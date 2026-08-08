/**
 * Fails when the extension's extraction behaviour drifts from the shared
 * corpus, which the Rust CLI (crate/) also builds against.
 *
 * - extraction.json `documents`: every URL the extension finds in each
 *   corpus document, with protocol, domain, path, position and context —
 *   plus the success flag and any errors, so a document that fails to
 *   parse is pinned as carefully as one that does not.
 * - extraction.json `scan`: the shared URL scanner over the inputs most
 *   likely to drift — the delimiter set, the mailto/tel well-formedness
 *   rules, repeats, and IDN.
 * - mcp-extract-urls.json: the `extract_urls` tool, which BOTH MCP
 *   servers offer and must answer identically.
 *
 * This checks only the extension's side. `cargo test` runs the crate's
 * implementation over the same files.
 *
 * Run: bun scripts/check-extraction-parity.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractUrls } from '../src/extraction/extract';
import { scanUrls } from '../src/extraction/heuristics';
import { TOOLS } from '../src/mcp/tools';

const ROOT = join(import.meta.dir, '..');
/** The corpus lives inside the crate so the published package is self-contained. */
const CORPUS = join(ROOT, 'crate', 'fixtures');
const failures: string[] = [];

function fail(message: string): void {
	failures.push(message);
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((item, i) => deepEqual(item, b[i]));
	}
	if (typeof a !== 'object' || typeof b !== 'object') return false;
	if (a === null || b === null) return false;
	const keysA = Object.keys(a).sort();
	const keysB = Object.keys(b).sort();
	if (!deepEqual(keysA, keysB)) return false;
	return keysA.every((key) =>
		deepEqual(
			(a as Record<string, unknown>)[key],
			(b as Record<string, unknown>)[key],
		),
	);
}

function asJson(value: unknown): unknown {
	return JSON.parse(JSON.stringify(value));
}

function readCorpus(name: string): unknown {
	return JSON.parse(readFileSync(join(CORPUS, name), 'utf8'));
}

function readDocument(file: string): string {
	return readFileSync(join(CORPUS, 'documents', file), 'utf8');
}

async function checkDocuments(): Promise<void> {
	const corpus = readCorpus('extraction.json') as Readonly<{
		documents: ReadonlyArray<{
			name: string;
			file: string;
			languageId: string;
			success: boolean;
			errors: readonly unknown[];
			expected: readonly unknown[];
		}>;
	}>;

	for (const testCase of corpus.documents) {
		const result = await extractUrls(
			readDocument(testCase.file),
			testCase.languageId,
		);
		const actual = result.urls.map((url) => ({
			value: url.value,
			protocol: url.protocol,
			domain: url.domain ?? null,
			path: url.path ?? null,
			line: url.position?.line ?? null,
			column: url.position?.column ?? null,
			context: url.context ?? null,
		}));
		if (!deepEqual(actual, testCase.expected)) {
			fail(
				`documents "${testCase.name}":\n  expected: ${JSON.stringify(testCase.expected)}\n  got:      ${JSON.stringify(actual)}`,
			);
		}
		if (result.success !== testCase.success) {
			fail(
				`documents "${testCase.name}": success was ${result.success}, corpus says ${testCase.success}`,
			);
		}
		const errors = result.errors.map((error) => ({
			category: error.category,
			severity: error.severity,
			message: error.message,
		}));
		if (!deepEqual(asJson(errors), testCase.errors)) {
			fail(
				`documents "${testCase.name}" errors:\n  expected: ${JSON.stringify(testCase.errors)}\n  got:      ${JSON.stringify(errors)}`,
			);
		}
	}
}

function checkScan(): void {
	const corpus = readCorpus('extraction.json') as Readonly<{
		scan: ReadonlyArray<{ input: string; expected: readonly unknown[] }>;
	}>;

	for (const testCase of corpus.scan) {
		const actual = scanUrls(testCase.input).map((match) => ({
			value: match.value,
			protocol: match.protocol,
			start: match.start,
		}));
		if (!deepEqual(actual, testCase.expected)) {
			fail(
				`scan ${JSON.stringify(testCase.input)}:\n  expected: ${JSON.stringify(testCase.expected)}\n  got:      ${JSON.stringify(actual)}`,
			);
		}
	}
}

/**
 * `extract_urls` is offered by BOTH MCP servers. They are meant to be
 * the same tool, not two similar ones, so the same corpus runs against
 * both: this function here, and `crate/src/mcp/extract.rs`'s own test
 * there.
 */
async function checkMcpExtractUrls(): Promise<void> {
	const cases = readCorpus('mcp-extract-urls.json') as ReadonlyArray<{
		name: string;
		file?: string;
		content?: string;
		arguments: Record<string, unknown>;
		expected?: unknown;
		expectedError?: string;
	}>;

	const tool = TOOLS.find((t) => t.name === 'extract_urls');
	if (!tool) {
		fail('the extension no longer offers extract_urls');
		return;
	}

	for (const testCase of cases) {
		const args: Record<string, unknown> = { ...testCase.arguments };
		if (testCase.file !== undefined) args.content = readDocument(testCase.file);
		else if (testCase.content !== undefined) args.content = testCase.content;

		if (testCase.expectedError !== undefined) {
			try {
				await tool.handler(args);
				fail(
					`mcp extract "${testCase.name}": expected it to fail with ${JSON.stringify(testCase.expectedError)}`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (message !== testCase.expectedError) {
					fail(
						`mcp extract "${testCase.name}": expected error ${JSON.stringify(testCase.expectedError)}, got ${JSON.stringify(message)}`,
					);
				}
			}
			continue;
		}

		const actual = asJson(await tool.handler(args));
		if (!deepEqual(actual, testCase.expected)) {
			fail(
				`mcp extract "${testCase.name}":\n  expected: ${JSON.stringify(testCase.expected)}\n  got:      ${JSON.stringify(actual)}`,
			);
		}
	}
}

await checkDocuments();
checkScan();
await checkMcpExtractUrls();

if (failures.length > 0) {
	console.error(`Extraction parity FAILED (${failures.length}):\n`);
	for (const failure of failures) {
		console.error(`- ${failure}\n`);
	}
	process.exit(1);
}
console.log(
	'OK: every corpus case reproduces under the extension, and both MCP servers agree.',
);
