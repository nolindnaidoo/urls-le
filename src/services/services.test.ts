import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	_createExtensionContext,
	_fireConfigChange,
	_outputChannels,
	_registeredCommands,
	_resetMockState,
	_setConfig,
	_shownMessages,
	_statusBarItems,
	executedBuiltins,
} from '../__mocks__/vscode';
import { registerOpenSettingsCommand } from '../config/settings';
import { activate, deactivate } from '../extension';
import { createTelemetry } from '../telemetry/telemetry';
import { createNotifier } from '../ui/notifier';
import { createStatusBar } from '../ui/statusBar';
import { createServices } from './serviceFactory';

beforeEach(() => {
	_resetMockState();
});

describe('createServices / activate', () => {
	it('activate registers every command the manifest declares, and no other', () => {
		// Read from the manifest rather than listed here: a list named five of
		// seven and could not notice an eighth.
		const manifest = JSON.parse(
			readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
		) as { contributes: { commands: Array<{ command: string }> } };
		const declared = manifest.contributes.commands
			.map((entry) => entry.command)
			.sort();
		expect(declared.length).toBeGreaterThanOrEqual(7);

		const context = _createExtensionContext();
		activate(context as never);

		expect([..._registeredCommands().keys()].sort()).toEqual(declared);
		deactivate();
	});

	it('createServices returns frozen bag and registers disposables', () => {
		const context = _createExtensionContext();
		const services = createServices(context as never);
		expect(Object.isFrozen(services)).toBe(true);
		expect(context.subscriptions.length).toBeGreaterThan(0);
	});
});

describe('telemetry', () => {
	it('creates no channel and writes nothing while disabled, which is the default', () => {
		const telemetry = createTelemetry();
		telemetry.event('x');
		telemetry.dispose();
		expect(_outputChannels()).toEqual([]);
	});

	it('writes each event with its properties to one channel while enabled, and releases it', () => {
		_setConfig('urls-le.telemetryEnabled', true);
		const telemetry = createTelemetry();
		telemetry.event('activated', { count: 2 });
		telemetry.event('plain');
		expect(_outputChannels()).toHaveLength(1);
		const channel = _outputChannels()[0];
		expect(
			channel?._lines.map((line) => line.replace(/^\[[^\]]+\] /, '')),
		).toEqual(['activated {"count":2}', 'plain']);
		expect(channel?._lines[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T[^\]]+Z\] /);
		expect(channel?.disposed).toBe(false);
		telemetry.dispose();
		expect(channel?.disposed).toBe(true);
	});
});

describe('statusBar', () => {
	it('is shown by default, bound to Extract, and shows extracting then idle text', () => {
		const context = _createExtensionContext();
		const statusBar = createStatusBar(context as never);
		const item = _statusBarItems()[0];
		expect(item).toMatchObject({
			text: 'URLs-LE: Ready',
			tooltip: 'URLs-LE: URL extraction',
			command: 'urls-le.extractUrls',
			visible: true,
		});
		statusBar.showExtracting();
		expect(item?.text).toBe('URLs-LE: Extracting...');
		statusBar.hideProgress();
		expect(item?.text).toBe('URLs-LE: Ready');
		statusBar.dispose();
		expect(item?.disposed).toBe(true);
	});

	it('hides when statusBar.enabled is switched off, and shows again when it is switched on', () => {
		const context = _createExtensionContext();
		createStatusBar(context as never);
		const item = _statusBarItems()[0];
		expect(item?.visible).toBe(true);
		_setConfig('urls-le.statusBar.enabled', false);
		_fireConfigChange('urls-le.statusBar.enabled');
		expect(item?.visible).toBe(false);
		_setConfig('urls-le.statusBar.enabled', true);
		_fireConfigChange('urls-le.statusBar.enabled');
		expect(item?.visible).toBe(true);
		// A change elsewhere in the section leaves it alone.
		_setConfig('urls-le.statusBar.enabled', false);
		_fireConfigChange('urls-le.telemetryEnabled');
		expect(item?.visible).toBe(true);
	});

	it('starts hidden when statusBar.enabled is off at activation', () => {
		_setConfig('urls-le.statusBar.enabled', false);
		createStatusBar(_createExtensionContext() as never);
		expect(_statusBarItems()[0]?.visible).toBe(false);
	});
});

describe('notifier respects notificationsLevel', () => {
	it('silent (default): errors only', () => {
		const notifier = createNotifier();
		notifier.showInfo('i');
		notifier.showWarning('w');
		notifier.showError('e');
		expect(_shownMessages().map((m) => m.kind)).toEqual(['error']);
	});

	it('important: warnings and errors', () => {
		_setConfig('urls-le.notificationsLevel', 'important');
		const notifier = createNotifier();
		notifier.showInfo('i');
		notifier.showWarning('w');
		notifier.showError('e');
		expect(_shownMessages().map((m) => m.kind)).toEqual(['warning', 'error']);
	});

	it('all: everything', () => {
		_setConfig('urls-le.notificationsLevel', 'all');
		const notifier = createNotifier();
		notifier.showInfo('i');
		notifier.showWarning('w');
		notifier.showError('e');
		expect(_shownMessages().map((m) => m.kind)).toEqual([
			'info',
			'warning',
			'error',
		]);
	});
});

describe('openSettings command', () => {
	it('opens the settings UI scoped to urls-le', async () => {
		const context = _createExtensionContext();
		registerOpenSettingsCommand(context as never, {
			event: () => {},
			dispose: () => {},
		});
		await _registeredCommands().get('urls-le.openSettings')?.();
		expect(executedBuiltins[0]).toEqual({
			id: 'workbench.action.openSettings',
			args: ['urls-le'],
		});
	});
});
