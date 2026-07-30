import type { Url } from '../../types';
import { scanUrls, toUrls } from '../heuristics';
import { createPositionIndex } from '../position';

/**
 * Java properties: whole-content scan, minus comment lines (# or !).
 * Multi-line values with backslash continuation are ordinary lines to
 * the scanner, so their URLs extract with real positions.
 */
export function extractFromProperties(content: string): Url[] {
	const lines = content.split('\n');
	const toPosition = createPositionIndex(content);

	const matches = scanUrls(content).filter((match) => {
		const line = lines[toPosition(match.start).line - 1]?.trim() ?? '';
		return !line.startsWith('#') && !line.startsWith('!');
	});

	return toUrls(content, matches);
}
