import * as vscode from 'vscode';

export function registerToggleCsvStreamingCommand(
	context: vscode.ExtensionContext,
): void {
	const command = vscode.commands.registerCommand(
		'urls-le.csv.toggleStreaming',
		async () => {
			const config = vscode.workspace.getConfiguration('urls-le');
			const currentValue = config.get<boolean>('csv.streamingEnabled', false);
			const newValue = !currentValue;

			await config.update(
				'csv.streamingEnabled',
				newValue,
				vscode.ConfigurationTarget.Global,
			);

			const message = newValue
				? 'CSV streaming enabled'
				: 'CSV streaming disabled';

			vscode.window.showInformationMessage(message);
		},
	);

	context.subscriptions.push(command);
}
