import { describe, expect, it } from 'vitest';
import { extractFromMarkdown } from './markdown';

describe('extractFromMarkdown', () => {
	it('extractFromMarkdown: markdown links', () => {
		const markdown = `
      [Example](https://example.com)
      [GitHub](https://github.com/user/repo)
      [Email](mailto:user@example.com)
    `;

		const result = extractFromMarkdown(markdown);

		expect(result.length).toBe(3);
		expect(result[0].value).toBe('https://example.com');
		expect(result[0].protocol).toBe('https');
		expect(result[1].value).toBe('https://github.com/user/repo');
		expect(result[2].value).toBe('mailto:user@example.com');
	});

	it('extractFromMarkdown: autolinks', () => {
		const markdown = `
      <https://example.com>
      <https://github.com/user/repo>
      <mailto:user@example.com>
    `;

		const result = extractFromMarkdown(markdown);

		expect(result.length).toBe(3);
		expect(result[0].value).toBe('https://example.com');
		expect(result[1].value).toBe('https://github.com/user/repo');
		expect(result[2].value).toBe('mailto:user@example.com');
	});

	it('extractFromMarkdown: plain text URLs', () => {
		const markdown = `
      Visit https://example.com for more info.
      Check out https://github.com/user/repo
      Contact us at https://example.com/contact
    `;

		const result = extractFromMarkdown(markdown);

		expect(result.length).toBe(3);
		expect(result[0].value).toBe('https://example.com');
		expect(result[1].value).toBe('https://github.com/user/repo');
		expect(result[2].value).toBe('https://example.com/contact');
	});

	it('extractFromMarkdown: mixed URL types', () => {
		const markdown = `
      [HTTPS](https://example.com)
      [HTTP](http://example.com)
      [FTP](ftp://files.example.com)
      [Email](mailto:user@example.com)
      [Phone](tel:+1234567890)
      [File](file:///path/to/file.txt)
    `;

		const result = extractFromMarkdown(markdown);

		expect(result.length).toBe(6);
		expect(result[0].protocol).toBe('https');
		expect(result[1].protocol).toBe('http');
		expect(result[2].protocol).toBe('ftp');
		expect(result[3].protocol).toBe('mailto');
		expect(result[4].protocol).toBe('tel');
		expect(result[5].protocol).toBe('file');
	});

	it('extractFromMarkdown: should not extract from code blocks', () => {
		const markdown = `
      \`\`\`
      https://example.com
      \`\`\`
    
      [Valid Link](https://actual.com)
    `;

		const result = extractFromMarkdown(markdown);

		// Should only extract URLs outside code blocks
		expect(result.length).toBe(1);
		expect(result[0].value).toBe('https://actual.com');
	});

	it('extractFromMarkdown: should not extract from inline code', () => {
		const markdown = `
      Use \`https://example.com\` in your code.
      [Valid Link](https://actual.com)
    `;

		const result = extractFromMarkdown(markdown);

		// Should only extract URLs outside inline code
		expect(result.length).toBe(1);
		expect(result[0].value).toBe('https://actual.com');
	});

	it('extractFromMarkdown: should not extract invalid URLs', () => {
		const markdown = `
      [Valid](https://example.com)
      [Invalid](not-a-url)
      [JavaScript](javascript:alert('test'))
      [Data](data:text/plain,hello)
    `;

		const result = extractFromMarkdown(markdown);

		// Should only extract valid URLs
		expect(result.length).toBe(1);
		expect(result[0].value).toBe('https://example.com');
	});

	it('extractFromMarkdown: URLs with query parameters', () => {
		const markdown = `
      [Search](https://example.com/search?q=test&page=1)
      [API](https://api.example.com/users?id=123&format=json)
    `;

		const result = extractFromMarkdown(markdown);

		expect(result.length).toBe(2);
		expect(result[0].value).toBe('https://example.com/search?q=test&page=1');
		expect(result[1].value).toBe(
			'https://api.example.com/users?id=123&format=json',
		);
	});

	it('extractFromMarkdown: URLs with fragments', () => {
		const markdown = `
      [Section 1](https://example.com/page#section1)
      [Section 2](https://example.com/page#section2)
    `;

		const result = extractFromMarkdown(markdown);

		expect(result.length).toBe(2);
		expect(result[0].value).toBe('https://example.com/page#section1');
		expect(result[1].value).toBe('https://example.com/page#section2');
	});

	it('extractFromMarkdown: relative URLs (not supported)', () => {
		const markdown = `
      [Relative](/path/to/page)
      [Parent](../parent/page)
      [Current](./current/page)
    `;

		const result = extractFromMarkdown(markdown);

		// Relative URLs are not supported for reliability
		expect(result.length).toBe(0);
	});

	it('extractFromMarkdown: empty markdown', () => {
		const result = extractFromMarkdown('');
		expect(result.length).toBe(0);
	});

	it('extractFromMarkdown: whitespace only', () => {
		const result = extractFromMarkdown('   \n\t  ');
		expect(result.length).toBe(0);
	});

	it('extractFromMarkdown: position tracking', () => {
		const markdown = `
      [Example](https://example.com)
    `;

		const result = extractFromMarkdown(markdown);

		expect(result.length).toBe(1);
		expect(result[0].position.line).toBe(2);
		expect(result[0].position.column > 0).toBeTruthy();
	});

	it('extractFromMarkdown: context tracking', () => {
		const markdown = `[Example](https://example.com)`;

		const result = extractFromMarkdown(markdown);

		expect(result.length).toBe(1);
		expect(result[0].context).toBe(`[Example](https://example.com)`);
	});

	it('extractFromMarkdown: large markdown file', () => {
		const links = Array.from(
			{ length: 1000 },
			(_, i) => `[Page ${i}](https://example.com/page${i})`,
		);
		const markdown = links.join('\n');

		const result = extractFromMarkdown(markdown);

		// Should extract all URLs
		expect(result.length).toBe(1000);
		expect(result[0].value).toBe('https://example.com/page0');
		expect(result[999].value).toBe('https://example.com/page999');
	});

	it('extractFromMarkdown: duplicate URLs', () => {
		const markdown = `
      [Link 1](https://example.com)
      [Link 2](https://example.com)
      [Link 3](https://example.com)
    `;

		const result = extractFromMarkdown(markdown);

		// Should deduplicate URLs
		expect(result.length).toBe(1);
		expect(result[0].value).toBe('https://example.com');
	});

	it('extractFromMarkdown: URLs with special characters', () => {
		const markdown = `
      [Spaces](https://example.com/path with spaces)
      [Dashes](https://example.com/path-with-dashes)
      [Underscores](https://example.com/path_with_underscores)
    `;

		const result = extractFromMarkdown(markdown);

		// Should extract all 3 markdown link URLs + 1 partial from plain text (space terminates URL regex)
		expect(result.length).toBe(4);
		expect(result[0].value).toBe('https://example.com/path with spaces');
		expect(result[1].value).toBe('https://example.com/path'); // Partial from plain text extraction
		expect(result[2].value).toBe('https://example.com/path-with-dashes');
		expect(result[3].value).toBe('https://example.com/path_with_underscores');
	});

	it('extractFromMarkdown: mixed markdown and plain URLs', () => {
		const markdown = `
      [Markdown Link](https://example.com)
      https://plain-url.com
      <https://autolink.com>
    `;

		const result = extractFromMarkdown(markdown);

		expect(result.length).toBe(3);
		expect(result[0].value).toBe('https://example.com');
		expect(result[1].value).toBe('https://plain-url.com');
		expect(result[2].value).toBe('https://autolink.com');
	});
});
