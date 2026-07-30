import { describe, expect, it } from 'vitest';
import { createPositionIndex } from './position';

describe('createPositionIndex', () => {
	it('maps offsets to 1-based line/column', () => {
		const index = createPositionIndex('ab\ncd\nef');
		expect(index(0)).toEqual({ line: 1, column: 1 });
		expect(index(1)).toEqual({ line: 1, column: 2 });
		expect(index(3)).toEqual({ line: 2, column: 1 });
		expect(index(7)).toEqual({ line: 3, column: 2 });
	});

	it('clamps out-of-range offsets', () => {
		const index = createPositionIndex('abc');
		expect(index(-5)).toEqual({ line: 1, column: 1 });
		expect(index(99)).toEqual({ line: 1, column: 4 });
	});

	it('handles empty content', () => {
		const index = createPositionIndex('');
		expect(index(0)).toEqual({ line: 1, column: 1 });
	});

	it('handles offsets on newline boundaries', () => {
		const index = createPositionIndex('a\nb');
		expect(index(1)).toEqual({ line: 1, column: 2 });
		expect(index(2)).toEqual({ line: 2, column: 1 });
	});
});
