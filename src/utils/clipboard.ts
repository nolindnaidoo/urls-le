import * as vscode from 'vscode';
import type { Notifier } from '../ui/notifier';

/**
 * Copying results to the clipboard.
 *
 * Takes a Notifier rather than the command's whole dependency bag: the
 * clipboard needs to tell the user when it could not copy, and nothing else.
 */

const MAX_CLIPBOARD_SIZE = 1_000_000; // 1MB

function byteSize(text: string): number {
	return new TextEncoder().encode(text).length;
}

function isPermissionError(message: string): boolean {
	return message.includes('permission') || message.includes('access');
}

function reportFailure(error: unknown, notifier: Notifier): void {
	const message =
		error instanceof Error ? error.message : 'Unknown clipboard error';

	// A denied clipboard is not a failed extraction — the results are already
	// in an editor — so both arms warn rather than error.
	if (isPermissionError(message)) {
		notifier.showWarning(
			'Clipboard access denied. Extracted URLs but could not copy to clipboard.',
		);
		return;
	}

	notifier.showWarning(
		vscode.l10n.t('Failed to copy to clipboard: {0}', message),
	);
}

/** Copy the results when the setting is on, respecting cancellation and the size cap. */
export async function copyResultsToClipboard(
	lines: readonly string[],
	enabled: boolean,
	token: vscode.CancellationToken,
	notifier: Notifier,
): Promise<void> {
	if (!enabled) return;

	const text = lines.join('\n');
	const size = byteSize(text);

	if (size > MAX_CLIPBOARD_SIZE) {
		notifier.showWarning(
			vscode.l10n.t(
				'Results too large for clipboard ({0} bytes), skipping clipboard copy',
				size,
			),
		);
		return;
	}

	if (token.isCancellationRequested) return;

	try {
		await vscode.env.clipboard.writeText(text);
	} catch (error) {
		reportFailure(error, notifier);
	}
}
