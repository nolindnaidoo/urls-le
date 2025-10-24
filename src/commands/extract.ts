import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { getConfiguration } from '../config/config';
import { extractUrls } from '../extraction/extract';
import type { Telemetry } from '../telemetry/telemetry';
import type { Notifier } from '../ui/notifier';
import type { StatusBar } from '../ui/statusBar';
import { handleSafetyChecks } from '../utils/safety';

const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

export function registerExtractCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry;
		notifier: Notifier;
		statusBar: StatusBar;
	}>,
): void {
	const command = vscode.commands.registerCommand(
		'urls-le.extractUrls',
		async () => {
			deps.telemetry.event('command-extract-urls');

			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				deps.notifier.showWarning(
					localize('runtime.error.no-active-editor', 'No active editor found'),
				);
				return;
			}

			const document = editor.document;
			const config = getConfiguration();

			// Safety checks
			const safetyResult = handleSafetyChecks(document, config);
			if (!safetyResult.proceed) {
				deps.notifier.showWarning(safetyResult.message);
				return;
			}

			// Create cancellation token for this operation
			const cancellationToken = new vscode.CancellationTokenSource();
			const token = cancellationToken.token;

			try {
				deps.statusBar.showExtracting();

				// Check for cancellation before starting
				if (token.isCancellationRequested) {
					return;
				}

				const result = await extractUrls(
					document.getText(),
					document.languageId,
					token,
				);

				// Check for cancellation after extraction
				if (token.isCancellationRequested) {
					return;
				}

				if (!result.success) {
					const errorMessage =
						result.errors && result.errors.length > 0
							? result.errors[0]?.message || 'Unknown error'
							: 'Unknown error';
					deps.notifier.showError(
						localize(
							'runtime.error.extraction-failed',
							'Failed to extract URLs: {0}',
							errorMessage,
						),
					);
					return;
				}

				if (!result.urls || result.urls.length === 0) {
					deps.notifier.showInfo(
						localize(
							'runtime.info.no-urls-found',
							'No URLs found in the current document',
						),
					);
					return;
				}

				// Format URLs with validation
				const formattedUrls = result.urls
					.filter((url) => url?.value && typeof url.value === 'string')
					.map((url) => url.value);

				// Open results
				if (config.openResultsSideBySide) {
					try {
						// Check for cancellation before file operations
						if (token.isCancellationRequested) {
							return;
						}
						const doc = await vscode.workspace.openTextDocument({
							content: formattedUrls.join('\n'),
							language: 'plaintext',
						});
						await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
					} catch (error) {
						deps.notifier.showError(
							localize(
								'runtime.error.open-side-by-side-failed',
								'Failed to open results side by side: {0}',
								error instanceof Error ? error.message : 'Unknown error',
							),
						);
						return;
					}
				} else if (config.postProcessOpenInNewFile) {
					try {
						// Check for cancellation before file operations
						if (token.isCancellationRequested) {
							return;
						}
						const doc = await vscode.workspace.openTextDocument({
							content: formattedUrls.join('\n'),
							language: 'plaintext',
						});
						await vscode.window.showTextDocument(doc);
					} catch (error) {
						deps.notifier.showError(
							localize(
								'runtime.error.open-new-file-failed',
								'Failed to open results in new file: {0}',
								error instanceof Error ? error.message : 'Unknown error',
							),
						);
						return;
					}
				} else {
					try {
						// Check for cancellation before file operations
						if (token.isCancellationRequested) {
							return;
						}
						// Replace current selection or entire document
						const edit = new vscode.WorkspaceEdit();
						edit.replace(
							document.uri,
							new vscode.Range(0, 0, document.lineCount, 0),
							formattedUrls.join('\n'),
						);
						const success = await vscode.workspace.applyEdit(edit);
						if (!success) {
							deps.notifier.showError(
								localize(
									'runtime.error.apply-edits-failed',
									'Failed to apply edits to document',
								),
							);
							return;
						}
					} catch (error) {
						deps.notifier.showError(
							localize(
								'runtime.error.replace-content-failed',
								'Failed to replace document content: {0}',
								error instanceof Error ? error.message : 'Unknown error',
							),
						);
						return;
					}
				}

				// Copy to clipboard if enabled
				if (config.copyToClipboardEnabled) {
					try {
						const clipboardText = formattedUrls.join('\n');
						// Check clipboard text byte size to prevent memory issues
						const byteSize = new TextEncoder().encode(clipboardText).length;
						if (byteSize > 1000000) {
							// 1MB limit in bytes
							deps.notifier.showWarning(
								localize(
									'runtime.warning.clipboard-too-large',
									'Results too large for clipboard ({0} bytes), skipping clipboard copy',
									byteSize,
								),
							);
						} else {
							// Check for cancellation before clipboard operation
							if (token.isCancellationRequested) {
								return;
							}
							await vscode.env.clipboard.writeText(clipboardText);
							deps.notifier.showInfo(
								localize(
									'runtime.info.urls-extracted-with-clipboard',
									'Extracted {0} URLs and copied to clipboard',
									result.urls.length,
								),
							);
						}
					} catch (error) {
						// Handle clipboard errors gracefully
						const errorMessage =
							error instanceof Error
								? error.message
								: 'Unknown clipboard error';
						if (
							errorMessage.includes('permission') ||
							errorMessage.includes('access')
						) {
							deps.notifier.showWarning(
								localize(
									'runtime.warning.clipboard-access-denied',
									'Clipboard access denied. Extracted URLs but could not copy to clipboard.',
								),
							);
						} else {
							deps.notifier.showWarning(
								localize(
									'runtime.error.clipboard-failed',
									'Failed to copy to clipboard: {0}',
									errorMessage,
								),
							);
						}
						deps.notifier.showInfo(
							localize(
								'runtime.info.urls-extracted',
								'Extracted {0} URLs',
								result.urls.length,
							),
						);
					}
				} else {
					deps.notifier.showInfo(
						localize(
							'runtime.info.urls-extracted',
							'Extracted {0} URLs',
							result.urls.length,
						),
					);
				}

				deps.telemetry.event('extract-success', { count: result.urls.length });
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: localize(
								'runtime.error.unknown-fallback',
								'Unknown error occurred',
							);
				deps.notifier.showError(
					localize(
						'runtime.error.extraction-failed',
						'Failed to extract URLs: {0}',
						message,
					),
				);
				deps.telemetry.event('extract-error', { error: message });
			} finally {
				deps.statusBar.hideProgress();
				cancellationToken.dispose();
			}
		},
	);

	context.subscriptions.push(command);
}
