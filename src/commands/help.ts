import * as vscode from 'vscode';
import type { Telemetry } from '../telemetry/telemetry';
import type { Notifier } from '../ui/notifier';
import type { StatusBar } from '../ui/statusBar';
import { guarded } from './guard';

const ISSUES = 'https://github.com/nolindnaidoo/urls-le/issues';
const README = 'https://github.com/nolindnaidoo/urls-le#readme';
const SITE = 'https://letools.dev';
const MARKETPLACE_REVIEWS =
	'https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.urls-le&ssr=false#review-details';
const OPEN_VSX_REVIEWS =
	'https://open-vsx.org/extension/nolindnaidoo/urls-le/reviews';
const FORMATS =
	'Markdown, HTML, CSS, JavaScript, TypeScript, JSON, YAML, Properties, TOML, INI, XML';
const SCHEMES = 'http, https, ftp, file, mailto, tel';

export function registerHelpCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry;
		notifier: Notifier;
		statusBar: StatusBar;
	}>,
): void {
	const command = vscode.commands.registerCommand(
		'urls-le.help',
		guarded(deps.notifier, async () => {
			deps.telemetry.event('command-help');

			const doc = await vscode.workspace.openTextDocument({
				content: helpDocument(),
				language: 'markdown',
			});
			await vscode.window.showTextDocument(doc, {
				preview: false,
				viewColumn: vscode.ViewColumn.Beside,
			});
		}),
	);

	context.subscriptions.push(command);
}

/** A command line: the title the palette shows in bold, then what it does. */
function command(title: string, does: string): string {
	return `- **${title}**: ${does}`;
}

/**
 * The help document. Every sentence goes through the bundle, so it reads in
 * the host's language; format names, schemes and links are not words and
 * stay as they are. The command titles are the bundle's copies of the
 * manifest's, held equal by the test beside this file.
 */
function helpDocument(): string {
	return [
		`# ${vscode.l10n.t('URLs-LE Help')}`,
		'',
		`## ${vscode.l10n.t('Quick Start')}`,
		`1. ${vscode.l10n.t('Open a file with URLs (Markdown, HTML, JSON, etc.)')}`,
		`2. ${vscode.l10n.t('Run "URLs-LE: Extract URLs" from the command palette')}`,
		`3. ${vscode.l10n.t('Extracted URLs open in a new document')}`,
		'',
		`## ${vscode.l10n.t('Commands')}`,
		command(
			vscode.l10n.t('Extract URLs'),
			vscode.l10n.t('Extract from the current document'),
		),
		command(
			vscode.l10n.t('Extract URLs from Workspace'),
			vscode.l10n.t(
				'The distinct URLs in every file in the workspace, and where each one is',
			),
		),
		command(
			vscode.l10n.t('Extract URLs from Folder'),
			vscode.l10n.t(
				'The same for one folder. Also on a folder in the Explorer',
			),
		),
		command(
			vscode.l10n.t('Deduplicate URLs'),
			vscode.l10n.t('Remove duplicate lines in the current document'),
		),
		command(
			vscode.l10n.t('Sort URLs'),
			vscode.l10n.t('Sort lines alphabetically, by domain, or by length'),
		),
		command(
			vscode.l10n.t('Open Settings'),
			vscode.l10n.t('Open the URLs-LE settings'),
		),
		command(
			vscode.l10n.t('Help & Troubleshooting'),
			vscode.l10n.t('Show this document'),
		),
		'',
		`## ${vscode.l10n.t('Supported Formats')}`,
		vscode.l10n.t(
			'{0} have a format-aware extractor. Every other document is scanned whole.',
			FORMATS,
		),
		'',
		`## ${vscode.l10n.t('Extracted URL Types')}`,
		SCHEMES,
		'',
		`## ${vscode.l10n.t('Troubleshooting')}`,
		`- **${vscode.l10n.t('No URLs found?')}** ${vscode.l10n.t(
			'Every document is scanned whatever its language, so check that each URL carries one of the schemes above. In Markdown, a URL inside a fenced block or inline code is skipped on purpose',
		)}`,
		`- **${vscode.l10n.t('Large file warning?')}** ${vscode.l10n.t(
			'Adjust the safety file-size threshold in settings',
		)}`,
		'',
		`## ${vscode.l10n.t('Support')}`,
		`- ${vscode.l10n.t('GitHub Issues')}: ${ISSUES}`,
		`- ${vscode.l10n.t('Documentation')}: ${README}`,
		`- ${vscode.l10n.t('LE Tools')}: ${SITE}`,
		'',
		vscode.l10n.t("Enjoying it? A rating helps more than you'd think:"),
		`- ${vscode.l10n.t('Rate on VS Code Marketplace')}: ${MARKETPLACE_REVIEWS}`,
		`- ${vscode.l10n.t('Rate on Open VSX')}: ${OPEN_VSX_REVIEWS}`,
		'',
		vscode.l10n.t(
			'Built by {0} — MIT licensed.',
			'nolindnaidoo (https://github.com/nolindnaidoo)',
		),
	].join('\n');
}
