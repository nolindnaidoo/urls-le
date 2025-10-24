import * as nls from 'vscode-nls';
import type { UrlProtocol, ValidationResult } from '../types';

const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

export function isValidUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		// Check protocol and ensure URL has required components
		if (
			!['http:', 'https:', 'ftp:', 'file:', 'mailto:', 'tel:'].includes(
				parsed.protocol,
			)
		) {
			return false;
		}

		// Additional validation for different protocols
		if (parsed.protocol === 'mailto:') {
			return parsed.pathname.includes('@') && parsed.pathname.length > 1;
		}
		if (parsed.protocol === 'tel:') {
			return parsed.pathname.length > 1;
		}
		if (['http:', 'https:', 'ftp:'].includes(parsed.protocol)) {
			return parsed.hostname.length > 0;
		}
		if (parsed.protocol === 'file:') {
			return parsed.pathname.length > 1; // Need more than just "/"
		}

		return true;
	} catch {
		return false;
	}
}

export function detectUrlProtocol(url: string): UrlProtocol {
	try {
		const parsed = new URL(url);
		switch (parsed.protocol) {
			case 'http:':
				return 'http';
			case 'https:':
				return 'https';
			case 'ftp:':
				return 'ftp';
			case 'file:':
				return 'file';
			case 'mailto:':
				return 'mailto';
			case 'tel:':
				return 'tel';
			default:
				return 'unknown';
		}
	} catch {
		return 'unknown';
	}
}

export function extractUrlComponents(url: string): {
	protocol: UrlProtocol;
	domain?: string;
	path?: string;
} | null {
	try {
		const parsed = new URL(url);
		return {
			protocol: detectUrlProtocol(url),
			domain: parsed.hostname,
			path: parsed.pathname + parsed.search + parsed.hash,
		};
	} catch {
		return null;
	}
}

export async function validateUrl(
	url: string,
	_config: { timeout: number; followRedirects: boolean },
): Promise<ValidationResult> {
	try {
		// For now, we'll do basic validation without actual HTTP requests
		// In a real implementation, you'd use fetch or similar with timeout

		if (!isValidUrl(url)) {
			return {
				url,
				status: 'invalid',
				error: localize(
					'runtime.validation.invalid-format',
					'Invalid URL format',
				),
			};
		}

		const _parsed = new URL(url);

		// Check for suspicious patterns
		if (isSuspiciousUrl(url)) {
			return {
				url,
				status: 'error',
				error: localize(
					'runtime.validation.suspicious-url',
					'Suspicious URL detected',
				),
			};
		}

		// Simulate validation result - return valid for all valid URLs
		return {
			url,
			status: 'valid',
			statusCode: 200,
		};
	} catch (error) {
		return {
			url,
			status: 'error',
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

export function isSuspiciousUrl(url: string): boolean {
	const suspiciousPatterns = [
		/bit\.ly/i,
		/tinyurl/i,
		/short\.link/i,
		/t\.co/i,
		/goo\.gl/i,
		/ow\.ly/i,
		/is\.gd/i,
		/v\.gd/i,
		/cli\.gs/i,
		/tr\.im/i,
		/adf\.ly/i,
		/sh\.st/i,
		/bc\.vc/i,
		/u\.to/i,
		/j\.mp/i,
		/bit\.do/i,
		/rebrand\.ly/i,
		/short\.ly/i,
		/link\.to/i,
		/url\.short/i,
	];

	return suspiciousPatterns.some((pattern) => pattern.test(url));
}

export function isSecureUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

export function getDomainFromUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		// Only return hostname for protocols that have domains
		if (['http:', 'https:', 'ftp:'].includes(parsed.protocol)) {
			return parsed.hostname || null;
		}
		return null;
	} catch {
		return null;
	}
}

export function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		// Remove trailing slash and normalize
		return parsed.toString().replace(/\/$/, '');
	} catch {
		return url;
	}
}

export function isExpiredDomain(domain: string): boolean {
	// This would typically involve DNS lookups
	// For now, we'll use a simple heuristic
	const expiredPatterns = [
		/expired/i,
		/domain.*expired/i,
		/parked/i,
		/for.*sale/i,
		/buy.*domain/i,
	];

	return expiredPatterns.some((pattern) => pattern.test(domain));
}

export function isAccessibleUrl(url: string): boolean {
	// Basic accessibility checks
	const accessibilityIssues = [
		/javascript:/i,
		/data:/i,
		/blob:/i,
		/about:/i,
		/chrome:/i,
		/edge:/i,
		/moz-extension:/i,
		/chrome-extension:/i,
	];

	return !accessibilityIssues.some((pattern) => pattern.test(url));
}
