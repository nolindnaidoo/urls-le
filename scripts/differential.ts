/**
 * Generative differential test for the **shared** `extract_urls` tool.
 *
 * One tool name, one schema, two servers. An agent asking for
 * `extract_urls` must get the same answer whichever server it happens to
 * reach, so this generates documents and argument shapes and requires
 * both to answer identically.
 *
 * **Scope is the shared tool, deliberately.** The CLI is terminal-first —
 * a tree walk, exit codes, JSON Lines, `--strict` — and the extension is
 * IDE-first, one open buffer read by a person. Those surfaces are meant
 * to differ, and holding them equal would be inventing a contract nobody
 * wants. What may not differ is the tool both of them offer under the
 * same name.
 *
 * It covers **format resolution as well as extraction**, because that is
 * where this release found the divergences the alias contract could not
 * see: a dotfile resolved by whole name on one side and not the other,
 * and an alias lookup that read an inherited property, so `a.toString`
 * came back as a function that passed every truthiness check downstream.
 * Neither is visible in a table of names; both are visible the moment a
 * filename is fed to both servers.
 *
 * `crate/fixtures/` pins the cases somebody thought of. This generates
 * the ones nobody did.
 *
 * Run:
 *   bun scripts/differential.ts                 # default seed and count
 *   DIFFERENTIAL_SEED=7 bun scripts/differential.ts --cases 2000
 *   URLS_LE_BIN=crate/target/release/urls-le bun scripts/differential.ts
 *
 * The seed is printed on every run, pass or fail: a red build that does
 * not say which seed produced it is a red build somebody reruns rather
 * than reads.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { TOOLS } from '../src/mcp/tools';

const ROOT = join(import.meta.dir, '..');

function argument(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

const SEED = Number(
	argument('--seed') ?? process.env.DIFFERENTIAL_SEED ?? '20260812',
);
const CASES = Number(
	argument('--cases') ?? process.env.DIFFERENTIAL_CASES ?? '750',
);
const BINARY =
	process.env.URLS_LE_BIN ?? join(ROOT, 'crate', 'target', 'release', 'urls-le');

/**
 * A named, seeded generator. Not `Math.random`: a failure nobody can
 * reproduce is a failure nobody fixes.
 */
function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const random = mulberry32(SEED);
function pick<T>(items: readonly T[]): T {
	return items[Math.floor(random() * items.length)] as T;
}
function between(low: number, high: number): number {
	return low + Math.floor(random() * (high - low + 1));
}

/**
 * Values the scanner should find, chosen for the parts most likely to
 * drift: the delimiter set, the well-formedness rules for `mailto:` and
 * `tel:`, and the WHATWG parse behind `domain` and `path` — two different
 * implementations of the same standard.
 */
const VALUES: readonly string[] = [
	'https://example.com/guide',
	'http://example.com',
	'https://example.com:8443/a/b?q=1&r=2#frag',
	'https://user:pw@example.com/private',
	'https://example.com/a.',
	'https://example.com/trailing,',
	'https://münchen.example/straße',
	'https://xn--mnchen-3ya.example/a',
	'https://[2001:db8::1]/ipv6',
	'https://127.0.0.1:3000/local',
	'https://example.com/%20encoded%2Fpath',
	'ftp://files.example.com/pub/readme.txt',
	'file:///etc/hosts',
	'file://server/share/doc.txt',
	'mailto:someone@example.com',
	'mailto:nobody',
	'mailto:',
	'tel:+15551234567',
	'tel:1',
	'tel:',
	'https://example.com/(parens)',
	"https://example.com/it's",
	'https://example.com/a|b',
	'https://example.com/../up',
	'HTTPS://EXAMPLE.COM/SHOUTED',
	'not-a-url-at-all',
];

/** Where in a document the value sits, per format. */
type Fragment = (value: string, index: number) => string;

/**
 * Characters JavaScript and Rust disagree about.
 *
 * `String.prototype.trim` and JavaScript's `\s` include U+FEFF, which
 * Unicode's `White_Space` property does not, and exclude U+0085, which it
 * does. Every trim and every delimiter class in the crate had to be
 * spelled out against JavaScript's set for that reason, and this is what
 * keeps it that way: the same function has now produced three separate
 * shared-tool bugs, so it gets generated coverage rather than another
 * hand-written case.
 */
const ODD_SPACE: readonly string[] = [
	'\u{feff}', // whitespace to JavaScript, not to Rust
	'\u{85}', // whitespace to Rust, not to JavaScript
	'\u{a0}',
	'\u{2028}',
	'\u{3000}',
	'\u{b}',
	' ',
	'',
];

const COMMON: readonly Fragment[] = [
	(v) => `bare ${v} in a sentence`,
	(v) => `"${v}"`,
	(v) => `'${v}'`,
	(v) => `<${v}>`,
	(v) => `(${v})`,
	(v) => `[${v}]`,
	(v) => `\`${v}\``,
	(v) => `{${v}}`,
	(v) => `${v};`,
	(v) => `${v}`,
	(v) => `\t${v}`,
	(v) => `mid ${v} line ${v} twice`,
	(v) => `\u{1f3af} ${v}`,
	(v) => `naïve ${v}`,
	// The whitespace the two languages disagree about: leading it moves
	// a comment or a fence marker, and embedding it decides whether the
	// URL ends there.
	(v) => `${pick(ODD_SPACE)}${v}`,
	(v) => `${v}${pick(ODD_SPACE)}TAIL`,
	(v) => `${pick(ODD_SPACE)}# ${v}`,
	(v) => `${pick(ODD_SPACE)}; ${v}`,
	(v) => `${pick(ODD_SPACE)}! ${v}`,
	(v) => `${pick(ODD_SPACE)}\`\`\`\n${v}\n\`\`\``,
	(v) => `  ${v}  ${pick(ODD_SPACE)}`,
];

const BY_FORMAT: Readonly<Record<string, readonly Fragment[]>> = {
	markdown: [
		(v, i) => `[link ${i}](${v})`,
		(v) => `<${v}>`,
		(v) => `\`${v}\``,
		(v) => `\`\`\`\n${v}\n\`\`\``,
		(v) => `\`\`\`js\nconst a = "${v}";\n\`\`\``,
		(v, i) => `- item ${i}: ${v}`,
		(v) => `> quoted ${v}`,
		(v, i) => `| ${i} | ${v} |`,
		(v) => `![img](${v})`,
	],
	html: [
		(v) => `<a href="${v}">x</a>`,
		(v) => `<img src='${v}'/>`,
		(v) => `<!-- ${v} -->`,
		(v) => `<!--\n${v}\n-->`,
		(v) => `<!-- unterminated ${v}`,
		(v) => `<script>const a = "${v}";</script>`,
		(v) => `<p>${v}</p>`,
		(v) => `<link rel=stylesheet href=${v}>`,
	],
	css: [
		(v) => `.a { background: url(${v}); }`,
		(v) => `.b { background: url("${v}"); }`,
		(v) => `@import "${v}";`,
		(v) => `/* ${v} */`,
	],
	javascript: [
		(v, i) => `const a${i} = "${v}";`,
		(v) => `// ${v}`,
		(v) => `/* ${v} */`,
		(v) => `fetch(\`${v}\`);`,
	],
	typescript: [
		(v, i) => `const a${i}: string = "${v}";`,
		(v) => `// ${v}`,
		(v) => `type T = \`${v}\`;`,
	],
	json: [
		(v, i) => `  "key${i}": "${v}",`,
		(v, i) => `  "${v}": "value${i}",`,
		(v) => `  // ${v}`,
		(v) => `  // "${v}"`,
		(v, i) => `  "escaped${i}": "https:\\/\\/escaped.example",  "plain${i}": "${v}",`,
		(v, i) => `  "list${i}": ["${v}", "${v}"],`,
	],
	yaml: [
		(v, i) => `key${i}: ${v}`,
		(v, i) => `quoted${i}: "${v}"`,
		(v) => `# ${v}`,
		(v) => `  - ${v}`,
	],
	properties: [
		(v, i) => `key${i}=${v}`,
		(v, i) => `key${i} = ${v}`,
		(v) => `# ${v}`,
		(v) => `! ${v}`,
		(v, i) => `wrapped${i}=first \\\n  ${v}`,
	],
	toml: [
		(v, i) => `key${i} = "${v}"`,
		(v, i) => `list${i} = ["${v}", "${v}"]`,
		(v) => `# ${v}`,
		(v, i) => `[table${i}]\nnested = "${v}"`,
	],
	ini: [
		(v, i) => `key${i}=${v}`,
		(v, i) => `key${i} = ${v}`,
		(v) => `; ${v}`,
		(v) => `# ${v}`,
		(v, i) => `[section${i}]\nnested=${v}`,
	],
	xml: [
		(v, i) => `<link id="${i}" href="${v}"/>`,
		(v) => `<url>${v}</url>`,
		(v) => `<!-- ${v} -->`,
		(v) => `<![CDATA[${v}]]>`,
	],
	csv: [(v, i) => `${i},${v},trailing`, (v) => `"a","${v}"`],
	plaintext: COMMON,
};

/**
 * The document a case sends. TOML and INI fragments are wrapped so the
 * result parses: both sides parse first and locate afterwards, and a
 * document that fails to parse exercises the fallback instead — which is
 * a case worth having, but on purpose rather than by accident.
 */
function document(format: string): string {
	const fragments = [...COMMON, ...(BY_FORMAT[format] ?? COMMON)];
	const lines: string[] = [];
	if (format === 'json') lines.push('{');
	if (format === 'toml' || format === 'ini') lines.push(`[root]`);
	const count = between(1, 6);
	for (let i = 0; i < count; i++) {
		lines.push(pick(fragments)(pick(VALUES), i));
	}
	if (format === 'json') lines.push('  "last": "https://example.com/last"', '}');
	// A document ending without a newline is its own case: the last line
	// is where an off-by-one in a position index shows up.
	return random() < 0.2 ? lines.join('\n') : `${lines.join('\n')}\n`;
}

/**
 * Filenames whose resolution is worth asking about — including the two
 * shapes that produced real divergences this release.
 */
const FILENAMES: readonly string[] = [
	'README.md',
	'readme.MD',
	'a/b/c/notes.mdx',
	'index.html',
	'styles.scss',
	'app.tsx',
	'tsconfig.jsonc',
	'docker-compose.yml',
	'Cargo.toml',
	'setup.cfg',
	'pom.xml',
	'icon.svg',
	'data.tsv',
	'notes.txt',
	'server.log',
	// Whole-name resolution: no extension at all, so only the first
	// lookup can answer.
	'.env',
	'.ENV',
	'pom',
	'Makefile',
	'LICENSE',
	'.gitignore',
	// Inherited properties. An unguarded lookup hands back a function
	// here, and every truthiness check downstream accepts it.
	'toString',
	'constructor',
	'__proto__',
	'valueOf',
	'hasOwnProperty',
	'a.toString',
	'a.constructor',
	'a.__proto__',
	// Extensions with no format-aware extractor: read whole, never
	// refused.
	'script.py',
	'main.go',
	'run.sh',
	'query.sql',
	'archive.tar.gz',
	'weird.',
	'.',
	'',
];

const FORMAT_NAMES: readonly string[] = [
	...new Set(Object.values(BY_FORMAT).flatMap(() => [])),
	'markdown',
	'md',
	'.MD',
	'  yaml  ',
	'yml',
	'html',
	'htm',
	'css',
	'less',
	'javascript',
	'js',
	'typescript',
	'ts',
	'json',
	'jsonc',
	'properties',
	'env',
	'toml',
	'ini',
	'conf',
	'xml',
	'svg',
	'csv',
	'plaintext',
	'txt',
	// Not in the table: resolves to the whole-document scan rather than
	// being refused.
	'shellscript',
	'python',
	'klingon',
	'',
	'toString',
	'constructor',
	'__proto__',
];

/** Which format's fragments a case should be built from. */
const DOCUMENT_FORMATS: readonly string[] = [
	'markdown',
	'html',
	'css',
	'javascript',
	'typescript',
	'json',
	'yaml',
	'properties',
	'toml',
	'ini',
	'xml',
	'csv',
	'plaintext',
];

/**
 * A name with whitespace around it, sometimes the kind the two languages
 * disagree about. Both sides trim before looking a name up, and whose
 * definition of "whitespace" they trim by decides the answer.
 */
function padded(name: string): string {
	if (name === '' || random() < 0.6) return name;
	return `${pick(ODD_SPACE)}${name}${pick(ODD_SPACE)}`;
}

interface Case {
	readonly index: number;
	readonly shape: string;
	readonly args: Record<string, unknown>;
}

function buildCases(): Case[] {
	const cases: Case[] = [];
	for (let index = 0; index < CASES; index++) {
		const documentFormat = pick(DOCUMENT_FORMATS);
		const content = document(documentFormat);
		const args: Record<string, unknown> = { content };
		// Four ways a caller names the format, including naming neither,
		// which is the one refusal this tool still has.
		const shape = pick(['format', 'filename', 'both', 'neither']);
		if (shape === 'format' || shape === 'both')
			args.format = padded(pick(FORMAT_NAMES));
		if (shape === 'filename' || shape === 'both')
			args.filename = padded(pick(FILENAMES));
		if (random() < 0.25) args.dedupe = true;
		if (random() < 0.15) args.maxResults = between(1, 4);
		cases.push({ index, shape, args });
	}
	return cases;
}

/** Key order is not the contract; the values are. */
function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>).sort(
			([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
		);
		return Object.fromEntries(entries.map(([k, v]) => [k, canonical(v)]));
	}
	return value;
}

function show(value: unknown): string {
	return JSON.stringify(canonical(value));
}

type Answer = { ok: unknown } | { error: string };

async function fromExtension(cases: readonly Case[]): Promise<Answer[]> {
	const tool = TOOLS.find((candidate) => candidate.name === 'extract_urls');
	if (!tool) throw new Error('the extension no longer offers extract_urls');
	const answers: Answer[] = [];
	for (const testCase of cases) {
		try {
			answers.push({
				ok: JSON.parse(JSON.stringify(await tool.handler(testCase.args))),
			});
		} catch (error) {
			answers.push({
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return answers;
}

async function fromCrate(cases: readonly Case[]): Promise<Answer[]> {
	if (!existsSync(BINARY)) {
		throw new Error(
			`no binary at ${BINARY} — build it first, or set URLS_LE_BIN`,
		);
	}
	const request = (testCase: Case) =>
		`${JSON.stringify({
			jsonrpc: '2.0',
			id: testCase.index + 1,
			method: 'tools/call',
			params: { name: 'extract_urls', arguments: testCase.args },
		})}\n`;

	const child = Bun.spawn([BINARY, 'mcp'], {
		stdin: 'pipe',
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const writer = child.stdin;
	for (const testCase of cases) writer.write(request(testCase));
	await writer.end();
	const stdout = await new Response(child.stdout).text();
	const stderr = await new Response(child.stderr).text();
	await child.exited;

	const byId = new Map<number, Answer>();
	for (const line of stdout.split('\n')) {
		if (line.trim() === '') continue;
		const response = JSON.parse(line) as {
			id: number;
			result?: {
				isError?: boolean;
				structuredContent?: unknown;
				content?: Array<{ text?: string }>;
			};
			error?: { message?: string };
		};
		if (response.error) {
			byId.set(response.id, { error: response.error.message ?? 'protocol error' });
			continue;
		}
		const result = response.result;
		if (result?.isError) {
			byId.set(response.id, { error: result.content?.[0]?.text ?? '' });
			continue;
		}
		byId.set(response.id, { ok: result?.structuredContent });
	}

	return cases.map((testCase) => {
		const answer = byId.get(testCase.index + 1);
		if (!answer) {
			throw new Error(
				`the crate server never answered case ${testCase.index}\nstderr: ${stderr}`,
			);
		}
		return answer;
	});
}

const cases = buildCases();
console.log(
	`differential: seed ${SEED}, ${cases.length} cases, binary ${BINARY}`,
);

const [extension, crate] = await Promise.all([
	fromExtension(cases),
	fromCrate(cases),
]);

const failures: string[] = [];
for (const testCase of cases) {
	const mine = show(extension[testCase.index]);
	const theirs = show(crate[testCase.index]);
	if (mine === theirs) continue;
	failures.push(
		[
			`case ${testCase.index} (seed ${SEED}, shape ${testCase.shape})`,
			`  arguments:  ${JSON.stringify(testCase.args)}`,
			`  extension:  ${mine}`,
			`  crate:      ${theirs}`,
		].join('\n'),
	);
	if (failures.length >= 10) break;
}

if (failures.length > 0) {
	console.error(
		`\nThe two servers disagree about the SHARED extract_urls tool (${failures.length} shown).\n` +
			'This is one tool with one schema. A difference here is a bug in one\n' +
			'of the two servers, not a difference of surface — the CLI walking a\n' +
			'tree and the extension reading a buffer are allowed to differ, and\n' +
			'nothing in this file compares those.\n' +
			`Reproduce with: DIFFERENTIAL_SEED=${SEED} bun scripts/differential.ts --cases ${CASES}\n`,
	);
	for (const failure of failures) console.error(`${failure}\n`);
	process.exit(1);
}

const shapes = new Map<string, number>();
for (const testCase of cases)
	shapes.set(testCase.shape, (shapes.get(testCase.shape) ?? 0) + 1);
console.log(
	`OK: ${cases.length} generated documents, both servers identical. ` +
		`Shapes: ${[...shapes].map(([k, v]) => `${k}=${v}`).join(' ')}`,
);
