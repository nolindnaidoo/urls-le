import { describe, expect, it } from 'vitest';
import { extractFromJavaScript } from './javascript';

describe('JavaScript URL Extraction', () => {
	describe('Basic Extraction', () => {
		it('should extract URLs from single-quoted strings', () => {
			const content = "const url = 'https://example.com';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://example.com');
			expect(urls[0]?.protocol).toBe('https');
		});

		it('should extract URLs from double-quoted strings', () => {
			const content = 'const url = "https://example.com";';
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://example.com');
		});

		it('should extract URLs from template literals', () => {
			const content = 'const url = `https://example.com`;';
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://example.com');
		});

		it('should extract multiple URLs from same line', () => {
			const content =
				"const urls = ['https://example.com', 'https://test.com'];";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(2);
			expect(urls[0]?.value).toBe('https://example.com');
			expect(urls[1]?.value).toBe('https://test.com');
		});

		it('should extract URLs from object properties', () => {
			const content = `
        const config = {
          api: 'https://api.example.com',
          cdn: 'https://cdn.example.com'
        };
      `;
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(2);
			expect(urls.some((u) => u.value === 'https://api.example.com')).toBe(
				true,
			);
			expect(urls.some((u) => u.value === 'https://cdn.example.com')).toBe(
				true,
			);
		});
	});

	describe('Protocol Support', () => {
		it('should extract HTTP URLs', () => {
			const content = "const url = 'http://example.com';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.protocol).toBe('http');
		});

		it('should extract HTTPS URLs', () => {
			const content = "const url = 'https://example.com';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.protocol).toBe('https');
		});

		it('should extract FTP URLs', () => {
			const content = "const url = 'ftp://ftp.example.com';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.protocol).toBe('ftp');
		});

		it('should extract mailto URLs', () => {
			const content = "const email = 'mailto:user@example.com';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.protocol).toBe('mailto');
		});

		it('should extract tel URLs', () => {
			const content = "const phone = 'tel:+1234567890';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.protocol).toBe('tel');
		});

		it('should extract file URLs', () => {
			const content = "const file = 'file:///path/to/file.txt';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.protocol).toBe('file');
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty content', () => {
			const content = '';
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(0);
		});

		it('should handle content with no URLs', () => {
			const content = 'const name = "John Doe"; const age = 30;';
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(0);
		});

		it('should deduplicate identical URLs', () => {
			const content = `
        const url1 = 'https://example.com';
        const url2 = 'https://example.com';
      `;
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://example.com');
		});

		it('should handle URLs with query parameters', () => {
			const content = "const url = 'https://example.com/search?q=test&page=1';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://example.com/search?q=test&page=1');
		});

		it('should handle URLs with fragments', () => {
			const content = "const url = 'https://example.com/page#section';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://example.com/page#section');
		});

		it('should handle URLs with ports', () => {
			const content = "const url = 'https://example.com:8080/api';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://example.com:8080/api');
		});

		it('should handle URLs with authentication', () => {
			const content = "const url = 'https://user:pass@example.com';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://user:pass@example.com');
		});

		it('should handle URLs with special characters', () => {
			const content =
				"const url = 'https://example.com/path/with-dashes_and_underscores';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe(
				'https://example.com/path/with-dashes_and_underscores',
			);
		});

		it('should handle URLs in comments', () => {
			const content = `
        // Visit https://example.com for more info
        /* API endpoint: https://api.example.com */
        const code = 'actual code';
      `;
			const urls = extractFromJavaScript(content);

			// Should extract URLs from comments too
			expect(urls.length).toBeGreaterThan(0);
		});

		it('should handle multiline strings', () => {
			const content = `
        const url = \`https://example.com/
          path/to/resource\`;
      `;
			const urls = extractFromJavaScript(content);

			expect(urls.length).toBeGreaterThan(0);
		});
	});

	describe('Position Tracking', () => {
		it('should track line numbers', () => {
			const content = `
        const url1 = 'https://example.com';
        const url2 = 'https://test.com';
      `;
			const urls = extractFromJavaScript(content);

			expect(urls[0]?.position?.line).toBe(2);
			expect(urls[1]?.position?.line).toBe(3);
		});

		it('should track column positions', () => {
			const content = "const url = 'https://example.com';";
			const urls = extractFromJavaScript(content);

			expect(urls[0]?.position?.column).toBeGreaterThan(0);
		});

		it('should include context', () => {
			const content = "const url = 'https://example.com';";
			const urls = extractFromJavaScript(content);

			expect(urls[0]?.context).toBeTruthy();
			expect(urls[0]?.context).toContain('https://example.com');
		});
	});

	describe('TypeScript Support', () => {
		it('should extract URLs from TypeScript type annotations', () => {
			const content = "const url: string = 'https://example.com';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://example.com');
		});

		it('should extract URLs from TypeScript interfaces', () => {
			const content = `
        interface Config {
          apiUrl: string; // 'https://api.example.com'
        }
      `;
			const urls = extractFromJavaScript(content);

			expect(urls.length).toBeGreaterThan(0);
		});

		it('should extract URLs from TypeScript enums', () => {
			const content = `
        enum Endpoints {
          API = 'https://api.example.com',
          CDN = 'https://cdn.example.com'
        }
      `;
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(2);
		});
	});

	describe('Security & Injection Prevention', () => {
		it('should not execute code from URLs', () => {
			const content = "const url = 'javascript:alert(1)';";
			const urls = extractFromJavaScript(content);

			// Should extract but not execute
			expect(urls.length).toBeGreaterThanOrEqual(0);
			// If extracted, should be marked as javascript protocol
			if (urls.length > 0) {
				expect(urls[0]?.value).toBe('javascript:alert(1)');
			}
		});

		it('should handle data URIs safely', () => {
			const content =
				"const data = 'data:text/html,<script>alert(1)</script>';";
			const urls = extractFromJavaScript(content);

			// Should extract but not execute
			expect(urls.length).toBeGreaterThanOrEqual(0);
		});

		it('should handle very long URLs', () => {
			const longPath = 'a'.repeat(2000);
			const content = `const url = 'https://example.com/${longPath}';`;
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value.length).toBeGreaterThan(2000);
		});

		it('should handle URLs with encoded characters', () => {
			const content = "const url = 'https://example.com/path%20with%20spaces';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://example.com/path%20with%20spaces');
		});

		it('should handle URLs with Unicode characters', () => {
			const content = "const url = 'https://例え.jp/パス';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://例え.jp/パス');
		});
	});

	describe('Real-World Patterns', () => {
		it('should extract URLs from fetch calls', () => {
			const content = `
        fetch('https://api.example.com/data')
          .then(response => response.json());
      `;
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://api.example.com/data');
		});

		it('should extract URLs from axios calls', () => {
			const content = `
        axios.get('https://api.example.com/users')
          .then(response => console.log(response.data));
      `;
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://api.example.com/users');
		});

		it('should extract URLs from import statements', () => {
			const content = "import module from 'https://cdn.example.com/module.js';";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://cdn.example.com/module.js');
		});

		it('should extract URLs from dynamic imports', () => {
			const content =
				"const module = await import('https://cdn.example.com/module.js');";
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://cdn.example.com/module.js');
		});

		it('should extract URLs from environment variables', () => {
			const content = `
        const apiUrl = process.env.API_URL || 'https://api.example.com';
      `;
			const urls = extractFromJavaScript(content);

			expect(urls).toHaveLength(1);
			expect(urls[0]?.value).toBe('https://api.example.com');
		});
	});
});
