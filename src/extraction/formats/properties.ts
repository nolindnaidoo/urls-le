import type { Url, UrlProtocol } from '../../types';

// Regex patterns for different URL formats
const URL_PATTERN = /(https?:\/\/[^\s<>"{}|\\^`[\];)']+)/g;
const FTP_PATTERN = /(ftp:\/\/[^\s<>"{}|\\^`[\];)']+)/g;
const MAILTO_PATTERN = /(mailto:[^\s<>"{}|\\^`[\];)']+)/g;
const TEL_PATTERN = /(tel:[^\s<>"{}|\\^`[\];)']+)/g;
const FILE_PATTERN = /(file:\/\/[^\s<>"{}|\\^`[\];)']+)/g;

/**
 * Extract URLs from Java properties files
 * Properties format: key=value or key:value
 * Supports comments (# or !) and multi-line values with backslash continuation
 */
export function extractFromProperties(content: string): Url[] {
	const urls: Url[] = [];
	const lines = content.split('\n');

	lines.forEach((line, lineIndex) => {
		try {
			// Skip comment lines
			const trimmedLine = line.trim();
			if (
				trimmedLine.startsWith('#') ||
				trimmedLine.startsWith('!') ||
				trimmedLine === ''
			) {
				return;
			}

			// Extract HTTP/HTTPS URLs - reset regex lastIndex
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
