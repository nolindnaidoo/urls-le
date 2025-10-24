import * as ini from 'ini';
import type { Url, UrlProtocol } from '../../types';

// Regex patterns for different URL formats
const URL_PATTERN = /(https?:\/\/[^\s<>"{}|\\^`[\];)']+)/g;
const FTP_PATTERN = /(ftp:\/\/[^\s<>"{}|\\^`[\];)']+)/g;
const MAILTO_PATTERN = /(mailto:[^\s<>"{}|\\^`[\];)']+)/g;
const TEL_PATTERN = /(tel:[^\s<>"{}|\\^`[\];)']+)/g;
const FILE_PATTERN = /(file:\/\/[^\s<>"{}|\\^`[\];)']+)/g;

/**
 * Extract URLs from INI configuration files
 * Recursively walks through INI structure (sections and values)
 */
export function extractFromIni(content: string): Url[] {
	try {
		const parsed = ini.parse(content);
		return collectUrls(parsed);
	} catch (error) {
		// If INI parsing fails, fall back to regex extraction
		console.warn('[URLs-LE] INI parsing failed, using fallback:', error);
		return extractUrlsFromText(content);
	}
}

function collectUrls(obj: unknown, sectionContext = ''): Url[] {
	const urls: Url[] = [];

	if (typeof obj === 'string') {
		urls.push(...extractUrlsFromText(obj, sectionContext));
	} else if (Array.isArray(obj)) {
		for (const item of obj) {
			urls.push(...collectUrls(item, sectionContext));
		}
	} else if (obj && typeof obj === 'object') {
		for (const [key, value] of Object.entries(obj)) {
			const context = sectionContext ? `${sectionContext}.${key}` : key;
			urls.push(...collectUrls(value, context));
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
