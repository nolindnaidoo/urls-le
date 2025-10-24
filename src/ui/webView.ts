import * as vscode from 'vscode';
import type { Telemetry } from '../telemetry/telemetry';

/**
 * WebView implementation for help and documentation
 */
export interface WebView {
	readonly show: () => void;
	readonly dispose: () => void;
}

/**
 * Create a help webview
 */
export function createHelpWebView(
	_context: vscode.ExtensionContext,
	telemetry: Telemetry,
): WebView {
	let panel: vscode.WebviewPanel | undefined;

	return Object.freeze({
		show(): void {
			if (panel) {
				panel.reveal();
				return;
			}

			telemetry.event('webview-help-opened');

			panel = vscode.window.createWebviewPanel(
				'urls-le-help',
				'URLs-LE Help',
				vscode.ViewColumn.Beside,
				{
					enableScripts: true,
					localResourceRoots: [],
				},
			);

			panel.webview.html = getHelpHtml();

			panel.onDidDispose(() => {
				panel = undefined;
				telemetry.event('webview-help-closed');
			});
		},

		dispose(): void {
			if (panel) {
				panel.dispose();
				panel = undefined;
			}
		},
	});
}

/**
 * Get the HTML content for the help webview
 */
function getHelpHtml(): string {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>URLs-LE Help</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        h1, h2, h3 {
            color: var(--vscode-textLink-foreground);
            margin-top: 30px;
        }
        h1 {
            border-bottom: 2px solid var(--vscode-textLink-foreground);
            padding-bottom: 10px;
        }
        code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
        }
        pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
        }
        .command {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            padding: 8px 12px;
            border-radius: 4px;
            display: inline-block;
            margin: 5px 0;
        }
        .feature-list {
            list-style-type: none;
            padding-left: 0;
        }
        .feature-list li {
            margin: 10px 0;
            padding-left: 20px;
            position: relative;
        }
        .feature-list li:before {
            content: "✓";
            color: var(--vscode-textLink-foreground);
            font-weight: bold;
            position: absolute;
            left: 0;
        }
        .warning {
            background-color: var(--vscode-inputValidation-warningBackground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
            padding: 10px;
            border-radius: 4px;
            margin: 15px 0;
        }
        .info {
            background-color: var(--vscode-inputValidation-infoBackground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
            padding: 10px;
            border-radius: 4px;
            margin: 15px 0;
        }
        .keyboard-shortcut {
            background-color: var(--vscode-keybindingLabel-background);
            color: var(--vscode-keybindingLabel-foreground);
            border: 1px solid var(--vscode-keybindingLabel-border);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: monospace;
            font-size: 0.9em;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 15px 0;
        }
        th, td {
            border: 1px solid var(--vscode-panel-border);
            padding: 8px 12px;
            text-align: left;
        }
        th {
            background-color: var(--vscode-editor-lineHighlightBackground);
            font-weight: bold;
        }
    </style>
</head>
<body>
    <h1>URLs-LE Help & Documentation</h1>
    
    <div class="info">
        <strong>URLs-LE</strong> is a zero-hassle URL extraction tool for VS Code that helps you extract, analyze, and manage URLs from various file formats.
    </div>

    <h2>Quick Start</h2>
    <ol>
        <li>Open a file containing URLs (Markdown, HTML, JSON, etc.)</li>
        <li>Run <span class="command">URLs-LE: Extract URLs</span> from the Command Palette</li>
        <li>View extracted URLs in the results</li>
    </ol>

    <h2>Available Commands</h2>
    <table>
        <tr>
            <th>Command</th>
            <th>Shortcut</th>
            <th>Description</th>
        </tr>
        <tr>
            <td><span class="command">Extract URLs</span></td>
            <td><span class="keyboard-shortcut">Ctrl+Alt+U</span></td>
            <td>Extract all URLs from the current document</td>
        </tr>
        <tr>
            <td><span class="command">Sort URLs</span></td>
            <td>-</td>
            <td>Sort URLs alphabetically, by domain, or by length</td>
        </tr>
        <tr>
            <td><span class="command">Deduplicate URLs</span></td>
            <td>-</td>
            <td>Remove duplicate URLs from the current document</td>
        </tr>
        <tr>
            <td><span class="command">Toggle CSV Streaming</span></td>
            <td>-</td>
            <td>Enable/disable CSV streaming for large files</td>
        </tr>
        <tr>
            <td><span class="command">Open Settings</span></td>
            <td>-</td>
            <td>Configure URLs-LE settings</td>
        </tr>
    </table>

    <h2>Supported File Formats</h2>
    <ul class="feature-list">
        <li><strong>Markdown</strong> - Links, reference URLs, image sources</li>
        <li><strong>HTML</strong> - href attributes, src attributes, action URLs</li>
        <li><strong>JSON/JSONC</strong> - URL values in JSON structures</li>
        <li><strong>YAML</strong> - URL values in YAML configurations</li>
        <li><strong>XML</strong> - URL attributes and text content</li>
        <li><strong>JavaScript/TypeScript</strong> - String literals containing URLs</li>
        <li><strong>CSS</strong> - url() functions, @import statements</li>
        <li><strong>Plain Text</strong> - Any URLs found in text content</li>
        <li><strong>Properties Files</strong> - URL values in key=value format</li>
        <li><strong>TOML</strong> - URL values in TOML configurations</li>
        <li><strong>INI</strong> - URL values in INI files</li>
    </ul>

    <h2>URL Formats Supported</h2>
    <ul class="feature-list">
        <li><strong>HTTP/HTTPS</strong> - https://example.com, http://test.com</li>
        <li><strong>FTP</strong> - ftp://files.example.com</li>
        <li><strong>File URLs</strong> - file:///path/to/file</li>
        <li><strong>Data URLs</strong> - data:image/png;base64,...</li>
        <li><strong>Mailto</strong> - mailto:user@example.com</li>
        <li><strong>Tel</strong> - tel:+1234567890</li>
        <li><strong>Relative URLs</strong> - /path/to/page, ./relative/path</li>
        <li><strong>Absolute paths</strong> - /absolute/path/to/resource</li>
        <li><strong>Query parameters</strong> - https://example.com?key=value</li>
        <li><strong>Fragments</strong> - https://example.com#section</li>
    </ul>

    <h2>Key Features</h2>
    <ul class="feature-list">
        <li><strong>Zero Configuration</strong> - Works out of the box</li>
        <li><strong>Smart Detection</strong> - Automatically detects URL patterns</li>
        <li><strong>Multiple Formats</strong> - Supports 10+ file formats</li>
        <li><strong>CSV Streaming</strong> - Handle large CSV files efficiently</li>
        <li><strong>URL Analysis</strong> - Security and accessibility checks</li>
        <li><strong>Deduplication</strong> - Remove duplicate URLs</li>
        <li><strong>Sorting Options</strong> - Sort by various criteria</li>
        <li><strong>Clipboard Integration</strong> - Auto-copy results</li>
        <li><strong>Safety Checks</strong> - Warnings for large files</li>
        <li><strong>Internationalization</strong> - Multi-language support</li>
    </ul>

    <h2>Configuration</h2>
    <p>Access settings via <span class="command">URLs-LE: Open Settings</span> or through VS Code's settings UI.</p>
    
    <h3>Key Settings</h3>
    <ul>
        <li><strong>Copy to Clipboard</strong> - Automatically copy extraction results</li>
        <li><strong>CSV Streaming</strong> - Enable for large CSV files</li>
        <li><strong>Side-by-side View</strong> - Open results in new editor</li>
        <li><strong>Safety Checks</strong> - File size and output warnings</li>
        <li><strong>Notification Levels</strong> - Control message verbosity</li>
        <li><strong>Analysis Options</strong> - Enable URL security/accessibility analysis</li>
        <li><strong>Performance Settings</strong> - Configure limits and thresholds</li>
    </ul>

    <h2>Troubleshooting</h2>
    
    <h3>No URLs Found?</h3>
    <ul>
        <li>Check that the file format is supported</li>
        <li>Verify URL patterns are valid (include protocol for absolute URLs)</li>
        <li>Try different file type detection if auto-detection fails</li>
    </ul>

    <h3>Performance Issues?</h3>
    <ul>
        <li>Enable CSV streaming for large CSV files</li>
        <li>Adjust safety thresholds in settings</li>
        <li>Consider breaking very large files into smaller chunks</li>
    </ul>

    <h3>Extraction Errors?</h3>
    <ul>
        <li>Check the Output panel (View → Output → URLs-LE) for details</li>
        <li>Verify file encoding is UTF-8</li>
        <li>Try manual file type selection for ambiguous formats</li>
    </ul>

    <div class="warning">
        <strong>Note:</strong> Some obfuscated or heavily encoded URLs may not be detected. The tool focuses on common, readable URL patterns.
    </div>

    <h2>CSV Features</h2>
    <p>URLs-LE provides special handling for CSV files:</p>
    <ul class="feature-list">
        <li><strong>Column Selection</strong> - Choose specific columns to extract from</li>
        <li><strong>Header Detection</strong> - Automatically detect and use column headers</li>
        <li><strong>Streaming Mode</strong> - Process large CSV files incrementally</li>
        <li><strong>Index-based Selection</strong> - Select columns by index number</li>
    </ul>

    <h2>URL Analysis</h2>
    <p>When enabled, URLs-LE can analyze extracted URLs for:</p>
    <ul class="feature-list">
        <li><strong>Security Issues</strong> - HTTP vs HTTPS, suspicious patterns</li>
        <li><strong>Accessibility</strong> - URL reachability and response codes</li>
        <li><strong>Performance</strong> - Response times and optimization</li>
        <li><strong>Compliance</strong> - Standards adherence</li>
    </ul>

    <h2>Support & Feedback</h2>
    <p>Need help or found a bug?</p>
    <ul>
        <li><strong>GitHub Issues:</strong> <a href="https://github.com/OffensiveEdge/urls-le/issues">Report issues or request features</a></li>
        <li><strong>Documentation:</strong> <a href="https://github.com/OffensiveEdge/urls-le#readme">Full documentation on GitHub</a></li>
        <li><strong>Output Panel:</strong> Check "URLs-LE" in VS Code's Output panel for detailed logs</li>
    </ul>

    <div class="info">
        <strong>Pro Tip:</strong> Use the status bar indicator to quickly access URLs-LE commands and see extraction progress.
    </div>
</body>
</html>
	`.trim();
}
