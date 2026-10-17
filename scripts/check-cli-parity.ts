/**
 * Requires the npm command line to behave exactly as the Rust one does.
 *
 * Both install a command named `urls-le`, so a person or a CI step cannot tell
 * which one they have. This is a different contract from
 * `check-extraction-parity.ts`, which holds the extension's engine equal to
 * the crate's: here the whole terminal surface is compared, the walk, the
 * positions, the limits, the exit codes, stdout and stderr byte for byte, and
 * every reply `urls-le mcp` writes, byte for byte too.
 *
 * Every case runs both binaries over one generated tree with stdout piped,
 * which is how a script sees them. `--version` is compared too: every surface
 * carries one version, and two binaries of one name disagreeing about it is
 * the first thing a person comparing them would see.
 *
 * Run: bun run build:cli && cargo build --locked --manifest-path crate/Cargo.toml
 *      bun scripts/check-cli-parity.ts
 */
import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmdirSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const RUST =
	process.env.URLS_LE_BIN ??
	join(
		ROOT,
		'crate',
		'target',
		'debug',
		`urls-le${process.platform === 'win32' ? '.exe' : ''}`,
	);
const NODE_CLI = join(ROOT, 'cli', 'cli.js');
/**
 * Node, by name, not `process.execPath`: this script runs under Bun, and the
 * package is run by Node wherever `npx` runs it. Bun's errors are not Node's.
 */
const NODE = process.env.NODE_BIN ?? 'node';

interface Case {
	readonly args: readonly string[];
	readonly stdin?: string | Buffer;
}

interface Outcome {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

for (const [label, path] of [
	['the Rust binary', RUST],
	['cli/cli.js', NODE_CLI],
] as const) {
	if (!existsSync(path)) {
		console.error(`FAIL: ${label} is missing at ${path}. Build it first.`);
		process.exit(1);
	}
}

const tree = mkdtempSync(join(tmpdir(), 'urls-le-cli-parity-'));
const created: string[] = [];
const dirs: string[] = [tree];

function dir(relative: string): void {
	mkdirSync(join(tree, relative));
	dirs.push(join(tree, relative));
}

function file(relative: string, content: string | Buffer): void {
	writeFileSync(join(tree, relative), content);
	created.push(join(tree, relative));
}

function link(relative: string, target: string): void {
	// Windows grants symlinks to administrators and developer mode only, and
	// both binaries then see the same tree without the link.
	try {
		symlinkSync(target, join(tree, relative));
	} catch {
		return;
	}
	created.push(join(tree, relative));
}

const canLock = process.platform !== 'win32' && process.getuid?.() !== 0;

function build(): void {
	dir('repo');
	dir('repo/.git');
	dir('repo/.git/info');
	file('repo/.git/info/exclude', 'excluded.md\n');
	file('repo/.gitignore', 'ignored.md\nbuild/\n*.log\n!keep.log\n');
	file(
		'repo/README.md',
		[
			'# Title',
			'See [docs](https://docs.example.com/guide?a=1&b=2#part) and <https://auto.example/x>.',
			'Inline `https://code.example/skip` and after `x` https://after.example/y.',
			'```',
			'https://fenced.example/skip',
			'```',
			'  ```js',
			'https://fenced.example/indented',
			'  ```',
			'<!-- https://comment.example/kept -->',
			'mailto:someone@example.com mailto:nobody tel:+1-555-0100 tel:',
			'ftp://files.example/a.txt file:///etc/hosts',
			'https://x.example/a. https://y.example/b, (https://z.example/c)',
			'emoji 🎯 then https://emoji.example/after and ünï https://ünï.example/päth',
			'https://a.example https://a.example',
			'',
		].join('\n'),
	);
	file(
		'repo/page.html',
		'<a href="https://html.example/a">x</a>\n<!-- https://html.example/hidden\n-->\n<img src=\'https://html.example/img.png\'>\n<!-- open https://html.example/unterminated\n',
	);
	file(
		'repo/style.css',
		'.a{background:url("https://css.example/a.png")}\n.b{background:url(http://css.example/b.png)}\n',
	);
	file(
		'repo/app.ts',
		"const a = 'https://ts.example/a';\n// https://ts.example/comment\nconst b = `http://ts.example/${x}`;\n",
	);
	file(
		'repo/data.json',
		'{\n  "a": "https:\\/\\/json.example\\/escaped",\n  "b": "https://json.example/q?a=1\\u0026b=2",\n  "https://json.example/key": 1,\n  "c": ["https://json.example/c", "mailto:j@example.com"],\n  "d": "bad \\x escape https://json.example/d\\q"\n}\n',
	);
	file(
		'repo/settings.jsonc',
		'{\n  // "https://jsonc.example/comment"\n  /* "https://jsonc.example/block" */\n  "a": "https://jsonc.example/a"\n}\n',
	);
	file(
		'repo/ci.yml',
		'url: https://yaml.example/a\n# https://yaml.example/comment\nlist:\n  - "https://yaml.example/b"\n',
	);
	file(
		'repo/app.properties',
		'a=https://prop.example/a\n# https://prop.example/hash\n! https://prop.example/bang\n  # https://prop.example/indented\n',
	);
	file(
		'repo/setup.ini',
		'[s]\na = https://ini.example/a\n; https://ini.example/semi\n# https://ini.example/hash\nbare https://ini.example/bare\n',
	);
	file(
		'repo/Cargo.toml',
		'[package]\nhomepage = "https://toml.example/a"\n# https://toml.example/comment\nrepo = "https://toml.example/a"\nesc = "https://toml.example/\\u0041"\nmulti = """\nhttps://toml.example/multi\n"""\n',
	);
	file('repo/bad.toml', 'a = "https://toml.example/broken"\n[b\n');
	file(
		'repo/feed.xml',
		'<feed href="https://xml.example/a"><!-- https://xml.example/c --></feed>\n',
	);
	file('repo/script.py', 'URL = "https://py.example/a"  # https://py.example/b\n');
	file('repo/table.csv', 'name,url\na,https://csv.example/a\n');
	file('repo/.env', 'API=https://env.example/a\n# https://env.example/comment\n');
	file('repo/crlf.md', 'line https://crlf.example/a\r\nnext https://crlf.example/b\r\n');
	file('repo/bom.md', '﻿https://bom.example/a\n');
	file('repo/empty.md', '');
	file('repo/none.md', 'nothing here at all\n');
	file('repo/ünïcode.md', 'https://unicode.example/name\n');
	file('repo/dockerfile', 'FROM x\nRUN curl https://docker.example/install.sh\n');
	file('repo/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a, 0x0a]));
	file('repo/nul.md', Buffer.from('https://nul.example/a\u0000tail\n'));
	file('repo/latin1.md', Buffer.from([0x68, 0x74, 0x74, 0x70, 0xe9, 0x0a]));
	file('repo/ignored.md', 'https://ignored.example/a\n');
	file('repo/excluded.md', 'https://excluded.example/a\n');
	dir('repo/build');
	file('repo/build/out.md', 'https://build.example/a\n');
	file('repo/noise.log', 'https://noise.example/a\n');
	file('repo/keep.log', 'https://keep.example/a\n');
	file('repo/.hidden.md', 'https://hidden.example/a\n');
	dir('repo/.hiddendir');
	file('repo/.hiddendir/in.md', 'https://hiddendir.example/a\n');
	dir('repo/nested');
	file('repo/nested/.gitignore', '!ignored.md\nlocal.md\n');
	file('repo/nested/ignored.md', 'https://nested.example/unignored\n');
	file('repo/nested/local.md', 'https://nested.example/local\n');
	file('repo/nested/.ignore', 'dot-ignored.md\n');
	file('repo/nested/dot-ignored.md', 'https://nested.example/dot\n');
	link('repo/linked-dir', 'nested');
	if (canLock) {
		file('repo/locked.md', 'https://locked.example/a\n');
		chmodSync(join(tree, 'repo', 'locked.md'), 0o000);
	}

	dir('loose');
	file('loose/.gitignore', 'not-a-repo.md\n');
	file('loose/not-a-repo.md', 'https://loose.example/a\n');
	file('loose/a.md', 'https://loose.example/b\n');

	dir('follow');
	dir('follow/real');
	file('follow/real/a.md', 'https://follow.example/a\n');
	link('follow/via', 'real');
	link('follow/file.md', 'real/a.md');

	dir('loop');
	dir('loop/sub');
	file('loop/sub/a.md', 'https://loop.example/a\n');
	link('loop/sub/back', '..');

	dir('dead');
	file('dead/a.md', 'https://dead.example/a\n');
	link('dead/.gone.md', 'nowhere.md');
	link('dead/gone.md', 'nowhere.md');

	dir('limits');
	file(
		'limits/many.txt',
		Array.from({ length: 50_002 }, (_, at) => `https://m.example/${at % 50_001}`).join('\n'),
	);
	file('limits/huge.txt', `https://huge.example/a ${'é'.repeat(5_000_000)}\n`);

	if (canLock) {
		dir('closed');
		dir('closed/shut');
		file('closed/a.md', 'https://closed.example/a\n');
		chmodSync(join(tree, 'closed', 'shut'), 0o000);
	}
}

function cases(): readonly Case[] {
	const repo = join(tree, 'repo');
	const corpus = join(ROOT, 'crate', 'fixtures', 'documents');
	const at = (relative: string): string => join(repo, relative);
	const markdown = 'see https://stdin.example/a and `https://stdin.example/b`\n';
	return [
		{ args: ['--help'] },
		{ args: ['--version'] },
		{ args: ['-V'] },
		{ args: ['-h'] },
		{ args: [] },
		{ args: [repo] },
		{ args: [`${repo}/`] },
		{ args: ['repo'] },
		{ args: ['./repo/nested/'] },
		{ args: [repo, '--dedupe'] },
		{ args: [repo, '--strict'] },
		{ args: [repo, '--hidden'] },
		{ args: [repo, '--no-ignore'] },
		{ args: [repo, '--hidden', '--no-ignore', '--dedupe'] },
		{ args: [repo, '--follow-symlinks'] },
		{ args: [repo, '--format', 'json'] },
		{ args: [repo, '--format', 'YML'] },
		{ args: [repo, '--format', '.md'] },
		{ args: [repo, '--format', 'python'] },
		{ args: [repo, '--format', ' '] },
		{ args: [repo, '--format', ''] },
		{ args: [repo, '--format'] },
		{ args: [at('README.md')] },
		{ args: ['repo/README.md', '--dedupe'] },
		{ args: [at('page.html'), at('style.css'), at('app.ts')] },
		{ args: [at('data.json'), at('settings.jsonc'), at('ci.yml')] },
		{ args: [at('app.properties'), at('setup.ini'), at('.env')] },
		{ args: [at('Cargo.toml'), at('bad.toml'), at('feed.xml')] },
		{ args: [at('script.py'), at('table.csv'), at('dockerfile')] },
		{ args: [at('crlf.md'), at('bom.md'), at('empty.md'), at('none.md')] },
		{ args: [at('none.md')] },
		{ args: [at('ünïcode.md')] },
		{ args: [at('logo.png'), at('nul.md'), at('latin1.md')] },
		{ args: [at('latin1.md'), '--strict'] },
		{ args: [at('ignored.md'), at('.hidden.md')] },
		{ args: [at('README.md'), at('README.md')] },
		{ args: [at('nested'), at('nested/local.md')] },
		{ args: [at('linked-dir')] },
		{ args: [join(tree, 'loose')] },
		{ args: [join(tree, 'follow')] },
		{ args: [join(tree, 'follow'), '--follow-symlinks'] },
		{ args: [join(tree, 'follow', 'file.md')] },
		{ args: [join(tree, 'loop')] },
		{ args: [join(tree, 'loop'), '--follow-symlinks'] },
		{ args: [join(tree, 'loop', 'sub'), '--follow-symlinks'] },
		{ args: [join(tree, 'dead')] },
		{ args: [join(tree, 'dead'), '--follow-symlinks'] },
		{ args: [join(tree, 'dead'), '--follow-symlinks', '--hidden', '--strict'] },
		{ args: [join(tree, 'limits', 'many.txt')] },
		{ args: [join(tree, 'limits', 'huge.txt')] },
		{ args: [join(tree, 'limits', 'huge.txt'), '--strict'] },
		...(canLock
			? [
					{ args: [join(tree, 'closed')] },
					{ args: [join(tree, 'closed'), '--strict'] },
					{ args: [at('locked.md')] },
				]
			: []),
		{ args: [join(tree, 'missing')] },
		{ args: [repo, join(tree, 'missing')] },
		{ args: [repo, '--dedup'] },
		{ args: [repo, '--help'] },
		{ args: [repo, '-'] },
		{ args: [repo, join(tree, 'loose')] },
		{ args: ['--stdin'] },
		{ args: ['--stdin', repo] },
		{ args: ['--stdin', '--format', 'markdown'], stdin: markdown },
		{ args: ['--stdin', '--format', 'md', '--dedupe'], stdin: `${markdown}${markdown}` },
		{ args: ['--stdin', '--format', 'json'], stdin: '{"a": "https://stdin.example/j"}' },
		{ args: ['--stdin', '--format', 'markdown'], stdin: `﻿${markdown}` },
		{ args: ['--stdin', '--format', 'markdown'], stdin: Buffer.from([0x68, 0xff, 0x0a]) },
		{ args: ['--stdin', '--format', 'markdown'], stdin: '' },
		{ args: ['--stdin', '--format', 'toml'], stdin: 'a = "https://stdin.example/t"\n[' },
		{ args: [corpus] },
		{ args: [corpus, '--dedupe', '--no-ignore', '--hidden'] },
		{ args: [join(ROOT, 'src', 'extraction', '__fixtures__')] },
	];
}

function run(command: readonly string[], testCase: Case): Outcome {
	const [program, ...rest] = command as [string, ...string[]];
	const result = spawnSync(program, [...rest, ...testCase.args], {
		input: testCase.stdin ?? '',
		cwd: tree,
		maxBuffer: 256 * 1024 * 1024,
	});
	return {
		status: result.status,
		stdout: result.stdout.toString('utf8'),
		stderr: result.stderr.toString('utf8'),
	};
}

function compareCli(): string[] {
	const failures: string[] = [];
	for (const testCase of cases()) {
		const rust = run([RUST], testCase);
		const node = run([NODE, NODE_CLI], testCase);
		for (const field of ['status', 'stdout', 'stderr'] as const) {
			if (rust[field] === node[field]) continue;
			failures.push(
				`urls-le ${testCase.args.join(' ')}\n  ${field} differs\n` +
					describeDifference(String(rust[field]), String(node[field])),
			);
		}
	}
	return failures;
}

function mcpLines(): readonly string[] {
	const repo = join(tree, 'repo');
	let id = 0;
	const request = (method: string, params?: unknown) =>
		JSON.stringify({
			jsonrpc: '2.0',
			id: ++id,
			method,
			...(params === undefined ? {} : { params }),
		});
	const call = (name: string, args?: unknown) =>
		request('tools/call', args === undefined ? { name } : { name, arguments: args });
	const extract = (args: Record<string, unknown>) => call('extract_urls', args);
	return [
		request('initialize', { protocolVersion: '2024-11-05' }),
		JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
		request('tools/list'),
		request('ping'),
		request('resources/list'),
		request('tools/call'),
		request('tools/call', { arguments: {} }),
		call('no_such_tool', {}),
		JSON.stringify({ jsonrpc: '2.0', id: 'text-id', method: 'ping' }),
		JSON.stringify({ jsonrpc: '2.0', id: null, method: 'ping' }),
		JSON.stringify({ jsonrpc: '2.0', id: { b: 1, a: [2] }, method: 'ping' }),
		JSON.stringify({ id: 77, method: 'ping' }),
		JSON.stringify({ jsonrpc: '2.0', id: 78 }),
		'not json',
		'',
		'   ',
		'[1, 2]',
		`${request('ping')}\r`,
		extract({ content: 'see https://a.example/x?q=1#f and mailto:a@b.c', format: 'md' }),
		extract({ content: '```\nhttps://a.example/fenced\n```\nhttps://a.example/b', format: 'markdown' }),
		extract({ content: '{"a": "https:\\/\\/j.example\\/x", "k": 1}', format: 'json' }),
		extract({ content: '// "https://c.example"\n{"a": "https://c.example/b"}', filename: 'x.jsonc' }),
		extract({ content: 'a = "https://t.example/\\u0041"\n', format: 'toml' }),
		extract({ content: '{"a": "https://j.example/1\n", "b": "https://j.example/2"}', format: 'json' }),
		extract({ content: 'a = "https://t.example/x"\n[', format: 'toml' }),
		extract({ content: '; https://i.example/a\nb = https://i.example/b\n', filename: 'setup.cfg' }),
		extract({ content: 'https://p.example/a', filename: 'app.py' }),
		extract({ content: 'https://p.example/a', format: 'klingon' }),
		extract({ content: 'https://p.example/a', format: '', filename: 'a.md' }),
		extract({ content: 'https://p.example/a', format: '' }),
		extract({ content: '﻿https://bom.example/a', format: '﻿html' }),
		extract({ content: 'https://a.example https://b.example https://a.example', dedupe: true }),
		extract({ content: 'https://a.example https://b.example https://c.example', format: 'md', maxResults: 2 }),
		extract({ content: 'x', format: 'md', maxResults: 0 }),
		extract({ content: 'x', format: 'md', maxResults: -1 }),
		extract({ content: 'x', format: 'md', maxResults: 'two' }),
		extract({ content: 'x', format: 'md', maxResults: null }),
		extract({ content: 'https://a.example', format: 'md', maxResults: 999999 }),
		extract({ content: 7 }),
		extract({ content: 'https://a.example' }),
		extract({}),
		call('extract_urls'),
		call('urls_le_scan', { path: repo }),
		call('urls_le_scan', { paths: [repo, join(tree, 'loose')], dedupe: true }),
		call('urls_le_scan', { path: repo, hidden: true, ignored: true }),
		call('urls_le_scan', { path: join(repo, 'README.md'), hidden: 'yes' }),
		call('urls_le_scan', { path: join(tree, 'dead') }),
		call('urls_le_scan', { paths: [] }),
		call('urls_le_scan', { paths: [3] }),
		call('urls_le_scan', { path: 3, paths: [join(repo, 'none.md')] }),
		call('urls_le_scan', {}),
		call('urls_le_scan', { path: join(tree, 'missing') }),
		...(canLock ? [call('urls_le_scan', { path: join(tree, 'closed') })] : []),
	];
}

function serve(command: readonly string[], input: string | Buffer): Outcome {
	const [program, ...rest] = command as [string, ...string[]];
	const result = spawnSync(program, [...rest, 'mcp'], { input, cwd: tree });
	return {
		status: result.status,
		stdout: result.stdout.toString('utf8'),
		stderr: result.stderr.toString('utf8'),
	};
}

function compareMcp(): string[] {
	const failures: string[] = [];
	const lines = mcpLines();
	const sessions: readonly (readonly [string, string | Buffer])[] = [
		['the whole session', `${lines.join('\n')}\n`],
		['a last line with no newline', lines[3] as string],
		[
			'a line that is not UTF-8',
			Buffer.concat([
				Buffer.from(`${lines[3]}\n`),
				Buffer.from([0x7b, 0xff, 0x7d, 0x0a]),
				Buffer.from(`${lines[3]}\n`),
			]),
		],
	];
	for (const [label, input] of sessions) {
		const rust = serve([RUST], input);
		const node = serve([NODE, NODE_CLI], input);
		for (const field of ['status', 'stdout', 'stderr'] as const) {
			if (rust[field] === node[field]) continue;
			failures.push(
				`urls-le mcp, ${label}\n  ${field} differs\n` +
					describeDifference(String(rust[field]), String(node[field])),
			);
		}
	}
	return failures;
}

/** The first differing line, which is the one worth reading in a long output. */
function describeDifference(rust: string, node: string): string {
	const left = rust.split('\n');
	const right = node.split('\n');
	const index = left.findIndex((line, at) => line !== right[at]);
	const at = index === -1 ? left.length : index;
	const clip = (line: string | undefined) =>
		line === undefined || line.length <= 2000 ? line : `${line.slice(0, 2000)}…`;
	return `  line ${at + 1}\n  rust: ${clip(left[at])}\n  node: ${clip(right[at])}`;
}

function cleanUp(): void {
	const unlock: readonly (readonly [string, number])[] = [
		[join(tree, 'repo', 'locked.md'), 0o600],
		[join(tree, 'closed', 'shut'), 0o700],
	];
	for (const [path, mode] of unlock) if (existsSync(path)) chmodSync(path, mode);
	for (const path of created) unlinkSync(path);
	for (const path of [...dirs].reverse()) rmdirSync(path);
}

build();
let failures: string[];
try {
	failures = [...compareCli(), ...compareMcp()];
} finally {
	cleanUp();
}

if (failures.length > 0) {
	console.error(failures.join('\n\n'));
	console.error(`\nFAIL: ${failures.length} difference(s) between the npm and Rust CLIs`);
	process.exit(1);
}
console.log(
	`OK: the npm CLI matches the Rust CLI on ${cases().length} commands and ${mcpLines().length} MCP lines`,
);
