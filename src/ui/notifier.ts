import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { getConfiguration } from '../config/config';

const _localize = nls.config({ messageFormat: nls.MessageFormat.file })();

export interface Notifier {
	showInfo(message: string): void;
	showWarning(message: string): void;
	showError(message: string): void;
}

export function createNotifier(): Notifier {
	return Object.freeze({
		showInfo(message: string): void {
			const config = getConfiguration();
			if (config.notificationsLevel === 'all') {
				vscode.window.showInformationMessage(message);
			}
		},
		showWarning(message: string): void {
			const config = getConfiguration();
			if (config.notificationsLevel !== 'silent') {
				vscode.window.showWarningMessage(message);
			}
		},
		showError(message: string): void {
			// Always show errors regardless of notification level
			vscode.window.showErrorMessage(message);
		},
	});
}
