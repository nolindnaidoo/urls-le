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
import { requests } from './frames';
import { readTree } from './run';
import { extract as extractDocument } from './scan';

const PROTOCOL_VERSION = '2025-06-18';
const INVALID_PARAMS = -32602;
const METHOD_NOT_FOUND = -32601;
const DEFAULT_MAX_RESULTS = 500;
const MAX_MAX_RESULTS = 5000;

type Handled =
	| { readonly result: unknown }
	| { readonly error: { readonly code: number; readonly message: string } };

/**
 * An argument that does not fit the tool's schema: a protocol error,
 * `-32602`, in the words the extension's server and the crate's use. A tool
 * that fails on what it was given at run time, a path that is not there,
 * throws a plain `Error` and is an `isError` result.
 */
class InvalidParams extends Error {
	override readonly name = 'InvalidParams';
}

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
		additionalProperties: false,
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
 * Serves until stdin closes, one request at a time, in order, over the
 * crate's framing in `frames.ts`.
 */
export async function serve(
	input: AsyncIterable<Uint8Array>,
	write: (line: string) => void,
	version: string,
): Promise<number> {
	for await (const request of requests(input)) {
		const response = await handle(request, version);
		if (response !== undefined) write(`${response}\n`);
	}
	return 0;
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
	if (name === 'extract_urls') return outcome(extract, args);
	if (name === 'urls_le_scan') return outcome(scan, args);
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
): Promise<Handled> {
	let envelope: unknown;
	try {
		envelope = sortedKeys(await tool(args));
	} catch (error) {
		if (error instanceof InvalidParams) {
			return { error: { code: INVALID_PARAMS, message: error.message } };
		}
		const message = error instanceof Error ? error.message : String(error);
		return {
			result: { content: [{ type: 'text', text: message }], isError: true },
		};
	}
	return {
		result: {
			content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
			structuredContent: envelope,
			isError: false,
		},
	};
}

/** The arguments a tool's schema declares; `additionalProperties: false` closes it. */
function refuseUnknown(args: unknown, known: readonly string[]): void {
	if (typeof args !== 'object' || args === null || Array.isArray(args)) return;
	const unknown = Object.keys(args)
		.filter((key) => !known.includes(key))
		.sort();
	if (unknown.length === 1) {
		throw new InvalidParams(`unknown argument: ${unknown[0]}`);
	}
	if (unknown.length > 1) {
		throw new InvalidParams(`unknown arguments: ${unknown.join(', ')}`);
	}
}

function optionalString(args: unknown, name: string): string | undefined {
	if (!hasField(args, name)) return undefined;
	const value = field(args, name);
	if (typeof value !== 'string') {
		throw new InvalidParams(`${name} must be a string`);
	}
	return value;
}

function optionalBoolean(args: unknown, name: string): boolean {
	if (!hasField(args, name)) return false;
	const value = field(args, name);
	if (typeof value !== 'boolean') {
		throw new InvalidParams(`${name} must be a boolean`);
	}
	return value;
}

async function extract(args: unknown): Promise<unknown> {
	refuseUnknown(args, [
		'content',
		'format',
		'filename',
		'dedupe',
		'maxResults',
	]);
	const raw = field(args, 'content');
	if (typeof raw !== 'string') {
		throw new InvalidParams('content is required and must be a string');
	}
	const content = raw.startsWith('﻿') ? raw.slice(1) : raw;
	const maxResults = readMaxResults(args);
	// Read as the schema types them. A `format: 7` was read as absent and a
	// `dedupe: "yes"` as false, silences the schema never allowed.
	const languageId = resolveFormat(
		optionalString(args, 'format'),
		optionalString(args, 'filename'),
	);
	const dedupe = optionalBoolean(args, 'dedupe');
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
	const kept = dedupe
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

/**
 * Clamp quietly, reject loudly. A whole number of one or more, however it
 * was written: `2.0`, `1e3` and `1E20` are caps, as JSON Schema's `integer`
 * reads them and as the other two servers read them; `1E20` was refused
 * here as past `u64` and clamped by the extension's server.
 */
function readMaxResults(args: unknown): number {
	if (!hasField(args, 'maxResults')) return DEFAULT_MAX_RESULTS;
	const raw = field(args, 'maxResults');
	if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
		throw new InvalidParams('maxResults must be a positive integer');
	}
	return Math.min(raw, MAX_MAX_RESULTS);
}

async function scan(args: unknown): Promise<unknown> {
	refuseUnknown(args, ['path', 'paths', 'dedupe', 'hidden', 'ignored']);
	const inputs = requestedPaths(args);
	// Read as the schema types them: a `hidden: "yes"` was read as false.
	const reports = await readTree(
		inputs,
		{ dedupe: optionalBoolean(args, 'dedupe') },
		{
			hidden: optionalBoolean(args, 'hidden'),
			respectIgnore: !optionalBoolean(args, 'ignored'),
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
	if (path !== undefined) throw new InvalidParams('path must be a string');
	const paths = field(args, 'paths');
	if (!Array.isArray(paths)) {
		throw new InvalidParams('no file or directory was supplied to audit');
	}
	// An entry that is not a string is named rather than dropped: `["dir", 7]`
	// was answered for `dir` alone and the 7 vanished without a word.
	const index = paths.findIndex((item) => typeof item !== 'string');
	if (index !== -1) {
		throw new InvalidParams(`entry ${index} of paths is not a string`);
	}
	if (paths.length === 0)
		throw new InvalidParams('the list of paths was empty');
	return paths as readonly string[];
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

function hasField(value: unknown, name: string): boolean {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	return Object.hasOwn(value, name);
}
