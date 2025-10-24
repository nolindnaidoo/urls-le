import { describe, expect, it } from 'vitest';
import { extractFromIni } from './ini';

describe('extractFromIni', () => {
	it('should extract HTTP URLs from INI values', () => {
		const content = `
[server]
url = https://example.com
host = http://localhost:8080
`;
		const urls = extractFromIni(content);
		expect(urls).toHaveLength(2);
		expect(urls[0]?.value).toBe('https://example.com');
		expect(urls[0]?.protocol).toBe('https');
		expect(urls[1]?.value).toBe('http://localhost:8080');
		expect(urls[1]?.protocol).toBe('http');
	});

	it('should extract FTP URLs', () => {
		const content = `
[ftp]
server = ftp://files.example.com
`;
		const urls = extractFromIni(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('ftp://files.example.com');
		expect(urls[0]?.protocol).toBe('ftp');
	});

	it('should extract mailto URLs', () => {
		const content = `
[contact]
email = mailto:admin@example.com
`;
		const urls = extractFromIni(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('mailto:admin@example.com');
		expect(urls[0]?.protocol).toBe('mailto');
	});

	it('should extract tel URLs', () => {
		const content = `
[support]
phone = tel:+1234567890
`;
		const urls = extractFromIni(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('tel:+1234567890');
		expect(urls[0]?.protocol).toBe('tel');
	});

	it('should extract file URLs', () => {
		const content = `
[paths]
config = file:///etc/config.ini
`;
		const urls = extractFromIni(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('file:///etc/config.ini');
		expect(urls[0]?.protocol).toBe('file');
	});

	it('should extract URLs from nested sections', () => {
		const content = `
[database]
url = https://db.example.com
[api]
endpoint = https://api.example.com
`;
		const urls = extractFromIni(content);
		expect(urls).toHaveLength(2);
		expect(urls[0]?.value).toBe('https://db.example.com');
		expect(urls[1]?.value).toBe('https://api.example.com');
	});

	it('should handle empty content', () => {
		const urls = extractFromIni('');
		expect(urls).toEqual([]);
	});

	it('should handle empty or minimal INI gracefully', () => {
		const content = '[section]\nkey = value';
		const urls = extractFromIni(content);
		expect(urls).toEqual([]);
		// Valid INI with no URLs returns empty array
	});

	it('should extract multiple URLs from same value', () => {
		const content = `
[urls]
list = https://example.com http://test.com
`;
		const urls = extractFromIni(content);
		expect(urls).toHaveLength(2);
	});

	it('should include context information', () => {
		const content = `
[server]
url = https://example.com
`;
		const urls = extractFromIni(content);
		expect(urls[0]?.context).toBeDefined();
	});
});
