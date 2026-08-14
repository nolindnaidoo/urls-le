<h1 align="center">urls-le</h1>

<p align="center">
  <b>Extract every URL from a codebase, with its protocol and exact position</b><br/>
  <i>every file, one scanner — and no opinions about what it found</i>
</p>

<p align="center">
  <a href="https://crates.io/crates/urls-le">
    <img src="https://img.shields.io/crates/v/urls-le.svg" alt="urls-le on crates.io" />
  </a>
  <a href="https://crates.io/crates/urls-le">
    <img src="https://img.shields.io/crates/d/urls-le.svg" alt="crates.io downloads" />
  </a>
  <a href="https://github.com/nolindnaidoo/urls-le/actions/workflows/ci-crate.yml">
    <img src="https://github.com/nolindnaidoo/urls-le/actions/workflows/ci-crate.yml/badge.svg" alt="Build Status" />
  </a>
  <img src="https://img.shields.io/badge/rustc-1.88+-93450a.svg" alt="MSRV: Rust 1.88+" />
  <a href="https://github.com/nolindnaidoo/urls-le/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" />
  </a>
  <a href="https://letools.dev/tools/urls-le">
    <img src="https://img.shields.io/badge/web-letools.dev-00A0FF.svg" alt="letools.dev" />
  </a>
</p>

> **Useful?** A star is how other developers find it —
> [★ GitHub](https://github.com/nolindnaidoo/urls-le) ·
> [letools.dev/tools/urls-le](https://letools.dev/tools/urls-le)

`grep -o 'https\?://[^ ]*'` finds URLs. It also finds them inside fenced
code blocks, misses the one in a TOML value it can't see the string
boundary of, and hands you back half a URL because it guessed where the
delimiter was. urls-le knows the difference between a URL in a Markdown
link and one in a `<!-- comment -->`, and it gives you the line and
column of each.

Then it stops. **This tool extracts; what the URLs mean is your call.**

It is the second frontend of
[URLs-LE](https://github.com/nolindnaidoo/urls-le#readme), the VS Code
extension — one product, two frontends, one repository, so the two can
never read a document differently. The corpus both build against lives
at
[`crate/fixtures/`](https://github.com/nolindnaidoo/urls-le/tree/main/crate/fixtures),
and CI fails on drift.

## Sixty seconds

```bash
urls-le .                       # every URL in the tree
urls-le --dedupe docs/          # one line per distinct URL
cat README.md | urls-le --stdin --format markdown

# the point of the whole thing:
urls-le . | jq -r '.urls[].value' | sort -u | lychee -
```

```
./config.toml:1:13  https://example.org/start
./docs/guide.md:3:13  https://example.com/api
./docs/guide.md:3:44  https://example.com/ref
3 URLs in 2 files
```

**Exit codes follow grep** — `0` URLs found, `1` none found, `2` the
question was malformed. Finding none is an answer, not an error, which is
what makes `if urls-le src/; then …` work.

## Install

| Route | Command | Worth knowing |
|---|---|---|
| **cargo** | `cargo install urls-le` | Any platform, needs **Rust 1.88+**. |
| **From source** | `git clone https://github.com/nolindnaidoo/urls-le`<br>`cd urls-le/crate && cargo build --release` | The same build CI runs. |

No runtime, no network, nothing written.

## Why it has no opinions

The obvious next features are all judgments: fetch each URL to see if it
404s, flag `http://` as insecure, flag a password in the userinfo, flag a
private address. Every one is absent, deliberately.

An `http://` URL is wrong in a production config and correct in a test
fixture. A `localhost` URL is a bug in one repository and the whole point
in another. **A tool that decides for you is a tool you configure, then
argue with, then mute — and the muting takes the extraction with it.**

Link checking is also already solved. `lychee`, `muffet` and `htmltest`
do it well, and each needs a network, which would stop this being a cheap
deterministic CI step. The value here is the list, not a verdict on it —
so pipe it to one of those and let it have the opinions.

A contract test asserts that no flag asks for a judgment, so the boundary
is enforced rather than merely written down.

## What it reads

**Every text file.** Thirteen format names are recognised, the same
thirteen the extension accepts. Eleven of them know what to exclude —
**Markdown, HTML, CSS, JavaScript, TypeScript, JSON, YAML,
`.properties`, TOML, INI, XML** — and `csv` and `plaintext` are named
because a caller can ask for them, though there is nothing in either
worth excluding. Everything else is scanned whole.

Each format decides *which part of the document* to scan, and nothing
else — that is what one shared scanner buys. Markdown skips fenced blocks
and inline code spans. HTML skips comments. JSON reads string literals
only, and a comment is trivia there rather than a string. `.properties`
and INI skip comment lines. TOML parses first and locates each value back
in the source, falling back to a whole-document scan when the file does
not parse — so a broken config still yields its URLs.

A `.py`, a `.go`, a `.sh`, a `Dockerfile` gets that same whole-document
scan, because a URL is unambiguous in any text and there is nothing in
those worth excluding. The report's `format` field says which pass ran,
so a `.py` comes back as `plaintext` and a `.csv` as `csv`. Nothing is
refused for its name.

A directory is walked the way ripgrep walks one: `.gitignore` honoured,
hidden files skipped, `--no-ignore` and `--hidden` to reach the rest. A
file named explicitly is always read. Files that are not text — a PNG, a
zip — are named on stderr and carried in the report as `skipped`, and do
not fail the run unless you ask with `--strict`.

### Ported as-is, including the awkward parts

- **A URL ends at whitespace or at the extension's delimiter set** —
  angle brackets, quotes, braces, pipes, backslash, caret, backtick,
  square brackets, semicolon, close-paren, apostrophe.
- **Trailing punctuation is kept.** `https://x.com/a.` keeps its dot,
  because a dot can be part of a URL and stripping it would corrupt the
  ones that genuinely end that way. A documented limitation, not a bug.
- **Every occurrence is its own result**, with its own position.
  `--dedupe` is opt-in, because which repeats matter is your call.
- **`mailto:` needs an `@`; `tel:` needs a subject.**
- **Limits are behaviour**: 10 MB of content and 50,000 URLs per
  document, both reported when they bind so a truncated result is never
  mistaken for a complete one.

## Options

```
--dedupe             collapse repeated URLs to their first occurrence
--format <format>    force a format instead of inferring from the name
--stdin              read one document from stdin
--follow-symlinks    descend symlinked directories when walking a tree
--hidden             walk hidden files and directories too
--no-ignore          walk files that .gitignore excludes
```

## As an MCP server

```bash
urls-le mcp
```

Two tools, both returning `{ ok, data, diagnostics, meta }`:

- **`extract_urls`** — content in, URLs out. Touches no filesystem. The
  npm server ships the same tool with byte-identical output; one corpus
  runs against both.
- **`urls_le_scan`** — files or directories in, the same reports the CLI
  writes.

`ok` means the scan ran, never that it found something. A document with
no URLs is a result, not an error.

## The other four ways to run it

| Where | What you get | Install |
|---|---|---|
| **VS Code** | The extraction, in your editor, on a keystroke | [Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.urls-le) |
| **Cursor, VSCodium, Windsurf** | The same extension | [Open VSX](https://open-vsx.org/extension/OffensiveEdge/urls-le) |
| **Any MCP agent, via Node** | `extract_urls` over stdio | `npx urls-le-mcp` · [npm](https://www.npmjs.com/package/urls-le-mcp) |
| **Zed** | The MCP server as a context server | [zed-industries/extensions#7077](https://github.com/zed-industries/extensions/pull/7077) *(pending review)* |

All sixteen LE tools are on **[letools.dev](https://letools.dev)**.

## Documentation

| What | Where |
|---|---|
| What this tool is allowed to say — scope, output contract, refusals, non-goals | [SPEC.md](https://github.com/nolindnaidoo/urls-le/blob/main/crate/SPEC.md) |
| How the code is written and held together — architecture, invariants, the gates | [AGENTS.md](https://github.com/nolindnaidoo/urls-le/blob/main/crate/AGENTS.md) |
| The VS Code extension this shares its extraction with | [README.md](https://github.com/nolindnaidoo/urls-le/blob/main/README.md) |
| What changed | [CHANGELOG.md](https://github.com/nolindnaidoo/urls-le/blob/main/crate/CHANGELOG.md) |
| The tool's page, and the other fifteen | [letools.dev/tools/urls-le](https://letools.dev/tools/urls-le) |

## More from the LE family

Sixteen single-purpose tools for the work in front of every model. Each ships
a Rust CLI and an MCP server. One page: **[letools.dev](https://letools.dev)**

**Get it out**

- **[String-LE](https://letools.dev/tools/string-le)** — Extract every string in a codebase, with its position, so a person can read them
- **[Numbers-LE](https://letools.dev/tools/numbers-le)** — Extract every hardcoded number in a codebase, so a person can check them
- **[Units-LE](https://letools.dev/tools/units-le)** — Extract every quantity with its unit, normalized, and refuse the ambiguous ones by name
- **[Dates-LE](https://letools.dev/tools/dates-le)** — Extract every date and timestamp, and the exact instant each one resolves to
- **[IDs-LE](https://letools.dev/tools/ids-le)** — Extract every UUID, ULID, NanoID, ObjectId and Snowflake, and decode the time inside
- **[IPs-LE](https://letools.dev/tools/ips-le)** — Extract every IP address, CIDR block and MAC, normalized and classified by scope
- **[URLs-LE](https://letools.dev/tools/urls-le)** — Extract every URL in a codebase, with its protocol and exact position
- **[Paths-LE](https://letools.dev/tools/paths-le)** — Extract every file path in a codebase, and say whether it still points at anything
- **[Colors-LE](https://letools.dev/tools/colors-le)** — Extract every color in a codebase, and say which ones are not in your palette

**Check it**

- **[Regex-LE](https://letools.dev/tools/regex-le)** — Find every regex in a codebase, and report which can be driven into catastrophic backtracking
- **[Versions-LE](https://letools.dev/tools/versions-le)** — Find where one dependency is constrained differently across a repository's manifests
- **[i18n-LE](https://letools.dev/tools/i18n-le)** — Identify the i18n library a project uses, then audit its catalogs by that library's rules
- **[Scrape-LE](https://letools.dev/tools/scrape-le)** — Check whether a page is scrapeable before the scraper is written, and say when it cannot tell

**Guard it**

- **[Secrets-LE](https://letools.dev/tools/secrets-le)** — Find hardcoded credentials in a codebase, and never print one into the report
- **[EnvSync-LE](https://letools.dev/tools/envsync-le)** — Compare the dotenv files in a tree, and say which keys are missing from which
- **[Unicode-LE](https://letools.dev/tools/unicode-le)** — Find the Unicode that hides meaning — bidi controls, invisibles, homoglyphs, mixed scripts

Each stands on its own: no shared crate, no published core. Where two of them
agree, it is because the same answer was right twice.

**Contact** — [nolindnaidoo.com](https://nolindnaidoo.com) · [GitHub](https://github.com/nolindnaidoo) · [LinkedIn](https://www.linkedin.com/in/nolindnaidoo/)

## Also by nolindnaidoo

**Rust** — pixelcoords and pixelactions are one loop: pixelcoords answers
*where*, pixelactions *acts* there. Their own tools, their own voice — not
part of the LE family.

- **[pixelcoords](https://github.com/nolindnaidoo/pixelcoords)** — Freeze your screen, mark regions, get pixel-exact coordinates and crops
  [pixelcoords.dev](https://pixelcoords.dev) · [crates.io](https://crates.io/crates/pixelcoords) · [docs.rs](https://docs.rs/pixelcoords)
- **[pixelactions](https://github.com/nolindnaidoo/pixelactions)** — Consume human-verified coordinates, perform the interaction, confirm it landed
  [pixelactions.dev](https://pixelactions.dev) · [crates.io](https://crates.io/crates/pixelactions) · [docs.rs](https://docs.rs/pixelactions)

## License

MIT — see [LICENSE](https://github.com/nolindnaidoo/urls-le/blob/main/LICENSE).
