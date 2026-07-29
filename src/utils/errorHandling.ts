export type ErrorCategory =
	| 'parse'
	| 'validation'
	| 'safety'
	| 'operational'
	| 'file-system'
	| 'configuration';

export interface EnhancedError {
	readonly category: ErrorCategory;
	readonly originalError: Error;
	readonly message: string;
	readonly userFriendlyMessage: string;
	readonly suggestion: string;
	readonly recoverable: boolean;
	readonly timestamp: Date;
}

export interface ErrorRecoveryOptions {
	readonly retryable: boolean;
	readonly maxRetries: number;
	readonly retryDelay: number;
	readonly fallbackAction?: () => Promise<void>;
}

export interface ErrorHandler {
	handle(error: EnhancedError): void;
	dispose(): void;
}

export interface ErrorLogger {
	log(error: EnhancedError): void;
	dispose(): void;
}

export interface ErrorNotifier {
	notify(error: EnhancedError): void;
	dispose(): void;
}

export function categorizeError(error: Error): ErrorCategory {
	const message = error.message.toLowerCase();
	const name = error.name.toLowerCase();

	if (isParseError(name, message)) {
		return 'parse';
	}

	if (isValidationError(message)) {
		return 'validation';
	}

	if (isFileSystemError(message)) {
		return 'file-system';
	}

	if (isConfigurationError(message)) {
		return 'configuration';
	}

	if (isSafetyError(message)) {
		return 'safety';
	}

	return 'operational';
}

function isParseError(name: string, message: string): boolean {
	return (
		name.includes('syntax') ||
		message.includes('parse') ||
		message.includes('invalid json')
	);
}

function isValidationError(message: string): boolean {
	return (
		message.includes('validation') ||
		message.includes('invalid') ||
		message.includes('required')
	);
}

function isFileSystemError(message: string): boolean {
	return (
		message.includes('file') ||
		message.includes('enoent') ||
		message.includes('permission')
	);
}

function isConfigurationError(message: string): boolean {
	return message.includes('config') || message.includes('setting');
}

function isSafetyError(message: string): boolean {
	return (
		message.includes('size') ||
		message.includes('limit') ||
		message.includes('threshold')
	);
}

export function createErrorMessage(error: Error, context?: string): string {
	const category = categorizeError(error);
	return getUserFriendlyMessage(error, category, context);
}

export function formatErrorForUser(error: Error, includeStack = false): string {
	const enhanced = createEnhancedError(error, categorizeError(error));
	let formatted = `${enhanced.userFriendlyMessage}\n\nSuggestion: ${enhanced.suggestion}`;

	if (includeStack && error.stack) {
		formatted += `\n\nTechnical details:\n${error.stack}`;
	}

	return formatted;
}

export function isKnownError(error: Error): boolean {
	const knownPatterns = [
		/syntax.*error/i,
		/parse.*error/i,
		/validation.*failed/i,
		/file.*not.*found/i,
		/permission.*denied/i,
		/invalid.*configuration/i,
		/size.*limit.*exceeded/i,
	];

	return knownPatterns.some(
		(pattern) => pattern.test(error.message) || pattern.test(error.name),
	);
}

export function createEnhancedError(
	error: Error,
	category: ErrorCategory,
	context?: string,
): EnhancedError {
	return Object.freeze({
		category,
		originalError: error,
		message: error.message,
		userFriendlyMessage: getUserFriendlyMessage(error, category, context),
		suggestion: getErrorSuggestion(category),
		recoverable: isRecoverableError(category),
		timestamp: new Date(),
	});
}

function isRecoverableError(category: ErrorCategory): boolean {
	switch (category) {
		case 'parse':
		case 'configuration':
		case 'validation':
			return true;
		case 'file-system':
		case 'operational':
			return false;
		case 'safety':
			return false;
	}
}

function getUserFriendlyMessage(
	error: Error,
	category: ErrorCategory,
	context?: string,
): string {
	switch (category) {
		case 'parse':
			return `Failed to parse URL values: ${context || 'unknown file'}`;
		case 'file-system':
			return `File system error: ${error.message}`;
		case 'configuration':
			return `Configuration error: ${error.message}`;
		case 'validation':
			return `URL validation failed: ${error.message}`;
		case 'safety':
			return `Safety threshold exceeded: ${error.message}`;
		case 'operational':
			return `URL extraction failed: ${error.message}`;
	}
}

export function getErrorSuggestion(category: ErrorCategory): string {
	switch (category) {
		case 'parse':
			return 'Check the URL format and ensure values are valid';
		case 'file-system':
			return 'Check file permissions and ensure the file exists';
		case 'configuration':
			return 'Reset to default settings or check configuration syntax';
		case 'validation':
			return 'Review URL values and ensure they meet validation criteria';
		case 'safety':
			return 'Reduce file size or adjust safety thresholds';
		case 'operational':
			return 'Try again or check system resources';
	}
}

export function getErrorRecoveryOptions(
	error: EnhancedError,
): ErrorRecoveryOptions {
	switch (error.category) {
		case 'file-system':
			return createRetryableOptions(3, 1000);
		case 'operational':
			return createRetryableOptions(2, 2000);
		case 'configuration':
			return createFallbackOptions();
		default:
			return createNonRetryableOptions();
	}
}

function createRetryableOptions(
	maxRetries: number,
	retryDelay: number,
): ErrorRecoveryOptions {
	return Object.freeze({
		retryable: true,
		maxRetries,
		retryDelay,
	});
}

function createFallbackOptions(): ErrorRecoveryOptions {
	return Object.freeze({
		retryable: false,
		maxRetries: 0,
		retryDelay: 0,
		fallbackAction: async () => {
			// Fallback to default configuration
		},
	});
}

function createNonRetryableOptions(): ErrorRecoveryOptions {
	return Object.freeze({
		retryable: false,
		maxRetries: 0,
		retryDelay: 0,
	});
}

export function sanitizeErrorMessage(message: string): string {
	return message
		.replace(/\/Users\/[^/]+\//g, '/Users/***/')
		.replace(/\/home\/[^/]+\//g, '/home/***/')
		.replace(/C:\\Users\\[^\\]+\\/g, 'C:\\Users\\***\\')
		.replace(/password[=:]\s*[^\s]+/gi, 'password=***')
		.replace(/token[=:]\s*[^\s]+/gi, 'token=***')
		.replace(/key[=:]\s*[^\s]+/gi, 'key=***');
}

export function handleError(error: EnhancedError): void {
	const sanitizedMessage = sanitizeErrorMessage(error.userFriendlyMessage);
	const logLevel = error.recoverable ? 'WARN' : 'ERROR';

	const logEntry = {
		timestamp: error.timestamp.toISOString(),
		level: logLevel,
		category: error.category,
		message: sanitizedMessage,
		suggestion: error.suggestion,
		recoverable: error.recoverable,
		originalError: error.originalError.message,
	};

	if (error.recoverable) {
		console.warn(`[URLs-LE] ${logLevel}: ${sanitizedMessage}`, logEntry);
	} else {
		console.error(`[URLs-LE] ${logLevel}: ${sanitizedMessage}`, logEntry);
	}
}

export function createErrorHandler(): ErrorHandler {
	return Object.freeze({
		handle(error: EnhancedError): void {
			handleError(error);
		},
		dispose(): void {
			// Cleanup if needed
		},
	});
}

export function createErrorLogger(): ErrorLogger {
	return Object.freeze({
		log(error: EnhancedError): void {
			const sanitizedMessage = sanitizeErrorMessage(error.message);
			console.error(`[URLs-LE] ${sanitizedMessage}`);
		},
		dispose(): void {
			// Cleanup if needed
		},
	});
}

export function createErrorNotifier(): ErrorNotifier {
	return Object.freeze({
		notify(error: EnhancedError): void {
			const sanitizedMessage = sanitizeErrorMessage(error.userFriendlyMessage);
			console.warn(`[URLs-LE] ${sanitizedMessage}`);
		},
		dispose(): void {
			// Cleanup if needed
		},
	});
}

export function createPerformanceError(
	operation: string,
	error: Error,
): EnhancedError {
	return createEnhancedError(
		error,
		'operational',
		`Performance monitoring for ${operation}`,
	);
}
