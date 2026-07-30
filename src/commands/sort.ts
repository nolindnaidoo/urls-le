import * as vscode from 'vscode';
import type { Notifier } from '../ui/notifier';
import { sanitizeErrorMessage } from '../utils/errors';

type SortOrder = 'asc' | 'desc' | 'domain' | 'length-asc' | 'length-desc';

interface SortOption {
	readonly label: string;
	readonly value: SortOrder;
}

export function registerSortCommand(
	context: vscode.ExtensionContext,
	notifier: Notifier,
): void {
	const command = vscode.commands.registerCommand(
		'urls-le.postProcess.sort',
		async () => executeSortCommand(notifier),
	);

	context.subscriptions.push(command);
}

async function executeSortCommand(notifier: Notifier): Promise<void> {
	// Fail fast: Check for active editor
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		notifier.showWarning('No active editor found');
		return;
	}

	const sortOption = await promptForSortOrder();

	// Fail fast: User cancelled
	if (!sortOption) {
		return;
	}

	try {
		await performSort(editor, sortOption, notifier);
	} catch (error) {
		handleSortError(error, notifier);
	}
}

async function promptForSortOrder(): Promise<SortOption | undefined> {
	return vscode.window.showQuickPick(createSortOptions(), {
		placeHolder: 'Select sort order',
	});
}

function createSortOptions(): SortOption[] {
	return [
		{
			label: 'Alphabetical (A → Z)',
			value: 'asc',
		},
		{
			label: 'Alphabetical (Z → A)',
			value: 'desc',
		},
		{
			label: 'By Domain',
			value: 'domain',
		},
		{
			label: 'By Length (Short → Long)',
			value: 'length-asc',
		},
		{
			label: 'By Length (Long → Short)',
			value: 'length-desc',
		},
	];
}

async function performSort(
	editor: vscode.TextEditor,
	sortOption: SortOption,
	notifier: Notifier,
): Promise<void> {
	const document = editor.document;
	const lines = extractNonEmptyLines(document);
	const sorted = sortLines(lines, sortOption.value);

	await replaceDocumentContent(document, sorted);
	notifier.showInfo(`Sorted ${sorted.length} URLs (${sortOption.label})`);
}

function extractNonEmptyLines(document: vscode.TextDocument): string[] {
	return document
		.getText()
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function sortLines(lines: string[], order: SortOrder): string[] {
	switch (order) {
		case 'domain':
			return sortByDomain(lines);
		case 'length-asc':
			return sortByLength(lines, 'asc');
		case 'length-desc':
			return sortByLength(lines, 'desc');
		case 'asc':
			return sortAlphabetically(lines, 'asc');
		case 'desc':
			return sortAlphabetically(lines, 'desc');
	}
}

function sortByDomain(lines: string[]): string[] {
	return [...lines].sort((a, b) => {
		const domainA = extractDomain(a);
		const domainB = extractDomain(b);
		return domainA.localeCompare(domainB);
	});
}

function extractDomain(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		// If URL parsing fails, use the original string
		return url;
	}
}

function sortByLength(lines: string[], order: 'asc' | 'desc'): string[] {
	return [...lines].sort((a, b) => {
		return order === 'asc' ? a.length - b.length : b.length - a.length;
	});
}

function sortAlphabetically(lines: string[], order: 'asc' | 'desc'): string[] {
	return [...lines].sort((a, b) => {
		return order === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
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

function handleSortError(error: unknown, notifier: Notifier): void {
	const message = sanitizeErrorMessage(
		error instanceof Error ? error.message : 'Unknown error occurred',
	);
	notifier.showError(`Sorting failed: ${message}`);
}
