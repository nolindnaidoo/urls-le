import * as vscode from 'vscode';
import type { Url } from '../types';

export interface UrlProvider extends vscode.Disposable {
	provideUrls(document: vscode.TextDocument): Promise<readonly Url[]>;
}

export function registerUrlProvider(
	context: vscode.ExtensionContext,
	provider: UrlProvider,
): void {
	const disposable = vscode.workspace.registerTextDocumentContentProvider(
		'urls-le',
		provider as unknown as vscode.TextDocumentContentProvider,
	);
	context.subscriptions.push(disposable);
}

export function createUrlProvider(): UrlProvider {
	return {
		async provideUrls(document: vscode.TextDocument): Promise<readonly Url[]> {
			// Basic URL extraction from document content
			const content = document.getText();
			const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
			const urls: Url[] = [];
			let match;

			while ((match = urlRegex.exec(content)) !== null) {
				const url = match[0];
				const position = document.positionAt(match.index);

				urls.push({
					value: url,
					protocol: url.startsWith('https') ? 'https' : 'http',
					position: {
						line: position.line,
						column: position.character,
					},
				});
			}

			return Object.freeze(urls);
		},
		dispose(): void {
			// Cleanup if needed
		},
	};
}
