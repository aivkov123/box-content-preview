import * as React from 'react';

export type CompareVersion = {
    id: string;
    modified_at?: string;
    modified_by?: {
        id?: string;
        name?: string;
    };
    version_number?: string;
};

export type Props = {
    hasNext: boolean;
    hasPrevious: boolean;
    onClose: () => void;
    onNext: () => void;
    onPrevious: () => void;
    version: CompareVersion;
};

function formatSubtitle(version: CompareVersion): string {
    const parts = [];

    if (version.modified_at) {
        const date = new Date(version.modified_at);
        if (!Number.isNaN(date.getTime())) {
            parts.push(date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
        }
    }

    if (version.modified_by && version.modified_by.name) {
        parts.push(version.modified_by.name);
    }

    return parts.join(' \u00B7 ');
}

/**
 * Slim chrome bar for the version comparison surface: version label with
 * previous/next steppers and a close button. Rendered above the compare pane
 * (rendered docs) or above the source diff (text files).
 */
export default function VersionCompareBar({
    hasNext,
    hasPrevious,
    onClose,
    onNext,
    onPrevious,
    version,
}: Props): JSX.Element {
    const subtitle = formatSubtitle(version);

    return (
        <div className="bp-VersionCompareBar" data-testid="bp-VersionCompareBar">
            <div className="bp-VersionCompareBar-stepper">
                <button
                    aria-label="Previous version"
                    className="bp-VersionCompareBar-step"
                    data-testid="bp-VersionCompareBar-previous"
                    disabled={!hasPrevious}
                    onClick={onPrevious}
                    title="Previous version"
                    type="button"
                >
                    <svg focusable="false" height="16" viewBox="0 0 24 24" width="16">
                        <path d="M15.5 5.5 9 12l6.5 6.5L14 20l-8-8 8-8 1.5 1.5Z" fill="currentColor" />
                    </svg>
                </button>
                <span className="bp-VersionCompareBar-label">{`Version ${version.version_number || ''}`.trim()}</span>
                <button
                    aria-label="Next version"
                    className="bp-VersionCompareBar-step"
                    data-testid="bp-VersionCompareBar-next"
                    disabled={!hasNext}
                    onClick={onNext}
                    title="Next version"
                    type="button"
                >
                    <svg focusable="false" height="16" viewBox="0 0 24 24" width="16">
                        <path d="m8.5 5.5 1.5-1.5 8 8-8 8-1.5-1.5L15 12 8.5 5.5Z" fill="currentColor" />
                    </svg>
                </button>
            </div>
            {subtitle && <span className="bp-VersionCompareBar-subtitle">{subtitle}</span>}
            <button
                aria-label="Close comparison"
                className="bp-VersionCompareBar-close"
                data-testid="bp-VersionCompareBar-close"
                onClick={onClose}
                title="Close comparison"
                type="button"
            >
                <svg focusable="false" height="16" viewBox="0 0 24 24" width="16">
                    <path
                        d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z"
                        fill="currentColor"
                    />
                </svg>
            </button>
        </div>
    );
}
