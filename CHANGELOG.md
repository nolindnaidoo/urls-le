# Changelog

All notable changes to URLs-LE will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2026-08-03

### Added

- Rating links in the in-extension help output, for both the VS Code
  Marketplace and Open VSX. Acquisitions exceed listing page views, so most
  users never see the listing's rating control; help is the surface they do
  reach.

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
