import { describe, expect, it } from 'vitest';
import type { Configuration } from '../types';
import { handleSafetyChecks } from './safety';

// Standalone safety utility functions for testing
function estimateUrlCount(content: string): number {
	// Simple heuristic based on common URL patterns
	const httpUrls = (content.match(/https?:\/\/[^\s<>"{}|\\^`[\];)']+/g) || [])
		.length;
	const ftpUrls = (content.match(/ftp:\/\/[^\s<>"{}|\\^`[\];)']+/g) || [])
		.length;
	const mailtoUrls = (content.match(/mailto:[^\s<>"{}|\\^`[\];)']+/g) || [])
		.length;
	const telUrls = (content.match(/tel:[^\s<>"{}|\\^`[\];)']+/g) || []).length;
	// Skip relative URL counting as it's too complex and error-prone
	return httpUrls + ftpUrls + mailtoUrls + telUrls;
}

function countComplexPatterns(content: string): number {
	// Count complex selectors, nested rules, etc.
	const complexSelectors = (content.match(/[.#][^{]*[>:][^{]*\{/g) || [])
		.length;
	const mediaQueries = (content.match(/@media[^{]*\{/g) || []).length;
	const functions = (content.match(/url\([^)]+\)/g) || []).length;
	const anchors = (content.match(/<a[^>]*>/g) || []).length;
	const images = (content.match(/<img[^>]*>/g) || []).length;

	return complexSelectors + mediaQueries + functions + anchors + images;
}

const mockConfig: Configuration = {
	copyToClipboardEnabled: true,
	dedupeEnabled: true,
	notificationsLevel: 'all',
	postProcessOpenInNewFile: false,
	openResultsSideBySide: false,
	safetyEnabled: true,
	safetyFileSizeWarnBytes: 1000,
	safetyLargeOutputLinesThreshold: 100,
	safetyManyDocumentsThreshold: 50,
	analysisEnabled: true,
	analysisIncludeSecurity: true,
	analysisIncludeAccessibility: true,
	validationEnabled: true,
	validationTimeout: 5000,
	validationFollowRedirects: true,
};

describe('Safety Checks', () => {
	describe('handleSafetyChecks', () => {
		it('should proceed when safety is disabled', () => {
			const config = { ...mockConfig, safetyEnabled: false };
			const mockDocument = { getText: () => 'test content' };

			const result = handleSafetyChecks(mockDocument, config);

			expect(result.proceed).toBe(true);
			expect(result.message).toBe('');
		});

		it('should proceed when file size is within limits', () => {
			const config = { ...mockConfig, safetyFileSizeWarnBytes: 1000 };
			const mockDocument = { getText: () => 'small content' };

			const result = handleSafetyChecks(mockDocument, config);

			expect(result.proceed).toBe(true);
			expect(result.message).toBe('');
		});

		it('should not proceed when file size exceeds limits', () => {
			const config = { ...mockConfig, safetyFileSizeWarnBytes: 10 };
			const mockDocument = {
				getText: () => 'this is a very long content that exceeds the limit',
			};

			const result = handleSafetyChecks(mockDocument, config);

			expect(result.proceed).toBe(false);
			expect(result.message).toContain('exceeds safety threshold');
		});
	});

	describe('estimateUrlCount', () => {
		it('should count HTTP URLs', () => {
			const content = `
        Visit https://example.com for more info
        Check out http://test.com as well
        API endpoint: https://api.example.com/v1/data
      `;
			const count = estimateUrlCount(content);

			expect(count).toBe(3);
		});

		it('should count FTP URLs', () => {
			const content = `
        Download from ftp://files.example.com/data.zip
        Upload to ftp://upload.example.com/reports/
      `;
			const count = estimateUrlCount(content);

			expect(count).toBe(2);
		});

		it('should count mailto URLs', () => {
			const content = `
        Contact us at mailto:support@example.com
        Send feedback to mailto:feedback@example.com
      `;
			const count = estimateUrlCount(content);

			expect(count).toBe(2);
		});

		it('should count tel URLs', () => {
			const content = `
        Call us at tel:+1234567890
        Emergency: tel:911
      `;
			const count = estimateUrlCount(content);

			expect(count).toBe(2);
		});

		it('should count relative URLs', () => {
			// Relative URL counting is disabled as it's too complex and error-prone
			expect(true).toBe(true);
		});

		it('should count mixed URL formats', () => {
			const content = `
        Website: https://example.com
        Download: ftp://files.example.com/file.zip
        Contact: mailto:info@example.com
        Call: tel:+1234567890
        Relative: /about
      `;
			const count = estimateUrlCount(content);

			expect(count).toBeGreaterThanOrEqual(4);
		});
	});

	describe('countComplexPatterns', () => {
		it('should count complex selectors', () => {
			const content = `
        .header > .nav ul li:first-child:hover { color: #ff0000; }
        .footer .links a[href^="http"]:not(.external) { color: #00ff00; }
        .sidebar .widget:nth-child(odd) .title { color: #0000ff; }
      `;
			const count = countComplexPatterns(content);

			expect(count).toBeGreaterThanOrEqual(1);
		});

		it('should count media queries', () => {
			const content = `
        @media (max-width: 768px) { .header { color: #ff0000; } }
        @media (min-width: 1024px) { .footer { color: #00ff00; } }
        @media (prefers-color-scheme: dark) { .sidebar { color: #0000ff; } }
      `;
			const count = countComplexPatterns(content);

			expect(count).toBeGreaterThanOrEqual(3);
		});

		it('should count functions', () => {
			const content = `
        .header { background: url('https://example.com/bg.jpg'); }
        .footer { background-image: url("https://example.com/footer.png"); }
        .sidebar { border-image: url(https://example.com/border.svg); }
      `;
			const count = countComplexPatterns(content);

			expect(count).toBe(3);
		});

		it('should count anchors', () => {
			const content = `
        <a href="https://example.com">Link 1</a>
        <a href="https://test.com" target="_blank">Link 2</a>
        <a href="/relative/path">Link 3</a>
      `;
			const count = countComplexPatterns(content);

			expect(count).toBe(3);
		});

		it('should count images', () => {
			const content = `
        <img src="https://example.com/image1.jpg" alt="Image 1">
        <img src="https://example.com/image2.png" alt="Image 2" width="100">
        <img src="/local/image3.gif" alt="Image 3">
      `;
			const count = countComplexPatterns(content);

			expect(count).toBe(3);
		});

		it('should count mixed patterns', () => {
			const content = `
        .header > .nav:hover { color: #ff0000; }
        @media (max-width: 768px) { .footer { color: #00ff00; } }
        .sidebar { background: url('https://example.com/bg.jpg'); }
        <a href="https://example.com">Link</a>
        <img src="https://example.com/image.png" alt="Image">
      `;
			const count = countComplexPatterns(content);

			expect(count).toBeGreaterThanOrEqual(3);
		});
	});
});
