import React from 'react';
import IconCompare24 from '../icons/IconCompare24';
import './CompareToggle.scss';

export type Props = {
    onCompareVersionsToggle?: () => void;
};

export default function CompareToggle({ onCompareVersionsToggle }: Props): JSX.Element | null {
    if (!onCompareVersionsToggle) {
        return null;
    }

    return (
        <button
            className="bp-CompareToggle"
            data-resin-target="compareversions"
            data-testid="bp-CompareToggle"
            onClick={onCompareVersionsToggle}
            title="Compare versions"
            type="button"
        >
            <IconCompare24 />
        </button>
    );
}
