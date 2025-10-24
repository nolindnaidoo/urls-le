import { describe, expect, it } from 'vitest';
import type { Configuration } from '../types';
import { analyzeUrls } from './analysis';

function createTestConfig(): Configuration {
	return Object.freeze({
		copyToClipboardEnabled: false,
		dedupeEnabled: true,
		notificationsLevel: 'silent',
		postProcessOpenInNewFile: false,
		openResultsSideBySide: false,
		safetyEnabled: true,
		safetyFileSizeWarnBytes: 1000000,
		safetyLargeOutputLinesThreshold: 50000,
		safetyManyDocumentsThreshold: 8,
		analysisEnabled: true,
		analysisIncludeSecurity: true,
		analysisIncludeAccessibility: true,
		validationEnabled: true,
		validationTimeout: 5000,
		validationFollowRedirects: true,
	});
}

describe('URL Analysis', () => {
	describe('analyzeUrls', () => {
		it('should analyze basic URL statistics', () => {
			const urls = [
				'https://example.com/page1',
				'https://example.com/page2',
				'https://test.com/page1',
				'https://api.example.com/endpoint',
			];

			const result = analyzeUrls(urls, createTestConfig());

			expect(result.count).toBe(4);
			expect(result.unique).toBe(4);
			expect(result.duplicates).toBe(0);
			expect(result.protocols).toBeDefined();
		});

		it('should analyze protocol distribution', () => {
			const urls = [
				'https://example.com/page1',
				'http://example.com/page2',
				'ftp://files.example.com/file.zip',
				'mailto:user@example.com',
			];

			const result = analyzeUrls(urls, createTestConfig());

			expect(result.protocols.https).toBe(1);
			expect(result.protocols.http).toBe(1);
			expect(result.protocols.ftp).toBe(1);
			expect(result.protocols.mailto).toBe(1);
		});

		it('should analyze domain distribution', () => {
			const urls = [
				'https://example.com/page1',
				'https://example.com/page2',
				'https://test.com/page1',
				'https://api.example.com/endpoint',
			];

			const result = analyzeUrls(urls, createTestConfig());

			expect(result.domains).toBeDefined();
			expect(result.domains.uniqueDomains).toBe(3);
			expect(result.domains.commonDomains).toBeDefined();
		});

		it('should analyze security aspects when enabled', () => {
			const urls = [
				'https://secure.example.com/data',
				'http://insecure.example.com/data',
				'https://example.com/redirect',
				'https://bit.ly/short-url',
			];

			const result = analyzeUrls(urls, createTestConfig());

			expect(result.security).toBeDefined();
			expect(result.security.secure).toBe(3);
			expect(result.security.insecure).toBe(1);
			expect(result.security.suspicious).toBe(1);
		});

		it('should analyze accessibility aspects when enabled', () => {
			const urls = [
				'https://example.com/page',
				'javascript:void(0)',
				'data:text/html,<html></html>',
				'https://example.com/accessible',
			];

			const result = analyzeUrls(urls, createTestConfig());

			expect(result.accessibility).toBeDefined();
			expect(result.accessibility.accessible).toBe(2);
			expect(result.accessibility.inaccessible).toBe(2);
		});

		it('should handle empty URL list', () => {
			const urls: string[] = [];

			const result = analyzeUrls(urls, createTestConfig());

			expect(result.count).toBe(0);
			expect(result.unique).toBe(0);
			expect(result.duplicates).toBe(0);
		});

		it('should handle URLs with different formats', () => {
			const urls = [
				'https://example.com/page',
				'ftp://files.example.com/data.zip',
				'mailto:user@example.com',
				'tel:+1234567890',
				'/relative/path',
			];

			const result = analyzeUrls(urls, createTestConfig());

			expect(result.count).toBe(5);
			expect(result.protocols.https).toBe(1);
			expect(result.protocols.ftp).toBe(1);
			expect(result.protocols.mailto).toBe(1);
			expect(result.protocols.tel).toBe(1);
		});

		it('should detect duplicate URLs', () => {
			const urls = [
				'https://example.com/page1',
				'https://example.com/page1',
				'https://example.com/page2',
			];

			const result = analyzeUrls(urls, createTestConfig());

			expect(result.count).toBe(3);
			expect(result.unique).toBe(2);
			expect(result.duplicates).toBe(1);
		});

		it('should identify common domains', () => {
			const urls = [
				'https://example.com/page1',
				'https://example.com/page2',
				'https://example.com/page3',
				'https://test.com/page1',
			];

			const result = analyzeUrls(urls, createTestConfig());

			expect(result.domains.commonDomains).toBeDefined();
			expect(result.domains.commonDomains.length).toBeGreaterThan(0);
			expect(result.domains.commonDomains[0].domain).toBe('example.com');
			expect(result.domains.commonDomains[0].count).toBe(3);
		});

		it('should detect suspicious URLs', () => {
			const urls = [
				'https://bit.ly/short-url',
				'https://tinyurl.com/abc123',
				'https://example.com/normal',
			];

			const result = analyzeUrls(urls, createTestConfig());

			expect(result.security.suspicious).toBe(2);
			expect(result.security.issues).toBeDefined();
			expect(result.security.issues.length).toBe(2);
		});

		it('should handle URLs with special characters', () => {
			const urls = [
				'https://example.com/path%20with%20spaces',
				'https://example.com/path-with-dashes',
				'https://example.com/path_with_underscores',
				'https://example.com/path.with.dots',
			];

			const result = analyzeUrls(urls, createTestConfig());

			expect(result.count).toBe(4);
			expect(result.domains.uniqueDomains).toBe(1);
		});

		it('should analyze subdomain distribution', () => {
			const urls = [
				'https://www.example.com/page',
				'https://api.example.com/endpoint',
				'https://cdn.example.com/asset',
				'https://blog.example.com/post',
				'https://example.com/page',
			];

			const result = analyzeUrls(urls, createTestConfig());

			expect(result.domains.uniqueDomains).toBe(5);
			expect(result.domains.commonDomains).toBeDefined();
		});

		it('should always include security analysis', () => {
			const config = createTestConfig();
			const urls = ['https://example.com/page'];

			const result = analyzeUrls(urls, config);

			expect(result.security).toBeDefined();
			expect(result.security?.secure).toBe(1);
		});

		it('should always include accessibility analysis', () => {
			const config = createTestConfig();
			const urls = ['https://example.com/page'];

			const result = analyzeUrls(urls, config);

			expect(result.accessibility).toBeDefined();
			expect(result.accessibility?.accessible).toBe(1);
		});
	});
});
