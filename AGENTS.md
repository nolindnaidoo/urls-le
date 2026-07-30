# AGENTS.md — URLs-LE

Technical source of truth for this repo. README.md is the user-facing doc; this file is for anyone (human or agent) changing the code.

## What this is

A VS Code extension that extracts URLs (http/https/ftp/file/mailto/tel) from the active document (Markdown, HTML, CSS, JS/TS, JSON, YAML, Properties, TOML, INI, XML) into a results editor, with dedupe/sort post-processing. No network access — URLs are read from text, never fetched or validated.

## Architecture

```
extension.ts            activate(): createServices() -> registerCommands()
services/serviceFactory createServices(context) -> { telemetry, notifier, statusBar }
commands/               one file per command; deps injected as a frozen bag
extraction/extract.ts   dispatcher: languageId -> FileType -> extractor;
                        content-size cap (10MB), URL-count cap (50k), unknown
                        languages return a 'format' error
extraction/heuristics.ts  THE single URL scanner: five protocol patterns,
                        scanUrls() -> UrlMatch[], toUrls() enrichment,
                        locateParsedValues() for parser-based formats
extraction/position.ts    offset -> {line, column} via newline index (1-based)
extraction/formats/*.ts   one extractor per format; scan-based ones filter the
                        shared scan (markdown: code regions, html: comments,
                        properties: comment lines), parser-based ones
                        (json/toml/ini) walk tokens or values
ui/                     notifier (window messages, gated by notificationsLevel:
                        all -> everything, important -> warn+error, silent ->
                        error only), statusBar
utils/                  errors (sanitizeErrorMessage), safety (size guard +
                        large-file warning)
config/config.ts        getConfiguration() snapshot; CONFIG_DEFAULTS table
types.ts                shared types only — no logic
```

Conventions: factory functions + `Object.freeze` (no classes), early returns, dependency bags typed inline at the consumer. Runtime strings are plain English; the 13 `package.nls*.json` catalogues localize **manifest** strings only (VS Code `%key%` substitution — do not add a runtime i18n layer without wiring real bundles).

## Invariants (things that were once broken — keep them true)

- **The bundle must be self-contained.** The VSIX ships `dist/extension.js` only; `scripts/check-bundle.js` (run in `vscode:prepublish` and CI) does a static require scan AND loads the bundle with `vscode` stubbed. esbuild uses `--main-fields=module,main` because jsonc-parser's UMD build smuggles `require` through a factory parameter.
- **`CONFIG_DEFAULTS` must equal package.json defaults.** `config.test.ts` asserts parity over every declared setting; add new settings to both plus the KEY_MAP in the test.
- **Every declared setting must have a consumer.** v1 shipped 18 no-op settings (of 27 declared); don't add a setting without wiring it.
- **Extractor behavior is pinned by golden snapshots** (`extraction/characterization.test.ts` + `__fixtures__/`). Any output change must update goldens in the same commit and be listed in the CHANGELOG.
- **nls catalogues stay in key-parity:** all 12 locale files carry exactly the keys of `package.nls.json`.
- **URL patterns live in one place** (`extraction/heuristics.ts`). Never re-declare the protocol regexes inside a format extractor — that is exactly how v1 ended up labeling http URLs as https in three formats.
- **All commands notify through the notifier**, so `notificationsLevel` applies uniformly; errors always show.

## Toolchain

- **Build:** esbuild bundle (`bun run build`, `build:prod` minified). `tsc` is typecheck-only (`noEmit`) and covers test files.
- **Unit tests:** vitest; `vscode` aliased to `src/__mocks__/vscode.ts` (stateful mock with `_reset/_set` helpers). Coverage thresholds enforced: 80 lines / 80 funcs / 75 branches / 80 stmts.
- **Integration tests:** `bun run test:integration` — `@vscode/test-cli` launches a real VS Code (config in `.vscode-test.mjs`, tests compiled via `tsconfig.it.json` to `out-test/`).
- **Lint/format:** Biome (tabs, single quotes). `__fixtures__`/`__snapshots__` are exempt — formatting fixtures would corrupt goldens.
- **Packaging:** `bun run package` → `release/*.vsix`. `.vscodeignore` is an allow-list; the VSIX is ~21 files.

## Release

1. Bump `version` in package.json, add a CHANGELOG entry.
2. CI green on all 3 OSes (includes packaging + integration tests).
   Locally, `bun run package && bun run test:e2e-vsix` proves the actual
   VSIX installs and works in a clean VS Code profile.
3. `Release` workflow (manual dispatch) publishes to the VS Code Marketplace (`VSCE_PAT`) and Open VSX (`OVSX_PAT`) — Open VSX is what Cursor/VSCodium users install from. Locally: `bun run package` then `vsce publish` / `ovsx publish`.

## Known limitations (documented, not bugs)

- A URL ends at whitespace or any of ``< > " { } | \ ^ ` [ ] ; ) '`` — URLs containing raw spaces extract as space-terminated partials; trailing `.`/`,` are kept (legal URL characters).
- YAML and JS/TS extraction includes comments by design (a URL in a commented-out line is still discoverable); Markdown code blocks, HTML comments, and Properties comment lines are excluded.
- TOML/INI positions come from forward-locate over the source (no offsets from @iarna/toml or ini); repeated identical values resolve to successive occurrences, and values whose raw form differs from the parsed form (escape sequences) are reported without a position.
- JSON escaped URL forms (`https:\/\/…`) don't match — the scan runs over raw string tokens.
