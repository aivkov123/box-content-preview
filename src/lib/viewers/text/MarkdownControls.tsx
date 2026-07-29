import React from 'react';
import CompareToggle, { Props as CompareToggleProps } from '../controls/compare';
import ControlsBar from '../controls/controls-bar';
import FullscreenToggle, { Props as FullscreenToggleProps } from '../controls/fullscreen';

export type Props = CompareToggleProps & FullscreenToggleProps;

export default function MarkdownControls({ onCompareVersionsToggle, onFullscreenToggle }: Props): JSX.Element {
    return (
        <ControlsBar>
            <CompareToggle onCompareVersionsToggle={onCompareVersionsToggle} />
            <FullscreenToggle onFullscreenToggle={onFullscreenToggle} />
        </ControlsBar>
    );
}
