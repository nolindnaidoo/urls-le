import * as assert from 'node:assert';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';

/**
 * The extension under a real host running in German.
 *
 * `test/integration/l10n.test.ts` holds the catalogues complete and in parity,
 * and says why it cannot show that either mechanism loads: `vscode.l10n.t`
 * resolves against the extension that calls it, and a test file is its own
 * extension with an empty bundle. The help command writes a document whose
 * every sentence goes through the extension's own bundle, so that document
 * is the one runtime string a test can read back in the host's language;
 * the results document holds URLs only, and every other string goes to a
 * notification, the status bar or a quick pick. A manifest string cannot be
 * read back through the API, so that half is the catalogue parity test.
 *
 * Launched by the `german host` config in `.vscode-test.mjs`, with
 * `--locale=de` and the German language pack installed into the test profile.
 */
describe('URLs-LE in a German host', function () {
	this.timeout(60_000);

	const EXTENSION_ID = 'nolindnaidoo.urls-le';

	it('runs in German', () => {
		assert.strictEqual(vscode.env.language, 'de');
	});

	it('activates and registers every command the manifest declares', async () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		assert.ok(extension, 'extension not found');
		await extension.activate();
		const declared = (
			extension.packageJSON.contributes.commands as { command: string }[]
		).map((entry) => entry.command);
		assert.ok(declared.length >= 7, `only ${declared.length} commands declared`);
		const commands = await vscode.commands.getCommands(true);
		for (const id of declared) {
			assert.ok(commands.includes(id), `missing command: ${id}`);
		}
	});

	it('writes the help document in German, naming the commands as the palette does', async () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		assert.ok(extension, 'extension not found');
		await extension.activate();
		await vscode.commands.executeCommand('urls-le.help');
		const text = vscode.window.activeTextEditor?.document.getText() ?? '';
		assert.ok(
			text.startsWith('# URLs-LE Hilfe'),
			`the help document is not in German:\n${text.slice(0, 200)}`,
		);
		assert.ok(text.includes('## Schnellstart'), 'no German Quick Start heading');
		assert.ok(
			text.includes('- **URLs extrahieren**: '),
			'the German palette title of Extract is not in the command list',
		);
		assert.ok(
			!text.includes('# URLs-LE Help'),
			'the English heading is still there',
		);
	});

	it('ships the German runtime bundle where the manifest tells the host to look', () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		assert.ok(extension, 'extension not found');
		const l10n = (extension.packageJSON as { l10n?: string }).l10n;
		assert.strictEqual(l10n, './l10n');
		const bundle = join(extension.extensionPath, l10n, 'bundle.l10n.de.json');
		assert.ok(existsSync(bundle), `no German bundle at ${bundle}`);
	});
});
