<p align="center">
  <img src="src/assets/images/icon.png" alt="URLs-LE Logo" width="96" height="96"/>
</p>
<h1 align="center">URLs-LE: Zero Hassle URL Extraction</h1>
<p align="center">
  <b>Pull every URL out of the current file in one keystroke</b><br/>
  <i>Markdown, HTML, CSS, JavaScript, TypeScript, JSON, YAML, Properties, TOML, INI, XML</i>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.urls-le">
    <img src="https://img.shields.io/badge/Install%20from-VS%20Code-blue?style=for-the-badge&logo=visualstudiocode" alt="Install from VS Code Marketplace" />
  </a>
  <a href="https://letools.dev">
    <img src="https://img.shields.io/badge/LE%20Tools-letools.dev-blue?style=for-the-badge" alt="LE Tools" />
  </a>
</p>

---

<p align="center">
  <img src="src/assets/images/demo.gif" alt="URLs-LE Demo" style="max-width: 100%; height: auto;" />
</p>

> **Useful?** A star or rating is how other developers find it —
> [★ GitHub](https://github.com/nolindnaidoo/urls-le) ·
> [★ Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.urls-le&ssr=false#review-details) ·
> [★ Open VSX](https://open-vsx.org/extension/OffensiveEdge/urls-le/reviews)

## What it does

Open a file, press `Ctrl+Alt+U` (`Cmd+Alt+U` on Mac), and every URL in the document lands in a new editor — deduplicate and sort it from there. Works in VS Code and in VS Code–based editors like Cursor and VSCodium (installable from Open VSX).

- **Link auditing** — every link, autolink, and plain URL in Markdown and HTML (code blocks and comments excluded)
- **Source review** — URLs in string literals, template literals, and comments across JS/TS
- **Config sweep** — URLs in JSON strings, YAML values, Java properties, TOML/INI values, and XML (Maven POMs, feeds)

## Supported formats

| Format | Language IDs | Notes |
|---|---|---|
| Markdown | `markdown` | Fenced code blocks and inline code excluded |
| HTML | `html` | `<!-- -->` comments excluded (multi-line supported) |
| CSS | `css` | Quoted or bare `url(...)`, `@import` |
| JavaScript / TypeScript | `javascript`, `typescript` | Strings, template literals, comments |
| JSON | `json` | String literals only, via jsonc-parser token offsets |
| YAML | `yaml` | Whole content, comments included |
| Properties | `properties` | `#`/`!` comment lines excluded |
| TOML | `toml` | Parsed values only; comments excluded |
| INI | `ini` | Parsed values only; comments excluded |
| XML | `xml` | Attributes and text content |

Extracted protocols: `http`, `https`, `ftp`, `file`, `mailto` (requires an `@`), `tel`. Every occurrence is reported with its real line and column — TOML/INI positions are forward-located in the source and can be approximate for repeated identical values. A URL ends at whitespace or a quote/bracket delimiter, so relative links (`/docs`) and bare domains (`example.com`) are never extracted, and URLs containing raw spaces extract as space-terminated partials. Trailing `.`/`,` are kept — they are legal URL characters.

## Commands

| Command | Description |
|---|---|
| `URLs-LE: Extract URLs` (`Ctrl+Alt+U` / `Cmd+Alt+U`) | Extract all URLs from the active document |
| `URLs-LE: Deduplicate URLs` | Remove duplicate lines from the results |
| `URLs-LE: Sort URLs` | Sort results alphabetically, by domain, or by length |
| `URLs-LE: Open Settings` | Open URLs-LE settings |
| `URLs-LE: Help` | Built-in documentation |

## Settings

| Setting | Default | Description |
|---|---|---|
| `urls-le.openResultsSideBySide` | `true` | Open results beside the current editor |
| `urls-le.postProcess.openInNewFile` | `true` | Open results in a new file (when not side-by-side) |
| `urls-le.copyToClipboardEnabled` | `false` | Also copy results to the clipboard |
| `urls-le.dedupeEnabled` | `false` | Deduplicate extraction results automatically |
| `urls-le.notificationsLevel` | `silent` | `all` = every notification, `important` = warnings + errors, `silent` = errors only |
| `urls-le.safety.enabled` | `true` | Guardrails for very large files |
| `urls-le.safety.fileSizeWarnBytes` | `1000000` | Refuse extraction above this file size |
| `urls-le.safety.largeOutputLinesThreshold` | `50000` | Warn above this line count |
| `urls-le.statusBar.enabled` | `true` | Show the status bar item |
| `urls-le.telemetryEnabled` | `false` | Local-only event log (see Privacy) |

## Languages

Twelve languages besides English:

German · Spanish · French · Indonesian · Italian · Japanese · Korean ·
Portuguese (Brazil) · Russian · Ukrainian · Vietnamese · Chinese (Simplified)

Both halves are covered — the manifest (command titles, setting names and
descriptions) and everything shown while the extension runs (notifications,
the status bar, the sort quick-pick). The extension follows VS Code's display
language, so it matches whatever the editor is already set to; no setting of
its own.

## Privacy & security

- **No network access.** The extension never fetches, validates, or pings the URLs it extracts — it only reads the text of the active document. The `telemetryEnabled` setting writes events to a local Output Channel you can inspect (`URLs-LE Telemetry`); nothing leaves your machine.
- Error notifications redact home directories and credential-shaped fragments.

## Development

```bash
bun install
bun run build            # esbuild bundle -> dist/extension.js
bun run typecheck        # tsc --noEmit (includes tests)
bun run test             # vitest unit suite
bun run test:integration # real VS Code extension host
bun run lint             # biome
bun run package          # VSIX into release/
```

Architecture and conventions live in [AGENTS.md](AGENTS.md). Changes are tracked in [CHANGELOG.md](CHANGELOG.md).

## Performance

<!-- performance:start -->
| Input | Size | Found | Time | Rate | Scan speed |
| --- | --- | --- | --- | --- | --- |
| Markdown docs | 2.63 MB | 50,000 | 61.14 ms | 817,802/sec | 43 MB/s |
| HTML page | 1.25 MB | 30,000 | 21.88 ms | 1,370,972/sec | 57 MB/s |
| JSON config | 1.52 MB | 40,000 | 39.01 ms | 1,025,358/sec | 38.8 MB/s |

Median of 7 runs after warmup, on Apple M5 Pro, 24 GB RAM, Node 24.3.0. Inputs are generated
by `scripts/benchmark.ts` rather than checked in, so the sizes above are
exactly what was measured. Reproduce with `bun run benchmark`.

These are machine-specific and are not asserted in CI — a benchmark that gates
a build only tells you how busy the runner was.
<!-- performance:end -->

## Testing

<!-- coverage:start -->
| Metric | Coverage |
| --- | --- |
| Statements | 95.10% |
| Branches | 86.75% |
| Functions | 95.54% |
| Lines | 95.41% |

290 test cases across 21 files, plus an integration suite that runs
in a real VS Code extension host and an end-to-end test that installs the
built `.vsix` into a clean profile.

Generated from `coverage/coverage-summary.json` by
`scripts/coverage-readme.js`; CI fails if this section drifts from a fresh
run. Reproduce with `bun run test:coverage`.
<!-- coverage:end -->

## More from the LE Family

Every tool in the family, one page: **[letools.dev](https://letools.dev)**

- **[Paths-LE](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.paths-le)** - Extract file paths from JS/TS imports, JSON, HTML, CSS, TOML, CSV, and .env
- **[String-LE](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.string-le)** - Extract string values for i18n from JSON, YAML, CSV, TOML, INI, and .env
- **[Numbers-LE](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.numbers-le)** - Extract numeric values from JSON, YAML, CSV, TOML, INI, and .env
- **[EnvSync-LE](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.envsync-le)** - Spot missing keys across your .env files, with a markdown report
- **[Regex-LE](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.regex-le)** - Find, test, and validate regular expressions with ReDoS screening
- **[Secrets-LE](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.secrets-le)** - Detect and sanitize credentials locally, before you commit
- **[Scrape-LE](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.scrape-le)** - Check whether a page is scrapeable before you write the scraper
- **[Colors-LE](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.colors-le)** - Extract and analyze colors from CSS, SCSS, LESS, Stylus, HTML, JS/TS, and SVG
- **[Dates-LE](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.dates-le)** - Extract and analyze dates from logs, configs, and code

## Also by nolindnaidoo

**Rust**

- **[pixelcoords](https://github.com/nolindnaidoo/pixelcoords)** - Mark pixel-exact coordinates machines can use · [pixelcoords.dev](https://pixelcoords.dev)
- **[pixelactions](https://github.com/nolindnaidoo/pixelactions)** - Perform the interaction and confirm it landed · [pixelactions.dev](https://pixelactions.dev)

**Contact Developer** — [GitHub](https://github.com/nolindnaidoo) · [LinkedIn](https://www.linkedin.com/in/nolindnaidoo/)

## License

MIT © [nolindnaidoo](https://github.com/nolindnaidoo)
