<h1 align="center">urls-le</h1>

<p align="center">
  <b>Extract every URL from a codebase, with its protocol and exact position</b><br/>
  <i>eleven formats, one scanner — and no opinions about what it found</i>
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

Eleven formats, the same eleven the extension supports: **Markdown, HTML,
CSS, JavaScript, TypeScript, JSON, YAML, `.properties`, TOML, INI, XML.**

Each format decides *which part of the document* to scan, and nothing
else — that is what one shared scanner buys. Markdown skips fenced blocks
and inline code spans. HTML skips comments. JSON reads string literals
only. `.properties` skips comment lines. TOML and INI parse first and
locate each value back in the source, falling back to a whole-document
scan when the file does not parse — so a broken config still yields its
URLs.

A directory is walked the way ripgrep walks one: `.gitignore` honoured,
hidden files skipped, `--no-ignore` and `--hidden` to reach the rest. A
file named explicitly is always read.

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

All ten LE tools are on **[letools.dev](https://letools.dev)**.

## Also by nolindnaidoo

**Rust**

- **[pixelcoords](https://github.com/nolindnaidoo/pixelcoords)** — Freeze your screen, mark regions, get pixel-exact coordinates and crops
  [pixelcoords.dev](https://pixelcoords.dev) · [crates.io](https://crates.io/crates/pixelcoords) · [docs.rs](https://docs.rs/pixelcoords)
- **[pixelactions](https://github.com/nolindnaidoo/pixelactions)** — Consume human-verified coordinates, perform the interaction, confirm it landed
  [pixelactions.dev](https://pixelactions.dev) · [crates.io](https://crates.io/crates/pixelactions)
- **[paths-le](https://github.com/nolindnaidoo/paths-le/tree/main/crate)** — Find every path in a codebase and report whether it still points at anything
  [crates.io](https://crates.io/crates/paths-le)
- **[secrets-le](https://github.com/nolindnaidoo/secrets-le/tree/main/crate)** — Find hardcoded credentials, and never print one
  [crates.io](https://crates.io/crates/secrets-le)
- **[regex-le](https://github.com/nolindnaidoo/regex-le/tree/main/crate)** — Find every regex in a codebase and report which can be driven into catastrophic backtracking
  [crates.io](https://crates.io/crates/regex-le)
- **[string-le](https://github.com/nolindnaidoo/string-le/tree/main/crate)** — Get every string in a codebase out where a person can read them
  [crates.io](https://crates.io/crates/string-le)
- **[numbers-le](https://github.com/nolindnaidoo/numbers-le/tree/main/crate)** — Find every hardcoded number in a codebase so a person can check them
  [crates.io](https://crates.io/crates/numbers-le)
- **[envsync-le](https://github.com/nolindnaidoo/envsync-le/tree/main/crate)** — Compare the dotenv files in a tree and say which keys are missing from which
  [crates.io](https://crates.io/crates/envsync-le)
- **[colors-le](https://github.com/nolindnaidoo/colors-le/tree/main/crate)** — Find every colour in a codebase, and say which are not in your palette
  [crates.io](https://crates.io/crates/colors-le)
- **[scrape-le](https://github.com/nolindnaidoo/scrape-le/tree/main/crate)** — Check whether a page is scrapeable before the scraper is written
  [crates.io](https://crates.io/crates/scrape-le)

**Contact Developer** — [nolindnaidoo.com](https://nolindnaidoo.com) · [GitHub](https://github.com/nolindnaidoo) · [LinkedIn](https://www.linkedin.com/in/nolindnaidoo/)

## License

MIT — see [LICENSE](https://github.com/nolindnaidoo/urls-le/blob/main/LICENSE).
