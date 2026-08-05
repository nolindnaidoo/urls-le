import type { Url } from '../../types';
import { scanUrls, toUrls } from '../heuristics';

/**
 * HTML: whole-content scan, minus <!-- --> comments (which may now span
 * lines — v1.x only recognized same-line comments). Attribute values
 * holding absolute URLs are found by the scan itself; relative targets
 * (href="/docs") are not URLs and are never extracted.
 */
const COMMENT_PATTERN = /<!--[\s\S]*?(?:-->|$)/g;

export function extractFromHtml(content: string): readonly Url[] {
	const commentSpans = computeCommentSpans(content);

	const matches = scanUrls(content).filter(
		(match) =>
			!commentSpans.some(
				([start, end]) => match.start >= start && match.start < end,
			),
	);

	return toUrls(content, matches);
}

function computeCommentSpans(content: string): Array<[number, number]> {
	const spans: Array<[number, number]> = [];
	COMMENT_PATTERN.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = COMMENT_PATTERN.exec(content)) !== null) {
		spans.push([match.index, match.index + match[0].length]);
	}
	return spans;
}
