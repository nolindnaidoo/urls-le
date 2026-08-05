import * as vscode from 'vscode';
import type { Configuration } from '../types';

export interface SafetyResult {
	readonly proceed: boolean;
	readonly message: string;
	readonly warnings: readonly string[];
}

/**
 * Pre-extraction guardrails: refuse files over the configured size
 * threshold and warn on line counts over the large-output threshold.
 * Pure string checks — no filesystem access.
 */
export function handleSafetyChecks(
	document: vscode.TextDocument,
	config: Configuration,
): SafetyResult {
	// Fail fast: Skip checks if safety is disabled
	if (!config.safetyEnabled) {
		return Object.freeze({ proceed: true, message: '', warnings: [] });
	}

	const content = document.getText();

	// Fail fast: Check file size
	if (content.length > config.safetyFileSizeWarnBytes) {
		return Object.freeze({
			proceed: false,
			message: vscode.l10n.t(
				'File size ({0} bytes) exceeds safety threshold ({1} bytes)',
				content.length,
				config.safetyFileSizeWarnBytes,
			),
			warnings: [],
		});
	}

	const warnings: string[] = [];
	const lineCount = content.split('\n').length;
	if (lineCount > config.safetyLargeOutputLinesThreshold) {
		warnings.push(
			vscode.l10n.t(
				'Large file: {0} lines (threshold: {1}); extraction may be slow',
				lineCount,
				config.safetyLargeOutputLinesThreshold,
			),
		);
	}

	return Object.freeze({
		proceed: true,
		message: '',
		warnings: Object.freeze(warnings),
	});
}
