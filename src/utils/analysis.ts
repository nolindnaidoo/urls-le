import * as nls from 'vscode-nls';
import type {
	AnalysisResult,
	Configuration,
	DomainAnalysis,
	SecurityAnalysis,
	UrlProtocol,
} from '../types';
import {
	detectUrlProtocol,
	getDomainFromUrl,
	isAccessibleUrl,
	isExpiredDomain,
	isSecureUrl,
	isSuspiciousUrl,
} from './urlValidation';

const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

export function analyzeUrls(
	lines: string[],
	_config: Configuration,
): AnalysisResult {
	const urls = lines.filter((line) => line.trim().length > 0);
	const uniqueUrls = new Set(urls);

	const protocols: Record<UrlProtocol, number> = {
		http: 0,
		https: 0,
		ftp: 0,
		file: 0,
		mailto: 0,
		tel: 0,
		unknown: 0,
	};

	urls.forEach((url) => {
		try {
			const protocol = detectUrlProtocol(url);
			protocols[protocol]++;
		} catch (_error) {
			// Handle protocol detection errors gracefully
			protocols.unknown++;
		}
	});

	const result: AnalysisResult = {
		count: urls.length,
		protocols,
		unique: uniqueUrls.size,
		duplicates: urls.length - uniqueUrls.size,
		security: undefined,
		accessibility: undefined,
		domains: undefined,
	};

	// Always include security and accessibility analysis
	result.security = analyzeSecurity(urls) as SecurityAnalysis;
	result.accessibility = analyzeAccessibility(urls);
	result.domains = analyzeDomains(urls);

	return result;
}

function analyzeSecurity(urls: string[]): SecurityAnalysis {
	const secure = urls.filter((url) => isSecureUrl(url)).length;
	const insecure = urls.filter((url) => url.startsWith('http://')).length;
	const suspicious = urls.filter((url) => isSuspiciousUrl(url)).length;

	const issues: Array<{
		url: string;
		issue: string;
		severity: 'warning' | 'error';
	}> = [];

	urls.forEach((url) => {
		try {
			if (isSuspiciousUrl(url)) {
				issues.push({
					url,
					issue: localize(
						'runtime.analysis.suspicious-url',
						'Suspicious URL detected',
					),
					severity: 'warning',
				});
			}
			if (url.startsWith('http://')) {
				issues.push({
					url,
					issue: localize(
						'runtime.analysis.insecure-http',
						'Insecure HTTP protocol',
					),
					severity: 'warning',
				});
			}
		} catch (_error) {
			// Handle security analysis errors gracefully
			issues.push({
				url,
				issue: localize(
					'runtime.analysis.security-failed',
					'Security analysis failed',
				),
				severity: 'warning',
			});
		}
	});

	return {
		secure,
		insecure,
		suspicious,
		issues,
	};
}

function analyzeAccessibility(urls: string[]) {
	const accessible = urls.filter((url) => isAccessibleUrl(url)).length;
	const inaccessible = urls.length - accessible;

	const issues: Array<{
		url: string;
		issue: string;
		severity: 'warning' | 'error';
	}> = [];

	urls.forEach((url) => {
		try {
			if (!isAccessibleUrl(url)) {
				issues.push({
					url,
					issue: localize(
						'runtime.analysis.url-not-accessible',
						'URL may not be accessible',
					),
					severity: 'warning',
				});
			}
		} catch (_error) {
			// Handle accessibility analysis errors gracefully
			issues.push({
				url,
				issue: localize(
					'runtime.analysis.accessibility-failed',
					'Accessibility analysis failed',
				),
				severity: 'warning',
			});
		}
	});

	return {
		accessible,
		inaccessible,
		issues,
	};
}

function analyzeDomains(urls: string[]): DomainAnalysis {
	const domainCounts: Record<string, number> = {};
	const domains: string[] = [];

	urls.forEach((url) => {
		try {
			const domain = getDomainFromUrl(url);
			if (domain) {
				domainCounts[domain] = (domainCounts[domain] || 0) + 1;
				domains.push(domain);
			}
		} catch (error) {
			// Handle domain extraction errors gracefully
			console.warn(`[URLs-LE] Domain extraction failed for URL: ${url}`, error);
		}
	});

	const uniqueDomains = new Set(domains).size;
	const commonDomains = Object.entries(domainCounts)
		.map(([domain, count]) => ({
			domain,
			count,
			percentage: (count / urls.length) * 100,
		}))
		.sort((a, b) => b.count - a.count)
		.slice(0, 10);

	const expiredDomains = domains.filter((domain) => isExpiredDomain(domain));
	const suspiciousDomains = domains.filter((domain) =>
		isSuspiciousUrl(`https://${domain}`),
	);

	return {
		uniqueDomains,
		commonDomains,
		expiredDomains,
		suspiciousDomains,
	};
}
