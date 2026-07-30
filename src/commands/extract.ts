import * as vscode from 'vscode';
import { getConfiguration } from '../config/config';
import { extractUrls } from '../extraction/extract';
import type { Telemetry } from '../telemetry/telemetry';
import type { Configuration, ExtractionResult } from '../types';
import type { Notifier } from '../ui/notifier';
import type { StatusBar } from '../ui/statusBar';
import { handleSafetyChecks } from '../utils/safety';

const MAX_CLIPBOARD_SIZE = 1_000_000; // 1MB

interface CommandDependencies {
	readonly telemetry: Telemetry;
	readonly notifier: Notifier;
	readonly statusBar: StatusBar;
}

export function registerExtractCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<CommandDependencies>,
): void {
	const command = vscode.commands.registerCommand(
		'urls-le.extractUrls',
		async () => executeExtractCommand(deps),
	);

	context.subscriptions.push(command);
}

async function executeExtractCommand(deps: CommandDependencies): Promise<void> {
	deps.telemetry.event('command-extract-urls');

	// Fail fast: Check for active editor
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		deps.notifier.showWarning('No active editor found');
		return;
	}

	const document = editor.document;
	const config = getConfiguration();

	// Fail fast: Safety checks
	const safetyResult = handleSafetyChecks(document, config);
	if (!safetyResult.proceed) {
		deps.notifier.showWarning(safetyResult.message);
		return;
	}
	for (const warning of safetyResult.warnings) {
		deps.notifier.showWarning(warning);
	}

	const cancellationToken = new vscode.CancellationTokenSource();

	try {
		await performExtraction(document, config, cancellationToken.token, deps);
	} catch (error) {
		handleExtractionError(error, deps);
	} finally {
		deps.statusBar.hideProgress();
		cancellationToken.dispose();
	}
}

async function performExtraction(
	document: vscode.TextDocument,
	config: Configuration,
	token: vscode.CancellationToken,
	deps: CommandDependencies,
): Promise<void> {
	deps.statusBar.showExtracting();

	// Fail fast: Check cancellation
	if (token.isCancellationRequested) {
		return;
	}

	const result = await extractUrls(
		document.getText(),
		document.languageId,
		token,
	);

	// Fail fast: Check cancellation after extraction
	if (token.isCancellationRequested) {
		return;
	}

	// Fail fast: Check extraction success
	if (!result.success) {
		handleExtractionFailure(result, deps);
		return;
	}

	// Fail fast: Check for empty results
	if (!result.urls || result.urls.length === 0) {
		showNoUrlsFound(deps);
		return;
	}

	const formattedUrls = formatUrls(result, config);
	await displayResults(formattedUrls, document, config, token, deps);
	await handleClipboard(formattedUrls, config, token, deps);

	deps.notifier.showInfo(`Extracted ${result.urls.length} URLs`);
	deps.telemetry.event('extract-success', { count: result.urls.length });
}

function formatUrls(result: ExtractionResult, config: Configuration): string[] {
	const values = result.urls
		.filter((url) => url?.value && typeof url.value === 'string')
		.map((url) => url.value);
	return config.dedupeEnabled ? [...new Set(values)] : values;
}

function handleExtractionFailure(
	result: ExtractionResult,
	deps: CommandDependencies,
): void {
	const errorMessage = extractErrorMessage(result);
	deps.notifier.showError(`Failed to extract URLs: ${errorMessage}`);
}

function extractErrorMessage(result: ExtractionResult): string {
	if (result.errors && result.errors.length > 0) {
		return result.errors[0]?.message || 'Unknown error';
	}
	return 'Unknown error';
}

function showNoUrlsFound(deps: CommandDependencies): void {
	deps.notifier.showInfo('No URLs found in the current document');
}

async function displayResults(
	formattedUrls: string[],
	document: vscode.TextDocument,
	config: Configuration,
	token: vscode.CancellationToken,
	deps: CommandDependencies,
): Promise<void> {
	const content = formattedUrls.join('\n');

	if (config.openResultsSideBySide) {
		await openSideBySide(content, token, deps);
		return;
	}

	if (config.postProcessOpenInNewFile) {
		await openInNewFile(content, token, deps);
		return;
	}

	await replaceDocumentContent(document, content, token, deps);
}

async function openSideBySide(
	content: string,
	token: vscode.CancellationToken,
	deps: CommandDependencies,
): Promise<void> {
	// Fail fast: Check cancellation
	if (token.isCancellationRequested) {
		return;
	}

	try {
		const doc = await vscode.workspace.openTextDocument({
			content,
			language: 'plaintext',
		});
		await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
	} catch (error) {
		deps.notifier.showError(
			`Failed to open results side by side: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
}

async function openInNewFile(
	content: string,
	token: vscode.CancellationToken,
	deps: CommandDependencies,
): Promise<void> {
	// Fail fast: Check cancellation
	if (token.isCancellationRequested) {
		return;
	}

	try {
		const doc = await vscode.workspace.openTextDocument({
			content,
			language: 'plaintext',
		});
		await vscode.window.showTextDocument(doc);
	} catch (error) {
		deps.notifier.showError(
			`Failed to open results in new file: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
}

async function replaceDocumentContent(
	document: vscode.TextDocument,
	content: string,
	token: vscode.CancellationToken,
	deps: CommandDependencies,
): Promise<void> {
	// Fail fast: Check cancellation
	if (token.isCancellationRequested) {
		return;
	}

	try {
		const edit = new vscode.WorkspaceEdit();
		edit.replace(
			document.uri,
			new vscode.Range(
				document.positionAt(0),
				document.lineAt(document.lineCount - 1).range.end,
			),
			content,
		);

		const success = await vscode.workspace.applyEdit(edit);
		if (!success) {
			deps.notifier.showError('Failed to apply edits to document');
		}
	} catch (error) {
		deps.notifier.showError(
			`Failed to replace document content: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
}

async function handleClipboard(
	formattedUrls: string[],
	config: Configuration,
	token: vscode.CancellationToken,
	deps: CommandDependencies,
): Promise<void> {
	// Fail fast: Check if clipboard is enabled
	if (!config.copyToClipboardEnabled) {
		return;
	}

	const clipboardText = formattedUrls.join('\n');
	const byteSize = calculateByteSize(clipboardText);

	// Fail fast: Check size limit
	if (byteSize > MAX_CLIPBOARD_SIZE) {
		deps.notifier.showWarning(
			`Results too large for clipboard (${byteSize} bytes), skipping clipboard copy`,
		);
		return;
	}

	// Fail fast: Check cancellation
	if (token.isCancellationRequested) {
		return;
	}

	await copyToClipboard(clipboardText, deps);
}

function calculateByteSize(text: string): number {
	return new TextEncoder().encode(text).length;
}

async function copyToClipboard(
	text: string,
	deps: CommandDependencies,
): Promise<void> {
	try {
		await vscode.env.clipboard.writeText(text);
	} catch (error) {
		handleClipboardError(error, deps);
	}
}

function handleClipboardError(error: unknown, deps: CommandDependencies): void {
	const errorMessage =
		error instanceof Error ? error.message : 'Unknown clipboard error';

	if (isPermissionError(errorMessage)) {
		deps.notifier.showWarning(
			'Clipboard access denied. Extracted URLs but could not copy to clipboard.',
		);
		return;
	}

	deps.notifier.showWarning(`Failed to copy to clipboard: ${errorMessage}`);
}

function isPermissionError(message: string): boolean {
	return message.includes('permission') || message.includes('access');
}

function handleExtractionError(
	error: unknown,
	deps: CommandDependencies,
): void {
	const message =
		error instanceof Error ? error.message : 'Unknown error occurred';

	deps.notifier.showError(`Failed to extract URLs: ${message}`);
	deps.telemetry.event('extract-error', { error: message });
}
