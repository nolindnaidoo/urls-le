import * as vscode from 'vscode';
import type { Configuration } from '../types';
import { replaceDocumentContent } from '../utils/document';
import type { CommandDependencies } from './dependencies';

/**
 * Where extraction results go: beside the source, in a new file, or over the
 * document itself.
 *
 * Split out of the extract command, which had grown to hold orchestration,
 * routing, clipboard handling and error mapping in one file. Every route
 * checks cancellation first — the token comes from a cancellable progress
 * notification, so the user really can interrupt between the extraction and
 * the write.
 */

function describe(error: unknown): string {
	if (error instanceof Error) return error.message;
	return vscode.l10n.t('Unknown error');
}

/** Returns whether the results reached the user. */
export async function displayResults(
	formattedUrls: readonly string[],
	document: vscode.TextDocument,
	config: Configuration,
	token: vscode.CancellationToken,
	deps: CommandDependencies,
): Promise<boolean> {
	const content = formattedUrls.join('\n');

	if (config.openResultsSideBySide) {
		return await openBeside(content, token, deps);
	}

	if (config.postProcessOpenInNewFile) {
		return await openInNewFile(content, token, deps);
	}

	return await replaceInPlace(document, content, token, deps);
}

async function openBeside(
	content: string,
	token: vscode.CancellationToken,
	deps: CommandDependencies,
): Promise<boolean> {
	if (token.isCancellationRequested) return false;

	try {
		const doc = await vscode.workspace.openTextDocument({
			content,
			language: 'plaintext',
		});
		await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
		return true;
	} catch (error) {
		deps.notifier.showError(
			vscode.l10n.t(
				'Failed to open results side by side: {0}',
				describe(error),
			),
		);
		return false;
	}
}

async function openInNewFile(
	content: string,
	token: vscode.CancellationToken,
	deps: CommandDependencies,
): Promise<boolean> {
	if (token.isCancellationRequested) return false;

	try {
		const doc = await vscode.workspace.openTextDocument({
			content,
			language: 'plaintext',
		});
		await vscode.window.showTextDocument(doc);
		return true;
	} catch (error) {
		deps.notifier.showError(
			vscode.l10n.t('Failed to open results in new file: {0}', describe(error)),
		);
		return false;
	}
}

async function replaceInPlace(
	document: vscode.TextDocument,
	content: string,
	token: vscode.CancellationToken,
	deps: CommandDependencies,
): Promise<boolean> {
	if (token.isCancellationRequested) return false;

	try {
		// The shared helper owns the full-document range and returns whether the
		// edit landed; this file used to carry a second copy of both.
		const applied = await replaceDocumentContent(document, [content]);
		if (!applied) {
			deps.notifier.showError(
				vscode.l10n.t('Failed to apply edits to document'),
			);
			return false;
		}
		return true;
	} catch (error) {
		deps.notifier.showError(
			vscode.l10n.t('Failed to replace document content: {0}', describe(error)),
		);
		return false;
	}
}
