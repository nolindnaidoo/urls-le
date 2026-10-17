/**
 * `urls-le mcp`: the crate's MCP server (`crate/src/mcp/`), not the
 * extension's. It offers `urls_le_scan` beside the shared `extract_urls`,
 * answers in the crate's words, and writes every reply with its keys sorted,
 * because the crate builds each one as a `serde_json::Value` without
 * `preserve_order`.
 */

import { sortedKeys } from '../mcp/envelope';
import { resolveFormat, SUPPORTED_FORMATS } from '../mcp/fileType';
import { TOOLS } from '../mcp/tools';
import { readTree } from './run';
import { extract as extractDocument } from './scan';

const PROTOCOL_VERSION = '2025-06-18';
const INVALID_PARAMS = -32602;
const METHOD_NOT_FOUND = -32601;
const DEFAULT_MAX_RESULTS = 500;
const MAX_MAX_RESULTS = 5000;
const U64_MAX = 2 ** 64;

type Handled =
	| { readonly result: unknown }
	| { readonly error: { readonly code: number; readonly message: string } };

type Diagnostic = Readonly<{ severity: string; code: string; message: string }>;

const EXTRACT_DEFINITION = definitionOf('extract_urls');

const SCAN_DEFINITION = {
	name: 'urls_le_scan',
	description:
		'Extract every URL from files or directories, with protocol and position. Reads the filesystem; never writes to it, never fetches anything, and never judges a URL.',
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'a file or directory to scan' },
			paths: {
				type: 'array',
				items: { type: 'string' },
				description: 'several files or directories, instead of `path`',
			},
			dedupe: {
				type: 'boolean',
				default: false,
				description: 'Collapse repeated URLs to their first occurrence.',
			},
			hidden: {
				type: 'boolean',
				default: false,
				description: 'Walk hidden files and directories too.',
			},
			ignored: {
				type: 'boolean',
				default: false,
				description: 'Walk files excluded by .gitignore too.',
			},
		},
	},
};

/** The shared tool's definition is the extension's, which the crate copies. */
function definitionOf(name: string): unknown {
	const tool = TOOLS.find((candidate) => candidate.name === name);
	if (!tool) throw new Error(`the extension offers no tool named ${name}`);
	return {
		name: tool.name,
		description: tool.description,
		inputSchema: tool.inputSchema,
	};
}

/**
 * Serves until stdin closes, one request at a time, in order. A line that is
 * not UTF-8 ends the server with exit 2, as `BufRead::lines` does.
 */
export async function serve(
	input: AsyncIterable<Uint8Array>,
	write: (line: string) => void,
	version: string,
): Promise<number> {
	for await (const line of lines(input)) {
		if (line === null) return 2;
		if (isRustBlank(line)) continue;
		let request: unknown;
		try {
			request = JSON.parse(line);
		} catch {
			// A frame that is not JSON has no id to answer against.
			continue;
		}
		const response = await handle(request, version);
		if (response !== undefined) write(`${response}\n`);
	}
	return 0;
}

/** Lines split on `\n` with one trailing `\r` dropped, or null for invalid UTF-8. */
async function* lines(
	input: AsyncIterable<Uint8Array>,
): AsyncGenerator<string | null> {
	const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
	let pending = Buffer.alloc(0);
	for await (const chunk of input) {
		pending = Buffer.concat([pending, chunk]);
		let newline = pending.indexOf(10);
		while (newline !== -1) {
			yield decodeLine(decoder, pending.subarray(0, newline));
			pending = pending.subarray(newline + 1);
			newline = pending.indexOf(10);
		}
	}
	if (pending.length > 0) yield decodeLine(decoder, pending);
}

function decodeLine(decoder: TextDecoder, bytes: Uint8Array): string | null {
	try {
		const line = decoder.decode(bytes);
		return line.endsWith('\r') ? line.slice(0, -1) : line;
	} catch {
		return null;
	}
}

/** Rust's `char::is_whitespace`, which `str::trim` strips. */
function isRustBlank(line: string): boolean {
	return /^[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]*$/.test(
		line,
	);
}

function field(value: unknown, name: string): unknown {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return undefined;
	}
	return Object.hasOwn(value, name)
		? (value as Record<string, unknown>)[name]
		: undefined;
}

async function handle(
	request: unknown,
	version: string,
): Promise<string | undefined> {
	const id = field(request, 'id');
	const method = field(request, 'method');
	if (typeof method !== 'string') return undefined;
	// A notification carries no id and gets no reply.
	if (id === undefined) return undefined;

	const handled = await dispatch(method, field(request, 'params'), version);
	return JSON.stringify(sortedKeys({ jsonrpc: '2.0', id, ...handled }));
}

async function dispatch(
	method: string,
	params: unknown,
	version: string,
): Promise<Handled> {
	if (method === 'initialize') {
		return {
			result: {
				protocolVersion: PROTOCOL_VERSION,
				capabilities: { tools: {} },
				serverInfo: { name: 'urls-le', version },
			},
		};
	}
	if (method === 'tools/list') {
		return { result: { tools: [EXTRACT_DEFINITION, SCAN_DEFINITION] } };
	}
	if (method === 'tools/call') return callTool(params);
	if (method === 'ping') return { result: {} };
	return {
		error: {
			code: METHOD_NOT_FOUND,
			message: `this server does not implement ${method}`,
		},
	};
}

/**
 * Protocol failures are JSON-RPC errors. A tool that fails on its arguments
 * returns a result carrying `isError`, so a model reads the reason rather than
 * concluding the server is broken.
 */
async function callTool(params: unknown): Promise<Handled> {
	if (params === undefined) {
		return {
			error: { code: INVALID_PARAMS, message: 'no tool call was supplied' },
		};
	}
	const name = field(params, 'name');
	if (typeof name !== 'string') {
		return {
			error: { code: INVALID_PARAMS, message: 'the tool call named no tool' },
		};
	}
	const args = field(params, 'arguments') ?? {};
	if (name === 'extract_urls') return { result: await outcome(extract, args) };
	if (name === 'urls_le_scan') return { result: await outcome(scan, args) };
	return {
		error: {
			code: INVALID_PARAMS,
			message: `this server offers no tool named ${name}`,
		},
	};
}

async function outcome(
	tool: (args: unknown) => Promise<unknown>,
	args: unknown,
): Promise<unknown> {
	let envelope: unknown;
	try {
		envelope = sortedKeys(await tool(args));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { content: [{ type: 'text', text: message }], isError: true };
	}
	return {
		content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
		structuredContent: envelope,
		isError: false,
	};
}

async function extract(args: unknown): Promise<unknown> {
	const raw = field(args, 'content');
	if (typeof raw !== 'string') {
		throw new Error('content is required and must be a string');
	}
	const content = raw.startsWith('﻿') ? raw.slice(1) : raw;
	const maxResults = readMaxResults(args);
	const languageId = resolveFormat(
		stringField(args, 'format'),
		stringField(args, 'filename'),
	);
	if (languageId === null) {
		throw new Error(
			`Provide \`format\` (one of: ${SUPPORTED_FORMATS.join(', ')}) or a \`filename\` with a recognised extension.`,
		);
	}

	const result = await extractDocument(content, languageId);
	const values = result.urls.map((url) => {
		const value = { value: url.value, protocol: url.protocol };
		if (url.line === undefined) return value;
		return { ...value, line: url.line, column: url.column };
	});
	const kept =
		field(args, 'dedupe') === true
			? values.filter(
					(url, index, all) =>
						all.findIndex((other) => other.value === url.value) === index,
				)
			: values;
	const truncated = kept.length > maxResults;
	const items = kept.slice(0, maxResults);
	return envelope(
		'extract_urls',
		{ urls: items, fileType: result.fileType },
		items.length,
		result.diagnostics,
		truncated,
	);
}

/** Clamp quietly, reject loudly: `as_u64`, then the floor, then the ceiling. */
function readMaxResults(args: unknown): number {
	if (!hasField(args, 'maxResults')) return DEFAULT_MAX_RESULTS;
	const raw = field(args, 'maxResults');
	const unsigned =
		typeof raw === 'number' &&
		Number.isInteger(raw) &&
		raw >= 0 &&
		raw < U64_MAX;
	if (!unsigned || raw < 1) {
		throw new Error('maxResults must be a positive integer');
	}
	return Math.min(raw, MAX_MAX_RESULTS);
}

async function scan(args: unknown): Promise<unknown> {
	const inputs = requestedPaths(args);
	const flag = (name: string): boolean => field(args, name) === true;
	const reports = await readTree(
		inputs,
		{ dedupe: flag('dedupe') },
		{
			hidden: flag('hidden'),
			respectIgnore: !flag('ignored'),
			followSymlinks: false,
			format: null,
		},
	);
	const urls = reports.reduce(
		(total, report) => total + report.summary.urls,
		0,
	);
	// The same predicate `--strict` uses on the terminal surface.
	const diagnostics: Diagnostic[] = reports
		.filter((report) =>
			report.diagnostics.some(
				(found) => found.severity === 'error' || found.code === 'skipped',
			),
		)
		.map((report) => ({
			severity: 'warning',
			code: 'unreadable',
			message: `${report.file} could not be examined, so this scan does not cover it`,
		}));
	return envelope(
		'urls_le_scan',
		{ reports, urls },
		reports.length,
		diagnostics,
		false,
	);
}

function requestedPaths(args: unknown): readonly string[] {
	const path = field(args, 'path');
	if (typeof path === 'string') return [path];
	const paths = field(args, 'paths');
	if (!Array.isArray(paths)) {
		throw new Error('no file or directory was supplied to audit');
	}
	const named = paths.filter(
		(item): item is string => typeof item === 'string',
	);
	if (named.length === 0) throw new Error('the list of paths was empty');
	return named;
}

function envelope(
	tool: string,
	data: unknown,
	count: number,
	diagnostics: readonly Diagnostic[],
	truncated: boolean,
): unknown {
	return {
		ok: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
		data,
		diagnostics,
		meta: { tool, count, truncated },
	};
}

function stringField(args: unknown, name: string): string | undefined {
	const value = field(args, name);
	return typeof value === 'string' ? value : undefined;
}

function hasField(value: unknown, name: string): boolean {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	return Object.hasOwn(value, name);
}
