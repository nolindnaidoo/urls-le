import * as vscode from 'vscode';
import { getConfiguration } from '../config/config';
import { extractUrlsFromText } from '../extraction/extract';
import { resolveFormat } from '../mcp/fileType';
import {
	listFiles,
	type ScanLimits,
	type ScanSummary,
	scanFiles,
	unreadNotes,
} from '../workspace/scan';
import {
	askForFolder,
	code,
	deliver,
	hasSomethingToScan,
	limitsFrom,
	type WorkspaceDeps,
} from './workspaceShared';

/** One place a URL is written. A reader that resolved the value has no position for it. */
export interface Occurrence {
	readonly file: string;
	readonly position:
		| { readonly line: number; readonly column: number }
		| undefined;
}

/** A URL, and every place it was found. */
export interface DistinctUrl {
	readonly value: string;
	readonly occurrences: readonly Occurrence[];
}

export function registerExtractWorkspaceCommands(
	context: vscode.ExtensionContext,
	deps: WorkspaceDeps,
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('urls-le.extractWorkspace', async () =>
			extractWorkspace(deps),
		),
		// The Explorer hands over the folder that was clicked. From the
		// palette there is none, and the command asks.
		vscode.commands.registerCommand(
			'urls-le.extractFolder',
			async (picked?: vscode.Uri) => {
				const folder = picked ?? (await askForFolder());
				if (folder !== undefined) await extractWorkspace(deps, folder);
			},
		),
	);
}

/**
 * Extract every URL in every file under a folder, or in the whole workspace
 * when no folder is given.
 *
 * A project writes the same URL in many places, so the answer is the
 * distinct URLs and where each one is, not one long list. Files are read
 * from disk, so an unsaved edit is not seen.
 */
async function extractWorkspace(
	deps: WorkspaceDeps,
	root?: vscode.Uri,
): Promise<void> {
	deps.telemetry.event(
		root === undefined ? 'command-extract-workspace' : 'command-extract-folder',
	);
	if (!hasSomethingToScan(root, deps)) return;
	const config = getConfiguration();
	const limits = limitsFrom(config);

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: vscode.l10n.t('Scanning files...'),
			cancellable: true,
		},
		async (progress, token) => {
			const { files, fileLimitReached, ignored } = await listFiles(
				root,
				limits,
			);
			const found = new Map<string, Occurrence[]>();
			let total = 0;
			const scanned = await scanFiles(
				root,
				files,
				limits,
				token,
				(done, all) =>
					progress.report({
						message: vscode.l10n.t('{0} of {1} files', done, all),
					}),
				({ file, text }) => {
					// The language comes from the file's name. One nothing
					// recognises is scanned whole, as Extract scans it.
					const language = resolveFormat(undefined, file) ?? 'unknown';
					for (const url of extractUrlsFromText(text, language)) {
						if (total >= config.workspaceScanMaxResults) return false;
						const occurrence = { file, position: url.position };
						const where = found.get(url.value);
						if (where === undefined) found.set(url.value, [occurrence]);
						else where.push(occurrence);
						total++;
					}
					return total < config.workspaceScanMaxResults;
				},
			);
			// A cancelled scan read part of the tree. Reporting that as the
			// project's URLs would understate it without saying so.
			if (scanned.cancelled) return;
			const summary: ScanSummary = { ...scanned, fileLimitReached, ignored };

			const urls = distinct(found);
			const where =
				root === undefined
					? undefined
					: vscode.workspace.asRelativePath(root, false);
			await deliver(
				(positions) =>
					formatExtractWorkspaceReport({
						where,
						urls,
						summary,
						limits,
						positions,
					}),
				config,
				deps,
			);

			deps.telemetry.event('extract-workspace-completed', {
				files: summary.read,
				urls: urls.length,
				occurrences: total,
			});
			deps.notifier.showInfo(headline(urls));
		},
	);
}

/**
 * The most widely used first, then by the URL's own text.
 *
 * A plain comparison rather than `localeCompare`: the order must not change
 * with the editor's display language.
 */
function distinct(found: ReadonlyMap<string, Occurrence[]>): DistinctUrl[] {
	return [...found]
		.map(([value, occurrences]) => ({ value, occurrences }))
		.sort(
			(a, b) =>
				b.occurrences.length - a.occurrences.length ||
				(a.value < b.value ? -1 : Number(a.value > b.value)),
		);
}

function filesOf(occurrences: readonly Occurrence[]): string[] {
	return [...new Set(occurrences.map((occurrence) => occurrence.file))];
}

function headline(urls: readonly DistinctUrl[]): string {
	const occurrences = urls.flatMap((url) => url.occurrences);
	return vscode.l10n.t(
		'{0} distinct URL(s), {1} occurrence(s) in {2} file(s)',
		urls.length,
		occurrences.length,
		filesOf(occurrences).length,
	);
}

export interface ExtractWorkspaceReportInput {
	/** The folder that was scanned, or undefined for the whole workspace. */
	readonly where: string | undefined;
	readonly urls: readonly DistinctUrl[];
	readonly summary: ScanSummary;
	readonly limits: ScanLimits;
	readonly positions?: boolean;
}

/**
 * The report for a folder or a workspace: a table of the distinct URLs with
 * how often and in how many files each is written, then where each one is,
 * and last whatever the scan left unread.
 */
export function formatExtractWorkspaceReport({
	where,
	urls,
	summary,
	limits,
	positions = true,
}: ExtractWorkspaceReportInput): string {
	const lines: string[] = [
		`# ${vscode.l10n.t('{0} workspace report', 'URLs-LE')}`,
		'',
	];
	const scope = where === undefined ? '' : `${code(where)} · `;
	lines.push(
		`${scope}${vscode.l10n.t('{0} file(s) read', summary.read)} · ${headline(urls)}`,
		'',
	);
	if (urls.length === 0) lines.push(vscode.l10n.t('No URLs found.'), '');

	if (urls.length > 0) {
		lines.push(
			`| ${vscode.l10n.t('URL')} | ${vscode.l10n.t('Occurrences')} | ${vscode.l10n.t('Files')} |`,
			'|---|---|---|',
		);
		for (const url of urls)
			lines.push(
				`| ${code(url.value).replace(/\|/g, '\\|')} | ${url.occurrences.length} | ${filesOf(url.occurrences).length} |`,
			);
		lines.push('');
	}

	for (const url of urls) {
		lines.push(`## ${code(url.value)} (${url.occurrences.length})`, '');
		// One line per file, with every place in it.
		for (const file of filesOf(url.occurrences)) {
			const here = url.occurrences.filter((o) => o.file === file);
			const placed = here.flatMap((o) =>
				o.position === undefined
					? []
					: [`**${o.position.line}:${o.position.column}**`],
			);
			if (positions && placed.length > 0)
				lines.push(`- ${code(file)} · ${placed.join(', ')}`);
			else
				lines.push(
					here.length > 1
						? `- ${code(file)} (${here.length})`
						: `- ${code(file)}`,
				);
		}
		lines.push('');
	}

	const notes = unreadNotes(summary, limits, code('urls-le.workspace.*'));
	if (notes.length > 0) lines.push(...notes.map((note) => `> ${note}`), '');
	return lines.join('\n');
}
