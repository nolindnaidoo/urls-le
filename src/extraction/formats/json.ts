import { createScanner, SyntaxKind } from 'jsonc-parser';
import type { Url } from '../../types';
import { scanUrls, toUrls } from '../heuristics';

/**
 * JSON: token scan via jsonc-parser, so URLs come only from string
 * literals (keys and values) at their real offsets — v1.x reported the
 * match column but scanned raw lines, catching nothing a string scan
 * misses while treating http URLs as https. Escaped URL forms
 * (https:\/\/...) do not match, exactly as before.
 */
export function extractFromJson(content: string): readonly Url[] {
	const scanner = createScanner(content, false);
	const matches = [];

	let kind = scanner.scan();
	while (kind !== SyntaxKind.EOF) {
		if (kind === SyntaxKind.StringLiteral) {
			const offset = scanner.getTokenOffset();
			const raw = content.slice(offset, offset + scanner.getTokenLength());
			matches.push(...scanUrls(raw, offset));
		}
		kind = scanner.scan();
	}

	return toUrls(
		content,
		matches.sort((a, b) => a.start - b.start),
	);
}
