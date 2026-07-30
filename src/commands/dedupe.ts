import * as vscode from 'vscode';
import type { Notifier } from '../ui/notifier';
import { sanitizeErrorMessage } from '../utils/errors';

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
		notifier.showWarning('No active editor found');
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
	const deduped = deduplicateLines(lines);

	await replaceDocumentContent(document, deduped);
	const removed = lines.length - deduped.length;
	notifier.showInfo(
		`Removed ${removed} duplicate URLs (${deduped.length} remaining)`,
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

async function replaceDocumentContent(
	document: vscode.TextDocument,
	lines: string[],
): Promise<void> {
	const edit = new vscode.WorkspaceEdit();
	edit.replace(document.uri, fullDocumentRange(document), lines.join('\n'));
	await vscode.workspace.applyEdit(edit);
}

function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
	return new vscode.Range(
		document.positionAt(0),
		document.lineAt(document.lineCount - 1).range.end,
	);
}

function handleDedupeError(error: unknown, notifier: Notifier): void {
	const message = sanitizeErrorMessage(
		error instanceof Error ? error.message : 'Unknown error occurred',
	);
	notifier.showError(`Deduplication failed: ${message}`);
}
