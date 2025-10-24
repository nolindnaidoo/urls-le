import type { Url } from '../../types';
import {
	detectUrlProtocol,
	extractUrlComponents,
	isValidUrl,
} from '../../utils/urlValidation';

// Regex patterns for different URL formats in HTML
const URL_PATTERN = /(https?:\/\/[^\s<>"{}|\\^`[\];)']+)/g;
const FTP_PATTERN = /(ftp:\/\/[^\s<>"{}|\\^`[\];)']+)/g;
const MAILTO_PATTERN = /(mailto:[^\s<>"{}|\\^`[\];)']+)/g;
const TEL_PATTERN = /(tel:[^\s<>"{}|\\^`[\];)']+)/g;
const FILE_PATTERN = /(file:\/\/[^\s<>"{}|\\^`[\];)']+)/g;

// HTML attribute patterns
const HREF_PATTERN = /href\s*=\s*["']([^"']+)["']/gi;
const SRC_PATTERN = /src\s*=\s*["']([^"']+)["']/gi;
const ACTION_PATTERN = /action\s*=\s*["']([^"']+)["']/gi;

export function extractFromHtml(content: string): Url[] {
	const urls: Url[] = [];
	const lines = content.split('\n');
	const extractedPositions = new Set<string>();

	// Helper function to check if a position is inside an HTML comment
	const isInComment = (line: string, index: number): boolean => {
		const before = line.substring(0, index);
		const commentStart = before.lastIndexOf('<!--');
		const commentEnd = before.lastIndexOf('-->');
		return commentStart > commentEnd;
	};

	lines.forEach((line, lineIndex) => {
		try {
			// Extract URLs from href attributes first (highest priority)
			HREF_PATTERN.lastIndex = 0;
			let match;
			while ((match = HREF_PATTERN.exec(line)) !== null) {
				const url = match[1];
				if (url && isValidUrl(url) && !isInComment(line, match.index ?? 0)) {
					const posKey = `${url}`;
					if (!extractedPositions.has(posKey)) {
						extractedPositions.add(posKey);
						const components = extractUrlComponents(url);
						// Position should be where the URL starts, not where href starts
						const _urlStartIndex =
							(match.index ?? 0) + match[0].indexOf(match[1] ?? '');
						urls.push({
							value: url,
							protocol: detectUrlProtocol(url),
							domain: components?.domain,
							path: components?.path,
							position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
							context: line.trim(),
						});
					}
				}
			}

			// Extract URLs from src attributes
			SRC_PATTERN.lastIndex = 0;
			while ((match = SRC_PATTERN.exec(line)) !== null) {
				const url = match[1];
				if (url && isValidUrl(url) && !isInComment(line, match.index ?? 0)) {
					const posKey = `${url}`;
					if (!extractedPositions.has(posKey)) {
						extractedPositions.add(posKey);
						const components = extractUrlComponents(url);
						const _urlStartIndex =
							(match.index ?? 0) + match[0].indexOf(match[1] ?? '');
						urls.push({
							value: url,
							protocol: detectUrlProtocol(url),
							domain: components?.domain,
							path: components?.path,
							position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
							context: line.trim(),
						});
					}
				}
			}

			// Extract URLs from action attributes
			ACTION_PATTERN.lastIndex = 0;
			while ((match = ACTION_PATTERN.exec(line)) !== null) {
				const url = match[1];
				if (url && isValidUrl(url) && !isInComment(line, match.index ?? 0)) {
					const posKey = `${url}`;
					if (!extractedPositions.has(posKey)) {
						extractedPositions.add(posKey);
						const components = extractUrlComponents(url);
						const _urlStartIndex =
							(match.index ?? 0) + match[0].indexOf(match[1] ?? '');
						urls.push({
							value: url,
							protocol: detectUrlProtocol(url),
							domain: components?.domain,
							path: components?.path,
							position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
							context: line.trim(),
						});
					}
				}
			}

			// Extract HTTP/HTTPS URLs from plain text (lowest priority)
			URL_PATTERN.lastIndex = 0;
			while ((match = URL_PATTERN.exec(line)) !== null) {
				const urlValue = match[0];
				if (!isInComment(line, match.index ?? 0)) {
					const posKey = `${urlValue}`;
					if (!extractedPositions.has(posKey)) {
						extractedPositions.add(posKey);
						const components = extractUrlComponents(urlValue);
						urls.push({
							value: urlValue,
							protocol: detectUrlProtocol(urlValue),
							domain: components?.domain,
							path: components?.path,
							position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
							context: line.trim(),
						});
					}
				}
			}

			// Extract FTP URLs
			FTP_PATTERN.lastIndex = 0;
			while ((match = FTP_PATTERN.exec(line)) !== null) {
				const urlValue = match[0];
				if (!isInComment(line, match.index ?? 0)) {
					const posKey = `${urlValue}`;
					if (!extractedPositions.has(posKey)) {
						extractedPositions.add(posKey);
						const components = extractUrlComponents(urlValue);
						urls.push({
							value: urlValue,
							protocol: detectUrlProtocol(urlValue),
							domain: components?.domain,
							path: components?.path,
							position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
							context: line.trim(),
						});
					}
				}
			}

			// Extract mailto URLs
			MAILTO_PATTERN.lastIndex = 0;
			while ((match = MAILTO_PATTERN.exec(line)) !== null) {
				const urlValue = match[0];
				if (!isInComment(line, match.index ?? 0)) {
					const posKey = `${urlValue}`;
					if (!extractedPositions.has(posKey)) {
						extractedPositions.add(posKey);
						urls.push({
							value: urlValue,
							protocol: detectUrlProtocol(urlValue),
							position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
							context: line.trim(),
						});
					}
				}
			}

			// Extract tel URLs
			TEL_PATTERN.lastIndex = 0;
			while ((match = TEL_PATTERN.exec(line)) !== null) {
				const urlValue = match[0];
				if (!isInComment(line, match.index ?? 0)) {
					const posKey = `${urlValue}`;
					if (!extractedPositions.has(posKey)) {
						extractedPositions.add(posKey);
						urls.push({
							value: urlValue,
							protocol: detectUrlProtocol(urlValue),
							position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
							context: line.trim(),
						});
					}
				}
			}

			// Extract file URLs
			FILE_PATTERN.lastIndex = 0;
			while ((match = FILE_PATTERN.exec(line)) !== null) {
				const urlValue = match[0];
				if (!isInComment(line, match.index ?? 0)) {
					const posKey = `${urlValue}`;
					if (!extractedPositions.has(posKey)) {
						extractedPositions.add(posKey);
						urls.push({
							value: urlValue,
							protocol: detectUrlProtocol(urlValue),
							position: { line: lineIndex + 1, column: (match.index ?? 0) + 1 },
							context: line.trim(),
						});
					}
				}
			}
		} catch (error) {
			// Skip lines that cause regex errors to prevent crashes
			console.warn(`[URLs-LE] Regex error on line ${lineIndex + 1}:`, error);
		}
	});

	return urls;
}
