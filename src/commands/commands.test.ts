import { beforeEach, describe, expect, it } from 'vitest';
import {
	_clipboardText,
	_createDocument,
	_registeredCommands,
	_resetMockState,
	_respondToQuickPick,
	_setActiveEditor,
	_setConfig,
	_shownMessages,
	appliedEdits,
} from '../__mocks__/vscode';
import { createNotifier } from '../ui/notifier';
import { registerDedupeCommand } from './dedupe';
import { registerExtractCommand } from './extract';
import { registerSortCommand } from './sort';

function makeContext() {
	return { subscriptions: [] as Array<{ dispose(): void }> } as never;
}

async function runCommand(id: string): Promise<void> {
	const handler = _registeredCommands().get(id);
	if (!handler) throw new Error(`command not registered: ${id}`);
	await handler();
}

function makeDeps(events: string[]) {
	return {
		telemetry: {
			event: (name: string) => events.push(name),
			dispose: () => {},
		},
		notifier: {
			showInfo: (m: string) => events.push(`info:${m}`),
			showWarning: (m: string) => events.push(`warn:${m}`),
			showError: (m: string) => events.push(`error:${m}`),
		},
		statusBar: {
			showExtracting: () => events.push('statusbar:extracting'),
			hideProgress: () => events.push('statusbar:idle'),
			dispose: () => {},
		},
	};
}

beforeEach(() => {
	_resetMockState();
});

describe('urls-le.postProcess.dedupe', () => {
	it('warns when no editor is active', async () => {
		_setConfig('urls-le.notificationsLevel', 'important');
		registerDedupeCommand(makeContext(), createNotifier());
		await runCommand('urls-le.postProcess.dedupe');
		expect(_shownMessages()[0]?.kind).toBe('warning');
		expect(appliedEdits).toHaveLength(0);
	});

	it('removes duplicates and reports an honest count', async () => {
		_setConfig('urls-le.notificationsLevel', 'all');
		registerDedupeCommand(makeContext(), createNotifier());
		_setActiveEditor(
			_createDocument({
				content:
					'https://a.com\nhttps://b.com\n\nhttps://a.com\nhttps://c.com\nhttps://b.com\n',
			}),
		);
		await runCommand('urls-le.postProcess.dedupe');

		expect(appliedEdits).toHaveLength(1);
		expect(appliedEdits[0]?.replacements[0]?.newText).toBe(
			'https://a.com\nhttps://b.com\nhttps://c.com',
		);
		// 5 non-empty lines, 3 unique -> 2 duplicates (blank lines not counted)
		expect(_shownMessages()[0]?.message).toBe(
			'Removed 2 duplicate URLs (3 remaining)',
		);
	});

	it('suppresses the success toast at the default silent level', async () => {
		registerDedupeCommand(makeContext(), createNotifier());
		_setActiveEditor(
			_createDocument({ content: 'https://a.com\nhttps://a.com' }),
		);
		await runCommand('urls-le.postProcess.dedupe');

		expect(appliedEdits).toHaveLength(1); // the edit still happens
		expect(_shownMessages()).toHaveLength(0); // the toast does not
	});
});

describe('urls-le.postProcess.sort', () => {
	it('sorts alphabetically ascending via quick pick', async () => {
		_setConfig('urls-le.notificationsLevel', 'all');
		registerSortCommand(makeContext(), createNotifier());
		_setActiveEditor(
			_createDocument({
				content: 'https://c.com\nhttps://a.com\nhttps://b.com',
			}),
		);
		_respondToQuickPick(
			(items) =>
				(items as Array<{ label: string; value: string }>).find(
					(item) => item.value === 'asc',
				) ?? items[0],
		);
		await runCommand('urls-le.postProcess.sort');

		expect(appliedEdits[0]?.replacements[0]?.newText).toBe(
			'https://a.com\nhttps://b.com\nhttps://c.com',
		);
		expect(_shownMessages()[0]?.message).toContain('Sorted 3 URLs');
	});

	it('sorts by domain', async () => {
		registerSortCommand(makeContext(), createNotifier());
		_setActiveEditor(
			_createDocument({
				content: 'https://zeta.com/a\nhttps://alpha.com/z',
			}),
		);
		_respondToQuickPick((items) =>
			(items as Array<{ value: string }>).find(
				(item) => item.value === 'domain',
			),
		);
		await runCommand('urls-le.postProcess.sort');

		expect(appliedEdits[0]?.replacements[0]?.newText).toBe(
			'https://alpha.com/z\nhttps://zeta.com/a',
		);
	});

	it('sorts by length descending', async () => {
		registerSortCommand(makeContext(), createNotifier());
		_setActiveEditor(
			_createDocument({
				content: 'https://ab.com\nhttps://abcd.com\nhttps://a.com',
			}),
		);
		_respondToQuickPick((items) =>
			(items as Array<{ value: string }>).find(
				(item) => item.value === 'length-desc',
			),
		);
		await runCommand('urls-le.postProcess.sort');

		expect(appliedEdits[0]?.replacements[0]?.newText).toBe(
			'https://abcd.com\nhttps://ab.com\nhttps://a.com',
		);
	});

	it('does nothing when the quick pick is dismissed', async () => {
		registerSortCommand(makeContext(), createNotifier());
		_setActiveEditor(
			_createDocument({ content: 'https://b.com\nhttps://a.com' }),
		);
		_respondToQuickPick(() => undefined);
		await runCommand('urls-le.postProcess.sort');
		expect(appliedEdits).toHaveLength(0);
	});
});

describe('urls-le.extractUrls', () => {
	it('extracts, copies to the clipboard when configured, and reports', async () => {
		const events: string[] = [];
		registerExtractCommand(makeContext(), makeDeps(events));
		_setConfig('urls-le.copyToClipboardEnabled', true);
		_setActiveEditor(
			_createDocument({
				content: "const api = 'https://api.example.com/v1';",
				languageId: 'javascript',
			}),
		);

		await runCommand('urls-le.extractUrls');

		expect(events).toContain('command-extract-urls');
		expect(events).toContain('info:Extracted 1 URLs');
		expect(events).toContain('statusbar:extracting');
		expect(events).toContain('statusbar:idle');
		expect(_clipboardText()).toBe('https://api.example.com/v1');
	});

	it('dedupes results when dedupeEnabled is set', async () => {
		const events: string[] = [];
		registerExtractCommand(makeContext(), makeDeps(events));
		_setConfig('urls-le.copyToClipboardEnabled', true);
		_setConfig('urls-le.dedupeEnabled', true);
		_setActiveEditor(
			_createDocument({
				content: 'https://a.com\nhttps://a.com\nhttps://b.com',
				languageId: 'yaml',
			}),
		);

		await runCommand('urls-le.extractUrls');

		expect(_clipboardText()).toBe('https://a.com\nhttps://b.com');
	});

	it('warns and stops when no editor is active', async () => {
		const events: string[] = [];
		registerExtractCommand(makeContext(), makeDeps(events));
		await runCommand('urls-le.extractUrls');
		expect(events).toContain('warn:No active editor found');
	});

	it('refuses files over the safety size threshold', async () => {
		const events: string[] = [];
		registerExtractCommand(makeContext(), makeDeps(events));
		_setConfig('urls-le.safety.fileSizeWarnBytes', 1000);
		_setActiveEditor(
			_createDocument({
				content: 'x'.repeat(2000),
				languageId: 'markdown',
			}),
		);

		await runCommand('urls-le.extractUrls');

		expect(events.some((e) => e.startsWith('warn:File size'))).toBe(true);
		expect(events).not.toContain('statusbar:extracting');
	});

	it('reports unsupported languages as an extraction failure', async () => {
		const events: string[] = [];
		registerExtractCommand(makeContext(), makeDeps(events));
		_setActiveEditor(
			_createDocument({ content: 'print(1)', languageId: 'python' }),
		);

		await runCommand('urls-le.extractUrls');

		expect(
			events.some((e) =>
				e.startsWith('error:Failed to extract URLs: Unsupported language'),
			),
		).toBe(true);
	});

	it('replaces the document in place when both open settings are off', async () => {
		const events: string[] = [];
		registerExtractCommand(makeContext(), makeDeps(events));
		_setConfig('urls-le.openResultsSideBySide', false);
		_setConfig('urls-le.postProcess.openInNewFile', false);
		_setActiveEditor(
			_createDocument({
				content: 'x https://only.example.com y',
				languageId: 'markdown',
			}),
		);

		await runCommand('urls-le.extractUrls');

		expect(appliedEdits).toHaveLength(1);
		expect(appliedEdits[0]?.replacements[0]?.newText).toBe(
			'https://only.example.com',
		);
	});

	it('opens in a new file when side-by-side is off', async () => {
		const events: string[] = [];
		registerExtractCommand(makeContext(), makeDeps(events));
		_setConfig('urls-le.openResultsSideBySide', false);
		_setActiveEditor(
			_createDocument({
				content: 'x https://only.example.com y',
				languageId: 'markdown',
			}),
		);

		await runCommand('urls-le.extractUrls');

		expect(appliedEdits).toHaveLength(0);
		expect(events).toContain('info:Extracted 1 URLs');
	});

	it('reports when no URLs are found', async () => {
		const events: string[] = [];
		registerExtractCommand(makeContext(), makeDeps(events));
		_setActiveEditor(
			_createDocument({ content: 'no urls here', languageId: 'markdown' }),
		);

		await runCommand('urls-le.extractUrls');

		expect(events).toContain('info:No URLs found in the current document');
	});
});

describe('urls-le.help', () => {
	it('opens the help document beside the editor', async () => {
		const { registerHelpCommand } = await import('./help');
		const events: string[] = [];
		registerHelpCommand(makeContext(), makeDeps(events));
		await runCommand('urls-le.help');
		expect(events).toContain('command-help');
	});
});
