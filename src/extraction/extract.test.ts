import { describe, expect, it } from 'vitest';
import { extractUrls } from './extract';

describe('URL Extraction', () => {
	describe('extractUrls', () => {
		it('should extract URLs from markdown content', async () => {
			const content = `
        # Test Document
        [Link 1](https://example.com)
        ![Image](https://example.com/image.png)
        <https://example.com/direct>
        [Reference link][ref]
        [ref]: https://example.com/reference
      `;

			const result = await extractUrls(content, 'markdown');

			expect(result.urls).toHaveLength(4);
			expect(result.urls[0].value).toBe('https://example.com');
			expect(result.urls[1].value).toBe('https://example.com/image.png');
			expect(result.urls[2].value).toBe('https://example.com/direct');
			expect(result.urls[3].value).toBe('https://example.com/reference');
			expect(result.fileType).toBe('markdown');
		});

		it('should extract URLs from HTML content', async () => {
			const content = `
        <!DOCTYPE html>
        <html>
        <head>
          <link href="https://example.com/style.css" rel="stylesheet">
        </head>
        <body>
          <a href="https://example.com">Link</a>
          <img src="https://example.com/image.png" alt="Image">
          <script src="https://example.com/script.js"></script>
        </body>
        </html>
      `;

			const result = await extractUrls(content, 'html');

			expect(result.urls).toHaveLength(4);
			expect(result.urls[0].value).toBe('https://example.com/style.css');
			expect(result.urls[1].value).toBe('https://example.com');
			expect(result.urls[2].value).toBe('https://example.com/image.png');
			expect(result.urls[3].value).toBe('https://example.com/script.js');
			expect(result.fileType).toBe('html');
		});

		it('should extract URLs from CSS content', async () => {
			const content = `
        .header {
          background-image: url('https://example.com/bg.jpg');
        }
        @import url('https://example.com/import.css');
        .footer {
          background: url("https://example.com/footer.png");
        }
      `;

			const result = await extractUrls(content, 'css');

			expect(result.urls).toHaveLength(3);
			expect(result.urls[0].value).toBe('https://example.com/bg.jpg');
			expect(result.urls[1].value).toBe('https://example.com/import.css');
			expect(result.urls[2].value).toBe('https://example.com/footer.png');
			expect(result.fileType).toBe('css');
		});

		it('should extract URLs from JavaScript content', async () => {
			const content = `
        const apiUrl = 'https://api.example.com/endpoint';
        const imageUrl = \`https://cdn.example.com/image.png\`;
        const config = {
          baseUrl: 'https://example.com',
          apiEndpoint: 'https://api.example.com/v1'
        };
      `;

			const result = await extractUrls(content, 'javascript');

			expect(result.urls).toHaveLength(4);
			expect(result.urls[0].value).toBe('https://api.example.com/endpoint');
			expect(result.urls[1].value).toBe('https://cdn.example.com/image.png');
			expect(result.urls[2].value).toBe('https://example.com');
			expect(result.urls[3].value).toBe('https://api.example.com/v1');
			expect(result.fileType).toBe('javascript');
		});

		it('should extract URLs from JSON content', async () => {
			const content = `
        {
          "website": "https://example.com",
          "api": "https://api.example.com",
          "cdn": "https://cdn.example.com",
          "nested": {
            "url": "https://nested.example.com"
          }
        }
      `;

			const result = await extractUrls(content, 'json');

			expect(result.urls).toHaveLength(4);
			expect(result.urls[0].value).toBe('https://example.com');
			expect(result.urls[1].value).toBe('https://api.example.com');
			expect(result.urls[2].value).toBe('https://cdn.example.com');
			expect(result.urls[3].value).toBe('https://nested.example.com');
			expect(result.fileType).toBe('json');
		});

		it('should extract URLs from YAML content', async () => {
			const content = `
        website: https://example.com
        api:
          base_url: https://api.example.com
          docs: https://docs.example.com
        cdn: https://cdn.example.com
      `;

			const result = await extractUrls(content, 'yaml');

			expect(result.urls).toHaveLength(4);
			expect(result.urls[0].value).toBe('https://example.com');
			expect(result.urls[1].value).toBe('https://api.example.com');
			expect(result.urls[2].value).toBe('https://docs.example.com');
			expect(result.urls[3].value).toBe('https://cdn.example.com');
			expect(result.fileType).toBe('yaml');
		});

		it('should handle empty content', async () => {
			const content = '';

			const result = await extractUrls(content, 'markdown');

			expect(result.urls).toHaveLength(0);
			expect(result.fileType).toBe('markdown');
		});

		it('should handle content with no URLs', async () => {
			const content = `
        This is just plain text
        with no URLs at all.
        Nothing to extract here.
      `;

			const result = await extractUrls(content, 'markdown');

			expect(result.urls).toHaveLength(0);
		});

		it('should handle malformed URLs gracefully', async () => {
			const content = `
        [Valid Link](https://example.com)
        [Invalid Link](not-a-url)
        [Another Valid](https://test.com)
      `;

			const result = await extractUrls(content, 'markdown');

			expect(result.urls).toHaveLength(2);
			expect(result.urls[0].value).toBe('https://example.com');
			expect(result.urls[1].value).toBe('https://test.com');
		});

		it('should include line and column information', async () => {
			const content = `
        Line 1: [Link](https://example.com)
        Line 2: [Another](https://test.com)
      `;

			const result = await extractUrls(content, 'markdown');

			expect(result.urls).toHaveLength(2);
			expect(result.urls[0].position?.line).toBe(2);
			expect(result.urls[0].position?.column).toBeGreaterThan(0);
			expect(result.urls[1].position?.line).toBe(3);
			expect(result.urls[1].position?.column).toBeGreaterThan(0);
		});

		it('should handle large content efficiently', async () => {
			const lines: string[] = [];
			for (let i = 0; i < 1000; i++) {
				lines.push(`[Link ${i}](https://example.com/page${i})`);
			}
			const content = lines.join('\n');

			const startTime = Date.now();
			const result = await extractUrls(content, 'markdown');
			const duration = Date.now() - startTime;

			expect(result.urls).toHaveLength(1000);
			expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
		});

		it('should handle mixed URL formats', async () => {
			const content = `
        [HTTP](http://example.com)
        [HTTPS](https://example.com)
        [FTP](ftp://files.example.com)
        [Mailto](mailto:user@example.com)
        [Tel](tel:+1234567890)
        [Relative](/path/to/resource)
      `;

			const result = await extractUrls(content, 'markdown');

			// Should extract 5 URLs (relative URL not supported)
			expect(result.urls).toHaveLength(5);
			expect(result.urls[0].value).toBe('http://example.com');
			expect(result.urls[1].value).toBe('https://example.com');
			expect(result.urls[2].value).toBe('ftp://files.example.com');
			expect(result.urls[3].value).toBe('mailto:user@example.com');
			expect(result.urls[4].value).toBe('tel:+1234567890');
		});

		it('should handle URLs with query parameters and fragments', async () => {
			const content = `
        [Search](https://example.com/search?q=test&page=1)
        [Section](https://example.com/page#section)
        [Complex](https://example.com/path?param=value#fragment)
      `;

			const result = await extractUrls(content, 'markdown');

			expect(result.urls).toHaveLength(3);
			expect(result.urls[0].value).toBe(
				'https://example.com/search?q=test&page=1',
			);
			expect(result.urls[1].value).toBe('https://example.com/page#section');
			expect(result.urls[2].value).toBe(
				'https://example.com/path?param=value#fragment',
			);
		});
	});
});
