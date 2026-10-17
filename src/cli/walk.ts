/**
 * Turning what the caller named into the list of files to examine, as the Rust
 * CLI's `walk.rs` does with ripgrep's `ignore` crate.
 *
 * A file named explicitly is always read, ignore rules included: you asked for
 * it. Hidden entries are passed over unless asked for, links are passed over
 * rather than descended unless `--follow-symlinks`, and the result is sorted
 * the way Rust sorts a `PathBuf`, by component, so a report's lines are in the
 * same order from either binary and do not move between two runs.
 *
 * A path the walk cannot enter is a target carrying its reason, not the end of
 * the run: one locked directory must not delete the report for everything
 * beside it.
 */
import {
	type Dirent,
	readdirSync,
	realpathSync,
	type Stats,
	statSync,
} from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { FALLBACK_FORMAT, resolveFormat } from '../mcp/fileType';
import {
	type DirectoryRules,
	isIgnored,
	type RepositoryRules,
	repositoryRoot,
	repositoryRules,
	rulesFor,
} from './ignoreRules';
import { rustIoMessage } from './ioError';

export interface WalkOptions {
	readonly hidden: boolean;
	readonly respectIgnore: boolean;
	readonly followSymlinks: boolean;
	/** Forces the format for every target instead of inferring it per name. */
	readonly format: string | null;
}

export interface Target {
	readonly path: string;
	readonly languageId: string;
	/** Why the walk could not examine this path, when it could not. */
	readonly unreadable: string | null;
}

interface Ancestor {
	readonly shown: string;
	readonly key: string;
}

interface Walk {
	readonly options: WalkOptions;
	readonly repository: RepositoryRules | null;
	readonly targets: Target[];
}

/** Every target, in a stable order. Throws a message naming a missing input. */
export function collect(
	inputs: readonly string[],
	options: WalkOptions,
): readonly Target[] {
	const targets: Target[] = [];
	for (const input of inputs) {
		targets.push(...targetsUnder(input, options));
	}
	return Object.freeze(sortAndDedupe(targets));
}

/** A name that resolves to nothing gets the whole-document scan. */
function languageFor(path: string): string {
	const name = path.split(sep === '\\' ? /[\\/]/ : '/').at(-1) ?? '';
	return resolveFormat(undefined, name) ?? FALLBACK_FORMAT;
}

function readable(path: string, options: WalkOptions): Target {
	return Object.freeze({
		path,
		languageId: options.format ?? languageFor(path),
		unreadable: null,
	});
}

function unreadable(path: string, reason: string): Target {
	return Object.freeze({
		path,
		languageId: FALLBACK_FORMAT,
		unreadable: reason,
	});
}

function targetsUnder(input: string, options: WalkOptions): readonly Target[] {
	let isFile: boolean;
	try {
		isFile = statSync(input).isFile();
	} catch (error) {
		throw new Error(`${input}: ${rustIoMessage(error)}`);
	}
	if (isFile) return [readable(input, options)];
	return walkDirectory(input, options);
}

function walkDirectory(root: string, options: WalkOptions): readonly Target[] {
	const absolute = resolve(root);
	const repoRoot = options.respectIgnore ? repositoryRoot(absolute) : null;
	const walk: Walk = {
		options,
		repository: repoRoot ? repositoryRules(repoRoot) : null,
		targets: [],
	};
	const ancestors = options.followSymlinks
		? [identity(root, statSync(absolute), absolute)]
		: [];
	visit(walk, root, absolute, parentRules(absolute, options), ancestors);
	return walk.targets;
}

/** The crate's `parents(true)`: ignore files above the walk root count too. */
function parentRules(
	absolute: string,
	options: WalkOptions,
): readonly DirectoryRules[] {
	if (!options.respectIgnore) return [];
	const chain: DirectoryRules[] = [];
	let dir = dirname(absolute);
	while (dir !== dirname(dir)) {
		chain.unshift(rulesFor(dir, repositoryRoot(dir) !== null));
		dir = dirname(dir);
	}
	chain.unshift(rulesFor(dir, repositoryRoot(dir) !== null));
	return chain;
}

function visit(
	walk: Walk,
	shown: string,
	absolute: string,
	inherited: readonly DirectoryRules[],
	ancestors: readonly Ancestor[],
): void {
	let entries: readonly Dirent[];
	try {
		entries = readdirSync(absolute, { withFileTypes: true });
	} catch (error) {
		walk.targets.push(unreadable(shown, ioFailure(shown, error)));
		return;
	}
	const chain = walk.options.respectIgnore
		? [...inherited, rulesFor(absolute, repositoryRoot(absolute) !== null)]
		: inherited;
	for (const entry of entries) {
		visitEntry(
			walk,
			entry,
			joinShown(shown, entry.name),
			`${absolute}${sep}${entry.name}`,
			chain,
			ancestors,
		);
	}
}

function visitEntry(
	walk: Walk,
	entry: Dirent,
	shown: string,
	absolute: string,
	chain: readonly DirectoryRules[],
	ancestors: readonly Ancestor[],
): void {
	// A link is followed before any filter is asked, as walkdir does, so a
	// broken or looping link is reported even where it is hidden or ignored.
	const followed = followedKind(walk, entry, shown, absolute, ancestors);
	if (followed === 'failed') return;
	if (!walk.options.hidden && entry.name.startsWith('.')) return;
	if (followed === null) return;
	const isDir = followed.kind === 'dir';
	if (
		walk.options.respectIgnore &&
		isIgnored(absolute, isDir, chain, walk.repository)
	)
		return;
	if (!isDir) {
		walk.targets.push(readable(shown, walk.options));
		return;
	}
	const below = walk.options.followSymlinks
		? [
				...ancestors,
				identity(shown, followed.stats ?? statSync(absolute), absolute),
			]
		: ancestors;
	visit(walk, shown, absolute, chain, below);
}

type Followed =
	| { readonly kind: 'dir' | 'file'; readonly stats: Stats | null }
	| 'failed'
	| null;

function followedKind(
	walk: Walk,
	entry: Dirent,
	shown: string,
	absolute: string,
	ancestors: readonly Ancestor[],
): Followed {
	if (entry.isDirectory()) return { kind: 'dir', stats: null };
	if (entry.isFile()) return { kind: 'file', stats: null };
	if (!entry.isSymbolicLink() || !walk.options.followSymlinks) return null;

	let stats: Stats;
	try {
		stats = statSync(absolute);
	} catch (error) {
		walk.targets.push(unreadable(shown, ioFailure(shown, error)));
		return 'failed';
	}
	if (stats.isFile()) return { kind: 'file', stats };
	if (!stats.isDirectory()) return null;
	const target = identity(shown, stats, absolute);
	const loop = [...ancestors]
		.reverse()
		.find((ancestor) => ancestor.key === target.key);
	if (loop) {
		walk.targets.push(
			unreadable(
				shown,
				`File system loop found: ${shown} points to an ancestor ${loop.shown}`,
			),
		);
		return 'failed';
	}
	return { kind: 'dir', stats };
}

/** walkdir's wording, inside the `ignore` crate's. */
function ioFailure(shown: string, error: unknown): string {
	return `${shown}: IO error for operation on ${shown}: ${rustIoMessage(error)}`;
}

/**
 * What walkdir compares to find a loop: the device and file number. Windows
 * gives a directory a different `ino` reached directly than reached through
 * a link to it, so a loop went unseen for a level there. Its resolved real
 * path names the directory instead, case-insensitively as the volume does.
 */
function identity(shown: string, stats: Stats, absolute: string): Ancestor {
	const key =
		process.platform === 'win32'
			? realpathSync.native(absolute).toLowerCase()
			: `${stats.dev}:${stats.ino}`;
	return Object.freeze({ shown, key });
}

/** `PathBuf::join`: no separator is added after one that is already there. */
function joinShown(parent: string, name: string): string {
	if (parent.endsWith('/') || parent.endsWith(sep)) return `${parent}${name}`;
	return `${parent}${sep}${name}`;
}

type Component = readonly [rank: number, bytes: Buffer];

/**
 * A path as Rust compares it: by component, where `/` and `.` sort before a
 * name and a name compares by its bytes. Comparing the strings instead would
 * put `a.md` before `a/b.md`, because `.` is below `/` in ASCII.
 */
function components(path: string): readonly Component[] {
	const separators = sep === '\\' ? /[\\/]/ : /\//;
	const parts = path.split(separators);
	const found: Component[] = [];
	if (parts[0] === '' && parts.length > 1) found.push([1, Buffer.alloc(0)]);
	parts.forEach((part, index) => {
		if (!part) return;
		if (part === '.') {
			if (index === 0) found.push([2, Buffer.alloc(0)]);
			return;
		}
		found.push([part === '..' ? 3 : 4, Buffer.from(part)]);
	});
	return found;
}

function compareComponents(
	left: readonly Component[],
	right: readonly Component[],
): number {
	const shared = Math.min(left.length, right.length);
	for (let index = 0; index < shared; index++) {
		const order = compareComponent(
			left[index] as Component,
			right[index] as Component,
		);
		if (order !== 0) return order;
	}
	return left.length - right.length;
}

function compareComponent(left: Component, right: Component): number {
	if (left[0] !== right[0]) return left[0] - right[0];
	return Buffer.compare(left[1], right[1]);
}

/**
 * The crate's stable sort by path, then `Vec::dedup`, which drops a target only
 * when it equals the one before it in every field.
 */
function sortAndDedupe(targets: readonly Target[]): Target[] {
	const keyed = targets.map((target) => ({
		target,
		key: components(target.path),
	}));
	keyed.sort((left, right) => compareComponents(left.key, right.key));
	return keyed
		.filter((item, index) => {
			const previous = keyed[index - 1];
			return (
				!previous ||
				compareComponents(previous.key, item.key) !== 0 ||
				previous.target.languageId !== item.target.languageId ||
				previous.target.unreadable !== item.target.unreadable
			);
		})
		.map((item) => item.target);
}
