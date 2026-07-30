import { describe, expect, it } from 'vitest';
import { locateParsedValues, scanUrls, toUrls } from './heuristics';

describe('scanUrls', () => {
	it('detects every supported protocol with the real scheme', () => {
		const text =
			'http://a.com https://b.com ftp://c.com file:///etc/x mailto:d@e.com tel:+123';
		const protocols = scanUrls(text).map((m) => m.protocol);
		expect(protocols).toEqual([
			'http',
			'https',
			'ftp',
			'file',
			'mailto',
			'tel',
		]);
	});

	it('reports every occurrence, in document order', () => {
		const matches = scanUrls('https://a.com then https://a.com');
		expect(matches).toHaveLength(2);
		expect(matches[0]?.start).toBe(0);
		expect(matches[1]?.start).toBe(19);
	});

	it('terminates URLs at delimiters', () => {
		expect(scanUrls('"https://a.com/x"')[0]?.value).toBe('https://a.com/x');
		expect(scanUrls('(https://a.com/y)')[0]?.value).toBe('https://a.com/y');
		expect(scanUrls('<https://a.com/z>')[0]?.value).toBe('https://a.com/z');
	});

	it('rejects malformed mailto and tel forms', () => {
		expect(scanUrls('mailto:no-at-sign')).toHaveLength(0);
		expect(scanUrls('tel:+15551234567')).toHaveLength(1);
	});

	it('shifts offsets by the base parameter', () => {
		expect(scanUrls('https://a.com', 100)[0]?.start).toBe(100);
	});
});

describe('toUrls', () => {
	it('attaches position, line context, and URL components', () => {
		const content = 'first line\nsee https://ex.com/path?q=1 here';
		const urls = toUrls(content, scanUrls(content));
		expect(urls).toHaveLength(1);
		expect(urls[0]?.position).toEqual({ line: 2, column: 5 });
		expect(urls[0]?.context).toBe('see https://ex.com/path?q=1 here');
		expect(urls[0]?.domain).toBe('ex.com');
		expect(urls[0]?.path).toBe('/path?q=1');
	});
});

describe('locateParsedValues', () => {
	it('locates repeated values at successive occurrences', () => {
		const content = 'a = "https://x.com"\nb = "https://x.com"';
		const { located, unlocated } = locateParsedValues(content, [
			'https://x.com',
			'https://x.com',
		]);
		expect(unlocated).toHaveLength(0);
		expect(located).toHaveLength(2);
		expect(located[0]?.start).not.toBe(located[1]?.start);
	});

	it('returns unlocatable values without positions', () => {
		const { located, unlocated } = locateParsedValues('nothing here', [
			'https://gone.com',
		]);
		expect(located).toHaveLength(0);
		expect(unlocated).toHaveLength(1);
		expect(unlocated[0]?.value).toBe('https://gone.com');
	});

	it('skips values containing no URLs', () => {
		const { located, unlocated } = locateParsedValues('plain', ['plain']);
		expect(located).toHaveLength(0);
		expect(unlocated).toHaveLength(0);
	});
});
