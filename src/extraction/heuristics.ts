import type { Url, UrlProtocol } from '../types';
import { createPositionIndex } from './position';

/**
 * The single URL scanner shared by every format extractor. v1.x had the
 * same five protocol patterns copy-pasted into ten files with divergent
 * behavior: CSS labeled every http URL 'https', JSON/YAML did the same,
 * TOML/INI returned no positions at all, XML emitted attribute URLs
 * twice, and markdown/html/javascript silently dropped repeat
 * occurrences of a URL while the rest kept them.
 *
 * Rules, applied uniformly:
 * - A URL ends at whitespace or at any of < > " { } | \ ^ ` [ ] ; ) '
 *   — the delimiter set v1.x used, kept so well-formed quoted/bracketed
 *   sources terminate correctly. Trailing punctuation that URLs may
 *   legally contain (., ,) is NOT stripped; 'https://x.com/a.' keeps
 *   its dot. Documented limitation, not a bug.
 * - http vs https is decided by the actual scheme, never hardcoded.
 * - Every occurrence is reported with its own real position; value-level
 *   dedupe is the job of the dedupe command / dedupeEnabled setting.
 * - mailto: needs an @ and tel: needs a subject, mirroring the v1.x
 *   isValidUrl checks that markdown/html applied — now applied
 *   everywhere so a format can no longer disagree.
 */

const DELIMS = String.raw`[^\s<>"{}|\\^\`\[\];)']`;

interface PatternSpec {
	readonly pattern: RegExp;
	readonly protocol: (value: string) => UrlProtocol;
}

const PATTERNS: readonly PatternSpec[] = [
	{
		pattern: new RegExp(String.raw`https?:\/\/${DELIMS}+`, 'dg'),
		protocol: (v) => (v.startsWith('https') ? 'https' : 'http'),
	},
	{
		pattern: new RegExp(String.raw`ftp:\/\/${DELIMS}+`, 'dg'),
		protocol: () => 'ftp',
	},
	{
		pattern: new RegExp(String.raw`file:\/\/${DELIMS}+`, 'dg'),
		protocol: () => 'file',
	},
	{
		pattern: new RegExp(String.raw`mailto:${DELIMS}+`, 'dg'),
		protocol: () => 'mailto',
	},
	{
		pattern: new RegExp(String.raw`tel:${DELIMS}+`, 'dg'),
		protocol: () => 'tel',
	},
];

export interface UrlMatch {
	readonly value: string;
	readonly protocol: UrlProtocol;
	readonly start: number;
}

/**
 * Scan text for every URL occurrence, in document order. `base` shifts
 * reported offsets when `text` is a slice of a larger document.
 */
export function scanUrls(text: string, base = 0): UrlMatch[] {
	const matches: UrlMatch[] = [];
	const claimed = new Set<number>();

	for (const { pattern, protocol } of PATTERNS) {
		pattern.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(text)) !== null) {
			const value = match[0];
			const start = base + match.index;
			if (claimed.has(start) || !isWellFormed(value)) {
				continue;
			}
			claimed.add(start);
			matches.push({ value, protocol: protocol(value), start });
		}
	}

	return matches.sort((a, b) => a.start - b.start);
}

function isWellFormed(value: string): boolean {
	if (value.startsWith('mailto:')) {
		return value.includes('@') && value.length > 'mailto:'.length + 1;
	}
	if (value.startsWith('tel:')) {
		return value.length > 'tel:'.length + 1;
	}
	// scheme://<delims>+ already guarantees a non-empty authority/body
	return true;
}

/**
 * Build the final Url objects for a document: convert offsets to
 * line/column, attach the trimmed source line as context, and enrich
 * with domain/path where the value parses as a URL.
 */
export function toUrls(content: string, matches: readonly UrlMatch[]): Url[] {
	const toPosition = createPositionIndex(content);
	const lines = content.split('\n');

	return matches.map((match) => {
		const position = toPosition(match.start);
		const components = extractUrlComponents(match.value);
		return Object.freeze({
			value: match.value,
			protocol: match.protocol,
			position,
			context: lines[position.line - 1]?.trim() ?? '',
			...(components?.domain && { domain: components.domain }),
			...(components?.path && { path: components.path }),
		});
	});
}

/**
 * Forward-locate URLs found inside parsed string values (TOML/INI). A
 * per-value cursor resolves repeated values to successive occurrences.
 * Values whose raw form differs from the parsed form (escape sequences)
 * cannot be located and come back in `unlocated`.
 */
export function locateParsedValues(
	content: string,
	values: readonly string[],
): { located: UrlMatch[]; unlocated: UrlMatch[] } {
	const located: UrlMatch[] = [];
	const unlocated: UrlMatch[] = [];
	const cursors = new Map<string, number>();

	for (const value of values) {
		const inner = scanUrls(value);
		if (inner.length === 0) {
			continue;
		}
		const from = cursors.get(value) ?? 0;
		const index = content.indexOf(value, from);
		if (index === -1) {
			unlocated.push(...inner);
			continue;
		}
		cursors.set(value, index + 1);
		located.push(
			...inner.map((m) => ({ ...m, start: index + m.start }) as UrlMatch),
		);
	}

	return { located: located.sort((a, b) => a.start - b.start), unlocated };
}

/** Url objects for matches that could not be located in the source. */
export function toUnpositionedUrls(matches: readonly UrlMatch[]): Url[] {
	return matches.map((match) => {
		const components = extractUrlComponents(match.value);
		return Object.freeze({
			value: match.value,
			protocol: match.protocol,
			...(components?.domain && { domain: components.domain }),
			...(components?.path && { path: components.path }),
		});
	});
}

/** domain/path enrichment for values that parse as URLs. */
function extractUrlComponents(
	value: string,
): { domain?: string; path?: string } | null {
	try {
		const parsed = new URL(value);
		return {
			domain: parsed.hostname,
			path: parsed.pathname + parsed.search + parsed.hash,
		};
	} catch {
		return null;
	}
}
