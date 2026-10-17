/**
 * The command line, parsed as the Rust CLI parses it: strictly, in order, and
 * refusing rather than defaulting. A typo'd `--dedup` that quietly did nothing
 * would produce a report the caller believed was deduplicated.
 */
import { resolveFormat } from '../mcp/fileType';
import type { ScanOptions } from './scan';
import { FLAGS } from './usage';
import type { WalkOptions } from './walk';

export interface Cli {
	readonly inputs: readonly string[];
	readonly stdin: boolean;
	readonly strict: boolean;
	/** The forced format. An unrecognised name is the whole-document scan. */
	readonly format: string | null;
	readonly scan: ScanOptions;
	readonly walk: WalkOptions;
}

type Draft = { -readonly [K in keyof Cli]: Cli[K] };

export function parse(args: readonly string[]): Cli {
	const draft: Draft = {
		inputs: [],
		stdin: false,
		strict: false,
		format: null,
		scan: { dedupe: false },
		walk: {
			hidden: false,
			respectIgnore: true,
			followSymlinks: false,
			format: null,
		},
	};

	for (let index = 0; index < args.length; index++) {
		const arg = args[index] as string;
		if (arg.startsWith('-') && !FLAGS.includes(arg)) {
			throw new Error(`${arg} is not an option. Try --help.`);
		}
		const value = arg === '--format' ? args[++index] : undefined;
		apply(draft, arg, value);
	}

	if (draft.stdin && draft.inputs.length > 0) {
		throw new Error('reading from stdin takes no file arguments');
	}
	if (!draft.stdin && draft.inputs.length === 0) {
		throw new Error('name a file or a directory to scan. Try --help.');
	}
	return Object.freeze(draft);
}

const SWITCHES: Readonly<Record<string, (draft: Draft) => void>> =
	Object.freeze({
		'--dedupe': (draft) => {
			draft.scan = { dedupe: true };
		},
		'--stdin': (draft) => {
			draft.stdin = true;
		},
		'--strict': (draft) => {
			draft.strict = true;
		},
		'--hidden': (draft) => {
			draft.walk = { ...draft.walk, hidden: true };
		},
		'--no-ignore': (draft) => {
			draft.walk = { ...draft.walk, respectIgnore: false };
		},
		'--follow-symlinks': (draft) => {
			draft.walk = { ...draft.walk, followSymlinks: true };
		},
	});

function apply(draft: Draft, arg: string, value: string | undefined): void {
	const toggle = SWITCHES[arg];
	if (toggle) {
		toggle(draft);
		return;
	}
	if (arg === '--format') {
		// An empty name is no name, so it is refused like a missing one.
		const resolved =
			value === undefined ? null : resolveFormat(value, undefined);
		if (resolved === null) throw new Error('--format needs a format');
		draft.format = resolved;
		draft.walk = { ...draft.walk, format: resolved };
		return;
	}
	draft.inputs = [...draft.inputs, arg];
}
