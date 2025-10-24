import { describe, expect, it } from 'vitest';
import { extractFromHtml } from './html';

describe('extractFromHtml', () => {
	it('extractFromHtml: href attributes', () => {
		const html = `
      <a href="https://example.com">Link</a>
      <a href="https://github.com/user/repo">GitHub</a>
      <a href="mailto:user@example.com">Email</a>
    `;

		const result = extractFromHtml(html);

		expect(result.length).toBe(3);
		expect(result[0].value).toBe('https://example.com');
		expect(result[0].protocol).toBe('https');
		expect(result[1].value).toBe('https://github.com/user/repo');
		expect(result[2].value).toBe('mailto:user@example.com');
	});

	it('extractFromHtml: src attributes', () => {
		const html = `
      <img src="https://example.com/image.jpg" alt="Image">
      <script src="https://cdn.example.com/script.js"></script>
      <iframe src="https://example.com/embed"></iframe>
    `;

		const result = extractFromHtml(html);

		expect(result.length).toBe(3);
		expect(result[0].value).toBe('https://example.com/image.jpg');
		expect(result[1].value).toBe('https://cdn.example.com/script.js');
		expect(result[2].value).toBe('https://example.com/embed');
	});

	it('extractFromHtml: action attributes', () => {
		const html = `
      <form action="https://example.com/submit">
      <form action="https://api.example.com/v1/users">
    `;

		const result = extractFromHtml(html);

		expect(result.length).toBe(2);
		expect(result[0].value).toBe('https://example.com/submit');
		expect(result[1].value).toBe('https://api.example.com/v1/users');
	});

	it('extractFromHtml: plain text URLs', () => {
		const html = `
      Visit https://example.com for more info.
      Check out https://github.com/user/repo
      Contact us at https://example.com/contact
    `;

		const result = extractFromHtml(html);

		expect(result.length).toBe(3);
		expect(result[0].value).toBe('https://example.com');
		expect(result[1].value).toBe('https://github.com/user/repo');
		expect(result[2].value).toBe('https://example.com/contact');
	});

	it('extractFromHtml: mixed URL types', () => {
		const html = `
      <a href="https://example.com">HTTPS</a>
      <a href="http://example.com">HTTP</a>
      <a href="ftp://files.example.com">FTP</a>
      <a href="mailto:user@example.com">Email</a>
      <a href="tel:+1234567890">Phone</a>
      <a href="file:///path/to/file.txt">File</a>
    `;

		const result = extractFromHtml(html);

		expect(result.length).toBe(6);
		expect(result[0].protocol).toBe('https');
		expect(result[1].protocol).toBe('http');
		expect(result[2].protocol).toBe('ftp');
		expect(result[3].protocol).toBe('mailto');
		expect(result[4].protocol).toBe('tel');
		expect(result[5].protocol).toBe('file');
	});

	it('extractFromHtml: should not extract from comments', () => {
		const html = `
      <!-- This is a comment with https://example.com -->
      <a href="https://actual.com">Link</a>
      <!-- Another comment with http://test.com -->
    `;

		const result = extractFromHtml(html);

		// Should only extract URLs outside comments
		expect(result.length).toBe(1);
		expect(result[0].value).toBe('https://actual.com');
	});

	it('extractFromHtml: should not extract invalid URLs', () => {
		const html = `
      <a href="https://example.com">Valid URL</a>
      <a href="not-a-url">Invalid URL</a>
      <a href="javascript:alert('test')">JavaScript URL</a>
      <a href="data:text/plain,hello">Data URL</a>
    `;

		const result = extractFromHtml(html);

		// Should only extract valid URLs
		expect(result.length).toBe(1);
		expect(result[0].value).toBe('https://example.com');
	});

	it('extractFromHtml: URLs with query parameters', () => {
		const html = `
      <a href="https://example.com/search?q=test&page=1">Search</a>
      <a href="https://api.example.com/users?id=123&format=json">API</a>
    `;

		const result = extractFromHtml(html);

		expect(result.length).toBe(2);
		expect(result[0].value).toBe('https://example.com/search?q=test&page=1');
		expect(result[1].value).toBe(
			'https://api.example.com/users?id=123&format=json',
		);
	});

	it('extractFromHtml: URLs with fragments', () => {
		const html = `
      <a href="https://example.com/page#section1">Section 1</a>
      <a href="https://example.com/page#section2">Section 2</a>
    `;

		const result = extractFromHtml(html);

		expect(result.length).toBe(2);
		expect(result[0].value).toBe('https://example.com/page#section1');
		expect(result[1].value).toBe('https://example.com/page#section2');
	});

	it('extractFromHtml: relative URLs (not supported)', () => {
		const html = `
      <a href="/path/to/page">Relative</a>
      <a href="../parent/page">Parent</a>
      <a href="./current/page">Current</a>
    `;

		const result = extractFromHtml(html);

		// Relative URLs are not supported for reliability
		expect(result.length).toBe(0);
	});

	it('extractFromHtml: empty HTML', () => {
		const result = extractFromHtml('');
		expect(result.length).toBe(0);
	});

	it('extractFromHtml: whitespace only', () => {
		const result = extractFromHtml('   \n\t  ');
		expect(result.length).toBe(0);
	});

	it('extractFromHtml: position tracking', () => {
		const html = `
      <a href="https://example.com">Link</a>
    `;

		const result = extractFromHtml(html);

		expect(result.length).toBe(1);
		expect(result[0].position.line).toBe(2);
		expect(result[0].position.column > 0).toBeTruthy();
	});

	it('extractFromHtml: context tracking', () => {
		const html = `<a href="https://example.com">Link</a>`;

		const result = extractFromHtml(html);

		expect(result.length).toBe(1);
		expect(result[0].context).toBe(`<a href="https://example.com">Link</a>`);
	});

	it('extractFromHtml: large HTML file', () => {
		const links = Array.from(
			{ length: 1000 },
			(_, i) => `<a href="https://example.com/page${i}">Page ${i}</a>`,
		);
		const html = links.join('\n');

		const result = extractFromHtml(html);

		// Should extract all URLs
		expect(result.length).toBe(1000);
		expect(result[0].value).toBe('https://example.com/page0');
		expect(result[999].value).toBe('https://example.com/page999');
	});

	it('extractFromHtml: duplicate URLs', () => {
		const html = `
      <a href="https://example.com">Link 1</a>
      <a href="https://example.com">Link 2</a>
      <a href="https://example.com">Link 3</a>
    `;

		const result = extractFromHtml(html);

		// Should deduplicate URLs
		expect(result.length).toBe(1);
		expect(result[0].value).toBe('https://example.com');
	});

	it('extractFromHtml: URLs with special characters', () => {
		const html = `
      <a href="https://example.com/path with spaces">Spaces</a>
      <a href="https://example.com/path-with-dashes">Dashes</a>
      <a href="https://example.com/path_with_underscores">Underscores</a>
    `;

		const result = extractFromHtml(html);

		// Should extract all 3 href URLs + 1 partial from plain text (space terminates URL regex)
		expect(result.length).toBe(4);
		expect(result[0].value).toBe('https://example.com/path with spaces');
		expect(result[1].value).toBe('https://example.com/path'); // Partial from plain text extraction
		expect(result[2].value).toBe('https://example.com/path-with-dashes');
		expect(result[3].value).toBe('https://example.com/path_with_underscores');
	});
});
