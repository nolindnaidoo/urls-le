import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	_clipboardText,
	_openedDocuments,
	_registeredCommands,
	_resetMockState,
	_respondToOpenDialog,
	_setConfig,
	_setWorkspaceFiles,
	_shownMessages,
	Uri,
	workspace,
} from '../__mocks__/vscode';
import { createTelemetry } from '../telemetry/telemetry';
import { createNotifier } from '../ui/notifier';
import { createStatusBar } from '../ui/statusBar';
import { registerExtractWorkspaceCommands } from './extractWorkspace';

const TREE = {
	'/w/docs/a.md':
		'See https://example.com/docs and https://example.com/docs again.\nAlso https://api.example.com/v1\n',
	'/w/src/b.ts': "const api = 'https://api.example.com/v1';\n",
	'/w/config.json': '{\n  "home": "https://example.com/docs"\n}\n',
	'/w/node_modules/x.js': "const skip = 'https://skip.example.com';\n",
	'/w/logo.png': 'https://not-text.example.com',
};

async function runCommand(id: string, ...args: unknown[]): Promise<void> {
	const handler = _registeredCommands().get(id);
	if (!handler) throw new Error(`command not registered: ${id}`);
	await handler(...args);
}

function report(): string {
	const last = _openedDocuments().at(-1);
	if (!last) throw new Error('no report was opened');
	return last.getText();
}

function open(files: Record<string, string> = TREE): void {
	_setWorkspaceFiles(files);
	workspace.workspaceFolders = [{ uri: Uri.file('/w'), name: 'w', index: 0 }];
}

/** How many delivered scans the rating prompt was told about. */
const successes = { count: 0 };

beforeEach(() => {
	_resetMockState();
	successes.count = 0;
	const context = { subscriptions: [] as Array<{ dispose(): void }> } as never;
	registerExtractWorkspaceCommands(context, {
		telemetry: createTelemetry(),
		notifier: createNotifier(),
		statusBar: createStatusBar(context),
		ratingPrompt: {
			recordSuccess: async () => {
				successes.count++;
			},
		},
	});
});

describe('urls-le.extractWorkspace and urls-le.extractFolder', () => {
	it('warns when no workspace is open', async () => {
		_setConfig('urls-le.notificationsLevel', 'all');
		await runCommand('urls-le.extractWorkspace');
		expect(_shownMessages()[0]).toMatchObject({ kind: 'warning' });
		expect(_openedDocuments()).toHaveLength(0);
	});

	it('counts a delivered scan toward the rating prompt, and nothing else', async () => {
		await runCommand('urls-le.extractWorkspace');
		expect(successes.count).toBe(0);

		open();
		await runCommand('urls-le.extractWorkspace');
		expect(successes.count).toBe(1);
	});

	it('lists each distinct URL once, the most widely used first, with how often and where', async () => {
		_setConfig('urls-le.notificationsLevel', 'all');
		open();
		await runCommand('urls-le.extractWorkspace');

		const text = report();
		expect(text).toContain(
			'3 file(s) read · 2 distinct URL(s), 5 occurrence(s) in 3 file(s)',
		);
		expect(text.split('\n').filter((line) => line.startsWith('| `'))).toEqual([
			'| `https://example.com/docs` | 3 | 2 |',
			'| `https://api.example.com/v1` | 2 | 2 |',
		]);
		expect(text.match(/^## .*$/gm)).toEqual([
			'## `https://example.com/docs` (3)',
			'## `https://api.example.com/v1` (2)',
		]);
		// Positions are off by default here: a file, and how many times.
		expect(text).toContain('- `/w/config.json`\n- `/w/docs/a.md` (2)');
		expect(text).not.toMatch(/\*\*\d+:\d+\*\*/);
		// Left out by the built-in list, and a .png is never opened.
		expect(text).not.toContain('skip.example.com');
		expect(text).not.toContain('not-text.example.com');
		expect(_shownMessages().at(-1)?.message).toBe(
			'2 distinct URL(s), 5 occurrence(s) in 3 file(s)',
		);
	});

	it('places every occurrence when positions are on, and decides the copy separately', async () => {
		open();
		_setConfig('urls-le.showPositions', true);
		_setConfig('urls-le.copyToClipboardEnabled', true);
		await runCommand('urls-le.extractWorkspace');

		expect(report()).toContain(
			'- `/w/config.json` · **2:12**\n- `/w/docs/a.md` · **1:5**, **1:34**',
		);
		// The clipboard has its own setting, and that one is still off.
		expect(_clipboardText()).toContain('- `/w/docs/a.md` (2)');
		expect(_clipboardText()).not.toMatch(/\*\*\d+:\d+\*\*/);
	});

	it('scans only the folder it is handed, and names files relative to it', async () => {
		open();
		await runCommand('urls-le.extractFolder', Uri.file('/w/docs'));

		expect(report()).toContain(
			'`/w/docs` · 1 file(s) read · 2 distinct URL(s), 3 occurrence(s) in 1 file(s)',
		);
		expect(report()).toContain('- `a.md` (2)');
	});

	it('asks for a folder from the palette, and does nothing when none is picked', async () => {
		open();
		_respondToOpenDialog(() => undefined);
		await runCommand('urls-le.extractFolder');
		expect(_openedDocuments()).toHaveLength(0);

		_respondToOpenDialog(() => [Uri.file('/w/src')]);
		await runCommand('urls-le.extractFolder');
		expect(report()).toContain('`/w/src` · 1 file(s) read');
	});

	it('stops at the results limit and says the rest was not read', async () => {
		open();
		_setConfig('urls-le.workspace.scanMaxResults', 1);
		await runCommand('urls-le.extractWorkspace');

		expect(report()).toContain(
			'1 file(s) read · 1 distinct URL(s), 1 occurrence(s) in 1 file(s)',
		);
		expect(report()).toContain(
			'> The results limit was reached. The rest of the files were not read.',
		);
	});

	it('reads what a switch would skip when the settings say so', async () => {
		open();
		_setConfig('urls-le.workspace.scanAlwaysInclude', ['**/node_modules/**']);
		await runCommand('urls-le.extractWorkspace');
		expect(report()).toContain('`https://skip.example.com`');
	});

	it('says when a folder holds no URLs', async () => {
		open({ '/w/a.txt': 'nothing here\n' });
		await runCommand('urls-le.extractWorkspace');
		expect(report()).toContain('No URLs found.');
	});

	it('prints the report the README shows as its sample', async () => {
		open();
		_setConfig('urls-le.showPositions', true);
		await runCommand('urls-le.extractFolder', Uri.file('/w'));

		const readme = readFileSync(
			join(__dirname, '..', '..', 'README.md'),
			'utf8',
		);
		const shown = report()
			.split('\n')
			.filter(
				(line) =>
					line.startsWith('- ') ||
					line.startsWith('| `') ||
					line.startsWith('## '),
			);
		expect(shown).toHaveLength(8);
		for (const line of shown) expect(readme).toContain(line);
		expect(readme).toContain(
			'3 file(s) read · 2 distinct URL(s), 5 occurrence(s) in 3 file(s)',
		);
	});
});
