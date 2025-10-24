import type * as vscode from 'vscode';
import type { ExtractionResult, FileType, ParseError, Url } from '../types';
import { extractFromCss } from './formats/css';
import { extractFromHtml } from './formats/html';
import { extractFromIni } from './formats/ini';
import { extractFromJavaScript } from './formats/javascript';
import { extractFromJson } from './formats/json';
import { extractFromMarkdown } from './formats/markdown';
import { extractFromProperties } from './formats/properties';
import { extractFromToml } from './formats/toml';
import { extractFromXml } from './formats/xml';
import { extractFromYaml } from './formats/yaml';

export async function extractUrls(
	content: string,
	languageId: string,
	cancellationToken?: vscode.CancellationToken,
): Promise<ExtractionResult> {
	// Check cancellation before starting
	if (cancellationToken?.isCancellationRequested) {
		return {
			success: false,
			urls: [],
			errors: [],
			fileType: 'unknown',
		};
	}

	// Validate input length to prevent memory issues
	if (content.length > 10000000) {
		// 10MB limit
		return {
			success: false,
			urls: [],
			errors: [
				{
					category: 'parsing',
					severity: 'warning',
					message: `Content too large (${content.length} characters), maximum size is 10MB`,
					recoverable: true,
					recoveryAction: 'truncate',
					timestamp: Date.now(),
				},
			],
			fileType: 'unknown',
		};
	}

	const fileType = determineFileType(languageId);
	const urls: Url[] = [];
	const errors: ParseError[] = [];

	// Check cancellation before extraction
	if (cancellationToken?.isCancellationRequested) {
		return {
			success: false,
			urls: [],
			errors: [],
			fileType,
		};
	}

	try {
		switch (fileType) {
			case 'markdown':
				urls.push(...extractFromMarkdown(content));
				break;
			case 'html':
				urls.push(...extractFromHtml(content));
				break;
			case 'css':
				urls.push(...extractFromCss(content));
				break;
			case 'javascript':
			case 'typescript':
				urls.push(...extractFromJavaScript(content));
				break;
			case 'json':
				urls.push(...extractFromJson(content));
				break;
			case 'yaml':
			case 'yml':
				urls.push(...extractFromYaml(content));
				break;
			case 'properties':
				urls.push(...extractFromProperties(content));
				break;
			case 'toml':
				urls.push(...extractFromToml(content));
				break;
			case 'ini':
				urls.push(...extractFromIni(content));
				break;
			case 'xml':
				urls.push(...extractFromXml(content));
				break;
			default:
				// Try markdown extraction as fallback
				urls.push(...extractFromMarkdown(content));
				break;
		}
	} catch (error) {
		errors.push({
			category: 'parsing' as const,
			severity: 'warning' as const,
			message: error instanceof Error ? error.message : 'Unknown parsing error',
			recoverable: true,
			recoveryAction: 'skip' as const,
			timestamp: Date.now(),
		});
	}

	// Check for URL count limits to prevent memory issues
	if (urls.length > 50000) {
		// 50K URL limit
		const truncatedUrls = urls.slice(0, 50000);
		return Object.freeze({
			success: true,
			urls: Object.freeze(truncatedUrls),
			errors: Object.freeze([
				{
					category: 'parsing' as const,
					severity: 'warning' as const,
					message: `URL count (${urls.length}) exceeds limit (50000), truncated results`,
					recoverable: true,
					recoveryAction: 'truncate' as const,
					timestamp: Date.now(),
				},
			]),
			fileType,
		});
	}

	return Object.freeze({
		success: errors.length === 0,
		urls: Object.freeze(urls),
		errors: Object.freeze(errors),
		fileType,
	});
}

function determineFileType(languageId: string): FileType {
	switch (languageId) {
		case 'markdown':
			return 'markdown';
		case 'html':
			return 'html';
		case 'css':
			return 'css';
		case 'javascript':
			return 'javascript';
		case 'typescript':
			return 'typescript';
		case 'json':
			return 'json';
		case 'yaml':
		case 'yml':
			return 'yaml';
		case 'properties':
			return 'properties';
		case 'toml':
			return 'toml';
		case 'ini':
			return 'ini';
		case 'xml':
			return 'xml';
		default:
			return 'unknown';
	}
}
