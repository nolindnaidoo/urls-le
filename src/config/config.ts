import * as vscode from 'vscode';
import type { Configuration } from '../types';

export function getConfiguration(): Configuration {
	const config = vscode.workspace.getConfiguration('urls-le');

	// Backward-compat: support both `notificationLevel` (preferred) and legacy `notificationsLevel`
	const notifRaw = config.get(
		'notificationLevel',
		config.get('notificationsLevel', 'silent'),
	) as unknown as string;
	const notificationsLevel = isValidNotificationLevel(notifRaw)
		? notifRaw
		: 'silent';

	return Object.freeze({
		copyToClipboardEnabled: Boolean(
			config.get('copyToClipboardEnabled', false),
		),
		dedupeEnabled: Boolean(config.get('dedupeEnabled', false)),
		notificationsLevel,
		postProcessOpenInNewFile: Boolean(
			config.get('postProcess.openInNewFile', false),
		),
		openResultsSideBySide: Boolean(config.get('openResultsSideBySide', false)),
		safetyEnabled: Boolean(config.get('safety.enabled', true)),
		safetyFileSizeWarnBytes: Math.max(
			1000,
			Number(config.get('safety.fileSizeWarnBytes', 1000000)),
		),
		safetyLargeOutputLinesThreshold: Math.max(
			100,
			Number(config.get('safety.largeOutputLinesThreshold', 50000)),
		),
		safetyManyDocumentsThreshold: Math.max(
			1,
			Number(config.get('safety.manyDocumentsThreshold', 8)),
		),
		showParseErrors: Boolean(config.get('showParseErrors', false)),
		statusBarEnabled: Boolean(config.get('statusBar.enabled', true)),
		telemetryEnabled: Boolean(config.get('telemetryEnabled', false)),
	});
}

export type NotificationLevel = 'all' | 'important' | 'silent';

export function isValidNotificationLevel(v: unknown): v is NotificationLevel {
	return v === 'all' || v === 'important' || v === 'silent';
}
