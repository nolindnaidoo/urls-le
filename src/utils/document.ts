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
 * Replace the document's entire contents.
 *
 * Returns whether the edit was applied. Callers must not report success
 * without checking it.
 */
export async function replaceDocumentContent(
	document: vscode.TextDocument,
	lines: readonly string[],
): Promise<boolean> {
	const edit = new vscode.WorkspaceEdit();
	edit.replace(document.uri, fullDocumentRange(document), lines.join('\n'));
	return await vscode.workspace.applyEdit(edit);
}
