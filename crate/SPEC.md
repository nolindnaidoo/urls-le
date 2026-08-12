# urls-le — Rust specification

A port of the [URLs-LE](https://github.com/nolindnaidoo/urls-le) VS Code
extension to a Rust CLI and MCP server.

**One answer is held equal; the surfaces are not.** The shared
`extract_urls` MCP tool must return the same URLs, their parts, and their positions
from either server — a difference there is a bug. Everything else is
IDE-first in the extension and terminal-first here, and is meant to
differ. See "Deliberate divergences".

## The one question

**Which URLs are in this codebase, and exactly where?**

That is the entire product. `urls-le src/ | lychee` is the point: this
hands the next tool a better list than a grep can — one that knows a URL
in a TOML value from a URL in a fenced code block — and then gets out of
the way.

## Why this has no opinions

The obvious next features are all judgments about the URLs it found:
fetch each one to see if it 404s, flag `http://` as insecure, flag a
password in the userinfo, flag a private address. Every one is absent,
deliberately.

**This tool extracts. What the URLs mean is the reader's call.** An
`http://` URL is wrong in a production config and correct in a test
fixture. A `localhost` URL is a bug in one repository and the whole
point in another. A tool that decides for you is a tool you have to
configure, then argue with, then mute — and the muting takes the
extraction with it.

Link checking is also already solved: `lychee`, `muffet` and `htmltest`
do it well, and each needs a network, which would stop this being a
cheap deterministic CI step. The value here is the list, not a verdict
on it.

So: **nothing is filtered, nothing is rewritten, nothing is scored.**
URLs are reported exactly as written, at their real positions, in
document order. Trailing punctuation is kept because it may be part of
the URL. Repeats are kept because they are separate occurrences.
`--dedupe` exists because the extension has it, and it is opt-in there
too.

## Shape

**One crate.** Self-contained: no published `-core`, no shared crate with
the family, and nothing holding this code equal to the similar files
in the sibling repos. Where they agree it is because the same answer was
right twice; where they diverge that is the point.

```
crate/
├── src/
│   ├── extract/     pure: the URL scanner, the eleven format
│   │                extractors and the scan every other document
│   │                gets, positions, and js.rs — JavaScript's string
│   │                primitives where Rust's differ. No filesystem,
│   │                pub(crate).
│   ├── walk.rs      ignore-aware tree walking
│   ├── scan.rs      one file end to end — the only path either surface calls
│   ├── cli.rs       the terminal surface
│   └── mcp/         the agent surface
└── fixtures/        the shared corpus, read by both frontends
```

**`extract/` touches no filesystem** and carries the **90% line coverage
floor per module**.

## Extraction — parity scope

### One scanner, eleven formats, and every other file

The extension's history is the reason this matters: v1.x had the same
five protocol patterns copy-pasted into ten files with divergent
behaviour — CSS labelled every `http` URL as `https`, TOML and INI
returned no positions, XML emitted attribute URLs twice, and three
formats silently dropped repeat occurrences. One scanner, applied
uniformly, is the fix, and it is ported as one scanner.

Formats: **Markdown, HTML, CSS, JavaScript, TypeScript, JSON, YAML,
`.properties`, TOML, INI, XML.**

**Nothing else is refused.** A format extractor decides which *subset* of
the document to scan — a fenced block excluded, a comment excluded,
everything that is not a JSON string excluded — so the whole-document
scan is the superset of all eleven, and it is what a `.py`, a `.go`, a
`.sh`, a `.csv` or a file with no extension at all gets. A URL is
unambiguous in any text; refusing one of those documents never protected
a reader from a wrong answer, it withheld the right one. The `fileType`
field reports `unknown` when that scan ran, which is how a caller tells
the two apart.

The same rule reaches `--format` and the walk. Any name resolves — an
unrecognised one to `plaintext` — and a file named on the command line is
read whatever its extension. Naming a file is an instruction.

### The rules, ported as-is

- **A URL ends at whitespace or at any of** `< > " { } | \ ^ \` [ ] ; ) '`.
  That is the extension's delimiter set, kept so quoted and bracketed
  sources terminate correctly. **Whitespace means JavaScript's `\s`**,
  spelled out in `extract/js.rs` rather than borrowed from Rust: the two
  sets differ on exactly two characters, U+FEFF and U+0085, and both
  decide where a URL ends. The same set is what every `trim` here uses,
  because the extension calls `String.prototype.trim`.
- **Trailing punctuation a URL may legally contain is not stripped.**
  `https://x.com/a.` keeps its dot. A documented limitation, not a bug —
  stripping it would corrupt URLs that genuinely end that way.
- **`http` versus `https` comes from the scheme**, never from a hardcoded
  guess.
- **Every occurrence is reported with its own position.** Value-level
  dedupe is a separate, opt-in step.
- **`mailto:` needs an `@`; `tel:` needs a subject.** Applied to every
  format, so no two can disagree about what counts as well-formed.
- **Five patterns, six protocols**: `http` and `https` share one pattern
  and are told apart by the scheme actually matched; then `ftp`, `file`,
  `mailto`, `tel`.
- **Limits are behaviour**: content over 10 MB is refused with a message,
  and no more than 50,000 URLs are returned from one document.

### What is not matched, and is not a bug report

The five patterns above are the whole set. Written down so nobody has to
discover it by running the tool:

- **No `ws://`, `wss://`, `ssh://`, `git://`, `s3://` or `gs://`.**
- **No bare domains.** `example.com` in prose is not extracted, and
  neither is `foo.py`. There is no TLD list here, deliberately: the
  moment there is one, this tool starts guessing, and the guesses are
  wrong in prose and in source in different ways.
- **No IPv6 literals.** `https://[2001:db8::1]/` yields nothing at all,
  because `[` is in the delimiter set that ends a URL, so the pattern
  never gets its first character. Located precisely rather than left to
  be rediscovered; fixing it means changing the delimiter set, which is
  where the zero-false-positive property lives, so it needs its own
  corpus pass.
- **No relative links.** `/docs/setup` is not a URL and never was.

Adding a protocol is a change to the shared scanner and therefore a
change to **both** frontends and the corpus at once.

### Which subset each format sees

Every extractor is the whole-document scan minus an exclusion, and the
exclusion is the whole difference between them:

| format | excluded |
|---|---|
| Markdown | fenced blocks and inline code spans |
| HTML | `<!--…-->`, including one left unterminated |
| JSON | everything that is not a string token — comments are trivia, as they are to `jsonc-parser` |
| `.properties` | lines whose first non-whitespace character is `#` or `!` |
| INI | lines whose first non-whitespace character is `;` or `#` |
| TOML | whatever the parse drops — comments, key names — with each value located back in the source |
| CSS · JavaScript · TypeScript · YAML · XML · anything else | nothing |

**INI takes no parser.** It parsed and then located, like TOML, until
that made the answer depend on which INI library each language happened
to install: one refuses a line with no `=` and fell back to a whole
document scan, the other refuses nothing and quietly dropped the URL.
A rule both sides state in three lines cannot drift that way. TOML keeps
its parse because both implementations refuse the same documents, and the
fallback is symmetric.

### Deliberate divergences

**There are none in the shared `extract_urls` tool.** One tool name, one
schema, two servers: an agent must get the same answer whichever it
reaches, and `scripts/differential.ts` generates documents and argument
shapes to keep it that way. Anything it finds is a bug in one of the two
until this section says otherwise, and a new entry here needs a reason
and a test asserting what each side answers.

**The two surfaces are a different question, and they are meant to
differ.** The CLI is terminal-first — a tree walk, exit codes, JSON
Lines, `--strict`, `--dedupe` — and the extension is IDE-first, one open
buffer read by a person. Neither is drift, and nothing holds them equal.
The bar for a new difference is whether it follows from that split.

### `domain` and `path`

The extension derives these with the platform `URL` parser. This uses
Rust's `url` crate, which is the same WHATWG standard but a different
implementation, and the corpus pins the cases most likely to diverge —
including an internationalised domain, where both are expected to emit
punycode. **Any disagreement the corpus finds is recorded here as a
documented divergence with a test asserting what each side answers**;
there is no other sanctioned way to differ.

### Out of parity scope

Commands, the editor UI, i18n, the configuration reader and the status
bar are extension concerns. Parity is `src/extraction/**` and nothing
else.

## Output contract

**stdout is protocol, stderr is human.** One JSON report per line, one
line per file.

```json
{
  "file": "docs/setup.md",
  "format": "markdown",
  "urls": [
    {
      "value": "https://example.com/guide",
      "protocol": "https",
      "domain": "example.com",
      "path": "/guide",
      "line": 12,
      "column": 15,
      "context": "See [the guide](https://example.com/guide) first."
    }
  ],
  "diagnostics": [],
  "summary": { "urls": 1 }
}
```

There is no verdict field, and there is no place for one.

### Exit codes are the API

**grep's convention**, because this is grep's kind of tool:

- **0** — URLs were found.
- **1** — none were found. Not an error; the honest answer to "is there
  anything here".
- **2** — the question was malformed: an unknown flag, an unreadable
  input, a path that does not exist.

That is a fact about the extraction, not an opinion about the URLs. It
makes the tool composable — `if urls-le src/; then …` — without the tool
deciding anything on the reader's behalf.

## The CLI surface

```
usage: urls-le [options] <file|dir>...
       urls-le [options] --stdin --format <format>
       urls-le mcp
       urls-le --version | --help

Options:
  --dedupe             collapse repeated URLs to their first occurrence
  --format <format>    force a format instead of inferring from the name
  --stdin              read one document from stdin
  --hidden             walk hidden files and directories too
  --no-ignore          walk files that .gitignore excludes
```

`--format` takes any name. One of the eleven picks that extractor;
anything else scans the whole document. That is not a silent default —
every extractor is the whole-document scan minus an exclusion, so a
mistyped name can only stop something being excluded, never hide a URL,
and the report's `format` field says which pass ran.

## The MCP surface

- **`extract_urls` belongs to both servers.** The npm server and this one
  offer the same tool: same schema, same envelope, byte-identical output.
  `fixtures/mcp-extract-urls.json` runs against both.
- **`urls_le_scan` is this server's own**: files or directories in, the
  same reports the CLI writes.

**Refusals speak the caller's vocabulary.** No message here names a flag.

## Non-goals

- **No network, ever.** No fetching, no DNS, no reachability.
- **It does not rewrite files**, and does not offer to.
- **It does not judge a URL.** No insecure-scheme flag, no credential
  flag, no private-address flag, no scoring. See "Why this has no
  opinions"; adding one would make everything else here negotiable.
- **It does not filter.** Every occurrence the extension reports, this
  reports.

## Not in v1

Listed so nobody smuggles one in as a small addition — each would turn
an extractor into something with a position.

- **Link checking**, or any network access.
- **Verdicts of any kind**, and the allow-lists and baselines they would
  immediately require.
- **`--fix`**, rewriting `http` to `https`.

## Files that cannot be read

Exit 2 means the *question* was malformed — an unknown flag, a missing
`--format` value, a path that does not exist. It does not mean one file
in fifty thousand was a PNG, and since every file is now walked, most
repositories contain several.

A file that is not UTF-8 text, that cannot be opened, that sits in a
directory the walk cannot enter, or that is refused for its size, is:

- named on stderr,
- carried in the JSON report with a `skipped` diagnostic saying why,
- and left out of the exit code.

`--strict` turns any of those back into exit 2, for a pipeline that wants
zero tolerance. What is never allowed is the third option: a file that
silently vanishes from the report, which reads to whoever ran it as a
file that was clean.

**One unreadable path never ends the run.** A permission-denied directory
— or a symlink loop under `--follow-symlinks` — used to exit 2 with
nothing on stdout, so one locked directory deleted the audit of every
readable file beside it. It is one `skipped` line among the others now.

### Report paths use `/`

On every platform, in the JSON and in the human summary. The report is
protocol: a consumer that splits a path, or diffs one machine's run
against another's, must not have to know which operating system produced
it.

## The byte-order mark

A leading BOM is stripped before extraction. It is three invisible bytes
that Notepad, Excel and a PowerShell redirect all add, and that VS Code
removes before the extension sees a document — so leaving it in means
the two frontends read the same file differently. It shifts every column
on the first line, and in a structured format it can lose the document
entirely.

A BOM anywhere other than the start is a zero-width no-break space and
belongs to the text.
