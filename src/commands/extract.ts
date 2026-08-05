import * as vscode from 'vscode';
import { getConfiguration } from '../config/config';
import { extractUrls } from '../extraction/extract';
import type { Configuration, ExtractionResult } from '../types';
import { copyResultsToClipboard } from '../utils/clipboard';
import { sanitizeErrorMessage } from '../utils/errors';
import { handleSafetyChecks } from '../utils/safety';
import type { CommandDependencies } from './dependencies';
import { displayResults } from './output';

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
		deps.notifier.showWarning(vscode.l10n.t('No active editor found'));
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

	// The token comes from a cancellable progress notification, so the user can
	// actually interrupt a long extraction. This previously created its own
	// CancellationTokenSource and never called cancel() on it, which meant the
	// token was permanently false: every isCancellationRequested check below was
	// unreachable and the extraction advertised an interruptibility it did not
	// have.
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: vscode.l10n.t('Extracting URLs...'),
			cancellable: true,
		},
		async (_progress, token): Promise<void> => {
			try {
				await performExtraction(document, config, token, deps);
			} catch (error) {
				handleExtractionError(error, deps);
			} finally {
				deps.statusBar.hideProgress();
			}
		},
	);
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
	const delivered = await displayResults(
		formattedUrls,
		document,
		config,
		token,
		deps,
	);
	await copyResultsToClipboard(
		formattedUrls,
		config.copyToClipboardEnabled,
		token,
		deps.notifier,
	);

	// A cancel that lands between the extraction and the output route leaves
	// displayResults a no-op — no document opened, no edit applied. Announcing
	// "Extracted N URLs" after that reports a result the user never received.
	if (token.isCancellationRequested) {
		return;
	}

	// Same for a route that failed outright: the error is already on screen,
	// and following it with a success count would report both for one action.
	if (!delivered) {
		return;
	}

	deps.notifier.showInfo(
		vscode.l10n.t('Extracted {0} URLs', result.urls.length),
	);
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
	const errorMessage = sanitizeErrorMessage(extractErrorMessage(result));
	deps.notifier.showError(
		vscode.l10n.t('Failed to extract URLs: {0}', errorMessage),
	);
}

function extractErrorMessage(result: ExtractionResult): string {
	if (result.errors && result.errors.length > 0) {
		return result.errors[0]?.message || 'Unknown error';
	}
	return 'Unknown error';
}

function showNoUrlsFound(deps: CommandDependencies): void {
	deps.notifier.showInfo(
		vscode.l10n.t('No URLs found in the current document'),
	);
}

function handleExtractionError(
	error: unknown,
	deps: CommandDependencies,
): void {
	const message = sanitizeErrorMessage(
		error instanceof Error ? error.message : 'Unknown error occurred',
	);

	deps.notifier.showError(
		vscode.l10n.t('Failed to extract URLs: {0}', message),
	);
	deps.telemetry.event('extract-error', { error: message });
}
