/**
 * The one thing extraction needs from a cancellation token.
 *
 * Declared structurally rather than importing `vscode.CancellationToken`, so
 * the extraction engine has no dependency on the editor at all — a real token
 * satisfies this shape, and the engine can run anywhere a string can.
 */
export interface CancellationSignal {
	readonly isCancellationRequested: boolean;
}

export interface ExtractionResult {
	readonly success: boolean;
	readonly urls: readonly Url[];
	readonly errors: readonly ExtractionError[];
	readonly fileType?: FileType;
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
	/** Whether the copy on the clipboard carries positions, whatever the screen shows. */
	readonly clipboardIncludesPositions: boolean;
	readonly copyToClipboardEnabled: boolean;
	readonly dedupeEnabled: boolean;
	readonly notificationsLevel: 'all' | 'important' | 'silent';
	readonly postProcessOpenInNewFile: boolean;
	readonly openResultsSideBySide: boolean;
	readonly safetyEnabled: boolean;
	readonly safetyFileSizeWarnBytes: number;
	readonly safetyLargeOutputLinesThreshold: number;
	/** Whether the output gives the line and column of each URL. */
	readonly showPositions: boolean;
	readonly statusBarEnabled: boolean;
	readonly telemetryEnabled: boolean;
	/** Globs read whatever the excludes and `.gitignore` say. */
	readonly workspaceScanAlwaysInclude: readonly string[];
	/** Globs left out on top of the built-in list. */
	readonly workspaceScanExcludes: readonly string[];
	readonly workspaceScanMaxFiles: number;
	/** The most occurrences one folder scan lists before it stops reading. */
	readonly workspaceScanMaxResults: number;
	readonly workspaceScanPatterns: readonly string[];
	readonly workspaceScanRespectGitignore: boolean;
	readonly workspaceScanSkipBinaryFiles: boolean;
	readonly workspaceScanUseDefaultExcludes: boolean;
}
