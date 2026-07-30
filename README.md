<p align="center">
  <img src="src/assets/images/icon.png" alt="URLs-LE Logo" width="96" height="96"/>
</p>
<h1 align="center">URLs-LE: Zero Hassle URL Extraction</h1>
<p align="center">
  <b>Pull every URL out of the current file in one keystroke</b><br/>
  <i>Markdown, HTML, CSS, JavaScript, TypeScript, JSON, YAML, Properties, TOML, INI, XML</i>
</p>

<p align="center">
  <a href="https://open-vsx.org/extension/nolindnaidoo/urls-le">
    <img src="https://img.shields.io/badge/Install%20from-Open%20VSX-blue?style=for-the-badge&logo=visualstudiocode" alt="Install from Open VSX" />
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.urls-le">
    <img src="https://img.shields.io/badge/Install%20from-VS%20Code-blue?style=for-the-badge&logo=visualstudiocode" alt="Install from VS Code Marketplace" />
  </a>
</p>

---

<p align="center">
  <img src="src/assets/images/demo.gif" alt="URLs-LE Demo" style="max-width: 100%; height: auto;" />
</p>

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

The settings UI is translated into 12 languages besides English.

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

## More from the LE Family

- **[Paths-LE](https://open-vsx.org/extension/nolindnaidoo/paths-le)** - Extract file paths from any codebase • [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.paths-le)
- **[String-LE](https://open-vsx.org/extension/nolindnaidoo/string-le)** - Extract user-visible strings for i18n and validation • [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.string-le)
- **[Numbers-LE](https://open-vsx.org/extension/nolindnaidoo/numbers-le)** - Extract and analyze numeric data with statistics • [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.numbers-le)
- **[EnvSync-LE](https://open-vsx.org/extension/nolindnaidoo/envsync-le)** - Keep .env files in sync with visual diffs • [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.envsync-le)
- **[Regex-LE](https://open-vsx.org/extension/nolindnaidoo/regex-le)** - Test and validate regex patterns with live feedback • [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.regex-le)
- **[Secrets-LE](https://open-vsx.org/extension/nolindnaidoo/secrets-le)** - Detect and sanitize secrets before you commit • [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.secrets-le)
- **[Scrape-LE](https://open-vsx.org/extension/nolindnaidoo/scrape-le)** - Validate scraper targets before debugging • [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.scrape-le)
- **[Colors-LE](https://open-vsx.org/extension/nolindnaidoo/colors-le)** - Extract and analyze colors from stylesheets • [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.colors-le)
- **[Dates-LE](https://open-vsx.org/extension/nolindnaidoo/dates-le)** - Extract temporal data from logs and APIs • [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.dates-le)

## License

MIT © [nolindnaidoo](https://github.com/nolindnaidoo)
