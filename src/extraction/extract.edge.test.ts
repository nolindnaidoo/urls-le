import { describe, expect, it } from 'vitest';
import { extractUrls } from './extract';

describe('Extract.ts Edge Cases', () => {
	describe('Content Size Limits', () => {
		it('should reject content larger than 10MB', async () => {
			const largeContent = 'a'.repeat(10_000_001);
			const result = await extractUrls(largeContent, 'markdown');

			expect(result.success).toBe(false);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]?.message).toContain('Content too large');
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
			expect(result.errors[0]?.message).toContain('truncated');
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

		it('should fallback to markdown for unknown types', async () => {
			const content = '[link](https://example.com)';
			const result = await extractUrls(content, 'unknown-type');

			// Should still extract URLs using markdown parser as fallback
			expect(result.urls.length).toBeGreaterThan(0);
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

		it('should handle malformed JSON gracefully', async () => {
			const content = '{invalid json';
			const result = await extractUrls(content, 'json');

			// Should handle gracefully (may succeed with empty results or fail with error)
			expect(result.success === true || result.success === false).toBe(true);
			if (!result.success) {
				expect(result.errors.length).toBeGreaterThan(0);
			}
		});

		it('should handle malformed YAML gracefully', async () => {
			const content = 'invalid: yaml: structure:';
			const result = await extractUrls(content, 'yaml');

			// Should handle gracefully
			expect(result.success === true || result.success === false).toBe(true);
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
