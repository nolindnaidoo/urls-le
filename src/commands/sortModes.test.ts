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
	appliedEdits,
} from '../__mocks__/vscode';
import { extractFromIni } from '../extraction/formats/ini';
import { createNotifier } from '../ui/notifier';
import { registerSortCommand } from './sort';

/**
 * Every sort mode, and the INI extractor on a document a parser refuses.
 *
 * The sort command offers five orderings and only the default was exercised,
 * so four comparators and the rejected-edit guard never ran. Each mode's test
 * then asserted only that something was shown, which any mode and any order
 * satisfies; each reads back the document as written now.
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

/** The document as written after the sort, and the message shown. The input ends in a newline, so the output does. */
function sorted(): { written: string | undefined; messages: string[] } {
	return {
		written: appliedEdits[0]?.replacements[0]?.newText,
		messages: _shownMessages().map((m) => `${m.kind}:${m.message}`),
	};
}

beforeEach(() => {
	_resetMockState();
	_setConfig('urls-le.notificationsLevel', 'all');
});

describe('sort modes', () => {
	it('warns without an active editor, and writes nothing', async () => {
		await runSort();
		expect(sorted()).toEqual({
			written: undefined,
			messages: ['warning:No active editor found'],
		});
	});

	it('sorts alphabetically ascending', async () => {
		_setActiveEditor(_createDocument({ content: URLS }));
		pickMode('asc');
		await runSort();
		expect(sorted()).toEqual({
			written:
				'https://alpha.example.com/bbbb\nhttps://mid.example.org/cc\nhttps://zeta.example.com/a\n',
			messages: ['info:Sorted 3 URLs (Alphabetical (A → Z))'],
		});
	});

	it('sorts alphabetically descending', async () => {
		_setActiveEditor(_createDocument({ content: URLS }));
		pickMode('desc');
		await runSort();
		expect(sorted()).toEqual({
			written:
				'https://zeta.example.com/a\nhttps://mid.example.org/cc\nhttps://alpha.example.com/bbbb\n',
			messages: ['info:Sorted 3 URLs (Alphabetical (Z → A))'],
		});
	});

	it('sorts by domain', async () => {
		// By host, so a longer path on an earlier host still comes first.
		_setActiveEditor(
			_createDocument({
				content:
					'https://zeta.example.com/a\nhttps://alpha.example.com/zzz\nhttps://mid.example.org/cc\n',
			}),
		);
		pickMode('domain');
		await runSort();
		expect(sorted()).toEqual({
			written:
				'https://alpha.example.com/zzz\nhttps://mid.example.org/cc\nhttps://zeta.example.com/a\n',
			messages: ['info:Sorted 3 URLs (By Domain)'],
		});
	});

	it('sorts by length ascending, keeping the written order between equal lengths', async () => {
		_setActiveEditor(_createDocument({ content: URLS }));
		pickMode('length-asc');
		await runSort();
		expect(sorted()).toEqual({
			written:
				'https://zeta.example.com/a\nhttps://mid.example.org/cc\nhttps://alpha.example.com/bbbb\n',
			messages: ['info:Sorted 3 URLs (By Length (Short → Long))'],
		});
	});

	it('sorts by length descending, keeping the written order between equal lengths', async () => {
		_setActiveEditor(_createDocument({ content: URLS }));
		pickMode('length-desc');
		await runSort();
		expect(sorted()).toEqual({
			written:
				'https://alpha.example.com/bbbb\nhttps://zeta.example.com/a\nhttps://mid.example.org/cc\n',
			messages: ['info:Sorted 3 URLs (By Length (Long → Short))'],
		});
	});

	it('does nothing when the mode picker is dismissed', async () => {
		_setActiveEditor(_createDocument({ content: URLS }));
		_respondToQuickPick(() => undefined);
		await runSort();
		expect(sorted()).toEqual({ written: undefined, messages: [] });
	});

	it('reports a failure when the edit is rejected', async () => {
		// applyEdit returns false for a read-only document; announcing a sort
		// over an untouched document is the bug this guards.
		_setActiveEditor(_createDocument({ content: URLS }));
		pickMode('asc');
		_setApplyEditResult(false);
		await runSort();
		expect(sorted().messages).toEqual([
			'error:Failed to apply edits to document',
		]);
	});
});

describe('ini extraction fallback', () => {
	it('extracts URLs from a well-formed ini file', () => {
		const result = extractFromIni('[api]\nendpoint = https://example.com/v1\n');
		expect(result.length).toBeGreaterThan(0);
	});

	it('reads a document an INI parser would refuse, since it has no parser', () => {
		// A dotted key after its parent was a parse error under the library this
		// once used, and the URL on the line after it was lost. The extractor is
		// a whole-document scan minus comment lines now, so it is found.
		const result = extractFromIni(
			'a.b = 1\na = 2\na.c = https://example.com/found\n',
		);
		expect(result.map((url) => [url.value, url.position])).toEqual([
			['https://example.com/found', { line: 3, column: 7 }],
		]);
	});

	it('returns nothing for content with no URLs', () => {
		expect(extractFromIni('[section]\nkey = value\n')).toHaveLength(0);
	});

	it('returns nothing for empty content', () => {
		expect(extractFromIni('')).toHaveLength(0);
	});
});
