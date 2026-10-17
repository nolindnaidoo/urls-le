/**
 * The `urls-le` npm binary: the Rust CLI's surface over the extension's
 * extraction engine. `urls-le mcp` serves the crate's two tools over stdio.
 */
import { version } from '../mcp/info';
import { exitWhenDrained } from './exit';
import { serve } from './mcp';
import { run } from './run';

async function readStdin(): Promise<Uint8Array> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

function main(args: readonly string[]): void {
	if (args[0] === 'mcp') {
		serve(process.stdin, (line) => process.stdout.write(line), version).then(
			exitWhenDrained,
		);
		return;
	}
	run(args, {
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
		stdoutIsTerminal: process.stdout.isTTY === true,
		readStdin,
		version,
	}).then(exitWhenDrained);
}

main(process.argv.slice(2));
