import type { ExtractionResult } from '../types';

/**
 * The one result shape every tool returns.
 *
 * The engines across the family disagree — some async, some sync, six different
 * result envelopes. Normalising here rather than in the engines keeps the
 * characterization goldens untouched and the extension's behaviour unchanged.
 */
export interface ToolEnvelope<T> {
	readonly ok: boolean;
	readonly data: T;
	readonly diagnostics: readonly Diagnostic[];
	readonly meta: EnvelopeMeta;
}

export interface Diagnostic {
	readonly severity: 'warning' | 'error';
	readonly code: string;
	readonly message: string;
}

export interface EnvelopeMeta {
	readonly tool: string;
	readonly count: number;
	readonly truncated: boolean;
}

/**
 * Result caps, in units of "what fits in a context window".
 *
 * These are not performance limits — the engine handles 50,000 URLs in under a
 * tenth of a second. They exist because the consumer is a language model with
 * a finite context, and an unbounded result is the difference between a useful
 * answer and a conversation that dies mid-sentence. 500 rows is roughly a few
 * thousand tokens; the 5,000 ceiling is the point past which no realistic
 * context survives the response.
 *
 * The default is a starting point rather than a policy: a caller who has read
 * `meta.truncated` and genuinely wants more can ask for it, up to the ceiling.
 */
export const DEFAULT_MAX_RESULTS = 500;
export const MAX_MAX_RESULTS = 5000;

/** JSON-RPC's code for params that do not fit the method's schema. */
export const INVALID_PARAMS = -32602;

/**
 * An argument that does not fit the tool's schema is a protocol error,
 * `-32602`, not a tool result carrying `isError`: a host counts the first
 * against the server and shows the second to the agent, and the schema is
 * what the agent read before sending. The transport reads the code off the
 * thrown value and answers with it. Every server this repository ships
 * refuses in these words.
 */
export function invalidParams(message: string): Error & { code: number } {
	return Object.assign(new Error(message), { code: INVALID_PARAMS });
}

/**
 * Refuse an argument the schema does not declare. `additionalProperties:
 * false` is in the schema; this is what makes it true.
 */
export function refuseUnknown(
	args: Record<string, unknown>,
	known: readonly string[],
): void {
	const unknown = Object.keys(args)
		.filter((key) => !known.includes(key))
		.sort();
	if (unknown.length === 1) {
		throw invalidParams(`unknown argument: ${unknown[0]}`);
	}
	if (unknown.length > 1) {
		throw invalidParams(`unknown arguments: ${unknown.join(', ')}`);
	}
}

/** Read an optional argument that must be a string when present. */
export function readOptionalString(
	args: Record<string, unknown>,
	name: string,
): string | undefined {
	const value = args[name];
	if (value === undefined) return undefined;
	if (typeof value !== 'string')
		throw invalidParams(`${name} must be a string`);
	return value;
}

/** Read an optional argument that must be a boolean when present. */
export function readOptionalBoolean(
	args: Record<string, unknown>,
	name: string,
): boolean | undefined {
	const value = args[name];
	if (value === undefined) return undefined;
	if (typeof value !== 'boolean') {
		throw invalidParams(`${name} must be a boolean`);
	}
	return value;
}

/**
 * `ok` is not `success`.
 *
 * `extractUrls` returns `success: false` with zero errors for an empty or
 * cancelled run — a true result, not a failure. Reporting that as an error
 * would have a model announce a problem that did not happen, so `ok` is driven
 * by whether any diagnostic is actually an error.
 */
export function isOk(diagnostics: readonly Diagnostic[]): boolean {
	return !diagnostics.some((d) => d.severity === 'error');
}

export function toDiagnostics(result: ExtractionResult): readonly Diagnostic[] {
	return result.errors.map((e) => ({
		severity: e.severity,
		code: e.category,
		message: e.message,
	}));
}

/**
 * Apply the result cap, reporting honestly whether anything was dropped.
 *
 * The `truncated` flag matters more than the cap. Silently returning the first
 * 500 of 900 matches produces an answer that is wrong in the most expensive
 * way: confidently incomplete, with nothing to indicate it. A model told the
 * result was truncated can narrow its input or raise the cap; one that is not
 * told will state a count that is simply false.
 */
export function capped<T>(
	items: readonly T[],
	maxResults: number,
): { readonly items: readonly T[]; readonly truncated: boolean } {
	if (items.length <= maxResults) {
		return { items, truncated: false };
	}
	return { items: items.slice(0, maxResults), truncated: true };
}

export function envelope<T>(
	tool: string,
	data: T,
	count: number,
	diagnostics: readonly Diagnostic[],
	truncated: boolean,
): ToolEnvelope<T> {
	return {
		ok: isOk(diagnostics),
		data,
		diagnostics,
		meta: { tool, count, truncated },
	};
}

/**
 * Read a bounded integer argument, rejecting values a tool cannot honour.
 *
 * Note the asymmetry: a nonsensical value (zero, negative, fractional, a
 * string) throws, while a merely excessive one is clamped. The first is a bug
 * in the caller that it needs to hear about; the second is a caller asking for
 * everything, which is reasonable, and refusing it would be pedantry that costs
 * a round trip. Clamp quietly, reject loudly.
 */
export function readMaxResults(args: Record<string, unknown>): number {
	const raw = args.maxResults;
	if (raw === undefined) return DEFAULT_MAX_RESULTS;
	// A whole number, however it was written: JSON Schema's `integer` is any
	// number with a zero fractional part, so `2.0`, `1e3` and `1E20` are
	// caps. The crate's server and the npm command line read the same rule.
	if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
		throw invalidParams('maxResults must be a positive integer');
	}
	return Math.min(raw, MAX_MAX_RESULTS);
}

/**
 * Read a required string argument with a message naming the argument.
 *
 * The message names the argument because the caller is a model choosing what to
 * send next. "content is required and must be a string" is actionable;
 * "invalid arguments" costs an entire retry to learn nothing.
 */
export function readString(
	args: Record<string, unknown>,
	name: string,
): string {
	const value = args[name];
	if (typeof value !== 'string') {
		throw invalidParams(`${name} is required and must be a string`);
	}
	return value;
}

/**
 * Keys in the order of their UTF-8 bytes, nested objects included, which is
 * how the crate's `serde_json::Value` without `preserve_order` writes them.
 * `extract_urls` belongs to both servers, so its text is the same bytes from
 * either one.
 */
export function sortedKeys<T>(value: T): T {
	if (Array.isArray(value)) return value.map(sortedKeys) as T;
	if (typeof value !== 'object' || value === null) return value;
	const entries = Object.entries(value).sort(([left], [right]) =>
		Buffer.compare(Buffer.from(left), Buffer.from(right)),
	);
	return Object.fromEntries(
		entries.map(([key, item]) => [key, sortedKeys(item)]),
	) as T;
}
