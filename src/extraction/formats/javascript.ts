import type { Url, UrlProtocol } from '../../types';

// Regex patterns for different URL formats in JavaScript/TypeScript
const URL_PATTERN = /(https?:\/\/[^\s<>"{}|\\^`[\];)']+)/g;
const FTP_PATTERN = /(ftp:\/\/[^\s<>"{}|\\^`[\];)']+)/g;
const MAILTO_PATTERN = /(mailto:[^\s<>"{}|\\^`[\];)']+)/g;
const TEL_PATTERN = /(tel:[^\s<>"{}|\\^`[\];)']+)/g;
const FILE_PATTERN = /(file:\/\/[^\s<>"{}|\\^`[\];)']+)/g;

// String patterns for URL values in quotes
const STRING_URL_PATTERN = /['"`]([^'"`]*?)['"`]/g;

export function extractFromJavaScript(content: string): Url[] {
	const urls: Url[] = [];
	const lines = content.split('\n');
	const extractedPositions = new Set<string>();

	lines.forEach((line, lineIndex) => {
		try {
			// Extract URLs from string literals first (highest priority)
			STRING_URL_PATTERN.lastIndex = 0;
			let match;
			while ((match = STRING_URL_PATTERN.exec(line)) !== null) {
				const stringValue = match[1];
				if (stringValue && isValidUrl(stringValue)) {
					const posKey = `${stringValue}`;
					if (!extractedPositions.has(posKey)) {
						extractedPositions.add(posKey);
						urls.push({
							value: stringValue,
							protocol: detectUrlProtocol(stringValue),
							position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
							context: line.trim(),
						});
					}
				}
			}

			// Extract HTTP/HTTPS URLs from plain text
			URL_PATTERN.lastIndex = 0;
			while ((match = URL_PATTERN.exec(line)) !== null) {
				const urlValue = match[0];
				const posKey = `${urlValue}`;
				if (!extractedPositions.has(posKey)) {
					extractedPositions.add(posKey);
					urls.push({
						value: urlValue,
						protocol: urlValue.startsWith('https') ? 'https' : 'http',
						position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
						context: line.trim(),
					});
				}
			}

			// Extract FTP URLs
			FTP_PATTERN.lastIndex = 0;
			while ((match = FTP_PATTERN.exec(line)) !== null) {
				const urlValue = match[0];
				const posKey = `${urlValue}`;
				if (!extractedPositions.has(posKey)) {
					extractedPositions.add(posKey);
					urls.push({
						value: urlValue,
						protocol: 'ftp' as UrlProtocol,
						position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
						context: line.trim(),
					});
				}
			}

			// Extract mailto URLs
			MAILTO_PATTERN.lastIndex = 0;
			while ((match = MAILTO_PATTERN.exec(line)) !== null) {
				const urlValue = match[0];
				const posKey = `${urlValue}`;
				if (!extractedPositions.has(posKey)) {
					extractedPositions.add(posKey);
					urls.push({
						value: urlValue,
						protocol: 'mailto' as UrlProtocol,
						position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
						context: line.trim(),
					});
				}
			}

			// Extract tel URLs
			TEL_PATTERN.lastIndex = 0;
			while ((match = TEL_PATTERN.exec(line)) !== null) {
				const urlValue = match[0];
				const posKey = `${urlValue}`;
				if (!extractedPositions.has(posKey)) {
					extractedPositions.add(posKey);
					urls.push({
						value: urlValue,
						protocol: 'tel' as UrlProtocol,
						position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
						context: line.trim(),
					});
				}
			}

			// Extract file URLs
			FILE_PATTERN.lastIndex = 0;
			while ((match = FILE_PATTERN.exec(line)) !== null) {
				const urlValue = match[0];
				const posKey = `${urlValue}`;
				if (!extractedPositions.has(posKey)) {
					extractedPositions.add(posKey);
					urls.push({
						value: urlValue,
						protocol: 'file' as UrlProtocol,
						position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
						context: line.trim(),
					});
				}
			}
		} catch (error) {
			// Skip lines that cause regex errors to prevent crashes
			console.warn(`[URLs-LE] Regex error on line ${lineIndex + 1}:`, error);
		}
	});

	return urls;
}

function isValidUrl(value: string): boolean {
	// Check if the string looks like a URL
	return (
		/^https?:\/\//.test(value) ||
		/^ftp:\/\//.test(value) ||
		/^mailto:/.test(value) ||
		/^tel:/.test(value) ||
		/^file:\/\//.test(value)
	);
}

function detectUrlProtocol(value: string): UrlProtocol {
	if (value.startsWith('http://')) return 'http';
	if (value.startsWith('https://')) return 'https';
	if (value.startsWith('ftp://')) return 'ftp';
	if (value.startsWith('mailto:')) return 'mailto';
	if (value.startsWith('tel:')) return 'tel';
	if (value.startsWith('file://')) return 'file';
	return 'unknown';
}
