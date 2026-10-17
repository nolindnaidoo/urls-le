/**
 * The terminal surface, as the Rust CLI's `cli.rs` runs it.
 *
 * stdout is protocol: one JSON report per line whenever something is reading
 * it, and nothing when it is a terminal, because the stderr listing already
 * shows every URL a person reads there.
 */
import { type Cli, parse } from './args';
import { decodeUtf8OrThrow, rustIoMessage, withoutBom } from './ioError';
import {
	describe,
	exitCode,
	type FileReport,
	type ScanOptions,
	scanContent,
	scanFile,
} from './scan';
import { USAGE } from './usage';
import { collect, type WalkOptions } from './walk';

export interface RunIo {
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	readonly stdoutIsTerminal: boolean;
	readonly readStdin: () => Promise<Uint8Array>;
	readonly version: string;
}

export async function run(args: readonly string[], io: RunIo): Promise<number> {
	const first = args[0];
	if (first === '--help' || first === '-h') {
		io.stdout(`${USAGE}\n`);
		return 0;
	}
	if (first === '--version' || first === '-V') {
		io.stdout(`urls-le ${io.version}\n`);
		return 0;
	}

	try {
		return await execute(args, io);
	} catch (error) {
		io.stderr(
			`urls-le: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 2;
	}
}

async function execute(args: readonly string[], io: RunIo): Promise<number> {
	const options = parse(args);
	const reports = options.stdin
		? [await scanStdin(options, io)]
		: await readTree(options.inputs, options.scan, options.walk);

	if (!io.stdoutIsTerminal) {
		io.stdout(reports.map((report) => `${JSON.stringify(report)}\n`).join(''));
	}
	io.stderr(summary(reports));
	return exitCode(reports, options.strict);
}

export async function readTree(
	inputs: readonly string[],
	scan: ScanOptions,
	walk: WalkOptions,
): Promise<FileReport[]> {
	const reports: FileReport[] = [];
	for (const target of collect(inputs, walk)) {
		reports.push(await scanFile(target, scan));
	}
	return reports;
}

async function scanStdin(options: Cli, io: RunIo): Promise<FileReport> {
	if (options.format === null) {
		throw new Error(
			'reading from stdin needs --format: the name that would carry the format is not there',
		);
	}
	let content: string;
	try {
		content = decodeUtf8OrThrow(await io.readStdin());
	} catch (error) {
		throw new Error(`could not read stdin: ${rustIoMessage(error)}`);
	}
	return scanContent(
		withoutBom(content),
		'<stdin>',
		options.format,
		options.scan,
	);
}

/** The human half. Every line restates something already in the JSON. */
function summary(reports: readonly FileReport[]): string {
	const lines: string[] = [];
	let urls = 0;
	for (const report of reports) {
		for (const diagnostic of report.diagnostics) {
			lines.push(`${report.file}: ${diagnostic.message}`);
		}
		for (const url of report.urls) {
			urls += 1;
			lines.push(describe(report, url));
		}
	}
	lines.push(
		`${plural(urls, 'URL', 'URLs')} in ${plural(reports.length, 'file', 'files')}`,
	);
	return lines.map((line) => `${line}\n`).join('');
}

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}
