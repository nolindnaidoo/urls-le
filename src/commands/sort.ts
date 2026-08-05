import * as vscode from 'vscode';
import type { Notifier } from '../ui/notifier';
import { replaceDocumentContent } from '../utils/document';
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
		notifier.showWarning(vscode.l10n.t('No active editor found'));
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
		placeHolder: vscode.l10n.t('Select sort order'),
	});
}

function createSortOptions(): SortOption[] {
	return [
		{
			label: vscode.l10n.t('Alphabetical (A → Z)'),
			value: 'asc',
		},
		{
			label: vscode.l10n.t('Alphabetical (Z → A)'),
			value: 'desc',
		},
		{
			label: vscode.l10n.t('By Domain'),
			value: 'domain',
		},
		{
			label: vscode.l10n.t('By Length (Short → Long)'),
			value: 'length-asc',
		},
		{
			label: vscode.l10n.t('By Length (Long → Short)'),
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

	const applied = await replaceDocumentContent(document, sorted);
	if (!applied) {
		notifier.showError(vscode.l10n.t('Failed to apply edits to document'));
		return;
	}

	notifier.showInfo(
		vscode.l10n.t('Sorted {0} URLs ({1})', sorted.length, sortOption.label),
	);
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

function handleSortError(error: unknown, notifier: Notifier): void {
	const message = sanitizeErrorMessage(
		error instanceof Error ? error.message : 'Unknown error occurred',
	);
	notifier.showError(vscode.l10n.t('Sorting failed: {0}', message));
}
