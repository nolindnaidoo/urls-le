import { describe, expect, it } from 'vitest';
import { extractUrls } from './extract';

describe('Extract.ts Edge Cases', () => {
	describe('Content Size Limits', () => {
		it('should reject content larger than 10MB', async () => {
			const largeContent = 'a'.repeat(10_000_001);
			const result = await extractUrls(largeContent, 'markdown');

			expect(result.success).toBe(false);
			expect(result.errors).toEqual([
				{
					category: 'format',
					severity: 'error',
					message:
						'Content too large (10000001 characters), maximum size is 10MB',
					recoverable: false,
					recoveryAction: 'abort',
				},
			]);
		});

		// The crate's `str` is UTF-8, so the ceiling counts bytes. Five million
		// two-byte characters is under it in UTF-16 units and over it in bytes.
		it('should measure the ceiling in UTF-8 bytes, as the crate does', async () => {
			const result = await extractUrls('é'.repeat(5_000_001), 'markdown');

			expect(result.errors[0]?.message).toBe(
				'Content too large (10000002 characters), maximum size is 10MB',
			);
		});

		it('should accept content at exactly 10MB', async () => {
			const content = 'a'.repeat(10_000_000);
			const result = await extractUrls(content, 'markdown');

			// Should not error due to size
			expect(
				result.errors.every((e) => !e.message.includes('Content too large')),
			).toBe(true);
		});

		it('should accept small content', async () => {
			const content = 'https://example.com';
			const result = await extractUrls(content, 'markdown');

			expect(result.success).toBe(true);
		});
	});

	describe('URL Count Limits', () => {
		it('should truncate results when URL count exceeds 50,000', async () => {
			// Create content with more than 50,000 URLs
			const urls = Array.from(
				{ length: 50_001 },
				(_, i) => `https://example${i}.com`,
			).join('\n');
			const result = await extractUrls(urls, 'markdown');

			expect(result.urls.length).toBe(50_000);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]?.message).toBe(
				'Too many URLs, truncated to 50000',
			);
		});

		it('should not truncate when URL count is at limit', async () => {
			const urls = Array.from(
				{ length: 50_000 },
				(_, i) => `https://example${i}.com`,
			).join('\n');
			const result = await extractUrls(urls, 'markdown');

			expect(result.urls.length).toBe(50_000);
			expect(result.errors.every((e) => !e.message.includes('truncated'))).toBe(
				true,
			);
		});

		it('should handle small URL counts', async () => {
			const content = 'https://example.com\nhttps://test.com';
			const result = await extractUrls(content, 'markdown');

			expect(result.urls.length).toBe(2);
			expect(result.success).toBe(true);
		});
	});

	describe('Cancellation Token Support', () => {
		it('should return empty result when cancelled before extraction', async () => {
			const content = 'https://example.com';
			const token = { isCancellationRequested: true };
			const result = await extractUrls(content, 'markdown', token as any);

			expect(result.success).toBe(false);
			expect(result.urls).toHaveLength(0);
		});

		it('should return empty result when cancelled after size check', async () => {
			const content = 'https://example.com';
			const token = { isCancellationRequested: true };
			const result = await extractUrls(content, 'markdown', token as any);

			expect(result.success).toBe(false);
			expect(result.urls).toHaveLength(0);
		});

		it('should complete extraction when not cancelled', async () => {
			const content = 'https://example.com';
			const token = { isCancellationRequested: false };
			const result = await extractUrls(content, 'markdown', token as any);

			expect(result.urls.length).toBeGreaterThan(0);
		});
	});

	describe('File Type Detection', () => {
		it('should detect markdown file type', async () => {
			const content = '[link](https://example.com)';
			const result = await extractUrls(content, 'markdown');

			expect(result.fileType).toBe('markdown');
		});

		it('should detect html file type', async () => {
			const content = '<a href="https://example.com">link</a>';
			const result = await extractUrls(content, 'html');

			expect(result.fileType).toBe('html');
		});

		it('should detect css file type', async () => {
			const content = "background: url('https://example.com/bg.jpg');";
			const result = await extractUrls(content, 'css');

			expect(result.fileType).toBe('css');
		});

		it('should detect javascript file type', async () => {
			const content = "const url = 'https://example.com';";
			const result = await extractUrls(content, 'javascript');

			expect(result.fileType).toBe('javascript');
		});

		it('should detect typescript file type', async () => {
			const content = "const url: string = 'https://example.com';";
			const result = await extractUrls(content, 'typescript');

			expect(result.fileType).toBe('typescript');
		});

		it('should detect json file type', async () => {
			const content = '{"url": "https://example.com"}';
			const result = await extractUrls(content, 'json');

			expect(result.fileType).toBe('json');
		});

		it('should detect yaml file type', async () => {
			const content = 'url: https://example.com';
			const result = await extractUrls(content, 'yaml');

			expect(result.fileType).toBe('yaml');
		});

		it('should detect yml file type', async () => {
			const content = 'url: https://example.com';
			const result = await extractUrls(content, 'yml');

			expect(result.fileType).toBe('yaml');
		});

		it('should detect properties file type', async () => {
			const content = 'url=https://example.com';
			const result = await extractUrls(content, 'properties');

			expect(result.fileType).toBe('properties');
		});

		it('should detect toml file type', async () => {
			const content = 'url = "https://example.com"';
			const result = await extractUrls(content, 'toml');

			expect(result.fileType).toBe('toml');
		});

		it('should detect ini file type', async () => {
			const content = '[section]\nurl=https://example.com';
			const result = await extractUrls(content, 'ini');

			expect(result.fileType).toBe('ini');
		});

		it('should detect xml file type', async () => {
			const content = '<url>https://example.com</url>';
			const result = await extractUrls(content, 'xml');

			expect(result.fileType).toBe('xml');
		});

		it('should default to unknown for unrecognized types', async () => {
			const content = 'https://example.com';
			const result = await extractUrls(content, 'unknown-type');

			expect(result.fileType).toBe('unknown');
		});

		// Changed deliberately: this asserted a format error and no
		// URLs. Refusing never protected a caller from a wrong answer — it
		// withheld the right one.
		it('scans the whole document for unknown types', async () => {
			const content = '[link](https://example.com)';
			const result = await extractUrls(content, 'unknown-type');

			expect(result.success).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.urls.map((u) => u.value)).toEqual(['https://example.com']);
		});
	});

	describe('Error Handling', () => {
		it('should handle empty content', async () => {
			const content = '';
			const result = await extractUrls(content, 'markdown');

			expect(result.urls).toHaveLength(0);
			expect(result.success).toBe(true);
		});

		it('should handle whitespace-only content', async () => {
			const content = '   \n\n   \t\t   ';
			const result = await extractUrls(content, 'markdown');

			expect(result.urls).toHaveLength(0);
			expect(result.success).toBe(true);
		});

		it('should handle content with no URLs', async () => {
			const content = 'This is plain text with no URLs';
			const result = await extractUrls(content, 'markdown');

			expect(result.urls).toHaveLength(0);
			expect(result.success).toBe(true);
		});

		it('reads a document that is not valid JSON through its string tokens, and reports no error', async () => {
			// The JSON extractor scans tokens rather than parsing a tree, so a
			// document with no closing brace still yields the URLs its strings
			// hold, and nothing is refused.
			expect(await extractUrls('{invalid json', 'json')).toEqual({
				success: true,
				urls: [],
				errors: [],
				fileType: 'json',
			});
			const result = await extractUrls('{"a": "https://a.example"', 'json');
			expect(result.success).toBe(true);
			expect(result.errors).toEqual([]);
			expect(
				result.urls.map((url) => [
					url.value,
					url.position?.line,
					url.position?.column,
				]),
			).toEqual([['https://a.example', 1, 8]]);
		});

		it('scans a YAML document whole whether or not it would parse', async () => {
			// YAML has no parser here: comments are scanned too, so a document
			// that is not YAML is simply text.
			expect(await extractUrls('invalid: yaml: structure:', 'yaml')).toEqual({
				success: true,
				urls: [],
				errors: [],
				fileType: 'yaml',
			});
			const result = await extractUrls('a: b: https://y.example\n', 'yaml');
			expect(result.urls.map((url) => url.value)).toEqual([
				'https://y.example',
			]);
		});
	});

	describe('Immutability', () => {
		it('should return frozen URL arrays', async () => {
			const content = 'https://example.com';
			const result = await extractUrls(content, 'markdown');

			expect(Object.isFrozen(result.urls)).toBe(true);
		});

		it('should return frozen error arrays', async () => {
			const content = 'a'.repeat(10_000_001);
			const result = await extractUrls(content, 'markdown');

			expect(Object.isFrozen(result.errors)).toBe(true);
		});

		it('should return frozen result object', async () => {
			const content = 'https://example.com';
			const result = await extractUrls(content, 'markdown');

			expect(Object.isFrozen(result)).toBe(true);
		});
	});

	describe('Performance Edge Cases', () => {
		it('should handle content with many newlines', async () => {
			const content = `${'\n'.repeat(10_000)}https://example.com`;
			const result = await extractUrls(content, 'markdown');

			expect(result.urls.length).toBeGreaterThan(0);
		});

		it('should handle content with very long lines', async () => {
			const longLine = `${'a'.repeat(100_000)} https://example.com`;
			const result = await extractUrls(longLine, 'markdown');

			expect(result.urls.length).toBeGreaterThan(0);
		});

		it('should handle mixed content types', async () => {
			const content = `
        [Markdown link](https://example.com)
        <a href="https://test.com">HTML link</a>
        const url = 'https://api.example.com';
      `;
			const result = await extractUrls(content, 'markdown');

			// Should extract URLs even from mixed content
			expect(result.urls.length).toBeGreaterThan(0);
		});
	});
});
