import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmdirSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from './args';
import { serve } from './mcp';
import { run } from './run';
import {
	exitCode,
	extract,
	type FileReport,
	describe as line,
	scanContent,
} from './scan';
import { FLAGS, USAGE } from './usage';
import { collect, type WalkOptions } from './walk';

const WALK: WalkOptions = {
	hidden: false,
	respectIgnore: false,
	followSymlinks: false,
	format: null,
};
const SCAN = { dedupe: false };

describe('usage', () => {
	it('names every flag the parser accepts, and no other', () => {
		const named = new Set(
			USAGE.split(/\s+/)
				.filter((word) => word.startsWith('--'))
				.map((word) => word.replace(/[,.:;]+$/, ''))
				.filter((word) => word !== '--version' && word !== '--help'),
		);
		expect([...named].sort()).toEqual([...FLAGS].sort());
	});

	it('offers no judgment about a URL', () => {
		for (const word of ['insecure', 'credential', 'scored as'])
			expect(USAGE).not.toContain(word);
		for (const flag of ['--check', '--insecure', '--fail-on', '--score'])
			expect(() => parse([flag, 'x'])).toThrow('is not an option');
	});
});

describe('parse', () => {
	it('scans the whole document for a format it does not name', () => {
		expect(parse(['--format', 'python', 'x']).format).toBe('plaintext');
		expect(parse(['--format', '.YML', 'x']).format).toBe('yaml');
	});

	it('refuses a missing or empty format, naming nothing, and stdin with files', () => {
		expect(() => parse(['--format'])).toThrow('--format needs a format');
		expect(() => parse(['--format', '', 'x'])).toThrow(
			'--format needs a format',
		);
		expect(() => parse([])).toThrow('name a file or a directory to scan');
		expect(() => parse(['--stdin', 'x'])).toThrow('takes no file arguments');
	});
});

describe('scanContent', () => {
	it('writes a report in the crate field order, nulls included', async () => {
		const report = await scanContent(
			'see mailto:a@b.c and https://a.example/x?q=1',
			'a.md',
			'markdown',
			SCAN,
		);
		expect(JSON.stringify(report)).toBe(
			'{"file":"a.md","format":"markdown","urls":[' +
				'{"value":"mailto:a@b.c","protocol":"mailto","domain":null,"path":"a@b.c","line":1,"column":5,"context":"see mailto:a@b.c and https://a.example/x?q=1"},' +
				'{"value":"https://a.example/x?q=1","protocol":"https","domain":"a.example","path":"/x?q=1","line":1,"column":22,"context":"see mailto:a@b.c and https://a.example/x?q=1"}' +
				'],"diagnostics":[],"summary":{"urls":2}}',
		);
	});

	it('drops the position and context of a URL a parser resolved', async () => {
		const report = await scanContent(
			'a = "https://t.example/\\u0041"\n',
			'a.toml',
			'toml',
			SCAN,
		);
		expect(report.urls).toEqual([
			{
				value: 'https://t.example/A',
				protocol: 'https',
				domain: 't.example',
				path: '/A',
				context: null,
			},
		]);
		expect(line(report, report.urls[0] as never)).toBe(
			'a.toml:-:-  https://t.example/A',
		);
	});

	it('keeps the first occurrence of each URL under dedupe', async () => {
		const report = await scanContent(
			'https://a.example\nhttps://b.example\nhttps://a.example\n',
			'x',
			'markdown',
			{ dedupe: true },
		);
		expect(report.urls.map((url) => [url.value, url.line])).toEqual([
			['https://a.example', 1],
			['https://b.example', 2],
		]);
	});
});

describe('extract', () => {
	it('measures the size ceiling in UTF-8 bytes and refuses past it', async () => {
		const result = await extract(`x ${'é'.repeat(5_000_000)}`, 'markdown');
		expect(result.urls).toEqual([]);
		expect(result.fileType).toBe('unknown');
		expect(result.diagnostics).toEqual([
			{
				severity: 'error',
				code: 'format',
				message:
					'Content too large (10000002 characters), maximum size is 10MB',
			},
		]);
	});

	it('names the URL ceiling in the crate words', async () => {
		const content = Array.from(
			{ length: 50_001 },
			(_, at) => `https://m.example/${at}`,
		).join('\n');
		const result = await extract(content, 'plaintext');
		expect(result.urls).toHaveLength(50_000);
		expect(result.diagnostics).toEqual([
			{
				severity: 'warning',
				code: 'parsing',
				message: 'Too many URLs, truncated to 50000',
			},
		]);
	});
});

describe('exitCode', () => {
	const report = (urls: number, code?: string): FileReport => ({
		file: 'x',
		format: 'markdown',
		urls: [],
		diagnostics: code ? [{ severity: 'warning', code, message: 'm' }] : [],
		summary: { urls },
	});

	it('follows grep, and fails a skipped file only under --strict', () => {
		expect(exitCode([report(1)], false)).toBe(0);
		expect(exitCode([report(0)], false)).toBe(1);
		expect(exitCode([], false)).toBe(1);
		expect(exitCode([report(1), report(0, 'skipped')], false)).toBe(0);
		expect(exitCode([report(1), report(0, 'skipped')], true)).toBe(2);
	});
});

describe('collect', () => {
	const created: string[] = [];
	const dirs: string[] = [];
	afterEach(() => {
		for (const path of created.splice(0)) unlinkSync(path);
		for (const path of dirs.splice(0).reverse()) rmdirSync(path);
	});

	function tree(): string {
		const root = mkdtempSync(join(tmpdir(), 'urls-le-walk-'));
		dirs.push(root);
		for (const sub of ['a', 'a.d'].map((name) => join(root, name))) {
			mkdirSync(sub);
			dirs.push(sub);
		}
		for (const name of ['a.md', 'a/b.md', 'a.d/c.toml', '.hidden.md']) {
			writeFileSync(join(root, name), 'https://x.example\n');
			created.push(join(root, name));
		}
		return root;
	}

	it('sorts by path component and gives each file its format', () => {
		const root = tree();
		const found = collect([root], WALK).map((target) => [
			// Targets keep the native separator; only the report turns it to `/`.
			target.path.slice(root.length + 1).replaceAll('\\', '/'),
			target.languageId,
		]);
		expect(found).toEqual([
			['a/b.md', 'markdown'],
			['a.d/c.toml', 'toml'],
			['a.md', 'markdown'],
		]);
	});

	it('refuses a path that does not exist, naming it', () => {
		const missing = join(tmpdir(), 'urls-le-surely-not-here');
		const reason =
			process.platform === 'win32'
				? 'The system cannot find the file specified. (os error 2)'
				: 'No such file or directory (os error 2)';
		expect(() => collect([missing], WALK)).toThrow(`${missing}: ${reason}`);
	});

	it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
		'carries a directory it cannot enter instead of ending the walk',
		() => {
			const root = tree();
			const shut = join(root, 'shut');
			mkdirSync(shut);
			dirs.push(shut);
			chmodSync(shut, 0o000);
			try {
				const found = collect([root], WALK);
				const refused = found.find((target) => target.unreadable !== null);
				expect(refused?.path).toBe(shut);
				expect(refused?.languageId).toBe('plaintext');
				expect(refused?.unreadable).toBe(
					`${shut}: IO error for operation on ${shut}: Permission denied (os error 13)`,
				);
				expect(found).toHaveLength(4);
			} finally {
				chmodSync(shut, 0o700);
			}
		},
	);
});

describe('run', () => {
	async function capture(args: readonly string[], stdin = '') {
		let stdout = '';
		let stderr = '';
		const status = await run(args, {
			stdout: (text) => {
				stdout += text;
			},
			stderr: (text) => {
				stderr += text;
			},
			stdoutIsTerminal: false,
			readStdin: async () => Buffer.from(stdin),
			version: '9.9.9',
		});
		return { status, stdout, stderr };
	}

	it('reads stdin under a named format, without its byte-order mark', async () => {
		const result = await capture(
			['--stdin', '--format', 'md'],
			'﻿https://a.example',
		);
		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout).urls[0].column).toBe(1);
		expect(result.stderr).toBe(
			'<stdin>:1:1  https://a.example\n1 URL in 1 file\n',
		);
	});

	it('refuses stdin with no format, in the crate words', async () => {
		const result = await capture(['--stdin']);
		expect(result.status).toBe(2);
		expect(result.stderr).toBe(
			'urls-le: reading from stdin needs --format: the name that would carry the format is not there\n',
		);
	});

	it('answers --version with the release', async () => {
		expect((await capture(['--version'])).stdout).toBe('urls-le 9.9.9\n');
	});
});

describe('mcp', () => {
	async function session(lines: readonly (string | Buffer)[]) {
		const written: string[] = [];
		const input = Readable.from(
			lines.map((item) =>
				typeof item === 'string' ? Buffer.from(item) : item,
			),
		);
		const status = await serve(input, (text) => written.push(text), '9.9.9');
		return { status, written };
	}

	it('sorts every key, as a serde_json Value does', async () => {
		const { written } = await session([
			'{"jsonrpc":"2.0","id":{"b":1,"a":2},"method":"ping"}\n',
		]);
		expect(written).toEqual([
			'{"id":{"a":2,"b":1},"jsonrpc":"2.0","result":{}}\n',
		]);
	});

	it('answers no notification and no frame that is not JSON', async () => {
		const { written } = await session([
			'{"jsonrpc":"2.0","method":"notifications/initialized"}\n',
			'not json\n',
			'   \n',
		]);
		expect(written).toEqual([]);
	});

	it('drops a line that is not UTF-8 and serves the next', async () => {
		const { status, written } = await session([
			Buffer.from([0x7b, 0xff, 0x7d, 0x0a]),
			'{"jsonrpc":"2.0","id":1,"method":"ping"}\n',
		]);
		expect(status).toBe(0);
		expect(written).toEqual(['{"id":1,"jsonrpc":"2.0","result":{}}\n']);
	});

	it('reports a scan of a missing path as a tool failure', async () => {
		const { written } = await session([
			`${JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: { name: 'urls_le_scan', arguments: {} },
			})}\n`,
		]);
		expect(JSON.parse(written[0] as string).result).toEqual({
			content: [
				{ text: 'no file or directory was supplied to audit', type: 'text' },
			],
			isError: true,
		});
	});
});
