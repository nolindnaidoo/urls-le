import { createScanner, SyntaxKind } from 'jsonc-parser';
import type { Url } from '../../types';
import { scanUrls, toUrls, type UrlMatch } from '../heuristics';

/**
 * JSON: token scan via jsonc-parser, so URLs come only from string
 * literals (keys and values) at their real offsets. Each literal is
 * scanned with its escapes decoded, so `https:\/\/…` and a query written
 * `?a=1&b=2` read as the URL the document means; the reported
 * position is still where the match starts in the file.
 */
export function extractFromJson(content: string): readonly Url[] {
	const scanner = createScanner(content, false);
	const matches: UrlMatch[] = [];

	let kind = scanner.scan();
	while (kind !== SyntaxKind.EOF) {
		if (kind === SyntaxKind.StringLiteral) {
			const offset = scanner.getTokenOffset();
			const raw = content.slice(offset, offset + scanner.getTokenLength());
			const { text, origin } = decodeJsonString(raw, offset);
			for (const match of scanUrls(text)) {
				matches.push({ ...match, start: origin[match.start] as number });
			}
		}
		kind = scanner.scan();
	}

	return toUrls(
		content,
		matches.sort((a, b) => a.start - b.start),
	);
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = Object.freeze({
	'"': '"',
	'\\': '\\',
	'/': '/',
	b: '\b',
	f: '\f',
	n: '\n',
	r: '\r',
	t: '\t',
});

/**
 * A string token, quotes included, with its JSON escapes decoded, and for
 * every decoded code unit the offset in the document it came from — an
 * escape's units all point at its backslash.
 *
 * A malformed escape is left as written, so its backslash still ends a URL
 * as it did before decoding existed. A lone surrogate becomes U+FFFD: the
 * crate's strings cannot hold one, and the two frontends must agree.
 */
export function decodeJsonString(
	raw: string,
	base: number,
): { text: string; origin: number[] } {
	let text = '';
	const origin: number[] = [];
	const emit = (value: string, from: number) => {
		text += value;
		for (let unit = 0; unit < value.length; unit++) origin.push(base + from);
	};

	let index = 0;
	while (index < raw.length) {
		const char = raw[index] as string;
		if (char !== '\\' || index + 1 >= raw.length) {
			emit(char, index);
			index += 1;
			continue;
		}
		const next = raw[index + 1] as string;
		const simple = SIMPLE_ESCAPES[next];
		if (simple !== undefined) {
			emit(simple, index);
			index += 2;
			continue;
		}
		const unit = next === 'u' ? hexUnit(raw, index + 2) : undefined;
		if (unit === undefined) {
			emit(char, index);
			index += 1;
			continue;
		}
		const low =
			isHighSurrogate(unit) && raw.startsWith('\\u', index + 6)
				? hexUnit(raw, index + 8)
				: undefined;
		if (low !== undefined && isLowSurrogate(low)) {
			emit(String.fromCharCode(unit, low), index);
			index += 12;
			continue;
		}
		emit(
			isHighSurrogate(unit) || isLowSurrogate(unit)
				? '�'
				: String.fromCharCode(unit),
			index,
		);
		index += 6;
	}

	return { text, origin };
}

function hexUnit(raw: string, at: number): number | undefined {
	const digits = raw.slice(at, at + 4);
	return /^[0-9A-Fa-f]{4}$/.test(digits)
		? Number.parseInt(digits, 16)
		: undefined;
}

function isHighSurrogate(unit: number): boolean {
	return unit >= 0xd800 && unit <= 0xdbff;
}

function isLowSurrogate(unit: number): boolean {
	return unit >= 0xdc00 && unit <= 0xdfff;
}
