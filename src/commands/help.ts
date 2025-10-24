import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import type { Telemetry } from '../telemetry/telemetry';
import type { Notifier } from '../ui/notifier';
import type { StatusBar } from '../ui/statusBar';

const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

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
# ${localize('runtime.help.title', 'URLs-LE Help')}

## ${localize('runtime.help.quick-start', 'Quick Start')}
${localize(
	'runtime.help.quick-start',
	'1. Open a file with URLs (Markdown, HTML, JSON, etc.)\n2. Run "URLs-LE: Extract URLs"\n3. View extracted URLs in results',
)}

## Commands
${localize(
	'runtime.help.commands',
	'**Extract URLs**: Extract from current document\n**Sort URLs**: Sort alphabetically, by domain, or by length\n**Deduplicate URLs**: Remove duplicate URLs\n**Toggle CSV Streaming**: Enable for large CSV files\n**Settings**: Configure options',
)}

## ${localize('runtime.help.formats', 'Supported Formats')}
${localize(
	'runtime.help.formats',
	'**Supported**: Markdown, HTML, JSON, YAML, XML, JavaScript, CSS, Plain text\n**URL Formats**: HTTP/HTTPS, FTP, File, Data URLs, Mailto, Tel, Relative, Absolute',
)}

## Extraction Features
- Automatically detects all URL formats
- Preserves original URL structure
- Extracts from multiple file types
- Handles encoded URLs
- Supports internationalized domain names (IDN)

## ${localize('runtime.help.troubleshooting', 'Troubleshooting')}
${localize(
	'runtime.help.troubleshooting',
	'**No URLs found?** Check file format and URL patterns\n**Performance issues?** Enable safety settings for large files\n**Need help?** Check Output panel for details',
)}

## ${localize('runtime.help.settings', 'Settings')}
${localize(
	'runtime.help.settings',
	'Access via Command Palette: "URLs-LE: Open Settings"\nKey settings: Copy to clipboard, CSV streaming, side-by-side view, safety checks, notification levels',
)}

## Common Use Cases

### Extract All Links from Markdown
1. Open a Markdown file
2. Run "URLs-LE: Extract URLs"
3. All URLs from links and references are extracted

### Find URLs in Source Code
1. Open JavaScript/TypeScript file
2. Run extraction command
3. All string URLs are found (API endpoints, CDN links, etc.)

### Audit HTML Resources
1. Open HTML file
2. Extract URLs to find all external resources
3. Review for security or optimization

### Convert Relative to Absolute URLs
1. Extract all relative URLs
2. Use find/replace to add base domain
3. Update source file with absolute URLs

## Performance Tips
- Safety warnings help prevent processing very large files
- Adjust file size threshold for your use case
- Use clipboard mode for large outputs
- Process files in smaller chunks if needed

## Planned Features
- **Deduplicate URLs**: Remove duplicate URLs (coming soon)
- **Sort URLs**: Sort by domain, path, or protocol (coming soon)
- **URL validation**: Check if URLs are reachable (coming soon)
- **Format URLs**: Normalize URL formatting (coming soon)

## ${localize('runtime.help.support', 'Support')}
${localize('runtime.help.support', 'GitHub Issues: https://github.com/OffensiveEdge/urls-le/issues')}
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
