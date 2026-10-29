import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { ExtractionResult } from '../types';
import { capped, isOk, readMaxResults, toDiagnostics } from './envelope';
import { FALLBACK_FORMAT, resolveFormat, SUPPORTED_FORMATS } from './fileType';
import { TOOLS } from './tools';
import { createResponder, MAX_FRAME_BYTES, serve } from './transport';

/**
 * The MCP layer: the normalisation boundary, the tool table and the protocol.
 *
 * The engine is covered by its own characterization goldens. What is new here
 * is the translation between an agent's request and that engine — which is
 * where the interesting mistakes live: reporting a true empty result as a
 * failure, letting an unbounded extraction flood a context window, or renaming
 * a tool that something already depends on.
 */

const emptyResult: ExtractionResult = Object.freeze({
	success: false,
	urls: Object.freeze([]),
	errors: Object.freeze([]),
});

describe('envelope: ok vs success', () => {
	it('treats an empty result with no errors as ok', () => {
		// extractUrls returns success:false for an empty or cancelled run. Passing
		// that through as a failure would have a model announce a problem that did
		// not happen.
		expect(isOk(toDiagnostics(emptyResult))).toBe(true);
	});

	it('is not ok when a diagnostic is an error', () => {
		expect(
			isOk([{ severity: 'error', code: 'format', message: 'unsupported' }]),
		).toBe(false);
	});

	it('stays ok when diagnostics are only warnings', () => {
		expect(
			isOk([{ severity: 'warning', code: 'parsing', message: 'partial' }]),
		).toBe(true);
	});
});

describe('envelope: result cap', () => {
	it('reports truncation honestly when it drops items', () => {
		const { items, truncated } = capped([1, 2, 3, 4, 5], 2);
		expect(items).toEqual([1, 2]);
		expect(truncated).toBe(true);
	});

	it('does not claim truncation when everything fits', () => {
		const { items, truncated } = capped([1, 2], 5);
		expect(items).toHaveLength(2);
		expect(truncated).toBe(false);
	});

	it('rejects a maxResults a tool cannot honour', () => {
		expect(() => readMaxResults({ maxResults: 0 })).toThrow(/positive integer/);
		expect(() => readMaxResults({ maxResults: 1.5 })).toThrow();
		expect(() => readMaxResults({ maxResults: 'ten' })).toThrow();
	});

	it('clamps an oversized request rather than refusing it', () => {
		expect(readMaxResults({ maxResults: 999999 })).toBe(5000);
	});
});

describe('fileType: tolerant resolution', () => {
	it('accepts the language ids the engine already knows', () => {
		expect(resolveFormat('markdown', undefined)).toBe('markdown');
	});

	it('accepts the shorthands an agent actually sends', () => {
		// The engine only maps yaml/yml; everything here would have fallen through
		// to "unknown" and produced an empty extraction with no explanation.
		expect(resolveFormat('md', undefined)).toBe('markdown');
		expect(resolveFormat('.MD', undefined)).toBe('markdown');
		expect(resolveFormat(' yml ', undefined)).toBe('yaml');
		expect(resolveFormat('tsx', undefined)).toBe('typescript');
	});

	it('infers from a filename when no format is given', () => {
		expect(resolveFormat(undefined, 'README.md')).toBe('markdown');
		expect(resolveFormat(undefined, 'pom.xml')).toBe('xml');
	});

	// A dotfile has no extension to split on, so the whole name has to be
	// tried first. The Rust crate always did; this side did not.
	it('resolves a dotfile by its whole name', () => {
		expect(resolveFormat(undefined, '.env')).toBe('properties');
		expect(resolveFormat(undefined, 'env')).toBe('properties');
	});

	// Changed deliberately: an unrecognised name used to be null,
	// which made `a.py` a document this tool refused rather than one it had
	// no special handling for. Every extractor is the plain-text scan minus
	// an exclusion, so the fallback can never hide a URL.
	it('falls back to a plain-text scan rather than refusing a name', () => {
		expect(resolveFormat('klingon', 'a.klingon')).toBe(FALLBACK_FORMAT);
		expect(resolveFormat(undefined, 'app.py')).toBe(FALLBACK_FORMAT);
		expect(resolveFormat(undefined, 'Makefile')).toBe(FALLBACK_FORMAT);
	});

	it('returns null when nothing at all was named', () => {
		expect(resolveFormat(undefined, undefined)).toBeNull();
	});

	// A plain object literal inherits from Object.prototype, so an unguarded
	// lookup hands back a function that every truthiness check accepts.
	it('reads own keys only', () => {
		expect(resolveFormat('toString', undefined)).toBe(FALLBACK_FORMAT);
		expect(resolveFormat(undefined, 'a.constructor')).toBe(FALLBACK_FORMAT);
	});

	it('advertises only formats the engine supports', () => {
		expect(SUPPORTED_FORMATS).toContain('markdown');
		expect(SUPPORTED_FORMATS).toContain(FALLBACK_FORMAT);
		expect(SUPPORTED_FORMATS).not.toContain('unknown');
	});
});

describe('tool table', () => {
	it('pins the tool names', () => {
		// Tool names are a public API with no deprecation channel: once an agent's
		// prompt or memory references one, renaming it breaks silently.
		expect(TOOLS.map((t) => t.name)).toEqual(['extract_urls']);
	});

	it('gives every tool a description and a closed schema', () => {
		for (const tool of TOOLS) {
			expect(tool.description.length).toBeGreaterThan(20);
			expect(tool.inputSchema.type).toBe('object');
			expect(tool.inputSchema.additionalProperties).toBe(false);
			expect(typeof tool.handler).toBe('function');
		}
	});

	it('caps results by default rather than leaving it unbounded', () => {
		const schema = TOOLS[0]?.inputSchema as {
			properties: { maxResults: { default: number } };
		};
		expect(schema.properties.maxResults.default).toBe(500);
	});
});

describe('extract_urls', () => {
	const call = async (args: Record<string, unknown>) => {
		const tool = TOOLS[0];
		if (!tool) throw new Error('no tool');
		return (await tool.handler(args)) as {
			ok: boolean;
			data: { urls: { value: string; line?: number }[] };
			meta: { count: number; truncated: boolean };
		};
	};

	it('extracts with positions', async () => {
		const result = await call({
			content: 'See <https://example.com/a>',
			format: 'markdown',
		});
		expect(result.data.urls[0]?.value).toBe('https://example.com/a');
		expect(result.data.urls[0]?.line).toBe(1);
		expect(result.ok).toBe(true);
	});

	it('collapses repeats only when asked', async () => {
		const content = 'https://a.example.com\nhttps://a.example.com';
		const kept = await call({ content, format: 'markdown' });
		const deduped = await call({ content, format: 'markdown', dedupe: true });
		expect(kept.meta.count).toBe(2);
		expect(deduped.meta.count).toBe(1);
	});

	it('truncates at maxResults and says so', async () => {
		const content = Array.from(
			{ length: 10 },
			(_, i) => `https://example.com/${i}`,
		).join('\n');
		const result = await call({ content, format: 'markdown', maxResults: 3 });
		expect(result.meta.count).toBe(3);
		expect(result.meta.truncated).toBe(true);
	});

	it('names the fix when no usable format is given', async () => {
		// The engine would report "Unsupported language: undefined", which tells an
		// agent nothing it can act on.
		await expect(call({ content: 'https://example.com' })).rejects.toThrow(
			/Provide `format`/,
		);
	});

	it('requires content', async () => {
		await expect(call({ format: 'markdown' })).rejects.toThrow(
			/content is required/,
		);
	});
});

describe('protocol', () => {
	const respond = createResponder({ name: 'urls-le', version: '1.0.0' }, TOOLS);

	it("answers with its own protocol version, as the crate's server does", async () => {
		// It echoed whatever the client asked for, with `listChanged: false`
		// in its capabilities, so one handshake got two answers from the two
		// servers that offer the shared tool.
		const reply = await respond({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: { protocolVersion: '2024-11-05' },
		});
		expect(reply?.result?.protocolVersion).toBe('2025-06-18');
		expect(reply?.result?.capabilities).toEqual({ tools: {} });
		expect(reply?.result?.serverInfo).toEqual({
			name: 'urls-le',
			version: '1.0.0',
		});
	});

	it('does not reply to a notification, a null id included', async () => {
		// A reply to a notification is the classic way to wedge a client. An
		// initialize with no id was answered with `id: null`.
		expect(
			await respond({ jsonrpc: '2.0', method: 'notifications/initialized' }),
		).toBeNull();
		expect(
			await respond({ jsonrpc: '2.0', id: null, method: 'initialize' }),
		).toBeNull();
		expect(await respond({ jsonrpc: '2.0', method: 'initialize' })).toBeNull();
	});

	it("refuses notifications/initialized sent with an id as a method it does not implement, as the crate's server does", async () => {
		const reply = await respond({
			jsonrpc: '2.0',
			id: 7,
			method: 'notifications/initialized',
		});
		expect(reply?.error?.code).toBe(-32601);
	});

	it('refuses in the words the other two servers use', async () => {
		// Three servers ship from this repository; a client must not be able
		// to tell them apart by what it sent.
		expect(
			(await respond({ jsonrpc: '2.0', id: 1, method: 'resources/list' }))
				?.error?.message,
		).toBe('Unknown method: resources/list');
		expect(
			(
				await respond({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: { name: 'nope' },
				})
			)?.error?.message,
		).toBe('Unknown tool: nope');
		expect(
			(await respond({ jsonrpc: '2.0', id: 1, method: 'tools/call' }))?.error
				?.message,
		).toBe('tools/call requires a string `name`');
		expect(
			(
				await respond({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: { name: 3 },
				})
			)?.error?.message,
		).toBe('tools/call requires a string `name`');
	});

	it('reports an unknown method as a JSON-RPC error', async () => {
		const reply = await respond({ jsonrpc: '2.0', id: 2, method: 'nope' });
		expect(reply?.error?.code).toBe(-32601);
	});

	it('reports an unknown tool without killing the connection', async () => {
		const reply = await respond({
			jsonrpc: '2.0',
			id: 3,
			method: 'tools/call',
			params: { name: 'no_such_tool', arguments: {} },
		});
		expect(reply?.error?.code).toBe(-32602);
	});

	it('refuses an argument that does not fit the schema as a protocol error, in the words the other two servers use', async () => {
		// It was an isError result, which a host shows to the agent as the
		// tool's own failure; a wrong type on an optional argument was read as
		// absent, and an argument the schema does not declare was accepted.
		// The schema is what the agent read before sending, so a violation
		// is -32602, and `additionalProperties: false` is enforced.
		for (const [args, message] of [
			[{}, 'content is required and must be a string'],
			[
				{ content: 'x', format: 'markdown', maxResults: 2.5 },
				'maxResults must be a positive integer',
			],
			[{ content: 'x', format: 7 }, 'format must be a string'],
			[
				{ content: 'x', format: 'markdown', filename: 7 },
				'filename must be a string',
			],
			[
				{ content: 'x', format: 'markdown', dedupe: 'yes' },
				'dedupe must be a boolean',
			],
			[
				{ content: 'x', format: 'markdown', extra: true },
				'unknown argument: extra',
			],
			[
				{ content: 'x', format: 'markdown', extra: true, another: 1 },
				'unknown arguments: another, extra',
			],
		] as const) {
			const reply = await respond({
				jsonrpc: '2.0',
				id: 4,
				method: 'tools/call',
				params: { name: 'extract_urls', arguments: args },
			});
			expect(reply?.result, JSON.stringify(args)).toBeUndefined();
			expect(reply?.error, JSON.stringify(args)).toEqual({
				code: -32602,
				message,
			});
		}
	});

	it('reads a cap written as an integer-valued float or exponent as the crate does', async () => {
		// JSON Schema's `integer` is any number with a zero fractional part.
		const reply = await respond({
			jsonrpc: '2.0',
			id: 5,
			method: 'tools/call',
			params: {
				name: 'extract_urls',
				arguments: {
					content: 'https://a.example https://b.example',
					format: 'markdown',
					maxResults: 1e20,
				},
			},
		});
		expect(reply?.error).toBeUndefined();
		const structured = reply?.result?.structuredContent as
			| { meta: { count: number } }
			| undefined;
		expect(structured?.meta.count).toBe(2);
	});

	it('returns a tool failure as a result, not a protocol error', async () => {
		// A model can read an isError result and correct itself; a JSON-RPC error
		// reads as "the server is broken".
		const reply = await respond({
			jsonrpc: '2.0',
			id: 4,
			method: 'tools/call',
			params: { name: 'extract_urls', arguments: { content: 'x' } },
		});
		expect(reply?.error).toBeUndefined();
		expect(reply?.result?.isError).toBe(true);
	});
});

describe('serve: the stdio loop', () => {
	/** A fake stdin/stdout pair so the loop can be driven without a process. */
	function harness() {
		const input = new EventEmitter() as EventEmitter & {
			setEncoding?: (e: string) => void;
		};
		const written: string[] = [];
		const output = {
			write: (chunk: string) => {
				written.push(chunk);
				return true;
			},
		};
		serve(
			{ name: 'urls-le', version: '1.0.0' },
			TOOLS,
			input as never,
			output as never,
		);
		const replies = () =>
			written
				.join('')
				.split('\n')
				.filter(Boolean)
				.map((l) => JSON.parse(l));
		return { input, replies };
	}

	const settle = () => new Promise((r) => setTimeout(r, 20));

	it('answers a request delivered as one line', async () => {
		const { input, replies } = harness();
		input.emit('data', '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
		await settle();
		expect(replies()[0]?.result?.tools).toHaveLength(1);
	});

	it('reassembles a request split across chunks', async () => {
		// stdin delivers whatever the OS gives it; a request arriving in two
		// pieces must not be dropped or double-parsed.
		const { input, replies } = harness();
		input.emit('data', '{"jsonrpc":"2.0","id":2,"me');
		input.emit('data', 'thod":"ping"}\n');
		await settle();
		expect(replies()[0]?.id).toBe(2);
	});

	it('handles several requests in one chunk', async () => {
		const { input, replies } = harness();
		input.emit(
			'data',
			'{"jsonrpc":"2.0","id":3,"method":"ping"}\n{"jsonrpc":"2.0","id":4,"method":"ping"}\n',
		);
		await settle();
		expect(replies().map((r) => r.id)).toEqual([3, 4]);
	});

	it('reports malformed JSON without dying', async () => {
		// One bad line from a client must not take the server down for everyone.
		const { input, replies } = harness();
		input.emit('data', 'not json at all\n');
		input.emit('data', '{"jsonrpc":"2.0","id":5,"method":"ping"}\n');
		await settle();
		expect(replies()[0]?.error?.code).toBe(-32700);
		expect(replies()[1]?.id).toBe(5);
	});

	it('rejects a payload that is not a JSON-RPC request', async () => {
		const { input, replies } = harness();
		input.emit('data', '{"hello":"world"}\n');
		await settle();
		expect(replies()[0]?.error?.code).toBe(-32700);
	});

	it("refuses a frame led by a byte order mark as not JSON, as the crate's server does", async () => {
		// JavaScript's trim strips the mark; Rust's does not, and serde_json
		// refuses it. The loop trims as Rust trims.
		const { input, replies } = harness();
		input.emit('data', '\uFEFF{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
		input.emit('data', '\u0085 \t\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
		await settle();
		expect(replies().map((r) => r.error?.message ?? r.id)).toEqual([
			'Invalid JSON',
			2,
		]);
	});

	it('ignores blank lines', async () => {
		const { input, replies } = harness();
		input.emit('data', '\n\n{"jsonrpc":"2.0","id":6,"method":"ping"}\n');
		await settle();
		expect(replies()).toHaveLength(1);
	});

	it('writes nothing for a notification', async () => {
		const { input, replies } = harness();
		input.emit(
			'data',
			'{"jsonrpc":"2.0","method":"notifications/initialized"}\n',
		);
		await settle();
		expect(replies()).toHaveLength(0);
	});

	it('refuses a frame over the limit whose newline arrives in the same chunk', async () => {
		// The over-limit check on the leftover buffer never sees a line that
		// arrives whole; the limit is on the line, not on its framing.
		const { input, replies } = harness();
		input.emit(
			'data',
			`${'x'.repeat(MAX_FRAME_BYTES + 1)}\n{"jsonrpc":"2.0","id":8,"method":"ping"}\n`,
		);
		await settle();
		expect(replies().map((r) => r.error?.message ?? r.id)).toEqual([
			`Message exceeds the ${MAX_FRAME_BYTES} byte frame limit`,
			8,
		]);
	});

	it('refuses a frame over the limit and keeps serving', async () => {
		// Input with no newline grew the buffer without bound: 64 MiB of it
		// held the process near a gigabyte and answered nothing. Past the
		// limit the frame is refused with a parse error, the rest of that line
		// is dropped as it arrives, and the next line is served.
		const { input, replies } = harness();
		input.emit('data', 'x'.repeat(MAX_FRAME_BYTES + 1));
		input.emit('data', 'y'.repeat(1000));
		input.emit('data', 'z\n{"jsonrpc":"2.0","id":9,"method":"ping"}\n');
		await settle();
		expect(replies()).toEqual([
			{
				jsonrpc: '2.0',
				id: null,
				error: {
					code: -32700,
					message: `Message exceeds the ${MAX_FRAME_BYTES} byte frame limit`,
				},
			},
			{ jsonrpc: '2.0', id: 9, result: {} },
		]);
	});
});

describe('serve: a client that reads slowly', () => {
	// The pipe to the client fills; `write` answers false. Every reply after
	// that would sit in this process until the client drained the pipe, so
	// the server stops reading until it does: what it holds is bounded by
	// the requests already in flight, not by everything the client sent.
	function slowReader() {
		const input = new PassThrough();
		const written: string[] = [];
		let full = false;
		const output = Object.assign(new EventEmitter(), {
			write: (chunk: string) => {
				written.push(chunk);
				return !full;
			},
		});
		serve({ name: 'urls-le', version: '1.0.0' }, TOOLS, input, output as never);
		return {
			input,
			output,
			written,
			fill: () => {
				full = true;
			},
			drain: () => {
				full = false;
				output.emit('drain');
			},
		};
	}

	const settle = () => new Promise((r) => setTimeout(r, 20));
	const ping = (id: number) => `{"jsonrpc":"2.0","id":${id},"method":"ping"}\n`;

	it('stops reading while the pipe is full and resumes when it drains', async () => {
		const reader = slowReader();
		reader.fill();
		reader.input.write(ping(1));
		await settle();
		expect(reader.written).toHaveLength(1);
		expect(reader.input.isPaused()).toBe(true);

		reader.input.write(ping(2));
		await settle();
		expect(reader.written).toHaveLength(1);

		reader.drain();
		await settle();
		expect(reader.input.isPaused()).toBe(false);
		expect(reader.written).toHaveLength(2);
		expect(JSON.parse(reader.written[1] ?? '').id).toBe(2);
	});

	it('reads on while the pipe accepts every reply', async () => {
		const reader = slowReader();
		reader.input.write(ping(1) + ping(2) + ping(3));
		await settle();
		expect(reader.written).toHaveLength(3);
		expect(reader.input.isPaused()).toBe(false);
	});
});
