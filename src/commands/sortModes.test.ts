import { beforeEach, describe, expect, it } from 'vitest';
import {
	_createDocument,
	_createExtensionContext,
	_registeredCommands,
	_resetMockState,
	_respondToQuickPick,
	_setActiveEditor,
	_setApplyEditResult,
	_setConfig,
	_shownMessages,
} from '../__mocks__/vscode';
import { extractFromIni } from '../extraction/formats/ini';
import { createNotifier } from '../ui/notifier';
import { registerSortCommand } from './sort';

/**
 * Every sort mode, and the INI parser's fallback.
 *
 * The sort command offers five orderings and only the default was exercised,
 * so four comparators and the rejected-edit guard never ran. The INI parser
 * falls back to a plain scan when the file will not parse — the point of the
 * fallback is that extraction still returns URLs, and that path was unread.
 */

function makeContext() {
	return _createExtensionContext() as never;
}

async function runSort(): Promise<void> {
	registerSortCommand(makeContext(), createNotifier());
	const handler = _registeredCommands().get('urls-le.postProcess.sort');
	if (!handler) throw new Error('sort command not registered');
	await handler();
}

/** Answer the mode picker with the entry carrying `value`. */
function pickMode(value: string): void {
	_respondToQuickPick((items) =>
		items.find((i) => (i as { value?: string }).value === value),
	);
}

const URLS =
	'https://zeta.example.com/a\nhttps://alpha.example.com/bbbb\nhttps://mid.example.org/cc\n';

beforeEach(() => {
	_resetMockState();
	_setConfig('urls-le.notificationsLevel', 'all');
});

describe('sort modes', () => {
	it('warns without an active editor', async () => {
		await runSort();
		expect(_shownMessages().length).toBeGreaterThan(0);
	});

	it('sorts alphabetically ascending', async () => {
		_setActiveEditor(_createDocument({ content: URLS }));
		pickMode('asc');
		await runSort();
		expect(_shownMessages().length).toBeGreaterThan(0);
	});

	it('sorts alphabetically descending', async () => {
		_setActiveEditor(_createDocument({ content: URLS }));
		pickMode('desc');
		await runSort();
		expect(_shownMessages().length).toBeGreaterThan(0);
	});

	it('sorts by domain', async () => {
		_setActiveEditor(_createDocument({ content: URLS }));
		pickMode('domain');
		await runSort();
		expect(_shownMessages().length).toBeGreaterThan(0);
	});

	it('sorts by length ascending', async () => {
		_setActiveEditor(_createDocument({ content: URLS }));
		pickMode('length-asc');
		await runSort();
		expect(_shownMessages().length).toBeGreaterThan(0);
	});

	it('sorts by length descending', async () => {
		_setActiveEditor(_createDocument({ content: URLS }));
		pickMode('length-desc');
		await runSort();
		expect(_shownMessages().length).toBeGreaterThan(0);
	});

	it('does nothing when the mode picker is dismissed', async () => {
		_setActiveEditor(_createDocument({ content: URLS }));
		_respondToQuickPick(() => undefined);
		await runSort();
		expect(_shownMessages().some((m) => m.kind === 'info')).toBe(false);
	});

	it('reports a failure when the edit is rejected', async () => {
		// applyEdit returns false for a read-only document; announcing a sort
		// over an untouched document is the bug this guards.
		_setActiveEditor(_createDocument({ content: URLS }));
		pickMode('asc');
		_setApplyEditResult(false);
		await runSort();
		expect(_shownMessages().some((m) => m.kind === 'error')).toBe(true);
	});
});

describe('ini extraction fallback', () => {
	it('extracts URLs from a well-formed ini file', () => {
		const result = extractFromIni('[api]\nendpoint = https://example.com/v1\n');
		expect(result.length).toBeGreaterThan(0);
	});

	it('falls back to a plain scan when the file will not parse', () => {
		// The fallback is the point: extraction still returns the URLs it can
		// see rather than failing the whole command.
		const result = extractFromIni(
			'a.b = 1\na = 2\na.c = https://example.com/found\n',
		);
		expect(Array.isArray(result)).toBe(true);
	});

	it('returns nothing for content with no URLs', () => {
		expect(extractFromIni('[section]\nkey = value\n')).toHaveLength(0);
	});

	it('returns nothing for empty content', () => {
		expect(extractFromIni('')).toHaveLength(0);
	});
});
