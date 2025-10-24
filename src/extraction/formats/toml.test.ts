import { describe, expect, it } from 'vitest';
import { extractFromToml } from './toml';

describe('extractFromToml', () => {
	it('should extract HTTP URLs from TOML values', () => {
		const content = `
[server]
url = "https://example.com"
host = "http://localhost:8080"
`;
		const urls = extractFromToml(content);
		expect(urls).toHaveLength(2);
		expect(urls[0]?.value).toBe('https://example.com');
		expect(urls[0]?.protocol).toBe('https');
		expect(urls[1]?.value).toBe('http://localhost:8080');
		expect(urls[1]?.protocol).toBe('http');
	});

	it('should extract FTP URLs', () => {
		const content = `
[ftp]
server = "ftp://files.example.com"
`;
		const urls = extractFromToml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('ftp://files.example.com');
		expect(urls[0]?.protocol).toBe('ftp');
	});

	it('should extract mailto URLs', () => {
		const content = `
[contact]
email = "mailto:admin@example.com"
`;
		const urls = extractFromToml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('mailto:admin@example.com');
		expect(urls[0]?.protocol).toBe('mailto');
	});

	it('should extract tel URLs', () => {
		const content = `
[support]
phone = "tel:+1234567890"
`;
		const urls = extractFromToml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('tel:+1234567890');
		expect(urls[0]?.protocol).toBe('tel');
	});

	it('should extract file URLs', () => {
		const content = `
[paths]
config = "file:///etc/config.toml"
`;
		const urls = extractFromToml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('file:///etc/config.toml');
		expect(urls[0]?.protocol).toBe('file');
	});

	it('should extract URLs from nested tables', () => {
		const content = `
[database]
url = "https://db.example.com"

[api]
endpoint = "https://api.example.com"
`;
		const urls = extractFromToml(content);
		expect(urls).toHaveLength(2);
		expect(urls[0]?.value).toBe('https://db.example.com');
		expect(urls[1]?.value).toBe('https://api.example.com');
	});

	it('should extract URLs from arrays', () => {
		const content = `
[urls]
list = [
  "https://example.com",
  "http://test.com"
]
`;
		const urls = extractFromToml(content);
		expect(urls).toHaveLength(2);
		expect(urls[0]?.value).toBe('https://example.com');
		expect(urls[1]?.value).toBe('http://test.com');
	});

	it('should handle empty content', () => {
		const urls = extractFromToml('');
		expect(urls).toEqual([]);
	});

	it('should handle invalid TOML with fallback', () => {
		const content = 'not valid toml but has https://example.com';
		const urls = extractFromToml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('https://example.com');
	});

	it('should extract from Cargo.toml format', () => {
		const content = `
[package]
name = "myproject"
repository = "https://github.com/user/repo"
documentation = "https://docs.rs/myproject"
`;
		const urls = extractFromToml(content);
		expect(urls).toHaveLength(2);
		expect(urls[0]?.value).toBe('https://github.com/user/repo');
		expect(urls[1]?.value).toBe('https://docs.rs/myproject');
	});

	it('should include context information', () => {
		const content = `
[server]
url = "https://example.com"
`;
		const urls = extractFromToml(content);
		expect(urls[0]?.context).toBeDefined();
	});

	it('should handle inline tables', () => {
		const content = `server = { url = "https://example.com", port = 8080 }`;
		const urls = extractFromToml(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('https://example.com');
	});
});
