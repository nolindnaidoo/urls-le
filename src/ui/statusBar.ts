import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { getConfiguration } from '../config/config';

const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

export interface StatusBar {
	showIdle(): void;
	showExtracting(): void;
	showSuccess(count: number): void;
	showError(message: string): void;
	showWarning(message: string): void;
	showProgress(message: string): void;
	hideProgress(): void;
	hide(): void;
	dispose(): void;
}

export function createStatusBar(context: vscode.ExtensionContext): StatusBar {
	return createStatusBarService(context);
}

export function createStatusBarService(
	context: vscode.ExtensionContext,
): StatusBar {
	const config = getConfiguration();
	let mainItem: vscode.StatusBarItem | undefined;
	let progressItem: vscode.StatusBarItem | undefined;

	if (config.statusBarEnabled) {
		mainItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			1000,
		);
		progressItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			1001,
		);

		context.subscriptions.push(mainItem, progressItem);

		mainItem.text = localize('runtime.statusbar.text.ready', 'URLs-LE: Ready');
		mainItem.tooltip = localize(
			'runtime.statusbar.tooltip.default',
			'URLs-LE: URL extraction and validation',
		);
		mainItem.command = 'urls-le.extractUrls';
		mainItem.show();
	}

	return Object.freeze({
		showIdle(): void {
			if (mainItem) {
				mainItem.text = localize(
					'runtime.statusbar.text.ready',
					'URLs-LE: Ready',
				);
				mainItem.color = undefined;
				mainItem.backgroundColor = undefined;
				mainItem.tooltip = localize(
					'runtime.statusbar.tooltip.ready',
					'URLs-LE: Ready to extract URLs',
				);
				mainItem.show();
			}
		},

		showExtracting(): void {
			if (mainItem) {
				mainItem.text = localize(
					'runtime.statusbar.text.extracting',
					'URLs-LE: Extracting...',
				);
				mainItem.color = new vscode.ThemeColor(
					'statusBarItem.activeForeground',
				);
				mainItem.backgroundColor = new vscode.ThemeColor(
					'statusBarItem.activeBackground',
				);
				mainItem.tooltip = localize(
					'runtime.statusbar.tooltip.extracting',
					'URLs-LE: Extracting URLs from document',
				);
				mainItem.show();
			}
		},

		showSuccess(count: number): void {
			if (mainItem) {
				mainItem.text = localize(
					'runtime.statusbar.text.success',
					'URLs-LE: {0} URLs found',
					count,
				);
				mainItem.color = new vscode.ThemeColor(
					'statusBarItem.successForeground',
				);
				mainItem.backgroundColor = new vscode.ThemeColor(
					'statusBarItem.successBackground',
				);
				mainItem.tooltip = localize(
					'runtime.statusbar.tooltip.success',
					'URLs-LE: Successfully extracted {0} URLs',
					count,
				);
				mainItem.show();
			}
		},

		showError(message: string): void {
			if (mainItem) {
				mainItem.text = localize(
					'runtime.statusbar.text.error',
					'URLs-LE: Error',
				);
				mainItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
				mainItem.backgroundColor = new vscode.ThemeColor(
					'statusBarItem.errorBackground',
				);
				mainItem.tooltip = localize(
					'runtime.statusbar.tooltip.error',
					'Error: {0}',
					message,
				);
				mainItem.show();
			}
		},

		showWarning(message: string): void {
			if (mainItem) {
				mainItem.text = localize(
					'runtime.statusbar.text.warning',
					'URLs-LE: Warning',
				);
				mainItem.color = new vscode.ThemeColor(
					'statusBarItem.warningForeground',
				);
				mainItem.backgroundColor = new vscode.ThemeColor(
					'statusBarItem.warningBackground',
				);
				mainItem.tooltip = localize(
					'runtime.statusbar.tooltip.warning',
					'Warning: {0}',
					message,
				);
				mainItem.show();
			}
		},

		showProgress(message: string): void {
			if (progressItem) {
				progressItem.text = localize(
					'runtime.statusbar.text',
					'URLs-LE: {0}',
					message,
				);
				progressItem.color = new vscode.ThemeColor(
					'statusBarItem.activeForeground',
				);
				progressItem.backgroundColor = new vscode.ThemeColor(
					'statusBarItem.activeBackground',
				);
				progressItem.tooltip = localize(
					'runtime.statusbar.text',
					'URLs-LE: {0}',
					message,
				);
				progressItem.show();
			}
		},

		hideProgress(): void {
			progressItem?.hide();
		},

		hide(): void {
			mainItem?.hide();
			progressItem?.hide();
		},

		dispose(): void {
			mainItem?.dispose();
			progressItem?.dispose();
		},
	});
}
