# urls-le — Rust specification

A port of the [URLs-LE](https://github.com/nolindnaidoo/urls-le) VS Code
extension to a Rust CLI and MCP server, plus a small audit an editor has
no reason to run: which of these URLs should not have been committed.

**Parity first.** For extraction, the extension is the reference
implementation. Anything this produces for a given document must match
what the extension produces for that document. A difference is a
regression until proven otherwise. The audit layer has no extension
equivalent and is specified separately, at the bottom.

## The one question

**Which URLs are in this codebase, and which of them are a problem?**

The first half feeds a pipeline — `urls-le src/ | lychee` is the point.
The second half answers on its own, without a network.

## Why this does not check links

The obvious next feature is fetching each URL to see if it 404s. It is
deliberately absent, for two reasons.

**It would make the tool slow and non-deterministic**, so it could not
be a cheap CI step, which is the thing it is good at. And **it already
exists**: `lychee`, `muffet` and `htmltest` do it well, and this tool's
job is to hand them a better list than a grep can — one that knows a URL
in a TOML value from a URL in a comment.

Everything this reports is decidable from the text. If a claim needs a
socket, it does not belong here. Same rule as scrape-le, which is the
one tool in this family that *is* allowed to open one.

## Shape

**One crate.** Self-contained: no published `-core`, no shared crate with
the family. Code two crates need is copied with a drift check.

```
crate/
├── src/
│   ├── extract/     pure: the URL scanner, the eleven format
│   │                extractors, positions. No filesystem, pub(crate).
│   ├── audit.rs     the verdicts — text-only, no network
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

## The audit — the enhancement

**No extension equivalent, and no network.** Every verdict is decidable
from the URL text alone, which is what keeps the tool a cheap CI step.

| verdict | meaning |
|---|---|
| `ok` | nothing to say about it |
| `credentials` | userinfo in the URL — `https://user:pass@host` |
| `insecure` | `http://` to a host that is not loopback |
| `loopback` | points at `localhost`, `127.0.0.1` or `::1` |
| `private` | points at a private or link-local address |
| `malformed` | does not parse as a URL |

Rules that keep it honest:

- **`credentials` is the one that matters most**, and it overlaps
  secrets-le on purpose: a password in a URL is a credential in the
  repository, and two tools finding it is better than none.
- **`insecure` exempts loopback.** `http://localhost:3000` is how
  everyone runs a dev server; flagging it would fire on every codebase
  and get the check muted.
- **`loopback` and `private` are facts, not failures.** They do not set
  the exit code on their own — a dev-server URL in a test fixture is
  fine, and it is the reader who knows whether one in a production
  config is not. `--strict` promotes them.
- **`mailto:` and `tel:` are `ok` by construction.** They have no host to
  judge.

### Exit codes are the API

- **0** — nothing found, or nothing above the threshold.
- **1** — at least one finding: `credentials`, `insecure` or `malformed`,
  plus `loopback` and `private` under `--strict`.
- **2** — the question was malformed: an unknown flag, an unreadable
  input, a path that does not exist.

## Output contract

**stdout is protocol, stderr is human.** One JSON report per line, one
line per file.

```json
{
  "file": "config/app.toml",
  "format": "toml",
  "urls": [
    {
      "value": "http://user:pw@api.internal/v1",
      "protocol": "http",
      "domain": "api.internal",
      "path": "/v1",
      "line": 4,
      "column": 11,
      "context": "endpoint = \"http://user:pw@api.internal/v1\"",
      "audit": { "verdict": "credentials", "reason": "the URL carries a username and password" }
    }
  ],
  "diagnostics": [],
  "summary": { "urls": 1, "findings": 1 }
}
```

**A URL with credentials in it is printed as it was written.** That is a
deliberate difference from secrets-le, and the reason is that the two
tools answer different questions: secrets-le tells you a credential
exists without disclosing it, and this tells you *which line to edit*. A
URL is not a secret in the same sense — it is already the thing you have
to look at to fix it. If that trade is wrong for your repository, pipe
this to nothing and use secrets-le, which will find the same string and
never print it.

## The CLI surface

```
usage: urls-le [options] <file|dir>...
       urls-le [options] --stdin --format <format>
       urls-le mcp
       urls-le --version | --help

Options:
  --no-audit           extract only; no verdicts, and nothing is a finding
  --strict             count loopback and private addresses as findings too
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
- **`urls_le_audit` is this server's own**: files or directories in, the
  same reports the CLI writes.

**Refusals speak the caller's vocabulary.** No message here names a flag.

## Non-goals

- **No network, ever.** No fetching, no DNS, no reachability.
- **It does not rewrite files.**
- **It does not know your allow-list.** A private-address URL that is
  correct for your deployment is `private` here; `--no-audit` or the exit
  code you choose to ignore is the answer, not a config file this tool
  has to be taught.

## Not in v1

- **A baseline file** for accepting known findings.
- **`--fix`**, rewriting `http` to `https`.
- **Per-host allow-lists.**
