import type * as vscode from 'vscode';
import type { Configuration } from '../types';

export interface SafetyResult {
	proceed: boolean;
	message: string;
}

export function handleSafetyChecks(
	document: vscode.TextDocument,
	config: Configuration,
): SafetyResult {
	if (!config.safetyEnabled) {
		return { proceed: true, message: '' };
	}

	// Check file size
	if (document.getText().length > config.safetyFileSizeWarnBytes) {
		return {
			proceed: false,
			message: `File size (${document.getText().length} bytes) exceeds safety threshold (${
				config.safetyFileSizeWarnBytes
			} bytes)`,
		};
	}

	return { proceed: true, message: '' };
}
