/**
 * One file end to end, as the Rust CLI's `scan.rs` and `extract/mod.rs` do it,
 * over the extension's extraction engine.
 *
 * The report's shape and field order are the crate's, because stdout is
 * protocol: a script reading JSON Lines from `urls-le` cannot know which of
 * the two binaries it is talking to.
 */
import { readFileSync } from 'node:fs';
import { sep } from 'node:path';
import { extractUrls } from '../extraction/extract';
import type { Url, UrlProtocol } from '../types';
import { decodeUtf8OrThrow, rustIoMessage, withoutBom } from './ioError';
import type { Target } from './walk';

export interface ReportDiagnostic {
	readonly severity: string;
	readonly code: string;
	readonly message: string;
}

/**
 * `domain`, `path` and `context` are null rather than absent, as serde writes
 * an `Option`. `line` and `column` are absent together when a parsed value
 * could not be placed in the source.
 */
export interface FoundUrl {
	readonly value: string;
	readonly protocol: UrlProtocol;
	readonly domain: string | null;
	readonly path: string | null;
	readonly line?: number;
	readonly column?: number;
	readonly context: string | null;
}

export interface FileReport {
	readonly file: string;
	readonly format: string;
	readonly urls: readonly FoundUrl[];
	readonly diagnostics: readonly ReportDiagnostic[];
	readonly summary: { readonly urls: number };
}

export interface ScanOptions {
	readonly dedupe: boolean;
}

export interface Extraction {
	readonly urls: readonly FoundUrl[];
	readonly diagnostics: readonly ReportDiagnostic[];
	readonly fileType: string;
}

export async function scanFile(
	target: Target,
	options: ScanOptions,
): Promise<FileReport> {
	const file = reportedPath(target.path);
	// The walk already knows this one cannot be examined.
	if (target.unreadable !== null) {
		return skipped(file, target.languageId, target.unreadable);
	}

	let bytes: Buffer;
	try {
		bytes = readFileSync(target.path);
	} catch (error) {
		return skipped(file, target.languageId, rustIoMessage(error));
	}
	let content: string;
	try {
		content = decodeUtf8OrThrow(bytes);
	} catch {
		return skipped(file, target.languageId, 'not UTF-8 text');
	}
	return scanContent(withoutBom(content), file, target.languageId, options);
}

export async function scanContent(
	content: string,
	file: string,
	languageId: string,
	options: ScanOptions,
): Promise<FileReport> {
	const extraction = await extract(content, languageId);
	const urls = options.dedupe ? firstOfEach(extraction.urls) : extraction.urls;
	return Object.freeze({
		file,
		format: languageId,
		urls: Object.freeze(urls),
		diagnostics: extraction.diagnostics,
		summary: Object.freeze({ urls: urls.length }),
	});
}

/**
 * The engine already applies the crate's limits in the crate's words: the
 * size ceiling in UTF-8 bytes, a refused document as an error, and the
 * 50,000-URL cut as a warning.
 */
export async function extract(
	content: string,
	languageId: string,
): Promise<Extraction> {
	const result = await extractUrls(content, languageId);
	return {
		urls: result.urls.map(asFound),
		diagnostics: result.errors.map((error) => ({
			severity: error.severity,
			code: error.category,
			message: error.message,
		})),
		fileType: result.fileType ?? languageId,
	};
}

/**
 * Whether this file was not examined: unreadable, not text, or refused for
 * its size. Reported, never swallowed, and a failure only under `--strict`.
 */
export function wasSkipped(report: FileReport): boolean {
	return report.diagnostics.some(
		(diagnostic) =>
			diagnostic.code === 'skipped' || diagnostic.severity === 'error',
	);
}

/** grep's convention: 0 found · 1 none found · 2 could not answer. */
export function exitCode(
	reports: readonly FileReport[],
	strict: boolean,
): number {
	if (strict && reports.some(wasSkipped)) return 2;
	return reports.some((report) => report.summary.urls > 0) ? 0 : 1;
}

export function describe(report: FileReport, url: FoundUrl): string {
	if (url.line === undefined) return `${report.file}:-:-  ${url.value}`;
	return `${report.file}:${url.line}:${url.column}  ${url.value}`;
}

function asFound(url: Url): FoundUrl {
	const base = {
		value: url.value,
		protocol: url.protocol,
		domain: url.domain ?? null,
		path: url.path ?? null,
	};
	if (url.position === undefined) return { ...base, context: null };
	return {
		...base,
		line: url.position.line,
		column: url.position.column,
		context: url.context ?? null,
	};
}

function firstOfEach(urls: readonly FoundUrl[]): FoundUrl[] {
	const seen = new Set<string>();
	return urls.filter((url) => {
		if (seen.has(url.value)) return false;
		seen.add(url.value);
		return true;
	});
}

function skipped(file: string, format: string, reason: string): FileReport {
	return Object.freeze({
		file,
		format,
		urls: Object.freeze([]),
		diagnostics: Object.freeze([
			{ severity: 'warning', code: 'skipped', message: reason },
		]),
		summary: Object.freeze({ urls: 0 }),
	});
}

/** Separators are always `/` in a report, and only where `\` is the separator. */
function reportedPath(path: string): string {
	if (sep !== '\\') return path;
	return path.replaceAll('\\', '/');
}
