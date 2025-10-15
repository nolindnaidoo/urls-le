import { describe, expect, it } from 'vitest';
import { extractFromProperties } from './properties';

describe('extractFromProperties', () => {
	it('should extract HTTP URLs from property values', () => {
		const content = `
server.url = https://example.com
api.endpoint = http://api.example.com
`;
		const urls = extractFromProperties(content);
		expect(urls).toHaveLength(2);
		expect(urls[0]?.value).toBe('https://example.com');
		expect(urls[0]?.protocol).toBe('https');
		expect(urls[1]?.value).toBe('http://api.example.com');
		expect(urls[1]?.protocol).toBe('http');
	});

	it('should extract FTP URLs', () => {
		const content = 'ftp.server = ftp://files.example.com';
		const urls = extractFromProperties(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('ftp://files.example.com');
		expect(urls[0]?.protocol).toBe('ftp');
	});

	it('should extract mailto URLs', () => {
		const content = 'contact.email = mailto:support@example.com';
		const urls = extractFromProperties(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('mailto:support@example.com');
		expect(urls[0]?.protocol).toBe('mailto');
	});

	it('should extract tel URLs', () => {
		const content = 'support.phone = tel:+1234567890';
		const urls = extractFromProperties(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('tel:+1234567890');
		expect(urls[0]?.protocol).toBe('tel');
	});

	it('should extract file URLs', () => {
		const content = 'config.path = file:///etc/config.properties';
		const urls = extractFromProperties(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('file:///etc/config.properties');
		expect(urls[0]?.protocol).toBe('file');
	});

	it('should skip comment lines starting with #', () => {
		const content = `
# This is a comment with https://example.com
server.url = https://real.com
`;
		const urls = extractFromProperties(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('https://real.com');
	});

	it('should skip comment lines starting with !', () => {
		const content = `
! This is a comment with https://example.com
server.url = https://real.com
`;
		const urls = extractFromProperties(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('https://real.com');
	});

	it('should skip empty lines', () => {
		const content = `
server.url = https://example.com

api.url = https://api.example.com
`;
		const urls = extractFromProperties(content);
		expect(urls).toHaveLength(2);
	});

	it('should handle empty content', () => {
		const urls = extractFromProperties('');
		expect(urls).toEqual([]);
	});

	it('should include position information', () => {
		const content = 'server.url = https://example.com';
		const urls = extractFromProperties(content);
		expect(urls[0]?.position).toBeDefined();
		expect(urls[0]?.position?.line).toBe(1);
	});

	it('should include context information', () => {
		const content = 'server.url = https://example.com';
		const urls = extractFromProperties(content);
		expect(urls[0]?.context).toBe('server.url = https://example.com');
	});

	it('should extract multiple URLs from same line', () => {
		const content = 'urls = https://example.com http://test.com';
		const urls = extractFromProperties(content);
		expect(urls).toHaveLength(2);
	});

	it('should handle properties with colon separator', () => {
		const content = 'server.url: https://example.com';
		const urls = extractFromProperties(content);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.value).toBe('https://example.com');
	});
});
