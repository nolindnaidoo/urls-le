import type { UrlProtocol, ValidationResult } from '../types';

const SUPPORTED_PROTOCOLS = [
	'http:',
	'https:',
	'ftp:',
	'file:',
	'mailto:',
	'tel:',
] as const;
const WEB_PROTOCOLS = ['http:', 'https:', 'ftp:'] as const;

export function isValidUrl(url: string): boolean {
	const parsed = parseUrl(url);
	if (!parsed) {
		return false;
	}

	// Fail fast: Check if protocol is supported
	if (!isSupportedProtocol(parsed.protocol)) {
		return false;
	}

	return validateByProtocol(parsed);
}

function parseUrl(url: string): URL | null {
	try {
		return new URL(url);
	} catch {
		return null;
	}
}

function isSupportedProtocol(protocol: string): boolean {
	return SUPPORTED_PROTOCOLS.includes(
		protocol as (typeof SUPPORTED_PROTOCOLS)[number],
	);
}

function validateByProtocol(parsed: URL): boolean {
	switch (parsed.protocol) {
		case 'mailto:':
			return isValidMailto(parsed.pathname);
		case 'tel:':
			return isValidTel(parsed.pathname);
		case 'http:':
		case 'https:':
		case 'ftp:':
			return isValidWebUrl(parsed.hostname);
		case 'file:':
			return isValidFileUrl(parsed.pathname);
		default:
			return false;
	}
}

function isValidMailto(pathname: string): boolean {
	return pathname.includes('@') && pathname.length > 1;
}

function isValidTel(pathname: string): boolean {
	return pathname.length > 1;
}

function isValidWebUrl(hostname: string): boolean {
	return hostname.length > 0;
}

function isValidFileUrl(pathname: string): boolean {
	return pathname.length > 1; // Need more than just "/"
}

export function detectUrlProtocol(url: string): UrlProtocol {
	const parsed = parseUrl(url);
	if (!parsed) {
		return 'unknown';
	}

	return mapProtocolToType(parsed.protocol);
}

function mapProtocolToType(protocol: string): UrlProtocol {
	switch (protocol) {
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
}

export function extractUrlComponents(url: string): {
	protocol: UrlProtocol;
	domain?: string;
	path?: string;
} | null {
	const parsed = parseUrl(url);
	if (!parsed) {
		return null;
	}

	return {
		protocol: detectUrlProtocol(url),
		domain: parsed.hostname,
		path: buildFullPath(parsed),
	};
}

function buildFullPath(parsed: URL): string {
	return parsed.pathname + parsed.search + parsed.hash;
}

export async function validateUrl(
	url: string,
	_config: { timeout: number; followRedirects: boolean },
): Promise<ValidationResult> {
	// Fail fast: Check basic format
	if (!isValidUrl(url)) {
		return createInvalidResult(url, 'Invalid URL format');
	}

	// Fail fast: Check for suspicious patterns
	if (isSuspiciousUrl(url)) {
		return createErrorResult(url, 'Suspicious URL detected');
	}

	// Return valid result (HTTP validation would go here in production)
	return createValidResult(url);
}

function createInvalidResult(url: string, error: string): ValidationResult {
	return { url, status: 'invalid', error };
}

function createErrorResult(url: string, error: string): ValidationResult {
	return { url, status: 'error', error };
}

function createValidResult(url: string): ValidationResult {
	return { url, status: 'valid', statusCode: 200 };
}

const SUSPICIOUS_URL_PATTERNS = [
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
] as const;

export function isSuspiciousUrl(url: string): boolean {
	return matchesAnyPattern(url, SUSPICIOUS_URL_PATTERNS);
}

function matchesAnyPattern(text: string, patterns: readonly RegExp[]): boolean {
	return patterns.some((pattern) => pattern.test(text));
}

export function isSecureUrl(url: string): boolean {
	const parsed = parseUrl(url);
	if (!parsed) {
		return false;
	}

	return parsed.protocol === 'https:';
}

export function getDomainFromUrl(url: string): string | null {
	const parsed = parseUrl(url);
	if (!parsed) {
		return null;
	}

	// Only return hostname for web protocols
	if (!isWebProtocol(parsed.protocol)) {
		return null;
	}

	return parsed.hostname || null;
}

function isWebProtocol(protocol: string): boolean {
	return WEB_PROTOCOLS.includes(protocol as (typeof WEB_PROTOCOLS)[number]);
}

export function normalizeUrl(url: string): string {
	const parsed = parseUrl(url);
	if (!parsed) {
		return url;
	}

	return removeTrailingSlash(parsed.toString());
}

function removeTrailingSlash(url: string): string {
	return url.replace(/\/$/, '');
}

const EXPIRED_DOMAIN_PATTERNS = [
	/expired/i,
	/domain.*expired/i,
	/parked/i,
	/for.*sale/i,
	/buy.*domain/i,
] as const;

export function isExpiredDomain(domain: string): boolean {
	return matchesAnyPattern(domain, EXPIRED_DOMAIN_PATTERNS);
}

const INACCESSIBLE_URL_PATTERNS = [
	/javascript:/i,
	/data:/i,
	/blob:/i,
	/about:/i,
	/chrome:/i,
	/edge:/i,
	/moz-extension:/i,
	/chrome-extension:/i,
] as const;

export function isAccessibleUrl(url: string): boolean {
	return !matchesAnyPattern(url, INACCESSIBLE_URL_PATTERNS);
}
