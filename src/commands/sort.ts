import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

export function registerSortCommand(context: vscode.ExtensionContext): void {
	const command = vscode.commands.registerCommand(
		'urls-le.postProcess.sort',
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showWarningMessage(
					localize('runtime.sort.no-editor', 'No active editor found'),
				);
				return;
			}

			// Prompt user for sort order
			const sortOrder = await vscode.window.showQuickPick(
				[
					{
						label: localize(
							'runtime.sort.pick.alpha-asc',
							'Alphabetical (A → Z)',
						),
						value: 'asc',
					},
					{
						label: localize(
							'runtime.sort.pick.alpha-desc',
							'Alphabetical (Z → A)',
						),
						value: 'desc',
					},
					{
						label: localize('runtime.sort.pick.domain', 'By Domain'),
						value: 'domain',
					},
					{
						label: localize(
							'runtime.sort.pick.length-asc',
							'By Length (Short → Long)',
						),
						value: 'length-asc',
					},
					{
						label: localize(
							'runtime.sort.pick.length-desc',
							'By Length (Long → Short)',
						),
						value: 'length-desc',
					},
				],
				{
					placeHolder: localize(
						'runtime.sort.pick.placeholder',
						'Select sort order',
					),
				},
			);

			if (!sortOrder) {
				return; // User cancelled
			}

			try {
				const document = editor.document;
				const text = document.getText();
				const lines = text
					.split('\n')
					.map((line) => line.trim())
					.filter((line) => line.length > 0);

				let sorted: string[];
				if (sortOrder.value === 'domain') {
					// Sort by domain (extract hostname from URL)
					sorted = [...lines].sort((a, b) => {
						try {
							const urlA = new URL(a);
							const urlB = new URL(b);
							return urlA.hostname.localeCompare(urlB.hostname);
						} catch {
							// If URL parsing fails, fall back to string comparison
							return a.localeCompare(b);
						}
					});
				} else if (
					sortOrder.value === 'length-asc' ||
					sortOrder.value === 'length-desc'
				) {
					sorted = [...lines].sort((a, b) => {
						return sortOrder.value === 'length-asc'
							? a.length - b.length
							: b.length - a.length;
					});
				} else {
					sorted = [...lines].sort((a, b) => {
						return sortOrder.value === 'asc'
							? a.localeCompare(b)
							: b.localeCompare(a);
					});
				}

				// Replace document content
				const edit = new vscode.WorkspaceEdit();
				edit.replace(
					document.uri,
					new vscode.Range(0, 0, document.lineCount, 0),
					sorted.join('\n'),
				);
				await vscode.workspace.applyEdit(edit);

				vscode.window.showInformationMessage(
					localize(
						'runtime.sort.success',
						'Sorted {0} URLs ({1})',
						sorted.length,
						sortOrder.label,
					),
				);
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: localize(
								'runtime.error.unknown-fallback',
								'Unknown error occurred',
							);
				vscode.window.showErrorMessage(
					localize('runtime.sort.error', 'Sorting failed: {0}', message),
				);
			}
		},
	);

	context.subscriptions.push(command);
}
