# Changelog

The Rust CLI and MCP server. The VS Code extension has its own
[CHANGELOG](../CHANGELOG.md) and its own version — the two products in
this repository release on their own cadence.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
