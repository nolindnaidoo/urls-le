import * as vscode from 'vscode';
import { getConfiguration } from '../config/config';

// Resolved per call, never at module scope. A top-level vscode.l10n.t() runs
// while the bundle is still being required, which makes the string depend on
// module evaluation order rather than on activation — and it is exactly what
// the runtime bundle gate in scripts/check-bundle.js refuses to load.
const idleText = (): string => vscode.l10n.t('URLs-LE: Ready');

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
	item.text = idleText();
	item.tooltip = vscode.l10n.t('URLs-LE: URL extraction');
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
			item.text = vscode.l10n.t('URLs-LE: Extracting...');
		},
		hideProgress(): void {
			item.text = idleText();
		},
		dispose(): void {
			item.dispose();
		},
	});
}
