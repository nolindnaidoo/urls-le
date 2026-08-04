import * as assert from 'node:assert';
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
			'urls-le.postProcess.dedupe',
			'urls-le.postProcess.sort',
			'urls-le.openSettings',
			'urls-le.help',
		]) {
			assert.ok(commands.includes(id), `missing command: ${id}`);
		}
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
});
