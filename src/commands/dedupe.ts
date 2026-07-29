import * as vscode from 'vscode';

export function registerDedupeCommand(context: vscode.ExtensionContext): void {
	const command = vscode.commands.registerCommand(
		'urls-le.postProcess.dedupe',
		async () => executeDedupeCommand(),
	);

	context.subscriptions.push(command);
}

async function executeDedupeCommand(): Promise<void> {
	// Fail fast: Check for active editor
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		showNoEditorWarning();
		return;
	}

	try {
		await performDedupe(editor);
	} catch (error) {
		handleDedupeError(error);
	}
}

async function performDedupe(editor: vscode.TextEditor): Promise<void> {
	const document = editor.document;
	const lines = extractLines(document);
	const deduped = deduplicateLines(lines);

	await replaceDocumentContent(document, deduped);
	showSuccessMessage(lines.length, deduped.length);
}

function extractLines(document: vscode.TextDocument): string[] {
	return document
		.getText()
		.split('\n')
		.map((line) => line.trim());
}

function deduplicateLines(lines: string[]): string[] {
	const seen = new Set<string>();
	return lines.filter((line) => {
		// Skip empty lines and duplicates
		if (line === '' || seen.has(line)) {
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
	edit.replace(
		document.uri,
		new vscode.Range(0, 0, document.lineCount, 0),
		lines.join('\n'),
	);
	await vscode.workspace.applyEdit(edit);
}

function showNoEditorWarning(): void {
	vscode.window.showWarningMessage('No active editor found');
}

function showSuccessMessage(originalCount: number, dedupedCount: number): void {
	const removedCount = originalCount - dedupedCount;
	vscode.window.showInformationMessage(
		`Removed ${removedCount} duplicate URLs (${dedupedCount} remaining)`,
	);
}

function handleDedupeError(error: unknown): void {
	const message =
		error instanceof Error ? error.message : 'Unknown error occurred';

	vscode.window.showErrorMessage(`Deduplication failed: ${message}`);
}
