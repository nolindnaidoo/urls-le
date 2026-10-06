import * as assert from 'node:assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'nolindnaidoo.urls-le';

async function openEditor(
	content: string,
	language: string,
): Promise<vscode.TextEditor> {
	const document = await vscode.workspace.openTextDocument({
		content,
		language,
	});
	return vscode.window.showTextDocument(document);
}

describe('URLs-LE integration', function () {
	this.timeout(30_000);

	it('activates', async () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		assert.ok(extension, `extension ${EXTENSION_ID} not found`);
		await extension.activate();
		assert.strictEqual(extension.isActive, true);
	});

	it('registers every declared command', async () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		await extension?.activate();
		const commands = await vscode.commands.getCommands(true);
		for (const id of [
			'urls-le.extractUrls',
			'urls-le.extractWorkspace',
			'urls-le.extractFolder',
			'urls-le.postProcess.dedupe',
			'urls-le.postProcess.sort',
			'urls-le.openSettings',
			'urls-le.help',
		]) {
			assert.ok(commands.includes(id), `missing command: ${id}`);
		}
	});

	it('offers its MCP server to agent mode', async () => {
		// The provider is registered against the id the manifest declares; a
		// mismatch leaves the tools invisible with nothing logged. Assert the
		// declaration and the API the floor was raised for, together — the
		// registration itself is only observable in a real host, which
		// scripts/e2e-vsix.js covers against the installed VSIX.
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		await extension?.activate();

		assert.strictEqual(
			typeof vscode.lm.registerMcpServerDefinitionProvider,
			'function',
			'this VS Code build predates the MCP provider API',
		);

		const providers = extension?.packageJSON.contributes
			.mcpServerDefinitionProviders as { id: string; label: string }[];
		assert.deepStrictEqual(
			providers.map((p) => p.id),
			['urls-le'],
		);
	});

	it('extracts URLs from a markdown document into a results document', async () => {
		await openEditor(
			[
				'# Links',
				'',
				'A [docs link](https://docs.example.com/guide) here.',
				'Mirror: ftp://mirror.example.com/pub',
				'Contact: mailto:team@example.com',
			].join('\n'),
			'markdown',
		);

		await vscode.commands.executeCommand('urls-le.extractUrls');

		// Results open in a new plaintext document (side-by-side default).
		// Identify it by an exact first-line match rather than a substring
		// search: content-sniffing could latch onto an unrelated document that
		// merely mentions the URL, and the assertion below gives a clearer
		// diff than a failed lookup would.
		const resultDoc = vscode.workspace.textDocuments.find(
			(doc) =>
				doc.languageId === 'plaintext' &&
				doc.getText().split('\n')[0] === 'https://docs.example.com/guide',
		);
		assert.ok(resultDoc, 'no results document found');
		const lines = resultDoc.getText().split('\n');
		assert.deepStrictEqual(lines, [
			'https://docs.example.com/guide',
			'ftp://mirror.example.com/pub',
			'mailto:team@example.com',
		]);
	});

	it('dedupe removes duplicate lines from the active document', async () => {
		const editor = await openEditor(
			'https://a.com\nhttps://b.com\nhttps://a.com\nhttps://c.com\nhttps://b.com',
			'plaintext',
		);

		await vscode.commands.executeCommand('urls-le.postProcess.dedupe');

		assert.strictEqual(
			editor.document.getText(),
			'https://a.com\nhttps://b.com\nhttps://c.com',
		);
	});
	it('extracts the distinct URLs of a folder from disk, with how often and where', async () => {
		const root = mkdtempSync(join(tmpdir(), 'urls-le-extract-'));
		for (const dir of ['docs', 'node_modules', 'generated']) mkdirSync(join(root, dir));
		writeFileSync(join(root, '.gitignore'), 'generated/\n');
		writeFileSync(join(root, 'docs', 'a.md'), 'See https://example.com/docs and https://example.com/docs again.\n');
		writeFileSync(join(root, 'config.json'), '{\n  "home": "https://example.com/docs"\n}\n');
		writeFileSync(join(root, 'node_modules', 'x.js'), "const skip = 'https://skip.example.com';\n");
		writeFileSync(join(root, 'generated', 'g.md'), 'https://generated.example.com\n');
		writeFileSync(join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x47]));

		await vscode.commands.executeCommand('urls-le.extractFolder', vscode.Uri.file(root));

		const report = vscode.workspace.textDocuments.find(
			(doc) => doc.languageId === 'markdown' && doc.getText().includes('urls-le-extract-'),
		);
		assert.ok(report, 'no workspace report was opened');
		const text = report.getText();
		// The .gitignore itself is read, and holds no URL.
		assert.match(text, /3 file\(s\) read · 1 distinct URL\(s\), 3 occurrence\(s\) in 2 file\(s\)/);
		assert.ok(text.includes('| `https://example.com/docs` | 3 | 2 |'));
		assert.ok(text.includes('- `config.json`\n- `docs/a.md` (2)'));
		assert.ok(!text.includes('skip.example.com') && !text.includes('generated.example.com'));
		assert.match(text, /1 file\(s\) ignored by \.gitignore/);
	});
});
