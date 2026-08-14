# Changelog

The Rust CLI and MCP server. The VS Code extension has its own
[CHANGELOG](../CHANGELOG.md) and its own version — the two products in
this repository release on their own cadence.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-08-14

The release where this reads what you already expected it to read, and
stops throwing away results it had already found.

### Fixed

- **One directory you could not read used to delete every result beside
  it.** Pointed at a tree containing a directory the process had no
  permission to enter, this exited 2 and printed **nothing** — not a
  partial report, not a warning, nothing. Every readable file next to it
  had been scanned and the answer was discarded. Anyone running this in
  CI over a tree with a protected directory got a silent failure that
  looked like a tool problem rather than a permissions one. The same
  happened to a whole run when `--follow-symlinks` met a link pointing at
  its own ancestor.

  That path is now one line in the report like any other, saying it could
  not be examined, and everything else is reported normally. `--strict`
  still turns it into exit 2 for a pipeline that wants zero tolerance.

- **`--strict` passed a file it had refused to read.** A document over the
  10 MB ceiling was reported as refused and then counted as fine, which
  is a clean bill of health over a file nobody looked at — the one thing
  `--strict` exists to prevent. It now fails the run.

- **Reports written on Windows used `\` in every path.** They use `/` on
  every platform now, in the JSON and in the summary, so a report can be
  diffed between two machines and a consumer never has to know which
  operating system produced it.

- **The CLI and the editor extension disagreed about the same document.**
  Six ways, each of which meant the shared `extract_urls` tool answered
  differently depending on which of the two servers you happened to
  reach:

  - A `.ini` file that was not valid INI came back empty from one and
    full from the other (see the INI change below).
  - A quoted URL inside a `//` or `/* */` comment in a `.json` or
    `.jsonc` file was extracted here and not there. A comment is not a
    string; it is not extracted from now.
  - A byte-order mark — three invisible bytes that Notepad, Excel and a
    PowerShell redirect all add — changed the answer in five separate
    ways: it ended a URL on one side and not the other, hid a code fence
    or a comment marker from one side only, and made a format name
    resolve two different ways. All of them came from JavaScript and Rust
    disagreeing about which characters count as whitespace.
  - A document beginning with a byte-order mark parsed as TOML on one
    side and not the other. A leading mark is stripped on both now, which
    is what the editor has always done before the extension sees a file.
  - `format: ""` was refused by one server and answered by the other.
  - A URL that a parser handed back but could not be found in the source
    keeps its value and loses its position; one server said `line: null`
    and the other left the field out.

  All six are now generated against, not just fixed: `differential`
  builds documents and argument shapes from a printed seed and requires
  both servers to answer identically.

- **The CLI and the extension accepted different file extensions.**
  Walking a directory of `icon.svg`, `app.cfg`, `app.conf` and `ok.json`,
  this read one file and the extension read four. This crate lacked
  `mdown`, `mkd`, `env`, `cfg`, `conf`, `svg`, `xsl` and `pom`; the
  extension lacked `mdx`; neither read `mts` or `cts`. Both tables carry
  all of them now, held equal from both directions.

### Changed

- **Every file is read.** A `.py`, a `.go`, a `.sh`, a `.sql`, a `.csv`,
  a `Dockerfile`, a file with no extension at all — all of them are
  scanned now, instead of being skipped by the walk or refused by name.
  A codebase is mostly source, and skipping it turned a scan that never
  looked into a report that read as clean.

  **Expect your counts to go up.** On this repository's own source tree
  the same command went from 671 URLs across 103 files to 1,059 across
  127. Nothing was loosened to get there: the eleven format-aware
  extractors are each the whole-document scan *minus* one exclusion — a
  fenced block, a comment, everything that is not a JSON string — so
  scanning a file no extractor knows about is the same scan without an
  exclusion to apply, and the report's `format` field says `plaintext`
  when that is what ran.

  Three smaller things move with it: naming a file whose extension
  nothing recognises reads it instead of failing the run; `--format` and
  the MCP `format` argument accept any name, and one with no extractor
  scans the whole document; and there is no `Unsupported file type`
  warning left to produce.

- **`.ini` files are scanned like `.properties` files.** They used to be
  parsed, and the values walked; now the whole document is scanned and
  comment lines — `;` or `#` — are excluded. A URL in a comment is still
  excluded, so a well-formed INI file gives the same answer as before.
  What changes is a file that is *not* valid INI: it used to yield
  nothing on the npm server and everything here, because the two INI
  libraries disagree about what counts as a broken line. Now both read
  it.

- **`extract_urls` reports the extractor that ran, not the name you sent
  it.** `fileType` comes back `unknown` for the whole-document scan,
  which is the one thing a caller cannot work out for itself.

### Added

- **Six CI jobs, each because something real got through a release.**
  `hazards` and `platform` drive the built binary across macOS, Windows
  and Linux over trees built at runtime — a byte-order mark, a lone
  carriage return, invalid UTF-8, a 1 MB line, 100,000 lines, a FIFO, a
  symlink loop, a permission-denied directory, a reserved Windows
  filename — and every case requires no panic, no hang, and an exit code
  of 0, 1 or 2, never a signal. `differential` generates documents and
  argument shapes and requires both MCP servers to answer identically,
  printing its seed so a failure reproduces. `fuzz` runs a sixty-second
  net over the extraction layer and checks that every reported line and
  column actually holds the URL reported there. `budget` holds a
  500-file scan to a wall-clock ceiling and requires four times the tree
  to cost less than six times the time. `coverage-matrix` writes one
  file per known extension plus a dozen it has never heard of and
  requires a report line for every one.

  Every bug above was fixed by these, and each fix was checked by
  reverting it and watching the job go red — a test that cannot fail
  proves nothing.

- **`csv`, `tsv`, `plaintext`, `txt` and `log`** as format names, and
  `csv` and `plaintext` in the advertised list, so an agent that sends
  one sees it offered.
- **Corpus documents for Python, Go, shell, TypeScript, CSV and plain
  text**, pinning what the whole-document scan returns from comments,
  docstrings, f-strings, raw literals and quoted shell arguments.
- **`fixtures/aliases.json`** — the extension table as a shared contract,
  checked from both sides. The mismatch above shipped in 0.1.0 and
  nothing failed, because nothing compared the two tables.

### Removed

- **Two dependencies**, `rust-ini` and `jsonc-parser`. The INI extractor
  no longer parses, and the JSON one never used the parser it declared.

### Still not here

Unchanged and deliberate, listed so nothing above reads as a hint: no
link checking, no network of any kind, no verdict about a URL, no
filtering, and no `--fix`. The protocols are the same five patterns as
0.1.0 — `http`/`https`, `ftp`, `file`, `mailto`, `tel`. There is still no
`ws://`, no `ssh://`, no bare-domain matching, and no IPv6 literal:
`https://[2001:db8::1]/` yields nothing, because `[` ends a URL. See
SPEC.md, "What is not matched".

## [0.1.0] - 2026-08-08

First release. The extension's extraction engine, ported and pinned
against a shared corpus, over a tree instead of a buffer.

### Added

- **Extraction for all eleven formats** the extension supports —
  Markdown, HTML, CSS, JavaScript, TypeScript, JSON, YAML,
  `.properties`, TOML, INI and XML — reproducing the extension's output
  for every case in `fixtures/`, including the delimiter set, the
  `mailto`/`tel` well-formedness rules, and the TOML fallback that keeps
  a document which fails to parse from silently yielding nothing.
- **The CLI**: JSON reports on stdout one per line, a human summary on
  stderr, and exit codes following grep — 0 URLs found, 1 none found, 2
  the question was malformed. `--dedupe`, `--format`, `--stdin`,
  `--follow-symlinks`, `--hidden`, `--no-ignore`.
- **The MCP server** (`urls-le mcp`) with two tools: `extract_urls`,
  shared byte-for-byte with the npm server and pinned by
  `fixtures/mcp-extract-urls.json`, and `urls_le_scan`.

### The shape of it

**This tool has no opinions.** No link checking, no insecure-scheme
flag, no scoring, no filtering. An `http://` URL is wrong in a
production config and right in a test fixture, and a tool that decides
for you is one you configure, then argue with, then mute. A contract
test asserts no flag asks for a judgment, so the boundary is enforced
rather than remembered.

One scanner serves all eleven formats. The extension's v1.x had five
protocol patterns copy-pasted into ten files with divergent behaviour —
CSS labelled every `http` URL `https`, TOML and INI returned no
positions, XML emitted attribute URLs twice — and porting it as one
function is what stops that recurring in a second language.


### Fixed

- **A leading byte-order mark is no longer part of the document.** Three
  invisible bytes, added by Notepad, Excel and a PowerShell redirect, and
  stripped by VS Code before the extension ever sees a file — so the two
  frontends read the same file differently. It shifted every column on
  line one, and before a `{` it made a structured parser reject the whole
  document, which is indistinguishable from a file with no URLs in it.

- **A file that cannot be read no longer fails the run.** Every
  repository has a PNG, a zip and something the runner lacks permission
  for. Exiting 2 on those made the tool unusable in CI, which is the one
  place it is most worth running. Such a file is now named on stderr and
  carried in the report with a `skipped` diagnostic, and the exit code
  reflects what was found. `--strict` restores the old behaviour for a
  pipeline that wants zero tolerance.

- **A file that is not text is named rather than dropped.** It used to
  vanish from the report entirely, which reads to whoever ran it as
  "that file was clean".

[0.2.0]: https://crates.io/crates/urls-le/0.2.0
[0.1.0]: https://crates.io/crates/urls-le/0.1.0
