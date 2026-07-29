import * as vscode from 'vscode';
import type { Telemetry } from '../telemetry/telemetry';
import type { Notifier } from '../ui/notifier';
import type { StatusBar } from '../ui/statusBar';

export function registerHelpCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry;
		notifier: Notifier;
		statusBar: StatusBar;
	}>,
): void {
	const command = vscode.commands.registerCommand('urls-le.help', async () => {
		deps.telemetry.event('command-help');

		const helpText = `
# URLs-LE Help

## Quick Start
1. Open a file with URLs (Markdown, HTML, JSON, etc.)
2. Run "URLs-LE: Extract URLs"
3. Extracted URLs open in a new document

## Commands
- **Extract URLs**: Extract from the current document
- **Deduplicate URLs**: Remove duplicate lines in the current document
- **Sort URLs**: Sort lines alphabetically, by domain, or by length
- **Open Settings**: Open the URLs-LE settings
- **Help**: Show this document

## Supported Formats
Markdown, HTML, CSS, JavaScript, TypeScript, JSON, YAML, Properties, TOML, INI, XML

## Extracted URL Types
http, https, ftp, file, mailto, tel

## Troubleshooting
- **No URLs found?** Check the file's language mode matches a supported format
- **Large file warning?** Adjust the safety file-size threshold in settings

## Support
GitHub Issues: https://github.com/nolindnaidoo/urls-le/issues
		`.trim();

		const doc = await vscode.workspace.openTextDocument({
			content: helpText,
			language: 'markdown',
		});
		await vscode.window.showTextDocument(doc, {
			preview: false,
			viewColumn: vscode.ViewColumn.Beside,
		});
	});

	context.subscriptions.push(command);
}
