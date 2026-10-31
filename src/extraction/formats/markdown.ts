import type { Url } from '../../types';
import { scanUrls, toUrls } from '../heuristics';
import { createPositionIndex } from '../position';

/**
 * Markdown: whole-content scan, minus fenced code blocks and inline
 * code spans. Links, autolinks, and plain URLs all reduce to the same
 * scan — the URL inside [text](url) or <url> is matched at its real
 * offset. Relative link targets are not URLs and are never extracted.
 */
export function extractFromMarkdown(content: string): readonly Url[] {
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

const FENCES = ['```', '~~~'] as const;

/**
 * 1-based line numbers inside (or delimiting) a fenced block. A fence is
 * three backticks or three tildes, and only the marker that opened a block
 * closes it, as CommonMark reads them: a tilde line inside a backtick block
 * is text, and the other way round. Only backticks were read as fences, so
 * a URL in a tilde block was extracted on both sides.
 */
function computeFencedLines(lines: readonly string[]): Set<number> {
	const fenced = new Set<number>();
	let open: (typeof FENCES)[number] | undefined;
	lines.forEach((line, index) => {
		const trimmed = line.trim();
		const marker = FENCES.find((fence) => trimmed.startsWith(fence));
		const isFence = open === undefined ? marker !== undefined : marker === open;
		if (isFence || open !== undefined) {
			fenced.add(index + 1);
		}
		if (isFence) {
			open = open === undefined ? marker : undefined;
		}
	});
	return fenced;
}

function isInInlineCode(line: string, index: number): boolean {
	const before = line.substring(0, index);
	const backticks = before.split('`').length - 1;
	return backticks % 2 === 1;
}
