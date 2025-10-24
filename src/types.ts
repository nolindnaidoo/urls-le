export interface ExtractionResult {
	success: boolean;
	urls: readonly Url[];
	errors: readonly ParseError[];
	fileType?: FileType;
}

export type ErrorCategory =
	| 'parsing'
	| 'validation'
	| 'file-system'
	| 'configuration'
	| 'url-validation'
	| 'analysis'
	| 'performance'
	| 'unknown';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export type RecoveryAction =
	| 'retry'
	| 'fallback'
	| 'user-action'
	| 'skip'
	| 'abort'
	| 'truncate';

export interface UrlsLeError {
	readonly category: ErrorCategory;
	readonly severity: ErrorSeverity;
	readonly message: string;
	readonly context?: string;
	readonly recoverable: boolean;
	readonly recoveryAction: RecoveryAction;
	readonly timestamp: number;
	readonly stack?: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ParseError extends UrlsLeError {
	readonly category: 'parsing';
	readonly filepath?: string;
	readonly position?: {
		readonly line: number;
		readonly column: number;
	};
}

export interface Url {
	readonly value: string;
	readonly protocol: UrlProtocol;
	readonly type?: string;
	readonly domain?: string;
	readonly path?: string;
	readonly position?: {
		readonly line: number;
		readonly column: number;
	};
	readonly context?: string;
}

export type UrlProtocol =
	| 'http'
	| 'https'
	| 'ftp'
	| 'file'
	| 'mailto'
	| 'tel'
	| 'unknown';

export interface AnalysisResult {
	count: number;
	protocols: Record<UrlProtocol, number>;
	unique: number;
	duplicates: number;
	security?: SecurityAnalysis;
	accessibility?: AccessibilityAnalysis;
	domains?: DomainAnalysis;
	// Additional properties for compatibility
	secure?: number;
	insecure?: number;
	suspicious?: number;
	uniqueDomains?: number;
	// Index signature for compatibility
	readonly [key: string]: unknown;
}

export interface SecurityAnalysis {
	readonly secure: number;
	readonly insecure: number;
	readonly suspicious: number;
	readonly issues: readonly SecurityIssue[];
}

export interface SecurityIssue {
	readonly url: string;
	readonly issue: string;
	readonly severity: 'warning' | 'error';
}

export interface AccessibilityAnalysis {
	readonly accessible: number;
	readonly inaccessible: number;
	readonly issues: readonly AccessibilityIssue[];
}

export interface AccessibilityIssue {
	readonly url: string;
	readonly issue: string;
	readonly severity: 'warning' | 'error';
	// Index signature for compatibility
	readonly [key: string]: unknown;
}

export interface AccessibilityResult {
	readonly url: string;
	readonly accessible: boolean;
	readonly issues: readonly string[];
	readonly severity: 'warning' | 'error';
	// Index signature for compatibility
	readonly [key: string]: unknown;
}

export interface DomainAnalysis {
	readonly uniqueDomains: number;
	readonly commonDomains: readonly CommonDomain[];
	readonly expiredDomains: readonly string[];
	readonly suspiciousDomains: readonly string[];
}

export interface CommonDomain {
	readonly domain: string;
	readonly count: number;
	readonly percentage: number;
}

export interface ValidationResult {
	readonly url: string;
	readonly status: 'valid' | 'invalid' | 'timeout' | 'error';
	readonly statusCode?: number;
	readonly redirects?: readonly string[];
	readonly error?: string;
	// Index signature for compatibility
	readonly [key: string]: unknown;
}

export type FileType =
	| 'markdown'
	| 'html'
	| 'css'
	| 'javascript'
	| 'typescript'
	| 'json'
	| 'yaml'
	| 'yml'
	| 'properties'
	| 'toml'
	| 'ini'
	| 'xml'
	| 'unknown';

export interface Configuration {
	readonly copyToClipboardEnabled: boolean;
	readonly dedupeEnabled: boolean;
	readonly notificationsLevel: 'all' | 'important' | 'silent';
	readonly postProcessOpenInNewFile: boolean;
	readonly openResultsSideBySide: boolean;
	readonly safetyEnabled: boolean;
	readonly safetyFileSizeWarnBytes: number;
	readonly safetyLargeOutputLinesThreshold: number;
	readonly safetyManyDocumentsThreshold: number;
	readonly showParseErrors: boolean;
	readonly statusBarEnabled: boolean;
	readonly telemetryEnabled: boolean;
}

// Re-export utility types for easier access
export type {
	ErrorHandler,
	ErrorLogger,
	ErrorNotifier,
} from './utils/errorHandling';
export type { Localizer } from './utils/localization';
export type {
	PerformanceMetrics,
	PerformanceMonitor,
	PerformanceThresholds,
} from './utils/performance';
