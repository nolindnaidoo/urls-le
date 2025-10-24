import { describe, expect, it } from 'vitest';
import { isValidUrl } from './urlValidation';
import { validateUrls } from './validation';

describe('URL Validation', () => {
	describe('isValidUrl', () => {
		it('should validate valid HTTPS URLs', () => {
			const result = isValidUrl('https://example.com');

			expect(result).toBe(true);
		});

		it('should validate valid HTTP URLs', () => {
			const result = isValidUrl('http://example.com');

			expect(result).toBe(true);
		});

		it('should validate URLs with paths', () => {
			const result = isValidUrl('https://example.com/path/to/resource');

			expect(result).toBe(true);
		});

		it('should validate URLs with query parameters', () => {
			const result = isValidUrl('https://example.com/search?q=test&page=1');

			expect(result).toBe(true);
		});

		it('should validate URLs with fragments', () => {
			const result = isValidUrl('https://example.com/page#section');

			expect(result).toBe(true);
		});

		it('should validate FTP URLs', () => {
			const result = isValidUrl('ftp://ftp.example.com/file.txt');

			expect(result).toBe(true);
		});

		it('should validate mailto URLs', () => {
			const result = isValidUrl('mailto:user@example.com');

			expect(result).toBe(true);
		});

		it('should validate tel URLs', () => {
			const result = isValidUrl('tel:+1234567890');

			expect(result).toBe(true);
		});

		it('should reject invalid URLs', () => {
			const result = isValidUrl('not-a-url');

			expect(result).toBe(false);
		});

		it('should reject empty URLs', () => {
			const result = isValidUrl('');

			expect(result).toBe(false);
		});

		it('should reject URLs with invalid protocols', () => {
			const result = isValidUrl('invalid://example.com');

			expect(result).toBe(false);
		});

		it('should handle edge cases', () => {
			const result = isValidUrl('https://');

			expect(result).toBe(false);
		});

		it('should handle special characters in URLs', () => {
			const result = isValidUrl('https://example.com/path%20with%20spaces');

			expect(result).toBe(true);
		});

		it('should handle internationalized domain names', () => {
			const result = isValidUrl('https://例え.jp');

			expect(result).toBe(true);
		});

		it('should handle ports in URLs', () => {
			const result = isValidUrl('https://example.com:8080/path');

			expect(result).toBe(true);
		});

		it('should handle subdomains', () => {
			const result = isValidUrl('https://api.example.com/v1/endpoint');

			expect(result).toBe(true);
		});
	});

	describe('validateUrls', () => {
		it('should validate multiple URLs', async () => {
			const urls = ['https://example.com', 'https://github.com'];
			const config = {
				validationTimeout: 5000,
				validationFollowRedirects: true,
			} as any;

			const results = await validateUrls(urls, config);

			expect(results).toHaveLength(2);
			expect(results[0].status).toBe('valid');
			expect(results[1].status).toBe('valid');
		});

		it('should handle invalid URLs', async () => {
			const urls = ['https://example.com', 'invalid-url'];
			const config = {
				validationTimeout: 5000,
				validationFollowRedirects: true,
			} as any;

			const results = await validateUrls(urls, config);

			expect(results).toHaveLength(2);
			expect(results[0].status).toBe('valid');
			expect(results[1].status).toBe('invalid');
		});
	});
});
