import * as vscode from 'vscode';

/**
 * The message of a thrown value, or one localized word when the value is
 * not an Error. Six catch arms each spelt their own English fallback, two
 * ways, and every one reached the user in English in every locale.
 */
export function describeError(error: unknown): string {
	return error instanceof Error
		? error.message
		: vscode.l10n.t('Unknown error');
}

/**
 * Redact user directories and credential-shaped fragments from messages
 * before they reach notifications or logs.
 */
export function sanitizeErrorMessage(message: string): string {
	return message
		.replace(/\/Users\/[^/]+\//g, '/Users/***/')
		.replace(/\/home\/[^/]+\//g, '/home/***/')
		.replace(/C:\\Users\\[^\\]+\\/g, 'C:\\Users\\***\\')
		.replace(/password[=:]\s*[^\s]+/gi, 'password=***')
		.replace(/token[=:]\s*[^\s]+/gi, 'token=***')
		.replace(/key[=:]\s*[^\s]+/gi, 'key=***');
}
