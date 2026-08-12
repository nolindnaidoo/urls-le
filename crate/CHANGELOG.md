# Changelog

The Rust CLI and MCP server. The VS Code extension has its own
[CHANGELOG](../CHANGELOG.md) and its own version — the two products in
this repository release on their own cadence.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Every file is read.** A document with no format-aware extractor —
  `.py`, `.go`, `.sh`, `.csv`, `.txt`, a `Dockerfile`, anything — is
  scanned whole instead of being skipped by the walk or refused by name.
  Each of the eleven extractors is that same scan *minus* an exclusion (a
  fenced block, a comment, everything that is not a JSON string), so the
  whole-document scan is their superset and a URL is unambiguous in any
  text. Refusing never protected a reader from a wrong answer; it
  withheld the right one, for most of a codebase.

  Four behaviours move with it, each pinned by a test that says so:

  - `walk.rs` no longer filters by extension, so a tree yields every
    file. One that is not text still comes back as `skipped` from
    `scan.rs`, which is where that is knowable rather than guessable —
    and `--strict` still turns those into exit 2.
  - Naming a file whose extension nothing recognises reads it, instead
    of failing the run with "no format could be inferred". Naming a file
    is an instruction.
  - `--format` and the MCP `format` argument accept any name; one with
    no extractor scans the whole document. Not a silent default: a
    mistyped name can only stop something being excluded, never hide a
    URL, and the report's `format` field says which pass ran.
  - `extract` no longer returns an `Unsupported file type` warning.

- **`extract_urls` reports the extractor that ran, not the name it was
  given.** `fileType` is the extraction's own answer — `unknown` for the
  whole-document scan — which is what the extension has always reported
  and is the one bit a caller cannot work out for itself.

- **INI no longer parses.** It is a whole-content scan minus comment
  lines (`;` or `#`), which is what the `.properties` extractor has
  always been. Parsing and then locating made the answer depend on which
  INI library each language happened to install: `rust-ini` refuses a
  line with no `=` and this fell back to a whole-document scan, while the
  npm server's `ini` refuses nothing and turned that same line into a key
  whose value is `true`, which its string walk skips. One document, one
  `extract_urls`, two answers. A URL in a comment is still excluded, so
  the corpus is unchanged; a document that is not INI is now read on both
  sides instead of yielding nothing on one.

- **Every path in a report uses `/`, on every platform.** They were
  whatever `Path` spelled them, so a Windows report carried `\` and could
  not be diffed against a Linux one or split by a consumer that did not
  know which operating system produced it.

- **A path the walk cannot examine no longer ends the run.** A directory
  it could not enter — or a symlink loop under `--follow-symlinks` —
  exited 2 with **nothing** on stdout, so one locked directory deleted
  the audit of every readable file beside it. It is now one `skipped`
  report line among the others, which is the rule this already had for a
  file that could not be opened: named on stderr, carried in the report,
  left out of the exit code, and turned back into a failure by
  `--strict`.

- **`--strict` refuses a document that was refused for its size.** A file
  over the 10 MB ceiling was reported and then passed by `--strict`,
  which is a clean result over a file nobody examined — the one thing
  `--strict` exists to prevent.

### Fixed

- **`extract_urls` answered `{"format": ""}` two different ways.** An
  empty string is not a name: the npm server reads it as absent through
  `if (format)` and refuses, and this resolved it to the plain-text scan
  and answered. Same tool, same schema, two servers, two replies.

- **`extract_urls` sent `"line": null` where the npm server sends no key
  at all.** A URL a parser handed back that could not be located in the
  source keeps its value and loses its position; `JSON.stringify` drops
  an undefined field, and this sent an explicit null, so an agent testing
  `"line" in url` got a different answer from each server.

- **Whitespace is JavaScript's set now, everywhere it is tested.** The
  extension calls `String.prototype.trim` and matches `\s`, and neither
  means what the Rust equivalent means: JavaScript's whitespace includes
  U+FEFF, which Unicode's `White_Space` property does not, and excludes
  U+0085, which it does. That reached five places at once — `format:
  "\u{feff}json"` resolved to `json` on one server and `unknown` on the
  other, a byte-order mark inside a URL ended the match on one server
  only, and a fence or a comment marker behind one was a marker on one
  server only. `extract/js.rs` now defines the set once, in a character
  list and a regex class held equal by a test, and the scanner's
  delimiter class and every trim route through it. `rust-ini` was the
  third dependency in this family to disagree with JavaScript about
  whitespace, which is why the set is spelled out rather than borrowed.

- **A leading byte-order mark reached the TOML parse.** VS Code strips
  one before the extension's engine sees a buffer and `scan.rs` strips
  one before the CLI reads a file, so `extract_urls` was the single entry
  where it survived — and the two TOML implementations disagree about
  whether a document may begin with one, so the same document parsed on
  one server and fell back to a whole-document scan on the other. Both
  servers now strip it at that boundary, which is what SPEC.md has always
  said a leading mark is: three invisible bytes that are not the
  document.

- **A quoted URL inside a JSON comment is trivia, not a string token.**
  `jsonc` is an alias for `json` and the npm server reads these documents
  with `jsonc-parser`'s scanner, which classifies `//` and `/* */` as
  trivia. This was a bare quote scanner that could not see a comment, so
  it extracted from inside one — its own doc comment had claimed a token
  scan all along.

  All five were found by `scripts/differential.ts`, which generates
  documents and argument shapes and requires both servers to answer the
  shared tool identically. Each fix was checked by reverting it and
  confirming the job goes red: a fix whose test cannot fail is not
  verified.

### Added

- **Six CI jobs, each because something real got through this release.**
  `hazards` and `platform` drive the built binary over trees built at
  runtime on all three operating systems — a BOM, a lone CR, invalid
  UTF-8, a 1 MB line, 100k lines, a FIFO, a symlink loop, a
  permission-denied directory, a reserved Windows filename — and every
  case asserts no panic, no hang and an exit code of 0, 1 or 2, never a
  signal. `differential` generates documents and argument shapes and
  requires both MCP servers to answer the shared `extract_urls`
  identically, seed printed on every run. `fuzz` puts a sixty-second net
  over the pure layer and checks that every reported span lines up with
  its source. `budget` holds a 500-file scan to a wall-clock ceiling and
  asserts four times the tree does not cost six times the time.
  `coverage-matrix` writes one file per alias plus a dozen extensions the
  table has never heard of and requires a report line for each.
- **`fixtures/documents/urls.ts`, `urls.csv` and `urls.txt`** —
  `typescript`, `csv` and `plaintext` were advertised formats that no
  corpus document exercised, which `coverage-matrix` is the check for.
- **`csv`, `tsv`, `plaintext`, `txt` and `log`** in the alias table, and
  `csv` and `plaintext` in the advertised format enum, so an agent that
  sends one sees it offered rather than falling through to the fallback.
- **`fixtures/documents/urls.py`, `urls.go` and `urls.sh`** — the
  documents that pin what the whole-document scan actually returns:
  comments, docstrings, f-strings, Go raw literals, quoted shell
  arguments.

### Removed

- **`jsonc-parser`.** Declared and called nowhere; the JSON extractor is
  a hand-rolled token scanner, because the offsets have to be the raw
  document's and a parser hands back values.
- **`rust-ini`.** The INI extractor no longer parses, so nothing calls
  it — and which INI library each language installed was deciding the
  answer, which is the drift the one-scanner design exists to prevent.

### Fixed

- **The CLI and the extension accepted different file extensions.**
  Walking a directory of `icon.svg`, `app.cfg`, `app.conf` and
  `ok.json`, this read one file and the extension read four — the same
  `extract_urls`, two answers, no error either side. This crate lacked
  `mdown`, `mkd`, `env`, `cfg`, `conf`, `svg`, `xsl` and `pom`; the
  extension lacked `mdx`. Both tables now carry all nine, plus `mts` and
  `cts`, which neither had while colors-le, dates-le and paths-le all
  read them.

### Added

- **`fixtures/aliases.json`** — the alias table as a shared contract,
  asserted from `extract/format.rs` and from
  `../scripts/check-extraction-parity.ts`. The divergence above shipped
  in 0.1.0 and nothing failed, because nothing compared the two tables.

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

[0.1.0]: https://github.com/nolindnaidoo/urls-le/releases/tag/crate-v0.1.0

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
