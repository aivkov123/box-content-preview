import React from 'react';
import classNames from 'classnames';
import './TextDiff.scss';

export type TextDiffProps = {
    /** Text content of the version being compared against (rendered in the right column) */
    compareText: string;
    /** Text content of the current version (rendered in the left column) */
    currentText: string;
};

type CellType = 'added' | 'context' | 'removed' | 'spacer';

type Cell = {
    lineNumber?: number;
    text?: string;
    type: CellType;
};

export type DiffRow = {
    left: Cell;
    right: Cell;
};

type LinePart = {
    lines: string[];
    type: 'added' | 'context' | 'removed';
};

const SPACER: Cell = { type: 'spacer' };

// Bail out of the Myers search once a diff gets this large - beyond it the
// side-by-side view is noise anyway, so we degrade to one removed + one added block
const MAX_EDIT_DISTANCE = 2000;

function splitLines(value: string): string[] {
    return value.split(/\r\n|\r|\n/);
}

/**
 * Myers greedy diff (An O(ND) Difference Algorithm) over arrays of line ids.
 * Returns the edit script as a sequence of 'eq' | 'del' | 'ins' ops, or null
 * when the edit distance exceeds maxEditDistance.
 */
function myersEditScript(a: Int32Array, b: Int32Array, maxEditDistance: number): string[] | null {
    const n = a.length;
    const m = b.length;
    // k only ever ranges within [-maxEditDistance, maxEditDistance], so size the
    // V arrays by the cap rather than n + m to keep the backtrack trace small
    const max = Math.min(n + m, maxEditDistance);
    const offset = max;
    const width = 2 * max + 1;

    const v = new Int32Array(width);
    const trace: Int32Array[] = [];
    let foundD = -1;

    for (let d = 0; d <= max && foundD < 0; d += 1) {
        trace.push(v.slice());

        for (let k = -d; k <= d; k += 2) {
            let x;
            if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
                x = v[offset + k + 1];
            } else {
                x = v[offset + k - 1] + 1;
            }

            let y = x - k;
            while (x < n && y < m && a[x] === b[y]) {
                x += 1;
                y += 1;
            }

            v[offset + k] = x;

            if (x >= n && y >= m) {
                foundD = d;
                break;
            }
        }
    }

    if (foundD < 0) {
        return null;
    }

    // Backtrack from (n, m) through the saved V states to recover the ops
    const ops: string[] = [];
    let x = n;
    let y = m;

    for (let d = foundD; d > 0; d -= 1) {
        const vPrev = trace[d];
        const k = x - y;

        let prevK;
        if (k === -d || (k !== d && vPrev[offset + k - 1] < vPrev[offset + k + 1])) {
            prevK = k + 1;
        } else {
            prevK = k - 1;
        }

        const prevX = vPrev[offset + prevK];
        const prevY = prevX - prevK;

        while (x > prevX && y > prevY) {
            ops.push('eq');
            x -= 1;
            y -= 1;
        }

        if (prevK === k + 1) {
            ops.push('ins');
            y -= 1;
        } else {
            ops.push('del');
            x -= 1;
        }
    }

    while (x > 0 && y > 0) {
        ops.push('eq');
        x -= 1;
        y -= 1;
    }
    while (x > 0) {
        ops.push('del');
        x -= 1;
    }
    while (y > 0) {
        ops.push('ins');
        y -= 1;
    }

    return ops.reverse();
}

/**
 * Groups an edit script into parts. Between equal regions, deletions are
 * flushed before insertions so changed regions always come out as a
 * removed-part followed by an added-part (which the row builder then zips).
 */
function groupOps(ops: string[], oldLines: string[], newLines: string[]): LinePart[] {
    const parts: LinePart[] = [];
    let oldIndex = 0;
    let newIndex = 0;
    let pendingRemoved: string[] = [];
    let pendingAdded: string[] = [];
    let pendingContext: string[] = [];

    const flushContext = (): void => {
        if (pendingContext.length) {
            parts.push({ lines: pendingContext, type: 'context' });
            pendingContext = [];
        }
    };

    const flushChanges = (): void => {
        if (pendingRemoved.length) {
            parts.push({ lines: pendingRemoved, type: 'removed' });
            pendingRemoved = [];
        }
        if (pendingAdded.length) {
            parts.push({ lines: pendingAdded, type: 'added' });
            pendingAdded = [];
        }
    };

    ops.forEach(op => {
        if (op === 'eq') {
            flushChanges();
            pendingContext.push(oldLines[oldIndex]);
            oldIndex += 1;
            newIndex += 1;
        } else if (op === 'del') {
            flushContext();
            pendingRemoved.push(oldLines[oldIndex]);
            oldIndex += 1;
        } else {
            flushContext();
            pendingAdded.push(newLines[newIndex]);
            newIndex += 1;
        }
    });

    flushChanges();
    flushContext();

    return parts;
}

/**
 * Computes a line-level diff between the current version's text (additions)
 * and the compared version's text (removals), self-contained so the viewer
 * needs no external diff dependency. Common prefix/suffix lines are trimmed
 * before running Myers so typical version-to-version diffs stay fast.
 */
export function computeLineParts(currentText: string, compareText: string): LinePart[] {
    const oldLines = splitLines(compareText);
    const newLines = splitLines(currentText);

    // Trim common prefix
    let start = 0;
    while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
        start += 1;
    }

    // Trim common suffix
    let oldEnd = oldLines.length;
    let newEnd = newLines.length;
    while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
        oldEnd -= 1;
        newEnd -= 1;
    }

    const oldMiddle = oldLines.slice(start, oldEnd);
    const newMiddle = newLines.slice(start, newEnd);

    // Map lines to integer ids for O(1) comparisons inside the diff
    const lineIds = new Map<string, number>();
    const toIds = (lines: string[]): Int32Array => {
        const ids = new Int32Array(lines.length);
        lines.forEach((line, index) => {
            let id = lineIds.get(line);
            if (id === undefined) {
                id = lineIds.size;
                lineIds.set(line, id);
            }
            ids[index] = id;
        });
        return ids;
    };

    const ops = myersEditScript(toIds(oldMiddle), toIds(newMiddle), MAX_EDIT_DISTANCE);
    const middleParts: LinePart[] =
        ops === null
            ? // Edit distance cap hit - degrade to a whole-block change
              ([
                  oldMiddle.length ? { lines: oldMiddle, type: 'removed' } : null,
                  newMiddle.length ? { lines: newMiddle, type: 'added' } : null,
              ].filter(Boolean) as LinePart[])
            : groupOps(ops, oldMiddle, newMiddle);

    const parts: LinePart[] = [];
    if (start > 0) {
        parts.push({ lines: oldLines.slice(0, start), type: 'context' });
    }
    parts.push(...middleParts);
    if (oldEnd < oldLines.length) {
        parts.push({ lines: oldLines.slice(oldEnd), type: 'context' });
    }

    return parts;
}

/**
 * Builds aligned side-by-side rows from the two versions' text. The current
 * version renders on the left (additions highlighted), the compared older
 * version on the right (removals highlighted). Removed/added part pairs are
 * zipped together so changed regions sit next to each other, padded with
 * spacer cells (hatched) to keep line alignment, per the design.
 */
export function buildDiffRows(currentText: string, compareText: string): DiffRow[] {
    const parts = computeLineParts(currentText, compareText);
    const rows: DiffRow[] = [];
    let leftLineNumber = 1;
    let rightLineNumber = 1;
    let partIndex = 0;

    while (partIndex < parts.length) {
        const part = parts[partIndex];

        if (part.type === 'removed') {
            const nextPart = parts[partIndex + 1];
            const pairedLines = nextPart && nextPart.type === 'added' ? nextPart.lines : [];
            const rowCount = Math.max(part.lines.length, pairedLines.length);

            for (let i = 0; i < rowCount; i += 1) {
                rows.push({
                    left:
                        i < pairedLines.length
                            ? { lineNumber: leftLineNumber, text: pairedLines[i], type: 'added' }
                            : SPACER,
                    right:
                        i < part.lines.length
                            ? { lineNumber: rightLineNumber, text: part.lines[i], type: 'removed' }
                            : SPACER,
                });

                if (i < pairedLines.length) {
                    leftLineNumber += 1;
                }
                if (i < part.lines.length) {
                    rightLineNumber += 1;
                }
            }

            if (pairedLines.length) {
                partIndex += 1; // consume the paired added part
            }
        } else if (part.type === 'added') {
            for (let i = 0; i < part.lines.length; i += 1) {
                rows.push({
                    left: { lineNumber: leftLineNumber, text: part.lines[i], type: 'added' },
                    right: SPACER,
                });
                leftLineNumber += 1;
            }
        } else {
            for (let i = 0; i < part.lines.length; i += 1) {
                rows.push({
                    left: { lineNumber: leftLineNumber, text: part.lines[i], type: 'context' },
                    right: { lineNumber: rightLineNumber, text: part.lines[i], type: 'context' },
                });
                leftLineNumber += 1;
                rightLineNumber += 1;
            }
        }

        partIndex += 1;
    }

    return rows;
}

function DiffCell({ cell, side }: { cell: Cell; side: 'left' | 'right' }): React.JSX.Element {
    return (
        <div
            className={classNames('bp-TextDiff-cell', `bp-TextDiff-cell--${side}`, {
                'bp-TextDiff-cell--added': cell.type === 'added',
                'bp-TextDiff-cell--removed': cell.type === 'removed',
                'bp-TextDiff-cell--spacer': cell.type === 'spacer',
            })}
        >
            <span className="bp-TextDiff-lineNumber">{cell.lineNumber}</span>
            <span className="bp-TextDiff-lineText">{cell.text}</span>
        </div>
    );
}

export default function TextDiff({ compareText, currentText }: TextDiffProps): React.JSX.Element {
    const rows = React.useMemo(() => buildDiffRows(currentText, compareText), [compareText, currentText]);

    return (
        <div className="bp-TextDiff" data-testid="bp-text-diff">
            {rows.map((row, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={index} className="bp-TextDiff-row">
                    <DiffCell cell={row.left} side="left" />
                    <DiffCell cell={row.right} side="right" />
                </div>
            ))}
        </div>
    );
}
