import type { Url, UrlProtocol } from '../../types';

// Regex patterns for different URL formats
const URL_PATTERN = /(https?:\/\/[^\s<>"{}|\\^`[\];)']+)/g;
const FTP_PATTERN = /(ftp:\/\/[^\s<>"{}|\\^`[\];)']+)/g;
const MAILTO_PATTERN = /(mailto:[^\s<>"{}|\\^`[\];)']+)/g;
const TEL_PATTERN = /(tel:[^\s<>"{}|\\^`[\];)']+)/g;
const FILE_PATTERN = /(file:\/\/[^\s<>"{}|\\^`[\];)']+)/g;

// Common XML attributes that contain URLs
const URL_ATTRIBUTES =
	/(?:href|src|url|xlink:href|data|xmlns|schemaLocation|repository|scm|issueManagement|website|link|downloadUrl)=["']([^"']+)["']/gi;

/**
 * Extract URLs from XML files (Maven POM, build configs, API definitions)
 * Extracts URLs from:
 * - XML attributes (href, src, url, xlink:href, etc.)
 * - Text content between tags
 * - Common Maven/Gradle elements
 */
export function extractFromXml(content: string): Url[] {
	const urls: Url[] = [];
	const lines = content.split('\n');

	lines.forEach((line, lineIndex) => {
		try {
			// Extract URLs from XML attributes
			URL_ATTRIBUTES.lastIndex = 0;
			let attrMatch;
			while ((attrMatch = URL_ATTRIBUTES.exec(line)) !== null) {
				const urlValue = attrMatch[1];
				if (urlValue && isLikelyUrl(urlValue)) {
					const protocol = determineProtocol(urlValue);
					urls.push({
						value: urlValue,
						protocol,
						position: {
							line: lineIndex + 1,
							column: (attrMatch.index ?? 0) + 1,
						},
						context: line.trim(),
					});
				}
			}

			// Extract HTTP/HTTPS URLs from text content - reset regex lastIndex
			URL_PATTERN.lastIndex = 0;
			let match;
			while ((match = URL_PATTERN.exec(line)) !== null) {
				urls.push({
					value: match[0],
					protocol: match[0].startsWith('https')
						? ('https' as UrlProtocol)
						: ('http' as UrlProtocol),
					position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
					context: line.trim(),
				});
			}

			// Extract FTP URLs - reset regex lastIndex
			FTP_PATTERN.lastIndex = 0;
			while ((match = FTP_PATTERN.exec(line)) !== null) {
				urls.push({
					value: match[0],
					protocol: 'ftp' as UrlProtocol,
					position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
					context: line.trim(),
				});
			}

			// Extract mailto URLs - reset regex lastIndex
			MAILTO_PATTERN.lastIndex = 0;
			while ((match = MAILTO_PATTERN.exec(line)) !== null) {
				urls.push({
					value: match[0],
					protocol: 'mailto' as UrlProtocol,
					position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
					context: line.trim(),
				});
			}

			// Extract tel URLs - reset regex lastIndex
			TEL_PATTERN.lastIndex = 0;
			while ((match = TEL_PATTERN.exec(line)) !== null) {
				urls.push({
					value: match[0],
					protocol: 'tel' as UrlProtocol,
					position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
					context: line.trim(),
				});
			}

			// Extract file URLs - reset regex lastIndex
			FILE_PATTERN.lastIndex = 0;
			while ((match = FILE_PATTERN.exec(line)) !== null) {
				urls.push({
					value: match[0],
					protocol: 'file' as UrlProtocol,
					position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
					context: line.trim(),
				});
			}
		} catch (error) {
			// Skip lines that cause regex errors to prevent crashes
			console.warn(`[URLs-LE] Regex error on line ${lineIndex + 1}:`, error);
		}
	});

	return urls;
}

function isLikelyUrl(value: string): boolean {
	return (
		value.includes('://') ||
		value.startsWith('www.') ||
		value.includes('.com') ||
		value.includes('.org') ||
		value.includes('.net')
	);
}

function determineProtocol(url: string): UrlProtocol {
	if (url.startsWith('https://')) return 'https';
	if (url.startsWith('http://')) return 'http';
	if (url.startsWith('ftp://')) return 'ftp';
	if (url.startsWith('mailto:')) return 'mailto';
	if (url.startsWith('tel:')) return 'tel';
	if (url.startsWith('file://')) return 'file';
	// Default to https for URLs without protocol
	return 'https';
}
