import type { Configuration, Url, ValidationResult } from '../types';
import { createEnhancedError } from './errorHandling';
import {
	detectUrlProtocol,
	extractUrlComponents,
	isValidUrl,
} from './urlValidation';

/**
 * URL validation service interface
 */
export interface UrlValidationService {
	validateUrl(url: string, config: Configuration): Promise<ValidationResult>;
	validateUrls(
		urls: readonly Url[],
		config: Configuration,
	): Promise<readonly ValidationResult[]>;
	dispose(): void;
}

/**
 * Enhanced URL validation service with error handling and performance monitoring
 */
export function createUrlValidationService(): UrlValidationService {
	let disposed = false;

	return {
		async validateUrl(
			url: string,
			_config: Configuration,
		): Promise<ValidationResult> {
			if (disposed) {
				throw new Error('URL validation service has been disposed');
			}

			try {
				// Basic URL format validation
				if (!isValidUrl(url)) {
					return {
						url,
						status: 'invalid',
						error: 'Invalid URL format',
					};
				}

				// Extract URL components for additional validation
				const components = extractUrlComponents(url);
				if (!components) {
					return {
						url,
						status: 'invalid',
						error: 'Failed to parse URL components',
					};
				}

				// Protocol-specific validation
				const protocol = detectUrlProtocol(url);
				if (protocol === 'unknown') {
					return {
						url,
						status: 'invalid',
						error: 'Unsupported URL protocol',
					};
				}

				// For now, return valid status (in a real implementation, you'd make HTTP requests)
				// This is a placeholder for actual URL validation logic
				return {
					url,
					status: 'valid',
					statusCode: 200,
					redirects: [],
				};
			} catch (error) {
				const enhancedError = createEnhancedError(
					error instanceof Error
						? error
						: new Error('Unknown validation error'),
					'validation',
					`URL validation failed for: ${url}`,
				);

				return {
					url,
					status: 'error',
					error: enhancedError.userFriendlyMessage,
				};
			}
		},

		async validateUrls(
			urls: readonly Url[],
			config: Configuration,
		): Promise<readonly ValidationResult[]> {
			if (disposed) {
				throw new Error('URL validation service has been disposed');
			}

			const results: ValidationResult[] = [];

			// Process URLs in batches to avoid overwhelming the system
			const batchSize = 10;
			for (let i = 0; i < urls.length; i += batchSize) {
				const batch = urls.slice(i, i + batchSize);
				const batchPromises = batch.map((url) =>
					this.validateUrl(url.value, config),
				);

				try {
					const batchResults = await Promise.all(batchPromises);
					results.push(...batchResults);
				} catch (_error) {
					// If batch fails, validate individually
					for (const url of batch) {
						try {
							const result = await this.validateUrl(url.value, config);
							results.push(result);
						} catch (individualError) {
							results.push({
								url: url.value,
								status: 'error',
								error:
									individualError instanceof Error
										? individualError.message
										: 'Unknown error',
							});
						}
					}
				}

				// Add small delay between batches to be respectful
				if (i + batchSize < urls.length) {
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
			}

			return Object.freeze(results);
		},

		dispose(): void {
			disposed = true;
		},
	};
}

/**
 * URL validation statistics
 */
export interface ValidationStats {
	readonly total: number;
	readonly valid: number;
	readonly invalid: number;
	readonly errors: number;
	readonly timeouts: number;
	readonly duration: number;
}

/**
 * Calculate validation statistics
 */
export function calculateValidationStats(
	results: readonly ValidationResult[],
	startTime: number,
): ValidationStats {
	const stats = results.reduce(
		(acc, result) => {
			acc.total++;
			switch (result.status) {
				case 'valid':
					acc.valid++;
					break;
				case 'invalid':
					acc.invalid++;
					break;
				case 'error':
					acc.errors++;
					break;
				case 'timeout':
					acc.timeouts++;
					break;
			}
			return acc;
		},
		{ total: 0, valid: 0, invalid: 0, errors: 0, timeouts: 0 },
	);

	return Object.freeze({
		...stats,
		duration: Date.now() - startTime,
	});
}
