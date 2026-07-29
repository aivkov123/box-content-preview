import React from 'react';
import CompareToggle, { Props as CompareToggleProps } from '../controls/compare';
import ControlsBar, { ControlsBarGroup } from '../controls/controls-bar';
import FullscreenToggle, { Props as FullscreenToggleProps } from '../controls/fullscreen';
import ZoomControls, { Props as ZoomControlsProps } from '../controls/zoom';

export type Props = CompareToggleProps & FullscreenToggleProps & ZoomControlsProps;

export default function TextControls({
    maxScale,
    minScale,
    onCompareVersionsToggle,
    onFullscreenToggle,
    onZoomIn,
    onZoomOut,
    scale,
}: Props): JSX.Element {
    return (
        <ControlsBar>
            <ControlsBarGroup isDistinct>
                <ZoomControls
                    maxScale={maxScale}
                    minScale={minScale}
                    onZoomIn={onZoomIn}
                    onZoomOut={onZoomOut}
                    scale={scale}
                />
            </ControlsBarGroup>
            <ControlsBarGroup>
                <CompareToggle onCompareVersionsToggle={onCompareVersionsToggle} />
                <FullscreenToggle onFullscreenToggle={onFullscreenToggle} />
            </ControlsBarGroup>
        </ControlsBar>
    );
}
