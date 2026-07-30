export interface ExtractionResult {
	success: boolean;
	urls: readonly Url[];
	errors: readonly ExtractionError[];
	fileType?: FileType;
}

export interface ExtractionError {
	readonly category: 'parsing' | 'format';
	readonly severity: 'warning' | 'error';
	readonly message: string;
	readonly recoverable: boolean;
	readonly recoveryAction: 'skip' | 'abort' | 'truncate';
}

export interface Url {
	readonly value: string;
	readonly protocol: UrlProtocol;
	readonly domain?: string;
	readonly path?: string;
	readonly position?: {
		readonly line: number;
		readonly column: number;
	};
	readonly context?: string;
}

export type UrlProtocol = 'http' | 'https' | 'ftp' | 'file' | 'mailto' | 'tel';

export type FileType =
	| 'markdown'
	| 'html'
	| 'css'
	| 'javascript'
	| 'typescript'
	| 'json'
	| 'yaml'
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
	readonly statusBarEnabled: boolean;
	readonly telemetryEnabled: boolean;
}
