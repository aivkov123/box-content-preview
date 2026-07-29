import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import VersionCompareBar, { CompareVersion } from './VersionCompareBar';
import './VersionCompare.scss';

export const COMPARE_MODE_SPLIT = 'split';
export const COMPARE_MODE_TEXT = 'text';

const CLASS_HAS_COMPARE = 'bp-has-compare';
const VERSIONS_FIELDS = 'id,version_number,modified_at,modified_by,trashed_at';
const VERSIONS_LIMIT = 100;

export type CompareMode = typeof COMPARE_MODE_SPLIT | typeof COMPARE_MODE_TEXT;

// Minimal surface of the Preview instance the controller drives. Typed loosely
// on purpose - Preview.js is untyped JS.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type VersionCompareDeps = {
    /** Api instance for authenticated requests */
    api: any;
    /** Factory for the internal comparison Preview instance */
    createPreview: () => any;
    /** Current .bp-container element (re-queried after reloads) */
    getContainerEl: () => HTMLElement | null;
    getFileId: () => string;
    /** Auth + rep hint headers, mirrors Preview's file info fetch */
    getRequestHeaders: () => Record<string, string>;
    /** Parsed Preview options (apiHost, sharedLink, queryParams, features, ...) */
    getOptions: () => any;
    /** Original token option (string or token generator function) */
    getToken: () => any;
    /** Called after the split opens/closes so the main viewer can re-layout */
    onLayoutChange: () => void;
    /** Sets/clears the text compare viewer option; reloads the viewer when requested */
    setTextCompareOption: (versionId: string | null, doReload: boolean) => void;
    showNotification: (message: string) => void;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Orchestrates the SDK-native version comparison surface. For rendered
 * documents it splits the preview area and renders the selected prior version
 * with a second internal Preview instance; for text/markdown files it reloads
 * the current viewer in source-diff mode (compareFileVersionId option).
 * Instantiated lazily on first use - costs nothing until activated.
 */
export default class VersionCompareController {
    deps: VersionCompareDeps;

    mode: CompareMode | null = null;

    versions: CompareVersion[] = [];

    activeIndex = -1;

    isActive = false;

    isFetching = false;

    barRoot: Root | null = null;

    barEl: HTMLElement | null = null;

    paneEl: HTMLElement | null = null;

    paneContentEl: HTMLElement | null = null;

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    comparePreview: any = null;

    constructor(deps: VersionCompareDeps) {
        this.deps = deps;
    }

    /**
     * Opens comparison (or switches version when already open). When no
     * versionId is given, defaults to the most recent prior version.
     */
    open(mode: CompareMode, versionId?: string): Promise<void> {
        if (this.isFetching) {
            return Promise.resolve();
        }

        return this.fetchVersions()
            .then(versions => {
                if (!versions.length) {
                    this.deps.showNotification('This file has no previous versions to compare.');
                    return;
                }

                const index = versionId ? versions.findIndex(version => version.id === versionId) : 0;
                if (index < 0) {
                    this.deps.showNotification('That version is not available for comparison.');
                    return;
                }

                if (this.isActive && this.mode === mode) {
                    this.setActiveVersion(index);
                    return;
                }

                if (this.isActive) {
                    // Switching surface type (e.g. after a different file type loaded)
                    this.close();
                }

                this.mode = mode;
                this.isActive = true;
                this.activeIndex = index;

                if (mode === COMPARE_MODE_SPLIT) {
                    this.openSplit();
                } else {
                    this.deps.setTextCompareOption(this.getActiveVersion().id, true);
                }
            })
            .catch(() => {
                this.deps.showNotification('Could not load version history. Please try again.');
            });
    }

    /**
     * Tears down the comparison surface. skipViewerReload is used when the
     * teardown happens as part of a Preview load/hide that will rebuild the
     * viewer anyway.
     */
    close({ skipViewerReload = false }: { skipViewerReload?: boolean } = {}): void {
        if (!this.isActive) {
            return;
        }

        const { mode } = this;
        this.isActive = false;
        this.mode = null;
        this.activeIndex = -1;

        this.unmountBar();

        if (mode === COMPARE_MODE_SPLIT) {
            if (this.comparePreview) {
                this.comparePreview.hide();
                this.comparePreview = null;
            }

            const containerEl = this.deps.getContainerEl();
            if (containerEl) {
                containerEl.classList.remove(CLASS_HAS_COMPARE);
            }

            if (this.paneEl && this.paneEl.parentNode) {
                this.paneEl.parentNode.removeChild(this.paneEl);
            }
            this.paneEl = null;
            this.paneContentEl = null;

            this.deps.onLayoutChange();
        } else {
            this.deps.setTextCompareOption(null, !skipViewerReload);
        }
    }

    /**
     * Re-attaches the text-mode bar after the viewer reloads (Preview setupUI
     * clears the container). No-op for split mode or when inactive.
     */
    handlePreviewReloaded(): void {
        if (!this.isActive || this.mode !== COMPARE_MODE_TEXT) {
            return;
        }

        this.mountTextBar();
    }

    getActiveVersion(): CompareVersion {
        return this.versions[this.activeIndex];
    }

    /**
     * Fetches and caches the file's prior versions (most recent first),
     * excluding trashed versions. No fetch happens until first activation.
     */
    fetchVersions(): Promise<CompareVersion[]> {
        if (this.versions.length) {
            return Promise.resolve(this.versions);
        }

        const { api, getFileId, getOptions, getRequestHeaders } = this.deps;
        const { apiHost } = getOptions();
        const url = `${apiHost}/2.0/files/${getFileId()}/versions?fields=${VERSIONS_FIELDS}&limit=${VERSIONS_LIMIT}`;

        this.isFetching = true;

        return api
            .get(url, { headers: getRequestHeaders() })
            .then((response: { entries?: CompareVersion[] }) => {
                const entries = response && Array.isArray(response.entries) ? response.entries : [];
                this.versions = entries
                    .filter(version => !(version as { trashed_at?: string | null }).trashed_at)
                    .sort((a, b) => Number(b.version_number) - Number(a.version_number));
                return this.versions;
            })
            .finally(() => {
                this.isFetching = false;
            });
    }

    /**
     * Switches the active compared version (steppers / programmatic switch).
     */
    setActiveVersion(index: number): void {
        if (index < 0 || index >= this.versions.length || !this.isActive) {
            return;
        }

        const isSameVersion = index === this.activeIndex;
        this.activeIndex = index;

        if (this.mode === COMPARE_MODE_SPLIT) {
            if (!isSameVersion) {
                this.showComparePreview();
            }
            this.renderBar();
        } else if (!isSameVersion) {
            this.deps.setTextCompareOption(this.getActiveVersion().id, true);
        }
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Builds the split pane DOM, mounts the chrome bar, and loads the second
     * Preview instance for the active version.
     */
    openSplit(): void {
        const containerEl = this.deps.getContainerEl();
        if (!containerEl) {
            return;
        }

        containerEl.classList.add(CLASS_HAS_COMPARE);

        this.paneEl = document.createElement('div');
        this.paneEl.className = 'bp-compare-pane';
        this.paneEl.setAttribute('data-testid', 'bp-compare-pane');

        this.barEl = document.createElement('div');
        this.barEl.className = 'bp-compare-pane-bar';

        this.paneContentEl = document.createElement('div');
        this.paneContentEl.className = 'bp-compare-pane-content';

        this.paneEl.appendChild(this.barEl);
        this.paneEl.appendChild(this.paneContentEl);
        containerEl.appendChild(this.paneEl);

        this.renderBar();
        this.deps.onLayoutChange();
        this.showComparePreview();
    }

    /**
     * Shows the active version in the internal comparison Preview instance,
     * inheriting auth and environment options from the host instance.
     */
    showComparePreview(): void {
        const { createPreview, getFileId, getOptions, getToken } = this.deps;
        const { apiHost, appHost, features, queryParams, sharedLink, sharedLinkPassword } = getOptions();
        const fileId = getFileId();
        const version = this.getActiveVersion();

        if (!this.comparePreview) {
            this.comparePreview = createPreview();
        }

        this.comparePreview.show(fileId, getToken(), {
            apiHost,
            appHost,
            container: this.paneContentEl,
            disableEventLog: true,
            enableThumbnailsSidebar: false,
            features,
            fileOptions: { [fileId]: { fileVersionId: version.id } },
            header: 'none',
            queryParams,
            sharedLink,
            sharedLinkPassword,
            showAnnotations: false,
            showDownload: false,
            useHotkeys: false,
        });
    }

    /**
     * Mounts the text-mode bar above the source diff. Idempotent per reload -
     * Preview's setupUI clears the container, so the bar is re-created.
     */
    mountTextBar(): void {
        const containerEl = this.deps.getContainerEl();
        if (!containerEl) {
            return;
        }

        if (this.barEl && this.barEl.parentNode === containerEl) {
            this.renderBar();
            return;
        }

        this.unmountBar();

        this.barEl = document.createElement('div');
        this.barEl.className = 'bp-compare-textbar';
        containerEl.appendChild(this.barEl);

        this.renderBar();
    }

    /**
     * Renders (or re-renders) the chrome bar. Versions are ordered most recent
     * first: "previous" steps to an older version, "next" to a newer one.
     */
    renderBar(): void {
        if (!this.barEl) {
            return;
        }

        if (!this.barRoot) {
            this.barRoot = createRoot(this.barEl);
        }

        this.barRoot.render(
            <VersionCompareBar
                hasNext={this.activeIndex > 0}
                hasPrevious={this.activeIndex < this.versions.length - 1}
                onClose={() => this.close()}
                onNext={() => this.setActiveVersion(this.activeIndex - 1)}
                onPrevious={() => this.setActiveVersion(this.activeIndex + 1)}
                version={this.getActiveVersion()}
            />,
        );
    }

    unmountBar(): void {
        if (this.barRoot) {
            this.barRoot.unmount();
            this.barRoot = null;
        }

        if (this.barEl && this.barEl.parentNode) {
            this.barEl.parentNode.removeChild(this.barEl);
        }
        this.barEl = null;
    }
}
