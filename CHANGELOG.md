# Changelog

All notable changes to URLs-LE will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.3] - 2026-08-05

### Changed

- Documentation and packaging metadata only — no behaviour change.

  The MCP server's source now explains its decisions rather than restating its
  code: why MCP's stdio transport is line-delimited and what happens to a client
  if you copy LSP's framing, why a tool failure is a result carrying `isError`
  rather than a JSON-RPC error and what each does to a model's next move, why
  the result cap is measured in context windows rather than milliseconds, and
  why `truncated` matters more than the cap itself.

- The npm package declares `publishConfig.provenance`, so a release published
  from CI carries a Sigstore attestation binding the tarball to the commit and
  workflow that built it. A consumer can verify it with `npm audit signatures`.

- The registry entry names its registry (`registryBaseUrl`) and how to run the
  package (`runtimeHint`), rather than leaving a client to infer both.

- Package metadata points at the author's site, and the npm page links the rest
  of the family, the Rust tools and their crates.

## [2.2.2] - 2026-08-05

### Changed

- Documentation only — no behaviour change.

  The README described a keyboard shortcut and little else. 2.2.1 added an MCP
  server that VS Code registers with agent mode, published it to npm and to the
  official MCP registry, and submitted a Zed extension — and a reader could
  discover none of it from this page. There is now a section for calling the
  tool from an agent, including the JSON config for hosts that use one and a
  one-line check that the server answers before you wire it into anything.

  The privacy section previously spoke only for the extension. It covers the
  server too, which is the part an agent actually runs.

  The registry listing gains a display name, an icon and a link to letools.dev;
  the npm page gains the badges and links it was missing. Every surface now
  points at the others.

## [2.2.1] - 2026-08-05

### Changed

- **VS Code 1.101 is now the minimum.** `engines.vscode` moves from `^1.90.0`
  to `^1.101.0` and `@types/vscode` is pinned exactly to the new floor, per the
  rule that the declared floor and the type surface must match. 1.101 is the
  first stable release carrying `registerMcpServerDefinitionProvider`, which
  the MCP integration needs — declaring the contribution point against an older
  floor would be a claim the code could not honour. Cursor and VSCodium track
  well past this; Cursor 3.6.21 reports 1.105.1.

### Added

- An MCP server, shipped inside the VSIX as `dist/mcp-server.js`. It exposes
  `extract_urls` over stdio, so an agent can pull every URL out of a document
  with its protocol and 1-based position. The same server is published to npm
  for hosts outside VS Code.

  It imports the extraction engine and nothing from `vscode` —
  `check:mcp-bundle` fails the build if that stops being true, because the
  server has to run in Zed, in Claude Code, and from `npx`.

- The extension now offers that server to VS Code's agent mode, so installing
  it adds `extract_urls` to the agent's tools alongside the existing commands.
  Nothing is downloaded at runtime: the server is the copy inside the VSIX.
  The registration is skipped on editors that do not implement the API, which
  is not an error — an editor without agent mode is not a broken install.

- The server is on npm as [`urls-le-mcp`](https://www.npmjs.com/package/urls-le-mcp),
  so `npx urls-le-mcp` gives the same tool to Claude Code, Cursor, Windsurf or
  anything else that speaks MCP. It is the same build the VSIX carries, and its
  version is written from this manifest rather than maintained separately —
  one version number means one build, whichever host it came from.

- A **Zed extension**, under `zed/`. Zed's extension API has no way to read the
  active buffer or register a command, so the ten LE extensions could never be
  ported to it in any language; a context server is the surface that fits. The
  crate is a launcher — it installs `urls-le-mcp` and starts it with Zed's
  Node — so there is no second implementation to keep in agreement with the
  goldens.

  The protocol is hand-rolled in `src/mcp/transport.ts`.
  `@modelcontextprotocol/sdk` was measured first and rejected: 60 packages and
  5.9 MB against a 66 KB extension bundle, and esbuild could not resolve its
  subpath exports without marking them external, which would have broken the
  self-contained-bundle invariant. These tools are pure functions over a
  string, so the surface needed is five methods over newline-delimited
  JSON-RPC. The built server is 59 KB. Everything protocol-shaped lives in one
  file, so adopting the SDK later is a one-file change.

  Two things the boundary fixes rather than the engine, whose behaviour is
  pinned by goldens: `extractUrls` reports `success: false` for an empty run,
  which is a true result and not a failure, so the envelope's `ok` is driven by
  whether a diagnostic is actually an error; and `maxResults` caps output at
  500 by default, because an unbounded extraction of up to 50,000 URLs would
  flood an agent's context window.

## [2.1.0] - 2026-08-05

### Added

- Runtime strings are localized again, and this time they render. All 25 of
  them — notifications, the status bar, the sort quick-pick — go through
  `vscode.l10n` and ship as twelve translated bundles in `l10n/`. The v1.x
  line carried full catalogues that never reached the screen: `vscode-nls`
  was configured without `__filename`, so every string fell back to English
  while the VSIX looked correct. Verified on a host launched with
  `--locale=de`, where the extension now reports `URLs-LE: Bereit`.
- An integration test covering both localization mechanisms — manifest
  substitution, catalogue key parity across all thirteen files, and
  placeholder integrity in every translation. A translation that silently
  drops `{0}` now fails the build instead of shipping a message with the
  number missing.
- Dependency review on pull requests, failing on a high-severity addition
  before Dependabot's auto-merge can act.

### Fixed

- The extract command reported a count after an output route had failed. A
  document that would not open, or an edit the workspace rejected, showed an
  error and was then followed by "Extracted N URLs" — a failure and a success
  for one action. Delivery is now checked before anything is announced.
- Three setting descriptions were left in English in all twelve catalogues
  because their wording had changed during the 2.0 rehab — from "warn" to
  "refuse" on the file-size threshold, and from suppressing all
  notifications to showing only errors. Reusing the old translations would
  have described behaviour the extension no longer has, so they are
  retranslated rather than restored.
- The status bar resolved its idle label at module scope, which fixed the
  string to whatever was loaded at require time rather than at activation.
- Sort and dedupe reported success for edits that were never applied.
  `vscode.workspace.applyEdit` returns `false` when an edit is rejected — a
  read-only document, or one that changed underneath the command — and both
  discarded that value, then announced "Sorted 12 URLs" or "Removed 3
  duplicate URLs" over a document they had not touched. `extract.ts` already
  checked the result; it is now the one behaviour, with a regression test that
  drives a rejected edit.
- The dedupe result message was still an interpolated template literal, so it
  was the one runtime string in this extension that could never be translated.
- Extraction was not actually interruptible. It created its own
  `CancellationTokenSource`, threaded the token through six
  `isCancellationRequested` checks and disposed it — but nothing ever called
  `cancel()`, so the token was a permanent `false` and none of those checks
  could fire. The token now comes from a cancellable progress notification, so
  the Cancel button on it does what it appears to do.
- Cancelling partway through announced a success anyway. A cancel landing
  between the extraction and the output route left nothing opened and no edit
  applied, and the command still reported "Extracted N URLs" over a result the
  user never received. Surfaced by the first tests that could reach those
  checks.

### Changed

- The extraction engine no longer imports `vscode`. It used the type
  `vscode.CancellationToken` for one property, so the parameter is now a
  structural `CancellationSignal` that a real token satisfies. Nothing about
  the extension changes; the engine can now run anywhere a string can, which
  is what a port to another editor — or an MCP server, or a CLI — would need.

- `commands/extract.ts` no longer holds orchestration, output routing,
  clipboard handling and error mapping in one 354-line file. Routing moved to
  `commands/output.ts` and the clipboard to `utils/clipboard.ts`, leaving the
  command at 171 lines. The private `replaceDocumentContent` it carried — a
  second copy of the shared helper, hand-building the same full-document range
  — is gone; there is one implementation again.
- Guard clauses replace the two remaining `else` blocks (`ui/statusBar.ts`,
  `extraction/position.ts`), per the code style in `AGENTS.md`.

- Test coverage raised to 87.61% of branches and 95.85% of statements. The
  sort command offers five orderings and only the default was exercised, so
  four comparators and the rejected-edit guard never ran; opening results in a
  new file, replacing the document in place, and every failure arm behind them
  — a rejected edit, a document that will not open, a denied clipboard — were
  untested as well.

  One file stays below a floor because the uncovered code cannot run rather
  than because it is untested, and it is recorded rather than papered over:
  `extraction/formats/ini.ts` falls back to a plain scan when the parser
  throws, but the `ini` package is fully lenient — unclosed sections, keys with
  no name and conflicting nested keys all parse without error, so the fallback
  cannot fire.


- `replaceDocumentContent`, `fullDocumentRange` and `collectStrings` are each
  defined once. The first existed three times and the other two twice —
  including the edit that replaces the user's entire document.
- CI gains fleet-wide checks that no single repo can perform: shared config is
  compared across all ten extensions, and every README link is verified —
  including Open VSX links, which are checked against the API because
  open-vsx.org answers HTTP 200 for extensions that do not exist.

## [2.0.1] - 2026-08-04

### Changed

- Marketplace categories re-targeted for discovery. `Other` is dropped
  (65,992 extensions, no discovery value); each extension now sits in
  categories matching how it is actually used.
- Search keywords widened to 30, targeting the terms users actually type
  rather than internal vocabulary.
- Toolchain moved to current: TypeScript 7, vitest 4, Biome 2.5.7,
  @types/node 26. `@types/vscode` is now pinned exactly to the
  `engines.vscode` floor — the caret had let the type surface drift 15
  minors ahead of the version actually supported.
- Runtime dependencies updated across majors where present: csv-parse 7,
  ini 7, js-yaml 5. Extraction output is unchanged, verified against the
  characterization goldens.
- Packaging no longer walks the npm tree (`vsce package --no-dependencies`).
  The bundle is self-contained, so the walk served no purpose and failed
  after any dependency change. Scrape-LE keeps it, since it genuinely
  ships `playwright-core`.
- Documentation claims corrected against the code. Removed: Numbers-LE
  "with statistics", EnvSync-LE "visual diffs", Regex-LE "live feedback",
  String-LE "and validation" — none of those features exist.

### Added

- Rating links in the in-extension help output, for both the VS Code
  Marketplace and Open VSX. Acquisitions exceed listing page views, so most
  users never see the listing's rating control; help is the surface they do
  reach.
- README now carries measured Performance and Testing sections, both
  generated rather than written — from `scripts/benchmark.ts` and from the
  coverage summary. CI fails if the coverage numbers drift from a real run.
- Coverage thresholds enforced at 75 lines / 80 functions / 60 branches /
  75 statements.
- CodeQL scanning, Dependabot with grouped weekly updates, and auto-merge
  limited to patch and minor devDependency bumps that pass CI.

## [2.0.0] - 2026-07-29

Full rehabilitation release. The headline: **v1.x VSIXes built from this
repo could not activate** — the build had no bundler while the package
excluded `node_modules`, so the extension crashed on load with
`Cannot find module 'vscode-nls'`. 2.0.0 ships a self-contained esbuild
bundle, verified by a packaging gate and a real extension-host
integration suite on every CI run.

### Fixed

- **Packaging**: `dist/extension.js` is now a single self-contained
  bundle (VSIX: 66 files → 21). A bundle gate (static require scan +
  loading the bundle with `vscode` stubbed) blocks any regression.
- **Config**: non-numeric setting overrides no longer produce `NaN`
  thresholds; the string `"false"` no longer reads as `true`; the code
  fallbacks for `postProcess.openInNewFile` / `openResultsSideBySide`
  said `false` while the manifest says `true` — `CONFIG_DEFAULTS` now
  provably matches manifest defaults (asserted by a test), and the
  phantom `notificationLevel` (singular) lookup is gone.
- **Dedupe/Sort/Extract**: whole-document replacement overshot the last
  line; dedupe counted removed blank lines as "duplicates".
- **Status bar**: reacts to `statusBar.enabled` changes without reload
  (was created once from a config snapshot, and re-showed itself even
  when disabled).
- **Context menu**: the `resourceExtname in …` when-clause never
  matched — the entry had never appeared; replaced with an
  `editorLangId` regex.
- **Runtime localization**: removed. It never worked — `vscode-nls` was
  configured without a filename and no language bundles were ever
  generated, so every locale saw English. Runtime strings are plain
  English now; manifest/settings translations (13 catalogues) keep
  working and are pruned to exact key parity.

### Changed — extraction output

- **Protocols are real everywhere**: CSS labeled every http URL
  `https`; JSON and YAML did the same. The scheme decides now.
- **Real line/column positions everywhere**: TOML/INI previously
  returned no positions at all (and TOML context was a key path, now
  the source line); JSON positions come from jsonc-parser token
  offsets; columns point at the URL itself, including inside
  `[text](url)` and `<url>` in Markdown.
- **Every occurrence is reported**: markdown/html/javascript silently
  dropped repeated URL values. Value-level dedup belongs to the dedupe
  command and the (now actually wired) `dedupeEnabled` setting.
- **One scanner** (`extraction/heuristics.ts`) replaces five protocol
  regexes copy-pasted into ten files: XML no longer emits attribute
  URLs twice, JS/TS template-literal URLs no longer double-emit, HTML
  comments spanning multiple lines are now excluded, and mailto/tel
  well-formedness (`@` required, non-empty subject) applies in every
  format instead of two.
- **Unknown languages return a format error** instead of silently
  running the markdown extractor.
- Documented limitations: URLs with raw spaces extract as
  space-terminated partials; trailing `.`/`,` are kept; YAML/JS
  comments contribute URLs by design; JSON escaped forms
  (`https:\/\/…`) don't match.

### Removed

- 16 settings with no live consumer (`analysis.*`, `performance.*`,
  `keyboard.*`, `presets.*`, `showParseErrors`,
  `safety.manyDocumentsThreshold`). 10 real settings remain, each with
  a consumer: `dedupeEnabled` and `safety.largeOutputLinesThreshold`
  are newly wired, and `notificationsLevel` now applies to every
  command (`all` / `important` / `silent`, default `silent`).
- The `Toggle CSV Streaming` command — it toggled a setting nothing
  read, for a format this extension does not parse.
- Eleven dead modules (analysis, validation, url-validation service,
  accessibility, performance monitoring, config validator, webview,
  prompts, large-output UI, URL provider, settings schema) and the
  three services built for them that no command ever consumed.
- The fabricated documentation set: `ENTERPRISE_QUALITY.md`, `docs/`
  (including performance results for a CSV format that never existed)
  and README claims ("10,000+ URLs per second", "95% coverage",
  "Fortune 10 quality") that nothing in the repo substantiated.

### Development

- esbuild toolchain; `tsc --noEmit` typechecks tests too; Biome.
- 242 unit tests (90% line coverage, thresholds enforced at 80/80/75/80)
  against a stateful `vscode` mock; characterization goldens pin every
  extractor's output; 4 integration tests run in a real extension host.
- CI on 3 OSes: lint → typecheck → coverage → build → bundle gate →
  package → integration; manual-dispatch release workflow publishes to
  the VS Code Marketplace and Open VSX.

## [1.8.1] and earlier - 2025

Condensed: iterative development of the original template
(1.0.0–1.8.1). These entries claimed extensive security hardening,
"enterprise-grade reliability", and performance figures; the 2.0.0
audit found the shipped artifact could not activate, runtime
localization never functioned, 18 of 27 settings were inert, and the
documented metrics were not reproducible from the repo. Treat pre-2.0
entries as historical record only.
