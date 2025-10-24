import * as vscode from 'vscode';
import { getConfiguration } from '../config/config';

export interface Telemetry {
	event(name: string, properties?: Record<string, unknown>): void;
	dispose(): void;
}

export function createTelemetry(): Telemetry {
	let outputChannel: vscode.OutputChannel | undefined;

	return Object.freeze({
		event(name: string, properties?: Record<string, unknown>): void {
			const config = getConfiguration();
			if (config.telemetryEnabled) {
				// Create channel lazily if needed
				if (!outputChannel) {
					outputChannel =
						vscode.window.createOutputChannel('URLs-LE Telemetry');
				}

				const timestamp = new Date().toISOString();
				try {
					const props = properties ? ` ${JSON.stringify(properties)}` : '';
					outputChannel.appendLine(`[${timestamp}] ${name}${props}`);
				} catch (_error) {
					// Handle JSON.stringify errors (circular references, etc.)
					outputChannel.appendLine(
						`[${timestamp}] ${name} [serialization error]`,
					);
				}
			}
		},
		dispose(): void {
			outputChannel?.dispose();
		},
	});
}
