import * as vscode from 'vscode';
import { getConfiguration } from '../config/config';

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

		mainItem.text = 'URLs-LE: Ready';
		mainItem.tooltip = 'URLs-LE: URL extraction and validation';
		mainItem.command = 'urls-le.extractUrls';
		mainItem.show();
	}

	return Object.freeze({
		showIdle(): void {
			if (mainItem) {
				mainItem.text = 'URLs-LE: Ready';
				mainItem.color = undefined;
				mainItem.backgroundColor = undefined;
				mainItem.tooltip = 'URLs-LE: Ready to extract URLs';
				mainItem.show();
			}
		},

		showExtracting(): void {
			if (mainItem) {
				mainItem.text = 'URLs-LE: Extracting...';
				mainItem.color = new vscode.ThemeColor(
					'statusBarItem.activeForeground',
				);
				mainItem.backgroundColor = new vscode.ThemeColor(
					'statusBarItem.activeBackground',
				);
				mainItem.tooltip = 'URLs-LE: Extracting URLs from document';
				mainItem.show();
			}
		},

		showSuccess(count: number): void {
			if (mainItem) {
				mainItem.text = `URLs-LE: ${count} URLs found`;
				mainItem.color = new vscode.ThemeColor(
					'statusBarItem.successForeground',
				);
				mainItem.backgroundColor = new vscode.ThemeColor(
					'statusBarItem.successBackground',
				);
				mainItem.tooltip = `URLs-LE: Successfully extracted ${count} URLs`;
				mainItem.show();
			}
		},

		showError(message: string): void {
			if (mainItem) {
				mainItem.text = 'URLs-LE: Error';
				mainItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
				mainItem.backgroundColor = new vscode.ThemeColor(
					'statusBarItem.errorBackground',
				);
				mainItem.tooltip = `Error: ${message}`;
				mainItem.show();
			}
		},

		showWarning(message: string): void {
			if (mainItem) {
				mainItem.text = 'URLs-LE: Warning';
				mainItem.color = new vscode.ThemeColor(
					'statusBarItem.warningForeground',
				);
				mainItem.backgroundColor = new vscode.ThemeColor(
					'statusBarItem.warningBackground',
				);
				mainItem.tooltip = `Warning: ${message}`;
				mainItem.show();
			}
		},

		showProgress(message: string): void {
			if (progressItem) {
				progressItem.text = `URLs-LE: ${message}`;
				progressItem.color = new vscode.ThemeColor(
					'statusBarItem.activeForeground',
				);
				progressItem.backgroundColor = new vscode.ThemeColor(
					'statusBarItem.activeBackground',
				);
				progressItem.tooltip = `URLs-LE: ${message}`;
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
