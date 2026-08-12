import type {
	CancellationSignal,
	ExtractionError,
	ExtractionResult,
	FileType,
	Url,
} from '../types';
import { extractFromCss } from './formats/css';
import { extractFromHtml } from './formats/html';
import { extractFromIni } from './formats/ini';
import { extractFromJavaScript } from './formats/javascript';
import { extractFromJson } from './formats/json';
import { extractFromMarkdown } from './formats/markdown';
import { extractFromPlainText } from './formats/plaintext';
import { extractFromProperties } from './formats/properties';
import { extractFromToml } from './formats/toml';
import { extractFromXml } from './formats/xml';
import { extractFromYaml } from './formats/yaml';

const MAX_CONTENT_SIZE = 10_000_000; // 10MB
const MAX_URL_COUNT = 50_000;

export async function extractUrls(
	content: string,
	languageId: string,
	cancellationToken?: CancellationSignal,
): Promise<ExtractionResult> {
	// Fail fast: Check cancellation
	if (cancellationToken?.isCancellationRequested) {
		return createEmptyResult('unknown');
	}

	// Fail fast: Validate content size
	if (content.length > MAX_CONTENT_SIZE) {
		return createErrorResult(
			'unknown',
			`Content too large (${content.length} characters), maximum size is 10MB`,
		);
	}

	// No refusal for an unrecognised language: 'unknown' is the whole-document
	// scan, which is what every format-aware extractor is before it excludes
	// something. Refusing was never protecting a caller from a wrong answer —
	// it withheld the right one, for every .py, .go, .sh and .csv there is.
	const fileType = determineFileType(languageId);

	// Fail fast: Check cancellation before extraction
	if (cancellationToken?.isCancellationRequested) {
		return createEmptyResult(fileType);
	}

	const extractionResult = extractUrlsByFileType(content, fileType);

	// Check URL count limits
	if (extractionResult.urls.length > MAX_URL_COUNT) {
		return createTruncatedResult(
			extractionResult.urls,
			fileType,
			extractionResult.urls.length,
		);
	}

	return createSuccessResult(
		extractionResult.urls,
		extractionResult.errors,
		fileType,
	);
}

function extractUrlsByFileType(
	content: string,
	fileType: FileType,
): { urls: Url[]; errors: ExtractionError[] } {
	const urls: Url[] = [];
	const errors: ExtractionError[] = [];

	try {
		const extractedUrls = selectExtractor(fileType)(content);
		urls.push(...extractedUrls);
	} catch (error) {
		errors.push(createParseError(error));
	}

	return { urls, errors };
}

function selectExtractor(
	fileType: FileType,
): (content: string) => readonly Url[] {
	switch (fileType) {
		case 'markdown':
			return extractFromMarkdown;
		case 'html':
			return extractFromHtml;
		case 'css':
			return extractFromCss;
		case 'javascript':
		case 'typescript':
			return extractFromJavaScript;
		case 'json':
			return extractFromJson;
		case 'yaml':
			return extractFromYaml;
		case 'properties':
			return extractFromProperties;
		case 'toml':
			return extractFromToml;
		case 'ini':
			return extractFromIni;
		case 'xml':
			return extractFromXml;
		default:
			// 'unknown': no format-aware extractor, so nothing to exclude. The
			// whole-content scan is what CSS, JS, TS, YAML and XML already run.
			return extractFromPlainText;
	}
}

function createEmptyResult(fileType: FileType): ExtractionResult {
	return Object.freeze({
		success: false,
		urls: Object.freeze([]),
		errors: Object.freeze([]),
		fileType,
	});
}

function createErrorResult(
	fileType: FileType,
	message: string,
): ExtractionResult {
	return Object.freeze({
		success: false,
		urls: Object.freeze([]),
		errors: Object.freeze([
			{
				category: 'parsing' as const,
				severity: 'warning' as const,
				message,
				recoverable: true,
				recoveryAction: 'truncate' as const,
			},
		]),
		fileType,
	});
}

function createTruncatedResult(
	urls: Url[],
	fileType: FileType,
	originalCount: number,
): ExtractionResult {
	const truncatedUrls = urls.slice(0, MAX_URL_COUNT);
	return Object.freeze({
		success: true,
		urls: Object.freeze(truncatedUrls),
		errors: Object.freeze([
			{
				category: 'parsing' as const,
				severity: 'warning' as const,
				message: `URL count (${originalCount}) exceeds limit (${MAX_URL_COUNT}), truncated results`,
				recoverable: true,
				recoveryAction: 'truncate' as const,
			},
		]),
		fileType,
	});
}

function createSuccessResult(
	urls: Url[],
	errors: ExtractionError[],
	fileType: FileType,
): ExtractionResult {
	return Object.freeze({
		success: errors.length === 0,
		urls: Object.freeze(urls),
		errors: Object.freeze(errors),
		fileType,
	});
}

function createParseError(error: unknown): ExtractionError {
	return {
		category: 'parsing' as const,
		severity: 'warning' as const,
		message: error instanceof Error ? error.message : 'Unknown parsing error',
		recoverable: true,
		recoveryAction: 'skip' as const,
	};
}

function determineFileType(languageId: string): FileType {
	switch (languageId) {
		case 'markdown':
			return 'markdown';
		case 'html':
			return 'html';
		case 'css':
			return 'css';
		case 'javascript':
			return 'javascript';
		case 'typescript':
			return 'typescript';
		case 'json':
			return 'json';
		case 'yaml':
		case 'yml':
			return 'yaml';
		case 'properties':
			return 'properties';
		case 'toml':
			return 'toml';
		case 'ini':
			return 'ini';
		case 'xml':
			return 'xml';
		default:
			// Not "we could not tell" — it is the answer for a .py, a .csv or
			// anything else with no structure worth excluding, and it is what
			// the fileType field reports so a caller can tell which pass ran.
			return 'unknown';
	}
}
