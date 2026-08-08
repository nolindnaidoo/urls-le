# The shared corpus

These files are the contract between the two frontends of URLs-LE: the
VS Code extension at the repository root, and the Rust CLI and MCP
server in this crate. **Both read them, and CI fails when either side
drifts.**

They live inside `crate/` because `cargo package` cannot reach above its
own directory, and `cargo test` on the published crate runs them — which
is what lets someone who installed the binary check the parity claims
rather than trust them.

| File | What it pins |
|---|---|
| `documents/` | The source documents both sides extract from. |
| `extraction.json` → `documents` | Every URL found in each document, with protocol, domain, path, position and context — plus the success flag and any errors. |
| `extraction.json` → `scan` | The shared scanner over the inputs most likely to drift. |
| `mcp-extract-urls.json` | The `extract_urls` MCP tool, which **both** servers offer and must answer identically. |

## Deliberate contents

- **`documents/broken.toml`** does not parse. It is here because a parser
  failure becoming an empty result is the quiet way a scanner stops
  working — the fallback whole-document scan must still find its URLs,
  and both frontends must agree that it does.
- **The `scan` cases** cover the delimiter set one at a time (quotes,
  brackets, backticks, pipes, carets, semicolons), the kept trailing dot
  and comma, the `mailto`/`tel` well-formedness rules, repeats, and an
  internationalised domain — where two different WHATWG URL parsers must
  agree on punycode.

## Who checks what

- `bun ../../scripts/check-extraction-parity.ts` runs the **extension's**
  exported functions over these files.
- `cargo test` runs the **crate's** implementation over the same files,
  from `src/extract/corpus.rs`.

Neither side may be the sole author of a case. A change here is a
behaviour change for both frontends and needs a CHANGELOG entry.
