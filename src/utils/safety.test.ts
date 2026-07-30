import { describe, expect, it } from 'vitest';
import type { Configuration } from '../types';
import { handleSafetyChecks } from './safety';

const mockConfig: Configuration = {
	copyToClipboardEnabled: true,
	dedupeEnabled: true,
	notificationsLevel: 'all',
	postProcessOpenInNewFile: false,
	openResultsSideBySide: false,
	safetyEnabled: true,
	safetyFileSizeWarnBytes: 1000,
	safetyLargeOutputLinesThreshold: 100,
	statusBarEnabled: true,
	telemetryEnabled: false,
};

describe('Safety Checks', () => {
	describe('handleSafetyChecks', () => {
		it('should proceed when safety is disabled', () => {
			const config = { ...mockConfig, safetyEnabled: false };
			const mockDocument = {
				getText: () => 'test content',
			} as unknown as import('vscode').TextDocument;

			const result = handleSafetyChecks(mockDocument, config);

			expect(result.proceed).toBe(true);
			expect(result.message).toBe('');
		});

		it('should proceed when file size is within limits', () => {
			const config = { ...mockConfig, safetyFileSizeWarnBytes: 1000 };
			const mockDocument = {
				getText: () => 'small content',
			} as unknown as import('vscode').TextDocument;

			const result = handleSafetyChecks(mockDocument, config);

			expect(result.proceed).toBe(true);
			expect(result.message).toBe('');
		});

		it('should not proceed when file size exceeds limits', () => {
			const config = { ...mockConfig, safetyFileSizeWarnBytes: 10 };
			const mockDocument = {
				getText: () => 'this is a very long content that exceeds the limit',
			} as unknown as import('vscode').TextDocument;

			const result = handleSafetyChecks(mockDocument, config);

			expect(result.proceed).toBe(false);
			expect(result.message).toContain('exceeds safety threshold');
		});

		it('warns when the line count exceeds the large-output threshold', () => {
			const config = { ...mockConfig, safetyLargeOutputLinesThreshold: 100 };
			const mockDocument = {
				getText: () => Array.from({ length: 150 }, () => 'x').join('\n'),
			} as unknown as import('vscode').TextDocument;

			const result = handleSafetyChecks(mockDocument, config);

			expect(result.proceed).toBe(true);
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0]).toContain('Large file: 150 lines');
		});

		it('reports no warnings for small documents', () => {
			const mockDocument = {
				getText: () => 'one\ntwo',
			} as unknown as import('vscode').TextDocument;

			const result = handleSafetyChecks(mockDocument, config());

			expect(result.warnings).toHaveLength(0);
		});
	});
});

function config(): Configuration {
	return mockConfig;
}
