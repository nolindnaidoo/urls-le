import * as nls from 'vscode-nls';
import type { Configuration } from '../types';
import { createEnhancedError } from './errorHandling';

const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
	readonly valid: boolean;
	readonly errors: readonly string[];
	readonly warnings: readonly string[];
	readonly sanitizedConfig: Configuration;
}

/**
 * Validate configuration values and return sanitized version
 */
export function validateConfiguration(
	config: Configuration,
): ConfigValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Validate numeric values
	if (config.safetyFileSizeWarnBytes < 1000) {
		warnings.push('File size warning threshold is very low (< 1KB)');
	}

	if (config.safetyFileSizeWarnBytes > 100000000) {
		warnings.push('File size warning threshold is very high (> 100MB)');
	}

	if (config.safetyLargeOutputLinesThreshold < 100) {
		warnings.push('Large output threshold is very low (< 100 lines)');
	}

	if (config.safetyManyDocumentsThreshold < 1) {
		errors.push('Many documents threshold must be at least 1');
	}

	// Validate notification level
	const validNotificationLevels = ['all', 'important', 'silent'] as const;
	if (!validNotificationLevels.includes(config.notificationsLevel)) {
		errors.push(`Invalid notification level: ${config.notificationsLevel}`);
	}

	return Object.freeze({
		valid: errors.length === 0,
		errors: Object.freeze(errors),
		warnings: Object.freeze(warnings),
		sanitizedConfig: config, // Return original config since we can't modify readonly properties
	});
}

/**
 * Create configuration error
 */
export function createConfigurationError(
	message: string,
	originalError?: Error,
): ReturnType<typeof createEnhancedError> {
	const error = originalError || new Error(message);
	return createEnhancedError(
		error,
		'configuration',
		localize(
			'runtime.config.validation-failed',
			'Configuration validation failed',
		),
	);
}

/**
 * Apply configuration defaults for missing values
 */
export function applyConfigurationDefaults(
	config: Partial<Configuration>,
): Configuration {
	return Object.freeze({
		copyToClipboardEnabled: config.copyToClipboardEnabled ?? false,
		dedupeEnabled: config.dedupeEnabled ?? false,
		notificationsLevel: config.notificationsLevel ?? 'silent',
		postProcessOpenInNewFile: config.postProcessOpenInNewFile ?? false,
		openResultsSideBySide: config.openResultsSideBySide ?? false,
		safetyEnabled: config.safetyEnabled ?? true,
		safetyFileSizeWarnBytes: config.safetyFileSizeWarnBytes ?? 1000000,
		safetyLargeOutputLinesThreshold:
			config.safetyLargeOutputLinesThreshold ?? 50000,
		safetyManyDocumentsThreshold: config.safetyManyDocumentsThreshold ?? 8,
		showParseErrors: config.showParseErrors ?? false,
		statusBarEnabled: config.statusBarEnabled ?? true,
		telemetryEnabled: config.telemetryEnabled ?? false,
	});
}
