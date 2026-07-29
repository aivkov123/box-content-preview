import * as React from 'react';
import { render, screen } from '@testing-library/react';
import TextDiff, { buildDiffRows, computeLineParts } from '../TextDiff';

describe('lib/viewers/text/TextDiff', () => {
    describe('computeLineParts()', () => {
        test('should return a single context part for identical texts', () => {
            const text = 'one\ntwo\nthree';
            expect(computeLineParts(text, text)).toEqual([{ lines: ['one', 'two', 'three'], type: 'context' }]);
        });

        test('should detect an added line', () => {
            const parts = computeLineParts('one\ntwo\nthree', 'one\nthree');
            expect(parts).toEqual([
                { lines: ['one'], type: 'context' },
                { lines: ['two'], type: 'added' },
                { lines: ['three'], type: 'context' },
            ]);
        });

        test('should detect a removed line', () => {
            const parts = computeLineParts('one\nthree', 'one\ntwo\nthree');
            expect(parts).toEqual([
                { lines: ['one'], type: 'context' },
                { lines: ['two'], type: 'removed' },
                { lines: ['three'], type: 'context' },
            ]);
        });

        test('should emit removed before added for a changed region', () => {
            const parts = computeLineParts('a\nNEW\nz', 'a\nOLD\nz');
            expect(parts).toEqual([
                { lines: ['a'], type: 'context' },
                { lines: ['OLD'], type: 'removed' },
                { lines: ['NEW'], type: 'added' },
                { lines: ['z'], type: 'context' },
            ]);
        });

        test('should handle completely different texts', () => {
            const parts = computeLineParts('x\ny', 'a\nb');
            expect(parts).toEqual([
                { lines: ['a', 'b'], type: 'removed' },
                { lines: ['x', 'y'], type: 'added' },
            ]);
        });
    });

    describe('buildDiffRows()', () => {
        test('should number context lines on both sides', () => {
            const rows = buildDiffRows('one\ntwo', 'one\ntwo');
            expect(rows).toEqual([
                {
                    left: { lineNumber: 1, text: 'one', type: 'context' },
                    right: { lineNumber: 1, text: 'one', type: 'context' },
                },
                {
                    left: { lineNumber: 2, text: 'two', type: 'context' },
                    right: { lineNumber: 2, text: 'two', type: 'context' },
                },
            ]);
        });

        test('should zip changed regions side by side and pad with spacers', () => {
            const rows = buildDiffRows('a\nNEW1\nNEW2\nz', 'a\nOLD\nz');

            expect(rows).toEqual([
                {
                    left: { lineNumber: 1, text: 'a', type: 'context' },
                    right: { lineNumber: 1, text: 'a', type: 'context' },
                },
                {
                    left: { lineNumber: 2, text: 'NEW1', type: 'added' },
                    right: { lineNumber: 2, text: 'OLD', type: 'removed' },
                },
                {
                    left: { lineNumber: 3, text: 'NEW2', type: 'added' },
                    right: { type: 'spacer' },
                },
                {
                    left: { lineNumber: 4, text: 'z', type: 'context' },
                    right: { lineNumber: 3, text: 'z', type: 'context' },
                },
            ]);
        });

        test('should pad the left side when lines only exist in the compared version', () => {
            const rows = buildDiffRows('a\nz', 'a\nOLD1\nOLD2\nz');

            expect(rows).toEqual([
                {
                    left: { lineNumber: 1, text: 'a', type: 'context' },
                    right: { lineNumber: 1, text: 'a', type: 'context' },
                },
                {
                    left: { type: 'spacer' },
                    right: { lineNumber: 2, text: 'OLD1', type: 'removed' },
                },
                {
                    left: { type: 'spacer' },
                    right: { lineNumber: 3, text: 'OLD2', type: 'removed' },
                },
                {
                    left: { lineNumber: 2, text: 'z', type: 'context' },
                    right: { lineNumber: 4, text: 'z', type: 'context' },
                },
            ]);
        });
    });

    describe('render', () => {
        test('should render a row per aligned line pair', () => {
            render(<TextDiff compareText={'one\nOLD\nthree'} currentText={'one\nNEW\nthree'} />);

            const container = screen.getByTestId('bp-text-diff');
            expect(container.querySelectorAll('.bp-TextDiff-row')).toHaveLength(3);
            expect(container.querySelectorAll('.bp-TextDiff-cell--added')).toHaveLength(1);
            expect(container.querySelectorAll('.bp-TextDiff-cell--removed')).toHaveLength(1);
            expect(container.textContent).toContain('NEW');
            expect(container.textContent).toContain('OLD');
        });
    });
});
