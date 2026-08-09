# urls-le — Rust specification

A port of the [URLs-LE](https://github.com/nolindnaidoo/urls-le) VS Code
extension to a Rust CLI and MCP server.

**Parity first, and parity is the whole of it.** The extension is the
reference implementation. Anything this produces for a given document
must match what the extension produces for that document. A difference
is a regression until proven otherwise.

## The one question

**Which URLs are in this codebase, and exactly where?**

That is the entire product. `urls-le src/ | lychee` is the point: this
hands the next tool a better list than a grep can — one that knows a URL
in a TOML value from a URL in a fenced code block — and then gets out of
the way.

## Why this has no opinions

The obvious next features are all judgments about the URLs it found:
fetch each one to see if it 404s, flag `http://` as insecure, flag a
password in the userinfo, flag a private address. Every one is absent,
deliberately.

**This tool extracts. What the URLs mean is the reader's call.** An
`http://` URL is wrong in a production config and correct in a test
fixture. A `localhost` URL is a bug in one repository and the whole
point in another. A tool that decides for you is a tool you have to
configure, then argue with, then mute — and the muting takes the
extraction with it.

Link checking is also already solved: `lychee`, `muffet` and `htmltest`
do it well, and each needs a network, which would stop this being a
cheap deterministic CI step. The value here is the list, not a verdict
on it.

So: **nothing is filtered, nothing is rewritten, nothing is scored.**
URLs are reported exactly as written, at their real positions, in
document order. Trailing punctuation is kept because it may be part of
the URL. Repeats are kept because they are separate occurrences.
`--dedupe` exists because the extension has it, and it is opt-in there
too.

## Shape

**One crate.** Self-contained: no published `-core`, no shared crate with
the family, and nothing holding this code equal to the similar files
in the sibling repos. Where they agree it is because the same answer was
right twice; where they diverge that is the point.

```
crate/
├── src/
│   ├── extract/     pure: the URL scanner, the eleven format
│   │                extractors, positions. No filesystem, pub(crate).
│   ├── walk.rs      ignore-aware tree walking
│   ├── scan.rs      one file end to end — the only path either surface calls
│   ├── cli.rs       the terminal surface
│   └── mcp/         the agent surface
└── fixtures/        the shared corpus, read by both frontends
```

**`extract/` touches no filesystem** and carries the **90% line coverage
floor per module**.

## Extraction — parity scope

### One scanner, eleven formats

The extension's history is the reason this matters: v1.x had the same
five protocol patterns copy-pasted into ten files with divergent
behaviour — CSS labelled every `http` URL as `https`, TOML and INI
returned no positions, XML emitted attribute URLs twice, and three
formats silently dropped repeat occurrences. One scanner, applied
uniformly, is the fix, and it is ported as one scanner.

Formats: **Markdown, HTML, CSS, JavaScript, TypeScript, JSON, YAML,
`.properties`, TOML, INI, XML.**

### The rules, ported as-is

- **A URL ends at whitespace or at any of** `< > " { } | \ ^ \` [ ] ; ) '`.
  That is the extension's delimiter set, kept so quoted and bracketed
  sources terminate correctly.
- **Trailing punctuation a URL may legally contain is not stripped.**
  `https://x.com/a.` keeps its dot. A documented limitation, not a bug —
  stripping it would corrupt URLs that genuinely end that way.
- **`http` versus `https` comes from the scheme**, never from a hardcoded
  guess.
- **Every occurrence is reported with its own position.** Value-level
  dedupe is a separate, opt-in step.
- **`mailto:` needs an `@`; `tel:` needs a subject.** Applied to every
  format, so no two can disagree about what counts as well-formed.
- **Five protocols**: `http`, `https`, `ftp`, `file`, `mailto`, `tel`.
- **Limits are behaviour**: content over 10 MB is refused with a message,
  and no more than 50,000 URLs are returned from one document.

### `domain` and `path`

The extension derives these with the platform `URL` parser. This uses
Rust's `url` crate, which is the same WHATWG standard but a different
implementation, and the corpus pins the cases most likely to diverge —
including an internationalised domain, where both are expected to emit
punycode. **Any disagreement the corpus finds is recorded here as a
documented divergence with a test asserting what each side answers**;
there is no other sanctioned way to differ.

### Out of parity scope

Commands, the editor UI, i18n, the configuration reader and the status
bar are extension concerns. Parity is `src/extraction/**` and nothing
else.

## Output contract

**stdout is protocol, stderr is human.** One JSON report per line, one
line per file.

```json
{
  "file": "docs/setup.md",
  "format": "markdown",
  "urls": [
    {
      "value": "https://example.com/guide",
      "protocol": "https",
      "domain": "example.com",
      "path": "/guide",
      "line": 12,
      "column": 15,
      "context": "See [the guide](https://example.com/guide) first."
    }
  ],
  "diagnostics": [],
  "summary": { "urls": 1 }
}
```

There is no verdict field, and there is no place for one.

### Exit codes are the API

**grep's convention**, because this is grep's kind of tool:

- **0** — URLs were found.
- **1** — none were found. Not an error; the honest answer to "is there
  anything here".
- **2** — the question was malformed: an unknown flag, an unreadable
  input, a path that does not exist.

That is a fact about the extraction, not an opinion about the URLs. It
makes the tool composable — `if urls-le src/; then …` — without the tool
deciding anything on the reader's behalf.

## The CLI surface

```
usage: urls-le [options] <file|dir>...
       urls-le [options] --stdin --format <format>
       urls-le mcp
       urls-le --version | --help

Options:
  --dedupe             collapse repeated URLs to their first occurrence
  --format <format>    force a format instead of inferring from the name
  --stdin              read one document from stdin
  --hidden             walk hidden files and directories too
  --no-ignore          walk files that .gitignore excludes
```

## The MCP surface

- **`extract_urls` belongs to both servers.** The npm server and this one
  offer the same tool: same schema, same envelope, byte-identical output.
  `fixtures/mcp-extract-urls.json` runs against both.
- **`urls_le_scan` is this server's own**: files or directories in, the
  same reports the CLI writes.

**Refusals speak the caller's vocabulary.** No message here names a flag.

## Non-goals

- **No network, ever.** No fetching, no DNS, no reachability.
- **It does not rewrite files**, and does not offer to.
- **It does not judge a URL.** No insecure-scheme flag, no credential
  flag, no private-address flag, no scoring. See "Why this has no
  opinions"; adding one would make everything else here negotiable.
- **It does not filter.** Every occurrence the extension reports, this
  reports.

## Not in v1

Listed so nobody smuggles one in as a small addition — each would turn
an extractor into something with a position.

- **Link checking**, or any network access.
- **Verdicts of any kind**, and the allow-lists and baselines they would
  immediately require.
- **`--fix`**, rewriting `http` to `https`.
