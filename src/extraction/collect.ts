import type { Url, UrlProtocol } from '../types';

/**
 * Recursively collect URL-like values from any object structure
 * Used by format-specific extractors to traverse parsed data
 */
export function collectUrls(obj: unknown, context: string = 'root'): Url[] {
	const urls: Url[] = [];

	if (typeof obj === 'string') {
		if (isUrlLike(obj)) {
			urls.push({
				value: obj,
				protocol: classifyUrlProtocol(obj),
				type: classifyUrlType(obj),
				position: {
					line: 1,
					column: 1,
				},
				context,
			});
		}
	} else if (Array.isArray(obj)) {
		for (let i = 0; i < obj.length; i++) {
			const item = obj[i];
			if (item !== null && item !== undefined) {
				urls.push(...collectUrls(item, `${context}[${i}]`));
			}
		}
	} else if (obj && typeof obj === 'object') {
		for (const [key, value] of Object.entries(obj)) {
			if (value !== null && value !== undefined) {
				urls.push(...collectUrls(value, `${context}.${key}`));
			}
		}
	}

	return urls;
}

/**
 * Check if a string looks like a URL
 */
function isUrlLike(str: string): boolean {
	if (typeof str !== 'string' || str.length === 0) {
		return false;
	}

	// Trim whitespace
	const trimmed = str.trim();
	if (trimmed.length === 0) {
		return false;
	}

	// Check for common URL patterns
	const urlPatterns = [
		// Protocol-based URLs
		/^https?:\/\//i,
		/^ftp:\/\//i,
		/^ftps:\/\//i,
		/^file:\/\//i,
		/^mailto:/i,
		/^tel:/i,
		/^data:/i,
		// Relative URLs
		/^\/[^/]/,
		/^\.\.?\//,
		// Domain-like patterns (must have at least one dot)
		/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}/,
	];

	return urlPatterns.some((pattern) => pattern.test(trimmed));
}

/**
 * Classify the protocol of URL
 */
function classifyUrlProtocol(url: string): UrlProtocol {
	const trimmed = url.trim().toLowerCase();

	if (trimmed.startsWith('https://')) return 'https';
	if (trimmed.startsWith('http://')) return 'http';
	if (trimmed.startsWith('ftp://')) return 'ftp';
	if (trimmed.startsWith('file://')) return 'file';
	if (trimmed.startsWith('mailto:')) return 'mailto';
	if (trimmed.startsWith('tel:')) return 'tel';

	return 'unknown';
}

/**
 * Classify the type of URL
 */
function classifyUrlType(url: string): string {
	const trimmed = url.trim().toLowerCase();

	if (trimmed.startsWith('https://')) return 'https';
	if (trimmed.startsWith('http://')) return 'http';
	if (trimmed.startsWith('ftp://')) return 'ftp';
	if (trimmed.startsWith('ftps://')) return 'ftps';
	if (trimmed.startsWith('file://')) return 'file';
	if (trimmed.startsWith('mailto:')) return 'mailto';
	if (trimmed.startsWith('tel:')) return 'tel';
	if (trimmed.startsWith('data:')) return 'data';
	if (trimmed.startsWith('/')) return 'absolute-path';
	if (trimmed.startsWith('./') || trimmed.startsWith('../'))
		return 'relative-path';

	// Check if it looks like a domain
	if (/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}/.test(trimmed)) {
		return 'domain';
	}

	return 'unknown';
}

/**
 * Extract URLs from a flat array of strings
 */
export function collectUrlsFromArray(
	items: readonly string[],
	context: string = 'array',
): Url[] {
	const urls: Url[] = [];

	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (typeof item === 'string' && isUrlLike(item)) {
			urls.push({
				value: item.trim(),
				protocol: classifyUrlProtocol(item),
				type: classifyUrlType(item),
				position: {
					line: i + 1,
					column: 1,
				},
				context: `${context}[${i}]`,
			});
		}
	}

	return urls;
}

/**
 * Extract URLs from key-value pairs
 */
export function collectUrlsFromKeyValue(
	obj: Record<string, unknown>,
	context: string = 'object',
): Url[] {
	const urls: Url[] = [];

	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === 'string' && isUrlLike(value)) {
			urls.push({
				value: value.trim(),
				protocol: classifyUrlProtocol(value),
				type: classifyUrlType(value),
				position: {
					line: 1,
					column: 1,
				},
				context: `${context}.${key}`,
			});
		} else if (Array.isArray(value)) {
			urls.push(
				...collectUrlsFromArray(
					value.filter((item) => typeof item === 'string'),
					`${context}.${key}`,
				),
			);
		} else if (value && typeof value === 'object') {
			urls.push(...collectUrls(value, `${context}.${key}`));
		}
	}

	return urls;
}

/**
 * Filter URLs by type
 */
export function filterUrlsByType(
	urls: readonly Url[],
	types: readonly string[],
): Url[] {
	return urls.filter((url) => url.type && types.includes(url.type));
}

/**
 * Group URLs by type
 */
export function groupUrlsByType(urls: readonly Url[]): Record<string, Url[]> {
	const groups: Record<string, Url[]> = {};

	for (const url of urls) {
		const type = url.type || 'unknown';
		if (!groups[type]) {
			groups[type] = [];
		}
		groups[type].push(url);
	}

	return groups;
}

/**
 * Group URLs by domain (for HTTP/HTTPS URLs)
 */
export function groupUrlsByDomain(urls: readonly Url[]): Record<string, Url[]> {
	const groups: Record<string, Url[]> = {};

	for (const url of urls) {
		if (url.type === 'http' || url.type === 'https') {
			try {
				const urlObj = new URL(url.value);
				const domain = urlObj.hostname;

				if (!groups[domain]) {
					groups[domain] = [];
				}
				groups[domain].push(url);
			} catch {
				// Invalid URL, group under 'invalid'
				if (!groups.invalid) {
					groups.invalid = [];
				}
				groups.invalid.push(url);
			}
		} else {
			// Non-HTTP URLs grouped by type
			const type = url.type || 'unknown';
			if (!groups[type]) {
				groups[type] = [];
			}
			groups[type].push(url);
		}
	}

	return groups;
}

/**
 * Deduplicate URLs while preserving first occurrence
 */
export function deduplicateUrls(urls: readonly Url[]): Url[] {
	const seen = new Set<string>();
	const result: Url[] = [];

	for (const url of urls) {
		const normalizedValue = url.value.trim().toLowerCase();
		if (!seen.has(normalizedValue)) {
			seen.add(normalizedValue);
			result.push(url);
		}
	}

	return result;
}

/**
 * Sort URLs by various criteria
 */
export function sortUrls(
	urls: readonly Url[],
	sortBy: 'value' | 'type' | 'domain' | 'length',
): Url[] {
	const sorted = [...urls];

	switch (sortBy) {
		case 'value':
			return sorted.sort((a, b) => a.value.localeCompare(b.value));

		case 'type':
			return sorted.sort((a, b) => {
				const typeA = a.type || 'unknown';
				const typeB = b.type || 'unknown';
				const typeCompare = typeA.localeCompare(typeB);
				return typeCompare !== 0 ? typeCompare : a.value.localeCompare(b.value);
			});

		case 'domain':
			return sorted.sort((a, b) => {
				const getDomain = (url: Url): string => {
					if (url.type === 'http' || url.type === 'https') {
						try {
							return new URL(url.value).hostname;
						} catch {
							return url.value;
						}
					}
					return url.value;
				};

				const domainA = getDomain(a);
				const domainB = getDomain(b);
				const domainCompare = domainA.localeCompare(domainB);
				return domainCompare !== 0
					? domainCompare
					: a.value.localeCompare(b.value);
			});

		case 'length':
			return sorted.sort((a, b) => {
				const lengthCompare = a.value.length - b.value.length;
				return lengthCompare !== 0
					? lengthCompare
					: a.value.localeCompare(b.value);
			});

		default:
			return sorted;
	}
}
