import { beforeEach, describe, expect, it } from 'vitest';
import {
	_clipboardText,
	_createDocument,
	_registeredCommands,
	_resetMockState,
	_setActiveEditor,
	_setApplyEditError,
	_setApplyEditResult,
	_setClipboardError,
	_setConfig,
	_setOpenDocumentError,
} from '../__mocks__/vscode';
import { registerExtractCommand } from './extract';

/**
 * The three output routes and the clipboard copy.
 *
 * Only the side-by-side route was exercised, so opening in a new file and
 * replacing the document in place never ran, and neither did any of the
 * failure arms: a rejected edit, a document that will not open, a denied
 * clipboard. Each of those is a case where the command must report a problem
 * instead of announcing a result it did not deliver.
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
	} as never;
}

async function runExtract(events: string[]): Promise<void> {
	registerExtractCommand(makeContext(), makeDeps(events));
	const handler = _registeredCommands().get('urls-le.extractUrls');
	if (!handler) throw new Error('extract command not registered');
	await handler();
}

const MARKDOWN = [
	'See <https://example.com/one> and <https://example.com/two>.',
	'Also [three](https://example.com/three) and https://example.com/four',
].join('\n');

function openMarkdown(): void {
	_setActiveEditor(
		_createDocument({ content: MARKDOWN, languageId: 'markdown' }),
	);
}

beforeEach(() => {
	_resetMockState();
	_setConfig('urls-le.notificationsLevel', 'all');
});

describe('output routes', () => {
	it('opens results beside the editor by default', async () => {
		const events: string[] = [];
		openMarkdown();
		await runExtract(events);
		expect(events.some((e) => e.startsWith('info:Extracted'))).toBe(true);
	});

	it('opens results in a new file when side-by-side is off', async () => {
		// Requires both settings: side-by-side off selects the route, and
		// openInNewFile decides between a new document and an in-place edit.
		const events: string[] = [];
		_setConfig('urls-le.openResultsSideBySide', false);
		_setConfig('urls-le.postProcess.openInNewFile', true);
		openMarkdown();
		await runExtract(events);
		expect(events.some((e) => e.startsWith('error:'))).toBe(false);
		expect(events.some((e) => e.startsWith('info:Extracted'))).toBe(true);
	});

	it('replaces the document in place when both open settings are off', async () => {
		const events: string[] = [];
		_setConfig('urls-le.openResultsSideBySide', false);
		_setConfig('urls-le.postProcess.openInNewFile', false);
		openMarkdown();
		await runExtract(events);
		expect(events.some((e) => e.startsWith('error:'))).toBe(false);
	});

	it('reports a failure when the in-place edit is rejected', async () => {
		// applyEdit resolves false for a read-only document. Announcing success
		// over an untouched document is the bug this guards.
		const events: string[] = [];
		_setConfig('urls-le.openResultsSideBySide', false);
		_setConfig('urls-le.postProcess.openInNewFile', false);
		_setApplyEditResult(false);
		openMarkdown();
		await runExtract(events);
		expect(events.some((e) => e.startsWith('error:'))).toBe(true);
		// The error is already on screen; a success count after it would
		// report both outcomes for one action.
		expect(events.some((e) => e.startsWith('info:Extracted'))).toBe(false);
		expect(events).not.toContain('extract-success');
	});

	it('reports a failure when the side-by-side document cannot be opened', async () => {
		const events: string[] = [];
		_setOpenDocumentError(new Error('no window'));
		openMarkdown();
		await runExtract(events);
		expect(events.some((e) => e.startsWith('error:'))).toBe(true);
		// The error is already on screen; a success count after it would
		// report both outcomes for one action.
		expect(events.some((e) => e.startsWith('info:Extracted'))).toBe(false);
		expect(events).not.toContain('extract-success');
	});

	it('reports a failure when the new file cannot be opened', async () => {
		const events: string[] = [];
		_setConfig('urls-le.openResultsSideBySide', false);
		_setConfig('urls-le.postProcess.openInNewFile', true);
		_setOpenDocumentError(new Error('no window'));
		openMarkdown();
		await runExtract(events);
		expect(events.some((e) => e.startsWith('error:'))).toBe(true);
		// The error is already on screen; a success count after it would
		// report both outcomes for one action.
		expect(events.some((e) => e.startsWith('info:Extracted'))).toBe(false);
		expect(events).not.toContain('extract-success');
	});
});

describe('clipboard copy', () => {
	it('copies the results when the setting is on', async () => {
		const events: string[] = [];
		_setConfig('urls-le.copyToClipboardEnabled', true);
		openMarkdown();
		await runExtract(events);
		expect(_clipboardText()).toContain('https://example.com/one');
	});

	it('leaves the clipboard alone when the setting is off', async () => {
		const events: string[] = [];
		_setConfig('urls-le.copyToClipboardEnabled', false);
		openMarkdown();
		await runExtract(events);
		expect(_clipboardText()).toBe('');
	});

	it('warns rather than fails when clipboard access is denied', async () => {
		// A denied clipboard must not lose the extraction: the results are already
		// in an editor, so this is a warning, not an error.
		const events: string[] = [];
		_setConfig('urls-le.copyToClipboardEnabled', true);
		_setClipboardError(new Error('permission denied by the system'));
		openMarkdown();
		await runExtract(events);
		expect(events.some((e) => e.startsWith('warn:'))).toBe(true);
		expect(events.some((e) => e.startsWith('error:'))).toBe(false);
	});

	it('warns when the clipboard write fails for any other reason', async () => {
		const events: string[] = [];
		_setConfig('urls-le.copyToClipboardEnabled', true);
		_setClipboardError(new Error('clipboard unavailable'));
		openMarkdown();
		await runExtract(events);
		expect(events.some((e) => e.startsWith('warn:'))).toBe(true);
	});
});

describe('safety guardrails and failure reporting', () => {
	it('surfaces a large-file warning before extracting', async () => {
		// The threshold clamps at 100 lines, so the document has to clear that
		// for the warning loop to be entered at all.
		const events: string[] = [];
		_setConfig('urls-le.safety.enabled', true);
		_setConfig('urls-le.safety.largeOutputLinesThreshold', 100);
		const many = Array.from(
			{ length: 150 },
			(_, i) => `line ${i}: https://example.com/${i}`,
		).join('\n');
		_setActiveEditor(
			_createDocument({ content: many, languageId: 'markdown' }),
		);
		await runExtract(events);
		expect(events.some((e) => e.startsWith('warn:'))).toBe(true);
	});

	it('refuses a file over the size threshold and does not extract', async () => {
		const events: string[] = [];
		_setConfig('urls-le.safety.enabled', true);
		_setConfig('urls-le.safety.fileSizeWarnBytes', 1000);
		const big = `https://example.com/x `.repeat(200);
		_setActiveEditor(_createDocument({ content: big, languageId: 'markdown' }));
		await runExtract(events);
		expect(events.some((e) => e.startsWith('warn:'))).toBe(true);
		expect(events.some((e) => e.startsWith('info:Extracted'))).toBe(false);
	});

	it('reports a failure when the in-place edit throws', async () => {
		const events: string[] = [];
		_setConfig('urls-le.openResultsSideBySide', false);
		_setConfig('urls-le.postProcess.openInNewFile', false);
		_setApplyEditError(new Error('document disposed'));
		openMarkdown();
		await runExtract(events);
		expect(events.some((e) => e.startsWith('error:'))).toBe(true);
	});

	it('skips the clipboard copy when the results exceed the 1MB cap', async () => {
		// Above the cap the copy is abandoned with a warning rather than
		// attempted; the extraction itself still succeeds.
		const events: string[] = [];
		_setConfig('urls-le.safety.enabled', false);
		_setConfig('urls-le.copyToClipboardEnabled', true);
		const huge = Array.from(
			{ length: 40_000 },
			(_, i) => `https://example.com/a-reasonably-long-path/${i}`,
		).join('\n');
		_setActiveEditor(
			_createDocument({ content: huge, languageId: 'markdown' }),
		);
		await runExtract(events);
		expect(events.some((e) => e.startsWith('warn:'))).toBe(true);
		expect(_clipboardText()).toBe('');
	});

	it('reports an unexpected failure through the error handler', async () => {
		// A disposed status bar item throws on show; the command has to turn that
		// into a reported error rather than an unhandled rejection.
		const events: string[] = [];
		openMarkdown();
		registerExtractCommand(makeContext(), {
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
				showExtracting: () => {
					throw new Error('status bar item disposed');
				},
				hideProgress: () => events.push('statusbar:idle'),
				dispose: () => {},
			},
		} as never);
		const handler = _registeredCommands().get('urls-le.extractUrls');
		if (!handler) throw new Error('extract command not registered');
		await expect(handler()).resolves.toBeUndefined();
		expect(events.some((e) => e.startsWith('error:'))).toBe(true);
		expect(events).toContain('extract-error');
		expect(events).toContain('statusbar:idle');
	});
});
