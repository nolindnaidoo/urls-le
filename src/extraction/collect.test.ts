import { describe, expect, it } from 'vitest';
import type { Url } from '../types';
import {
	collectUrls,
	collectUrlsFromArray,
	collectUrlsFromKeyValue,
	deduplicateUrls,
	filterUrlsByType,
	groupUrlsByDomain,
	groupUrlsByType,
	sortUrls,
} from './collect';

describe('Collection Utils', () => {
	describe('collectUrls', () => {
		it('extracts URLs from strings', () => {
			const result = collectUrls('https://example.com');

			expect(result).toHaveLength(1);
			expect(result[0].value).toBe('https://example.com');
			expect(result[0].type).toBe('https');
			expect(result[0].context).toBe('root');
		});

		it('extracts URLs from arrays', () => {
			const data = ['https://example.com', 'not-a-url', 'http://test.com'];
			const result = collectUrls(data);

			expect(result).toHaveLength(2);
			expect(result[0].value).toBe('https://example.com');
			expect(result[0].context).toBe('root[0]');
			expect(result[1].value).toBe('http://test.com');
			expect(result[1].context).toBe('root[2]');
		});

		it('extracts URLs from objects', () => {
			const data = {
				website: 'https://example.com',
				email: 'mailto:test@example.com',
				notUrl: 'just text',
			};
			const result = collectUrls(data);

			expect(result).toHaveLength(2);
			expect(
				result.find((u) => u.value === 'https://example.com')?.context,
			).toBe('root.website');
			expect(
				result.find((u) => u.value === 'mailto:test@example.com')?.context,
			).toBe('root.email');
		});

		it('extracts URLs from nested structures', () => {
			const data = {
				links: ['https://example.com', 'http://test.com'],
				config: {
					api: 'https://api.example.com',
					docs: 'https://docs.example.com',
				},
			};
			const result = collectUrls(data);

			expect(result).toHaveLength(4);
			expect(
				result.find((u) => u.value === 'https://example.com')?.context,
			).toBe('root.links[0]');
			expect(
				result.find((u) => u.value === 'https://api.example.com')?.context,
			).toBe('root.config.api');
		});

		it('handles null and undefined values', () => {
			const data = {
				valid: 'https://example.com',
				nullValue: null,
				undefinedValue: undefined,
				array: ['https://test.com', null, undefined],
			};
			const result = collectUrls(data);

			expect(result).toHaveLength(2);
			expect(result.map((u) => u.value)).toEqual([
				'https://example.com',
				'https://test.com',
			]);
		});

		it('classifies different URL types', () => {
			const urls = [
				'https://example.com',
				'http://example.com',
				'ftp://files.example.com',
				'mailto:test@example.com',
				'tel:+1234567890',
				'file:///path/to/file',
				'/absolute/path',
				'./relative/path',
				'example.com',
			];

			const result = collectUrls(urls);

			expect(result).toHaveLength(9);
			expect(result[0].type).toBe('https');
			expect(result[1].type).toBe('http');
			expect(result[2].type).toBe('ftp');
			expect(result[3].type).toBe('mailto');
			expect(result[4].type).toBe('tel');
			expect(result[5].type).toBe('file');
			expect(result[6].type).toBe('absolute-path');
			expect(result[7].type).toBe('relative-path');
			expect(result[8].type).toBe('domain');
		});
	});

	describe('collectUrlsFromArray', () => {
		it('extracts URLs from string array', () => {
			const items = ['https://example.com', 'not-a-url', 'http://test.com'];
			const result = collectUrlsFromArray(items);

			expect(result).toHaveLength(2);
			expect(result[0].value).toBe('https://example.com');
			expect(result[0].position.line).toBe(1);
			expect(result[1].value).toBe('http://test.com');
			expect(result[1].position.line).toBe(3);
		});

		it('handles empty array', () => {
			const result = collectUrlsFromArray([]);
			expect(result).toHaveLength(0);
		});

		it('trims whitespace from URLs', () => {
			const items = ['  https://example.com  ', '\thttp://test.com\n'];
			const result = collectUrlsFromArray(items);

			expect(result).toHaveLength(2);
			expect(result[0].value).toBe('https://example.com');
			expect(result[1].value).toBe('http://test.com');
		});
	});

	describe('collectUrlsFromKeyValue', () => {
		it('extracts URLs from object properties', () => {
			const obj = {
				website: 'https://example.com',
				email: 'mailto:test@example.com',
				notUrl: 'just text',
			};
			const result = collectUrlsFromKeyValue(obj);

			expect(result).toHaveLength(2);
			expect(
				result.find((u) => u.value === 'https://example.com')?.context,
			).toBe('object.website');
			expect(
				result.find((u) => u.value === 'mailto:test@example.com')?.context,
			).toBe('object.email');
		});

		it('handles nested objects and arrays', () => {
			const obj = {
				links: ['https://example.com', 'http://test.com'],
				config: {
					api: 'https://api.example.com',
				},
			};
			const result = collectUrlsFromKeyValue(obj);

			expect(result).toHaveLength(3);
			expect(
				result.find((u) => u.value === 'https://example.com')?.context,
			).toBe('object.links[0]');
			expect(
				result.find((u) => u.value === 'https://api.example.com')?.context,
			).toBe('object.config.api');
		});
	});

	describe('filterUrlsByType', () => {
		const urls: Url[] = [
			{
				value: 'https://example.com',
				type: 'https',
				position: { line: 1, column: 1 },
				context: 'test',
			},
			{
				value: 'http://example.com',
				type: 'http',
				position: { line: 1, column: 1 },
				context: 'test',
			},
			{
				value: 'ftp://files.com',
				type: 'ftp',
				position: { line: 1, column: 1 },
				context: 'test',
			},
			{
				value: 'mailto:test@example.com',
				type: 'mailto',
				position: { line: 1, column: 1 },
				context: 'test',
			},
		];

		it('filters URLs by single type', () => {
			const result = filterUrlsByType(urls, ['https']);

			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('https');
		});

		it('filters URLs by multiple types', () => {
			const result = filterUrlsByType(urls, ['https', 'http']);

			expect(result).toHaveLength(2);
			expect(result.every((u) => u.type === 'https' || u.type === 'http')).toBe(
				true,
			);
		});

		it('returns empty array for non-matching types', () => {
			const result = filterUrlsByType(urls, ['unknown']);
			expect(result).toHaveLength(0);
		});
	});

	describe('groupUrlsByType', () => {
		const urls: Url[] = [
			{
				value: 'https://example.com',
				type: 'https',
				position: { line: 1, column: 1 },
				context: 'test',
			},
			{
				value: 'https://test.com',
				type: 'https',
				position: { line: 1, column: 1 },
				context: 'test',
			},
			{
				value: 'http://example.com',
				type: 'http',
				position: { line: 1, column: 1 },
				context: 'test',
			},
			{
				value: 'mailto:test@example.com',
				type: 'mailto',
				position: { line: 1, column: 1 },
				context: 'test',
			},
		];

		it('groups URLs by type', () => {
			const result = groupUrlsByType(urls);

			expect(Object.keys(result)).toEqual(['https', 'http', 'mailto']);
			expect(result.https).toHaveLength(2);
			expect(result.http).toHaveLength(1);
			expect(result.mailto).toHaveLength(1);
		});

		it('handles empty array', () => {
			const result = groupUrlsByType([]);
			expect(result).toEqual({});
		});
	});

	describe('groupUrlsByDomain', () => {
		const urls: Url[] = [
			{
				value: 'https://example.com/page1',
				type: 'https',
				position: { line: 1, column: 1 },
				context: 'test',
			},
			{
				value: 'https://example.com/page2',
				type: 'https',
				position: { line: 1, column: 1 },
				context: 'test',
			},
			{
				value: 'http://test.com',
				type: 'http',
				position: { line: 1, column: 1 },
				context: 'test',
			},
			{
				value: 'mailto:user@example.com',
				type: 'mailto',
				position: { line: 1, column: 1 },
				context: 'test',
			},
			{
				value: 'invalid-url',
				type: 'https',
				position: { line: 1, column: 1 },
				context: 'test',
			},
		];

		it('groups HTTP/HTTPS URLs by domain', () => {
			const result = groupUrlsByDomain(urls);

			expect(result['example.com']).toHaveLength(2);
			expect(result['test.com']).toHaveLength(1);
			expect(result.mailto).toHaveLength(1);
			expect(result.invalid).toHaveLength(1);
		});

		it('handles non-HTTP URLs by type', () => {
			const nonHttpUrls: Url[] = [
				{
					value: 'ftp://files.com',
					type: 'ftp',
					position: { line: 1, column: 1 },
					context: 'test',
				},
				{
					value: 'tel:+1234567890',
					type: 'tel',
					position: { line: 1, column: 1 },
					context: 'test',
				},
			];

			const result = groupUrlsByDomain(nonHttpUrls);

			expect(result.ftp).toHaveLength(1);
			expect(result.tel).toHaveLength(1);
		});
	});

	describe('deduplicateUrls', () => {
		it('removes duplicate URLs', () => {
			const urls: Url[] = [
				{
					value: 'https://example.com',
					type: 'https',
					position: { line: 1, column: 1 },
					context: 'test1',
				},
				{
					value: 'http://test.com',
					type: 'http',
					position: { line: 1, column: 1 },
					context: 'test2',
				},
				{
					value: 'HTTPS://EXAMPLE.COM',
					type: 'https',
					position: { line: 1, column: 1 },
					context: 'test3',
				},
				{
					value: 'http://test.com',
					type: 'http',
					position: { line: 1, column: 1 },
					context: 'test4',
				},
			];

			const result = deduplicateUrls(urls);

			expect(result).toHaveLength(2);
			expect(result[0].context).toBe('test1'); // First occurrence preserved
			expect(result[1].context).toBe('test2'); // First occurrence preserved
		});

		it('handles empty array', () => {
			const result = deduplicateUrls([]);
			expect(result).toHaveLength(0);
		});

		it('preserves URLs with different protocols', () => {
			const urls: Url[] = [
				{
					value: 'http://example.com',
					type: 'http',
					position: { line: 1, column: 1 },
					context: 'test1',
				},
				{
					value: 'https://example.com',
					type: 'https',
					position: { line: 1, column: 1 },
					context: 'test2',
				},
			];

			const result = deduplicateUrls(urls);

			expect(result).toHaveLength(2); // Different protocols = different URLs
		});
	});

	describe('sortUrls', () => {
		const urls: Url[] = [
			{
				value: 'https://zebra.com',
				type: 'https',
				position: { line: 1, column: 1 },
				context: 'test',
			},
			{
				value: 'http://apple.com',
				type: 'http',
				position: { line: 1, column: 1 },
				context: 'test',
			},
			{
				value: 'https://beta.com',
				type: 'https',
				position: { line: 1, column: 1 },
				context: 'test',
			},
			{
				value: 'mailto:user@example.com',
				type: 'mailto',
				position: { line: 1, column: 1 },
				context: 'test',
			},
		];

		it('sorts URLs by value', () => {
			const result = sortUrls(urls, 'value');

			expect(result[0].value).toBe('http://apple.com');
			expect(result[1].value).toBe('https://beta.com');
			expect(result[2].value).toBe('https://zebra.com');
			expect(result[3].value).toBe('mailto:user@example.com');
		});

		it('sorts URLs by type', () => {
			const result = sortUrls(urls, 'type');

			expect(result[0].type).toBe('http');
			expect(result[1].type).toBe('https');
			expect(result[2].type).toBe('https');
			expect(result[3].type).toBe('mailto');
		});

		it('sorts URLs by domain', () => {
			const result = sortUrls(urls, 'domain');

			// Should sort by hostname for HTTP/HTTPS URLs
			const httpUrls = result.filter(
				(u) => u.type === 'http' || u.type === 'https',
			);
			expect(httpUrls[0].value).toContain('apple.com');
			expect(httpUrls[1].value).toContain('beta.com');
			expect(httpUrls[2].value).toContain('zebra.com');
		});

		it('sorts URLs by length', () => {
			const result = sortUrls(urls, 'length');

			expect(result[0].value.length).toBeLessThanOrEqual(
				result[1].value.length,
			);
			expect(result[1].value.length).toBeLessThanOrEqual(
				result[2].value.length,
			);
			expect(result[2].value.length).toBeLessThanOrEqual(
				result[3].value.length,
			);
		});

		it('handles empty array', () => {
			const result = sortUrls([], 'value');
			expect(result).toHaveLength(0);
		});
	});
});
