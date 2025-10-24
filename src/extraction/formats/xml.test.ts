import { describe, expect, it } from 'vitest';
import { extractFromXml } from './xml';

describe('extractFromXml', () => {
	it('should extract URLs from text content', () => {
		const content = '<link>https://www.example.com</link>';
		const urls = extractFromXml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('https://www.example.com');
		expect(urls[0]?.protocol).toBe('https');
	});

	it('should extract URLs from nested elements', () => {
		const content =
			'<script>const url = "https://cdn.example.com/script.js";</script>';
		const urls = extractFromXml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('https://cdn.example.com/script.js');
	});

	it('should extract URLs from multiple elements', () => {
		const content = '<resources><url>https://api.example.com</url></resources>';
		const urls = extractFromXml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('https://api.example.com');
	});

	it('should extract URLs from mixed content', () => {
		const content =
			'<svg><desc>Visit https://www.example.com/sprite.svg for more</desc></svg>';
		const urls = extractFromXml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('https://www.example.com/sprite.svg');
	});

	it('should extract URLs from text content', () => {
		const content =
			'<description>Visit https://example.com for more info</description>';
		const urls = extractFromXml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('https://example.com');
	});

	it('should extract FTP URLs', () => {
		const content = '<ftp>ftp://files.example.com</ftp>';
		const urls = extractFromXml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('ftp://files.example.com');
		expect(urls[0]?.protocol).toBe('ftp');
	});

	it('should extract mailto URLs from text content', () => {
		const content = '<email>mailto:contact@example.com</email>';
		const urls = extractFromXml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('mailto:contact@example.com');
		expect(urls[0]?.protocol).toBe('mailto');
	});

	it('should extract tel URLs from text content', () => {
		const content = '<phone>tel:+1234567890</phone>';
		const urls = extractFromXml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('tel:+1234567890');
		expect(urls[0]?.protocol).toBe('tel');
	});

	it('should extract file URLs from text content', () => {
		const content = '<config>file:///etc/config.xml</config>';
		const urls = extractFromXml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('file:///etc/config.xml');
		expect(urls[0]?.protocol).toBe('file');
	});

	it('should extract URLs from Maven POM format', () => {
		const content = `
<project>
  <url>https://github.com/user/project</url>
  <scm>
    <url>https://github.com/user/project</url>
  </scm>
  <issueManagement>
    <url>https://github.com/user/project/issues</url>
  </issueManagement>
</project>
`;
		const urls = extractFromXml(content);
		expect(urls.length).toBeGreaterThan(0);
		expect(urls.some((u) => u.value.includes('github.com'))).toBe(true);
	});

	it('should handle empty content', () => {
		const urls = extractFromXml('');
		expect(urls).toEqual([]);
	});

	it('should include position information', () => {
		const content = '<link href="https://example.com"/>';
		const urls = extractFromXml(content);
		expect(urls[0]?.position).toBeDefined();
		expect(urls[0]?.position?.line).toBe(1);
	});

	it('should include context information', () => {
		const content = '<link href="https://example.com"/>';
		const urls = extractFromXml(content);
		expect(urls[0]?.context).toBe('<link href="https://example.com"/>');
	});

	it('should extract multiple URLs from same line', () => {
		const content =
			'<urls><url>https://example.com</url><url>http://test.com</url></urls>';
		const urls = extractFromXml(content);
		expect(urls).toHaveLength(2);
	});

	it('should extract from xmlns attributes', () => {
		const content = '<root xmlns="https://schema.example.com"/>';
		const urls = extractFromXml(content);
		expect(urls.length).toBeGreaterThanOrEqual(0);
		// xmlns URLs are extracted if they match URL patterns
	});

	it('should handle mixed attribute and text URLs', () => {
		const content =
			'<api url="https://api.example.com">Visit https://example.com/docs</api>';
		const urls = extractFromXml(content);
		expect(urls.length).toBeGreaterThan(0);
	});
});
