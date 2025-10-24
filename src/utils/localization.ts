import * as nls from 'vscode-nls';

const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

export interface Localizer {
	localize(key: string, ...args: unknown[]): string;
	localizeCommand(command: string): string;
	localizeError(error: string, ...args: unknown[]): string;
	localizeWarning(warning: string, ...args: unknown[]): string;
	localizeInfo(info: string, ...args: unknown[]): string;
	localizeProgress(progress: string, ...args: unknown[]): string;
	localizeStatus(status: string): string;
	localizeRecovery(recovery: string): string;
	localizePerformance(performance: string, ...args: unknown[]): string;
	localizeSafety(safety: string, ...args: unknown[]): string;
	localizeConfirmation(confirmation: string): string;
}

export function createLocalizer(): Localizer {
	const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

	return Object.freeze({
		localize(key: string, ..._args: unknown[]): string {
			return localize(key, key);
		},

		localizeCommand(command: string): string {
			return localize(`runtime.command.${command}`, command);
		},

		localizeError(error: string, ..._args: unknown[]): string {
			return localize(`runtime.error.${error}`, error);
		},

		localizeWarning(warning: string, ..._args: unknown[]): string {
			return localize(`runtime.warning.${warning}`, warning);
		},

		localizeInfo(info: string, ..._args: unknown[]): string {
			return localize(`runtime.info.${info}`, info);
		},

		localizeProgress(progress: string, ..._args: unknown[]): string {
			return localize(`runtime.progress.${progress}`, progress);
		},

		localizeStatus(status: string): string {
			return localize(`runtime.status.${status}`, status);
		},

		localizeRecovery(recovery: string): string {
			return localize(`runtime.recovery.${recovery}`, recovery);
		},

		localizePerformance(performance: string, ..._args: unknown[]): string {
			return localize(`runtime.performance.${performance}`, performance);
		},

		localizeSafety(safety: string, ..._args: unknown[]): string {
			return localize(`runtime.safety.${safety}`, safety);
		},

		localizeConfirmation(confirmation: string): string {
			return localize(`runtime.confirmation.${confirmation}`, confirmation);
		},
	});
}

export const messages = Object.freeze({
	// Command messages
	extractUrls: 'extract-urls',
	validateUrls: 'validate-urls',
	checkAccessibility: 'check-accessibility',
	analyzeUrls: 'analyze-urls',
	openSettings: 'open-settings',
	help: 'help',

	// Error messages
	extractionFailed: 'extraction-failed',
	validationFailed: 'validation-failed',
	analysisFailed: 'analysis-failed',
	fileAccess: 'file-access',
	configuration: 'configuration',
	performance: 'performance',
	unknown: 'unknown',

	// Warning messages
	parseError: 'parse-error',
	validationError: 'validation-error',
	performanceWarning: 'performance-warning',

	// Info messages
	extractionComplete: 'extraction-complete',
	validationComplete: 'validation-complete',
	analysisComplete: 'analysis-complete',

	// Progress messages
	extracting: 'extracting',
	validating: 'validating',
	analyzing: 'analyzing',
	processing: 'processing',

	// Status messages
	ready: 'ready',
	extractingStatus: 'extracting',
	validatingStatus: 'validating',
	analyzingStatus: 'analyzing',
	error: 'error',

	// Recovery messages
	retry: 'retry',
	fallback: 'fallback',
	skip: 'skip',
	userAction: 'user-action',
	abort: 'abort',

	// Performance messages
	duration: 'duration',
	memory: 'memory',
	throughput: 'throughput',
	thresholdExceeded: 'threshold-exceeded',

	// Safety messages
	fileTooLarge: 'file-too-large',
	tooManyUrls: 'too-many-urls',
	processingTimeout: 'processing-timeout',
	memoryLimit: 'memory-limit',

	// Confirmation messages
	proceed: 'proceed',
	cancel: 'cancel',
	continueAction: 'continue',
	abortAction: 'abort',
});

export function formatMessage(template: string, ...args: unknown[]): string {
	if (args.length === 0) {
		return template;
	}

	return template.replace(/\{(\d+)\}/g, (match, index) => {
		const argIndex = parseInt(index, 10);
		const arg = args[argIndex];
		return arg !== undefined ? String(arg) : match;
	});
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

export function formatDuration(milliseconds: number): string {
	if (milliseconds < 1000) {
		return `${milliseconds}ms`;
	}

	const seconds = Math.floor(milliseconds / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
	} else if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`;
	} else {
		return `${seconds}s`;
	}
}

export function formatThroughput(throughput: number): string {
	if (throughput < 1) {
		return `${(throughput * 1000).toFixed(0)} URLs/min`;
	} else if (throughput < 60) {
		return `${throughput.toFixed(2)} URLs/sec`;
	} else {
		return `${(throughput * 60).toFixed(0)} URLs/min`;
	}
}

export function formatCount(
	count: number,
	singular: string,
	plural: string,
): string {
	return count === 1 ? `${count} ${singular}` : `${count} ${plural}`;
}

export function formatPercentage(value: number, total: number): string {
	if (total === 0) return '0%';
	return `${((value / total) * 100).toFixed(1)}%`;
}

export function formatRatio(numerator: number, denominator: number): string {
	if (denominator === 0) return '0:0';
	return `${numerator}:${denominator}`;
}

export function formatList(
	items: string[],
	conjunction: string = 'and',
): string {
	if (items.length === 0) return '';
	if (items.length === 1) return items[0] || '';
	if (items.length === 2)
		return `${items[0] || ''} ${conjunction} ${items[1] || ''}`;

	const lastItem = items[items.length - 1] || '';
	const otherItems = items.slice(0, -1);
	return `${otherItems.join(', ')}, ${conjunction} ${lastItem}`;
}

export function formatOrdinal(number: number): string {
	const suffixes = ['th', 'st', 'nd', 'rd'];
	const value = number % 100;
	const suffix = suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0];
	return `${number}${suffix}`;
}

export function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	if (diff < 1000) return 'just now';
	if (diff < 60000) return `${Math.floor(diff / 1000)} seconds ago`;
	if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
	if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;

	return new Date(timestamp).toLocaleDateString();
}

export function formatFileSize(bytes: number): string {
	return formatBytes(bytes);
}

export function formatUrlCount(count: number): string {
	return formatCount(count, 'URL', 'URLs');
}

export function formatErrorCount(count: number): string {
	return formatCount(count, 'error', 'errors');
}

export function formatWarningCount(count: number): string {
	return formatCount(count, 'warning', 'warnings');
}

export function formatSuccessRate(successful: number, total: number): string {
	if (total === 0) return '0%';
	return formatPercentage(successful, total);
}

export function formatSecurityStatus(secure: number, total: number): string {
	if (total === 0) return 'No URLs';
	const percentage = formatPercentage(secure, total);
	return `${secure}/${total} (${percentage}) secure`;
}

export function formatAccessibilityStatus(
	accessible: number,
	total: number,
): string {
	if (total === 0) return 'No URLs';
	const percentage = formatPercentage(accessible, total);
	return `${accessible}/${total} (${percentage}) accessible`;
}

export function formatDomainDistribution(
	domains: Array<{ domain: string; count: number }>,
): string {
	if (domains.length === 0) return 'No domains';

	const total = domains.reduce((sum, d) => sum + d.count, 0);
	const topDomains = domains
		.slice(0, 3)
		.map((d) => `${d.domain} (${formatPercentage(d.count, total)})`);

	if (domains.length <= 3) {
		return formatList(topDomains);
	}

	return `${formatList(topDomains)}, and ${domains.length - 3} more`;
}

export function formatProtocolDistribution(
	protocols: Record<string, number>,
): string {
	const entries = Object.entries(protocols).filter(([, count]) => count > 0);
	if (entries.length === 0)
		return localize('runtime.protocols.none', 'No protocols');

	const total = entries.reduce((sum, [, count]) => sum + count, 0);
	const formatted = entries.map(
		([protocol, count]) =>
			`${protocol.toUpperCase()} (${formatPercentage(count, total)})`,
	);

	return formatList(formatted);
}

export function formatTimeEstimate(remaining: number): string {
	if (remaining < 60000)
		return `${Math.ceil(remaining / 1000)} seconds remaining`;
	if (remaining < 3600000)
		return `${Math.ceil(remaining / 60000)} minutes remaining`;
	return `${Math.ceil(remaining / 3600000)} hours remaining`;
}

export function formatProgress(current: number, total: number): string {
	if (total === 0) return '0%';
	const percentage = Math.round((current / total) * 100);
	return `${current}/${total} (${percentage}%)`;
}

export function formatElapsedTime(startTime: number): string {
	const elapsed = Date.now() - startTime;
	return formatDuration(elapsed);
}

export function formatRemainingTime(
	startTime: number,
	total: number,
	processed: number,
): string {
	if (processed === 0) return 'Calculating...';

	const elapsed = Date.now() - startTime;
	const rate = processed / elapsed;
	const remaining = (total - processed) / rate;

	return formatTimeEstimate(remaining);
}

export function formatMemoryUsage(): string {
	const usage = process.memoryUsage();
	return `Heap: ${formatBytes(usage.heapUsed)}/${formatBytes(usage.heapTotal)}, RSS: ${formatBytes(
		usage.rss,
	)}`;
}

export function formatCpuUsage(): string {
	const usage = process.cpuUsage();
	const total = usage.user + usage.system;
	return `User: ${formatDuration(usage.user)}, System: ${formatDuration(
		usage.system,
	)}, Total: ${formatDuration(total)}`;
}

export function formatSystemInfo(): string {
	return `Node.js: ${process.version}, Platform: ${process.platform}, Arch: ${process.arch}`;
}

export function formatExtensionInfo(version: string, name: string): string {
	return `${name} v${version}`;
}

export function formatWorkspaceInfo(workspaceCount: number): string {
	return formatCount(workspaceCount, 'workspace', 'workspaces');
}

export function formatFileInfo(fileCount: number, totalSize: number): string {
	const files = formatCount(fileCount, 'file', 'files');
	const size = formatBytes(totalSize);
	return `${files}, ${size}`;
}

export function formatOperationInfo(operation: string, count: number): string {
	return `${operation}: ${formatCount(count, 'item', 'items')}`;
}

export function formatResultSummary(
	successful: number,
	failed: number,
	total: number,
): string {
	if (total === 0) return 'No results';

	const successRate = formatSuccessRate(successful, total);
	const failureRate = formatSuccessRate(failed, total);

	return `${successful} successful (${successRate}), ${failed} failed (${failureRate}), ${total} total`;
}

export function formatQualityScore(
	score: number,
	maxScore: number = 100,
): string {
	const percentage = formatPercentage(score, maxScore);
	const grade =
		score >= 90
			? 'A'
			: score >= 80
				? 'B'
				: score >= 70
					? 'C'
					: score >= 60
						? 'D'
						: 'F';
	return `${score}/${maxScore} (${percentage}, Grade: ${grade})`;
}

export function formatComplianceStatus(
	compliant: number,
	total: number,
	standard: string,
): string {
	if (total === 0) return `No ${standard} compliance data`;

	const percentage = formatPercentage(compliant, total);
	const status =
		compliant === total
			? localize('runtime.compliance.fully', 'Fully compliant')
			: compliant > total * 0.8
				? localize('runtime.compliance.mostly', 'Mostly compliant')
				: compliant > total * 0.5
					? localize('runtime.compliance.partially', 'Partially compliant')
					: localize('runtime.compliance.non', 'Non-compliant');

	return `${standard}: ${compliant}/${total} (${percentage}) - ${status}`;
}

export function formatUrlAnalysis(analysis: {
	totalUrls: number;
	uniqueUrls: number;
	protocols: Record<string, number>;
	domains: Record<string, number>;
	securityIssues: number;
	accessibilityIssues: number;
}): string {
	const lines = [
		`Total URLs: ${analysis.totalUrls}`,
		`Unique URLs: ${analysis.uniqueUrls}`,
		`Protocols: ${formatProtocolDistribution(analysis.protocols)}`,
		`Top domains: ${Object.keys(analysis.domains).slice(0, 3).join(', ')}`,
	];

	if (analysis.securityIssues > 0) {
		lines.push(`Security issues: ${analysis.securityIssues}`);
	}

	if (analysis.accessibilityIssues > 0) {
		lines.push(`Accessibility issues: ${analysis.accessibilityIssues}`);
	}

	return lines.join('\n');
}

export function formatUrlStatistics(stats: {
	total: number;
	unique: number;
	duplicates: number;
	protocols: Record<string, number>;
	domains: Record<string, number>;
}): string {
	return [
		`Total: ${stats.total}`,
		`Unique: ${stats.unique}`,
		`Duplicates: ${stats.duplicates}`,
		`Protocols: ${formatProtocolDistribution(stats.protocols)}`,
		`Domains: ${Object.keys(stats.domains).length}`,
	].join(' | ');
}
