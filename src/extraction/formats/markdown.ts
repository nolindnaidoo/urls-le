import type { Url } from '../../types';
import { scanUrls, toUrls } from '../heuristics';
import { createPositionIndex } from '../position';

/**
 * Markdown: whole-content scan, minus fenced code blocks and inline
 * code spans. Links, autolinks, and plain URLs all reduce to the same
 * scan — the URL inside [text](url) or <url> is matched at its real
 * offset. Relative link targets are not URLs and are never extracted.
 */
export function extractFromMarkdown(content: string): Url[] {
	const lines = content.split('\n');
	const fencedLines = computeFencedLines(lines);
	const toPosition = createPositionIndex(content);

	const matches = scanUrls(content).filter((match) => {
		const position = toPosition(match.start);
		if (fencedLines.has(position.line)) {
			return false;
		}
		const line = lines[position.line - 1] ?? '';
		return !isInInlineCode(line, position.column - 1);
	});

	return toUrls(content, matches);
}

/** 1-based line numbers inside (or delimiting) ``` fenced blocks. */
function computeFencedLines(lines: readonly string[]): Set<number> {
	const fenced = new Set<number>();
	let inBlock = false;
	lines.forEach((line, index) => {
		const isFence = line.trim().startsWith('```');
		if (isFence || inBlock) {
			fenced.add(index + 1);
		}
		if (isFence) {
			inBlock = !inBlock;
		}
	});
	return fenced;
}

function isInInlineCode(line: string, index: number): boolean {
	const before = line.substring(0, index);
	const backticks = before.split('`').length - 1;
	return backticks % 2 === 1;
}
