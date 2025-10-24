import * as toml from '@iarna/toml';
import type { Url, UrlProtocol } from '../../types';

// Regex patterns for different URL formats
const URL_PATTERN = /(https?:\/\/[^\s<>"{}|\\^`[\];)']+)/g;
const FTP_PATTERN = /(ftp:\/\/[^\s<>"{}|\\^`[\];)']+)/g;
const MAILTO_PATTERN = /(mailto:[^\s<>"{}|\\^`[\];)']+)/g;
const TEL_PATTERN = /(tel:[^\s<>"{}|\\^`[\];)']+)/g;
const FILE_PATTERN = /(file:\/\/[^\s<>"{}|\\^`[\];)']+)/g;

/**
 * Extract URLs from TOML files (e.g., Cargo.toml, pyproject.toml)
 * Recursively walks through TOML structure to find URL values
 */
export function extractFromToml(content: string): Url[] {
	try {
		const parsed = toml.parse(content);
		return collectUrls(parsed);
	} catch (error) {
		// If TOML parsing fails, fall back to regex extraction
		console.warn('[URLs-LE] TOML parsing failed, using fallback:', error);
		return extractUrlsFromText(content);
	}
}

function collectUrls(obj: unknown, lineContext = ''): Url[] {
	const urls: Url[] = [];

	if (typeof obj === 'string') {
		urls.push(...extractUrlsFromText(obj, lineContext));
	} else if (Array.isArray(obj)) {
		for (const item of obj) {
			urls.push(...collectUrls(item, lineContext));
		}
	} else if (obj && typeof obj === 'object') {
		for (const [key, value] of Object.entries(obj)) {
			urls.push(...collectUrls(value, `${lineContext}${key}: `));
		}
	}

	return urls;
}

function extractUrlsFromText(text: string, context = ''): Url[] {
	const urls: Url[] = [];

	// Extract HTTP/HTTPS URLs - reset regex lastIndex
	URL_PATTERN.lastIndex = 0;
	let match;
	while ((match = URL_PATTERN.exec(text)) !== null) {
		urls.push({
			value: match[0],
			protocol: match[0].startsWith('https')
				? ('https' as UrlProtocol)
				: ('http' as UrlProtocol),
			context: context || text,
		});
	}

	// Extract FTP URLs - reset regex lastIndex
	FTP_PATTERN.lastIndex = 0;
	while ((match = FTP_PATTERN.exec(text)) !== null) {
		urls.push({
			value: match[0],
			protocol: 'ftp' as UrlProtocol,
			context: context || text,
		});
	}

	// Extract mailto URLs - reset regex lastIndex
	MAILTO_PATTERN.lastIndex = 0;
	while ((match = MAILTO_PATTERN.exec(text)) !== null) {
		urls.push({
			value: match[0],
			protocol: 'mailto' as UrlProtocol,
			context: context || text,
		});
	}

	// Extract tel URLs - reset regex lastIndex
	TEL_PATTERN.lastIndex = 0;
	while ((match = TEL_PATTERN.exec(text)) !== null) {
		urls.push({
			value: match[0],
			protocol: 'tel' as UrlProtocol,
			context: context || text,
		});
	}

	// Extract file URLs - reset regex lastIndex
	FILE_PATTERN.lastIndex = 0;
	while ((match = FILE_PATTERN.exec(text)) !== null) {
		urls.push({
			value: match[0],
			protocol: 'file' as UrlProtocol,
			context: context || text,
		});
	}

	return urls;
}
