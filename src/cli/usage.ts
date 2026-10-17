/**
 * The command line's help text and the flags it names.
 *
 * Word for word the Rust CLI's, because both install as `urls-le` and a person
 * reading `--help` cannot tell which one they have.
 * `scripts/check-cli-parity.ts` compares the two outputs, and `cli.test.ts`
 * holds FLAGS equal to the flags this text names.
 */

export const USAGE = `usage: urls-le [options] <file|dir>...
       urls-le [options] --stdin --format <format>
       urls-le mcp
       urls-le --version | --help

Extracts every URL from a document, with its protocol and 1-based line
and column. One JSON report per line on stdout when it is piped or
redirected, human summary on stderr.

Every file is read. Eleven formats know what to exclude — a fenced code
block, an HTML comment, everything that is not a JSON string; anything
else is scanned whole, and the report's format field says which.

It reports what is there and nothing else: nothing is fetched, nothing
is filtered, nothing is scored. What the URLs mean is yours to decide.

Options:
  --dedupe             collapse repeated URLs to their first occurrence
  --format <format>    force a format instead of inferring it from the
                       file name; required with --stdin. A name with no
                       format-aware extractor scans the whole document
  --stdin              read one document from stdin
  --strict             exit 2 if any file could not be read, rather than
                       reporting it and carrying on
  --follow-symlinks    descend symlinked directories when walking a tree
  --hidden             walk hidden files and directories too
  --no-ignore          walk files that .gitignore excludes

Files that are not text, or that cannot be opened, are named on stderr
and carried in the report, and do not by themselves fail the run — every
repository has a PNG in it. --strict turns them back into a failure.

Exit codes follow grep: 0 URLs found · 1 none found · 2 malformed
question. Finding none is an answer, not an error.`;

export const FLAGS: readonly string[] = Object.freeze([
	'--dedupe',
	'--strict',
	'--format',
	'--stdin',
	'--follow-symlinks',
	'--hidden',
	'--no-ignore',
]);
