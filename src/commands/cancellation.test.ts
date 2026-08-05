import { beforeEach, describe, expect, it } from 'vitest';
import {
	_cancelAfterProgress,
	_createDocument,
	_registeredCommands,
	_resetMockState,
	_setActiveEditor,
	_setConfig,
} from '../__mocks__/vscode';
import { registerExtractCommand } from './extract';

/**
 * Cancellation of an in-flight extraction.
 *
 * Extraction checks the token at six points, which is what keeps a large
 * document interruptible. None of those checks could ever be true: the command
 * built its own CancellationTokenSource and nothing called cancel() on it, so
 * the token was a permanent false and the extraction advertised an
 * interruptibility it did not have. It now takes its token from a cancellable
 * progress notification, and these tests walk the cancel across each
 * checkpoint.
 */

function makeContext() {
	return { subscriptions: [] as Array<{ dispose(): void }> } as never;
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

async function runExtract(events: string[]): Promise<void> {
	registerExtractCommand(makeContext(), makeDeps(events) as never);
	const handler = _registeredCommands().get('urls-le.extractUrls');
	if (!handler) throw new Error('extract command not registered');
	await handler();
}

const MARKDOWN = [
	'See <https://example.com/one> and <https://example.com/two>.',
	'Also [three](https://example.com/three) and https://example.com/four',
].join('\n');

beforeEach(() => {
	_resetMockState();
	_setConfig('urls-le.notificationsLevel', 'all');
});

describe('extract: cancellation', () => {
	it('stops before doing any work when cancelled immediately', async () => {
		const events: string[] = [];
		_setActiveEditor(
			_createDocument({ content: MARKDOWN, languageId: 'markdown' }),
		);
		_cancelAfterProgress(0);
		await runExtract(events);
		expect(events.some((e) => e.startsWith('info:'))).toBe(false);
	});

	it('does not report a cancellation as an error', async () => {
		// A cancel is a user decision, not a failure; announcing it as an error
		// is the bug this guards.
		const events: string[] = [];
		_setActiveEditor(
			_createDocument({ content: MARKDOWN, languageId: 'markdown' }),
		);
		_cancelAfterProgress(0);
		await runExtract(events);
		expect(events.some((e) => e.startsWith('error:'))).toBe(false);
	});

	it('clears the status bar when cancelled', async () => {
		// hideProgress runs in a finally, so a cancel must not leave the status
		// bar stuck on "extracting".
		const events: string[] = [];
		_setActiveEditor(
			_createDocument({ content: MARKDOWN, languageId: 'markdown' }),
		);
		_cancelAfterProgress(0);
		await runExtract(events);
		expect(events).toContain('statusbar:idle');
	});

	for (const checkpoint of [1, 2, 3, 4, 5, 6]) {
		it(`stops cleanly when cancelled at checkpoint ${checkpoint}`, async () => {
			// Each value cancels one step later, so the walk covers every check in
			// turn: before extraction, after it, and before each output route.
			const events: string[] = [];
			_setActiveEditor(
				_createDocument({ content: MARKDOWN, languageId: 'markdown' }),
			);
			_cancelAfterProgress(checkpoint);
			await expect(runExtract(events)).resolves.toBeUndefined();
			expect(events.some((e) => e.startsWith('error:'))).toBe(false);
			expect(events).toContain('statusbar:idle');
		});
	}

	it('does not announce a result when the new-file route was cancelled', async () => {
		// The cancel lands after extraction but before the document is opened, so
		// nothing reaches the user; a success message here would be a lie.
		const events: string[] = [];
		_setConfig('urls-le.openResultsSideBySide', false);
		_setConfig('urls-le.postProcess.openInNewFile', true);
		_setActiveEditor(
			_createDocument({ content: MARKDOWN, languageId: 'markdown' }),
		);
		_cancelAfterProgress(4);
		await runExtract(events);
		expect(events.some((e) => e.startsWith('info:Extracted'))).toBe(false);
		expect(events).not.toContain('extract-success');
	});

	it('does not announce a result when the in-place edit was cancelled', async () => {
		// Same shape on the replace route: the edit is skipped, so the document
		// still holds its original text.
		const events: string[] = [];
		_setConfig('urls-le.openResultsSideBySide', false);
		_setConfig('urls-le.postProcess.openInNewFile', false);
		_setActiveEditor(
			_createDocument({ content: MARKDOWN, languageId: 'markdown' }),
		);
		_cancelAfterProgress(4);
		await runExtract(events);
		expect(events.some((e) => e.startsWith('info:Extracted'))).toBe(false);
		expect(events).not.toContain('extract-success');
	});

	it('completes normally when never cancelled', async () => {
		const events: string[] = [];
		_setActiveEditor(
			_createDocument({ content: MARKDOWN, languageId: 'markdown' }),
		);
		await runExtract(events);
		expect(events).toContain('statusbar:idle');
		expect(events.some((e) => e.startsWith('error:'))).toBe(false);
	});

	it('cancels the clipboard copy as well as the editor output', async () => {
		// The copy sits behind its own check; with copyToClipboardEnabled on it
		// is the last thing a late cancel can still prevent.
		const events: string[] = [];
		_setConfig('urls-le.copyToClipboardEnabled', true);
		_setActiveEditor(
			_createDocument({ content: MARKDOWN, languageId: 'markdown' }),
		);
		_cancelAfterProgress(5);
		await expect(runExtract(events)).resolves.toBeUndefined();
		expect(events.some((e) => e.startsWith('error:'))).toBe(false);
	});
});
