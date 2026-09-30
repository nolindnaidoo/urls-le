import { describe, expect, it } from 'vitest';
import { decodeJsonString, extractFromJson } from './json';

describe('decodeJsonString', () => {
	it('decodes the escapes JSON defines and maps each unit to its source', () => {
		const { text, origin } = decodeJsonString('"a\\/b\\u0026c"', 10);
		expect(text).toBe('"a/b&c"');
		// `/` came from the backslash at 12; `&` from the one at 15.
		expect(origin).toEqual([10, 11, 12, 14, 15, 21, 22]);
	});

	it('joins a surrogate pair into one character', () => {
		expect(decodeJsonString('"\\ud83c\\udfaf"', 0).text).toBe('"🎯"');
	});

	it('replaces a lone surrogate, as the crate must', () => {
		expect(decodeJsonString('"\\ud83c!"', 0).text).toBe('"�!"');
	});

	it('leaves a malformed escape as written, so its backslash still ends a URL', () => {
		expect(decodeJsonString('"https://x.example\\q"', 0).text).toBe(
			'"https://x.example\\q"',
		);
		expect(decodeJsonString('"\\u12"', 0).text).toBe('"\\u12"');
	});
});

describe('extractFromJson', () => {
	it('reads an escaped URL and reports it where the file spells it', () => {
		const content =
			'{"a": "https:\\/\\/escaped.example.com\\/p?x=1\\u0026y=2"}';
		const [url] = extractFromJson(content);
		expect(url?.value).toBe('https://escaped.example.com/p?x=1&y=2');
		expect(url?.position).toEqual({ line: 1, column: 8 });
		expect(content.slice(7).startsWith('https:\\/\\/escaped')).toBe(true);
	});
});
