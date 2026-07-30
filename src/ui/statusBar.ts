import * as vscode from 'vscode';
import { getConfiguration } from '../config/config';

const IDLE_TEXT = 'URLs-LE: Ready';

export interface StatusBar {
	showExtracting(): void;
	hideProgress(): void;
	dispose(): void;
}

export function createStatusBar(context: vscode.ExtensionContext): StatusBar {
	const item = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		1000,
	);
	item.text = IDLE_TEXT;
	item.tooltip = 'URLs-LE: URL extraction';
	item.command = 'urls-le.extractUrls';
	context.subscriptions.push(item);

	const applyVisibility = (): void => {
		if (getConfiguration().statusBarEnabled) {
			item.show();
		} else {
			item.hide();
		}
	};
	applyVisibility();

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('urls-le.statusBar.enabled')) {
				applyVisibility();
			}
		}),
	);

	return Object.freeze({
		showExtracting(): void {
			item.text = 'URLs-LE: Extracting...';
		},
		hideProgress(): void {
			item.text = IDLE_TEXT;
		},
		dispose(): void {
			item.dispose();
		},
	});
}
