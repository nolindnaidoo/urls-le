import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	_createExtensionContext,
	_openedDocuments,
	_registeredCommands,
	_resetMockState,
} from '../__mocks__/vscode';
import { registerHelpCommand } from './help';

/**
 * The help document against the manifest it describes. Prose has no
 * compiler: it told a user who found no URLs to check the document's
 * language mode, after every language had been scanned for a year.
 */

const ROOT = join(__dirname, '..', '..');

function manifestCommandTitles(): string[] {
	const manifest = JSON.parse(
		readFileSync(join(ROOT, 'package.json'), 'utf8'),
	) as { contributes: { commands: Array<{ title: string }> } };
	const nls = JSON.parse(
		readFileSync(join(ROOT, 'package.nls.json'), 'utf8'),
	) as Record<string, string>;
	return manifest.contributes.commands
		.map((entry) => nls[entry.title.replace(/^%|%$/g, '')] ?? entry.title)
		.sort();
}

async function helpText(): Promise<string> {
	registerHelpCommand(_createExtensionContext() as never, {
		telemetry: { event: () => {}, dispose: () => {} },
		notifier: {
			showInfo: () => {},
			showWarning: () => {},
			showError: () => {},
		},
		statusBar: {
			showExtracting: () => {},
			hideProgress: () => {},
			dispose: () => {},
		},
	});
	const handler = _registeredCommands().get('urls-le.help');
	if (!handler) throw new Error('help command not registered');
	await handler();
	return _openedDocuments().at(-1)?.getText() ?? '';
}

beforeEach(() => {
	_resetMockState();
});

describe('help', () => {
	it('opens as a markdown document', async () => {
		const help = await helpText();
		expect(_openedDocuments().at(-1)?.languageId).toBe('markdown');
		expect(help.startsWith('# URLs-LE Help')).toBe(true);
	});

	it('names every command the manifest declares, under the title the palette shows, in every language', async () => {
		// The titles are translated twice, once in each manifest catalogue for
		// the palette and once in each bundle for this document, so the two
		// are held equal here: a user must find in the palette what the
		// document names.
		const i18n = join(ROOT, 'src', 'i18n');
		const bundleDir = join(ROOT, 'l10n');
		const manifest = JSON.parse(
			readFileSync(join(ROOT, 'package.json'), 'utf8'),
		) as { contributes: { commands: Array<{ title: string }> } };
		const nlsKeys = manifest.contributes.commands.map((entry) =>
			entry.title.replace(/^%|%$/g, ''),
		);
		const english = JSON.parse(
			readFileSync(join(ROOT, 'package.nls.json'), 'utf8'),
		) as Record<string, string>;
		for (const file of readdirSync(bundleDir)) {
			const locale =
				file.match(/^bundle\.l10n(?:\.([a-z-]+))?\.json$/)?.[1] ?? '';
			const bundle = JSON.parse(
				readFileSync(join(bundleDir, file), 'utf8'),
			) as Record<string, string>;
			const nls =
				locale === ''
					? english
					: (JSON.parse(
							readFileSync(join(i18n, `package.nls.${locale}.json`), 'utf8'),
						) as Record<string, string>);
			for (const key of nlsKeys) {
				expect(bundle[english[key] ?? ''], `${file}: ${key}`).toBe(nls[key]);
			}
		}

		const help = await helpText();
		const section = help.split('## Commands')[1]?.split('\n## ')[0] ?? '';
		const named = [...section.matchAll(/^- \*\*([^*]+)\*\*/gm)]
			.map((match) => match[1] as string)
			.sort();
		expect(named).toEqual(manifestCommandTitles());
	});

	it('does not tell a user to change the language mode, since every language is scanned', async () => {
		const help = await helpText();
		expect(help).not.toMatch(/language mode/i);
		expect(help).toMatch(/every (document|language) is scanned/i);
	});

	it('names the six protocols the scanner extracts', async () => {
		expect(await helpText()).toContain('http, https, ftp, file, mailto, tel');
	});
});
