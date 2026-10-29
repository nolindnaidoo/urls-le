import * as vscode from 'vscode';

/**
 * Document-rewriting helpers shared by the in-place commands (sort, dedupe).
 *
 * Both carried their own copy, and both discarded the boolean
 * `vscode.workspace.applyEdit` returns. That value is `false` for a rejected
 * edit — a read-only document, or one that changed underneath the command —
 * and the callers went straight on to announce "Sorted 12 URLs" over a
 * document that had not been touched. `extract.ts` already checked the result;
 * this makes that the one behaviour.
 */

/** The range covering the whole document, start to final character. */
export function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
	return new vscode.Range(
		document.positionAt(0),
		document.lineAt(document.lineCount - 1).range.end,
	);
}

/**
 * Replace the document's entire contents with these lines.
 *
 * Written with the document's own line ending, and ending in one exactly
 * when the document did: the lines were joined with a bare newline and
 * nothing after the last, so a document that ended in a newline lost it on
 * every dedupe and sort, and a CRLF document was handed bare newlines to
 * normalise.
 *
 * Returns whether the edit was applied. Callers must not report success
 * without checking it.
 */
export async function replaceDocumentContent(
	document: vscode.TextDocument,
	lines: readonly string[],
): Promise<boolean> {
	const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
	const terminated = lines.length > 0 && /\r?\n$/.test(document.getText());
	const edit = new vscode.WorkspaceEdit();
	edit.replace(
		document.uri,
		fullDocumentRange(document),
		`${lines.join(eol)}${terminated ? eol : ''}`,
	);
	return await vscode.workspace.applyEdit(edit);
}
