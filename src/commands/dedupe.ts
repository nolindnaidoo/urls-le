import * as vscode from 'vscode';
import type { Notifier } from '../ui/notifier';
import { replaceDocumentContent } from '../utils/document';
import { sanitizeErrorMessage } from '../utils/errors';
import { hasPosition, onValues } from '../utils/positions';

export function registerDedupeCommand(
	context: vscode.ExtensionContext,
	notifier: Notifier,
): void {
	const command = vscode.commands.registerCommand(
		'urls-le.postProcess.dedupe',
		async () => executeDedupeCommand(notifier),
	);

	context.subscriptions.push(command);
}

async function executeDedupeCommand(notifier: Notifier): Promise<void> {
	// Fail fast: Check for active editor
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		notifier.showWarning(vscode.l10n.t('No active editor found'));
		return;
	}

	try {
		await performDedupe(editor, notifier);
	} catch (error) {
		handleDedupeError(error, notifier);
	}
}

async function performDedupe(
	editor: vscode.TextEditor,
	notifier: Notifier,
): Promise<void> {
	const document = editor.document;
	// Blank lines are dropped from the output but must not be reported as
	// removed duplicates.
	const lines = extractNonEmptyLines(document);
	// By URL: with positions shown every line is different, and a dedupe
	// over whole lines would remove nothing.
	const deduped = onValues(lines, deduplicateLines);

	const applied = await replaceDocumentContent(document, deduped);
	if (!applied) {
		notifier.showError(vscode.l10n.t('Failed to apply edits to document'));
		return;
	}

	const removed = lines.length - deduped.length;
	const summary = vscode.l10n.t(
		'Removed {0} duplicate URLs ({1} remaining)',
		removed,
		deduped.length,
	);
	// A URL found five times has five positions, and only one can stay.
	notifier.showInfo(
		lines.some(hasPosition)
			? `${summary}. ${vscode.l10n.t('Each value shows its first position only.')}`
			: summary,
	);
}

function extractNonEmptyLines(document: vscode.TextDocument): string[] {
	return document
		.getText()
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function deduplicateLines(lines: string[]): string[] {
	const seen = new Set<string>();
	return lines.filter((line) => {
		if (seen.has(line)) {
			return false;
		}
		seen.add(line);
		return true;
	});
}

function handleDedupeError(error: unknown, notifier: Notifier): void {
	const message = sanitizeErrorMessage(
		error instanceof Error ? error.message : 'Unknown error occurred',
	);
	notifier.showError(vscode.l10n.t('Deduplication failed: {0}', message));
}
