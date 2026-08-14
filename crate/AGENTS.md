# urls-le (CLI) — engineering standards

This is the source of truth for how code in `crate/` is written, tested,
and reviewed. It applies to every contributor, human or AI-assisted. CI
(`.github/workflows/ci-crate.yml`) enforces the mechanical parts;
reviewers enforce the rest. [SPEC.md](SPEC.md) defines the product
behavior — verdicts, exit codes, the parity scope; this file is how the
code gets there. The extension at the repo root is a separate TypeScript
product with its own `AGENTS.md`.

## What this project is

The command-line and MCP frontend of URLs-LE: read the URLs out of a
document and report exactly where they are. Nothing is fetched,
filtered, rewritten or judged — see SPEC.md, "Why this has no opinions". One
product, two frontends, one repository: the corpus (`fixtures/`) is
shared with the VS Code extension, and CI fails when either side drifts
from it.

**Status: released.** Every format, both surfaces, the resolver and the
test layers below are built and green. Releases go out through
`release-crate.yml`, which is dispatch-only and refuses a version that
crates.io already carries, has no changelog entry, would ship a tarball
missing its own corpus, or whose corpus the extension no longer
reproduces.

## Layout

```
crate/src/
├── extract/     pure: the URL scanner, the eleven format extractors
│                and the scan every other document gets, positions,
│                and js.rs — JavaScript's whitespace set, which the
│                delimiter class and every trim are held to.
│                No filesystem, pub(crate).
├── walk.rs      ignore-aware tree walking and format detection
├── scan.rs      one file end to end — the only path either surface calls
├── cli.rs       the terminal surface
└── mcp/         the agent surface
```

- **`extract/` touches no filesystem.** It takes document text and a
  format and returns paths, so the entire extraction layer tests from a
  fixture file — no temp directories, no flake. It carries the **75%
  line coverage floor per module**, enforced by the `coverage` job. A
  `std::fs` call appearing there is a bug, and the `policy` job greps
  for one.
- **`resolve.rs` is the only module allowed to touch the filesystem.**
  Everything it claims is checkable by hand against the same filesystem;
  a claim that is not does not belong there.
- **Both surfaces are one implementation.** `cli.rs` and `mcp/` both call
  `audit.rs`. A surface that grows its own copy of a rule is a bug, and
  a contract test asserts the two return identical reports for the same
  tree.
- **`walk.rs` selects, it does not decide.** Its one rule — a file named
  explicitly is read whatever the ignore rules say — is why intent beats
  configuration. It no longer filters by extension either: every walked
  file is read, and one that is not text comes back as `skipped` from
  `scan.rs`, which is where that is knowable rather than guessable.
- Keep modules flat. No layers, registries, managers, or services. No
  trait with a single implementation.

## Decisions already made (do not relitigate)

- **This tool has no opinions, and that is the product.** No link
  checking, no insecure-scheme flag, no credential flag, no scoring. An
  `http://` URL is wrong in a production config and right in a test
  fixture; deciding for the reader makes the tool something they
  configure, then argue with, then mute — and the muting takes the
  extraction with it. A contract test asserts no flag asks for a
  judgment, so the boundary is enforced rather than remembered.
- **Exit codes follow grep**: 0 found, 1 none found, 2 could not answer.
  That is a fact about the extraction, not an opinion about the URLs.
- **One crate, self-contained.** No published `-core`, no shared crate.
  `walk.rs` and `testing.rs` are near-copies of paths-le's, and nothing
  holds them equal — where they agree it is because the same answer was
  right twice, and where they diverge that is the point.
- **One regex engine.** The URL scanner needs no backreferences and no
  lookaround, so `regex` expresses it exactly and its matching cannot
  fail. Not taking a backtracking engine is the cheaper answer.
- **Whitespace means JavaScript's whitespace, spelled out.** `str::trim`
  and Rust's `\s` are not `String.prototype.trim` and JavaScript's `\s`:
  the sets differ on U+FEFF and U+0085, and a byte-order mark is
  ordinary. `extract/js.rs` holds the set in two forms with a test that
  they agree, and every trim and the delimiter class route through it.
  Reaching for `str::trim` here is a bug.
- **One scanner, eleven formats, and every other file.** The extension's
  v1.x had five protocol patterns copy-pasted into ten files with
  divergent behaviour; porting it as one function is what stops that
  recurring in a second language. A format extractor decides *which
  subset of the document* to scan and nothing else — which is why
  `FileType::Unknown` is the whole-document scan rather than a refusal:
  it is the superset of all eleven, and a URL is unambiguous in a `.py`
  or a `.csv` too.
- **The claimed-offset set is a `HashSet`.** With a linear scan the
  scanner is quadratic in the number of URLs, and the 50,000 cap says
  documents with that many are expected.
- **Limits are behaviour, not tuning**: 10 MB of content and 50,000 URLs,
  both reported when they bind so a truncated result cannot be mistaken
  for a complete one.
- **`--dedupe` is opt-in**, because it is opt-in in the extension. Every
  occurrence is a real occurrence.
- **stdout is protocol, stderr is human. There is no `--json` flag.**
- **Parity scope is extraction only** — `src/extraction/**`.

## Control-flow style

Flat over nested, guards over branches — the same rules as pixelcoords,
pixelactions and scrape-le:

- **No statement-position `else`.** Guard clauses and early `return`
  (`if !ok { return ... }` / `let Some(x) = ... else { return }`), then
  fall through to the happy path.
- **Value-position `if/else` is fine** — `let x = if cond { a } else
  { b }` is Rust's ternary.
- **`match` is fine and preferred** over any chain of condition tests on
  the same value; use match guards instead of `if/else` inside arms.
- Prefer combinators where they read cleanly: `bool::then_some`,
  `Option::map/filter/is_some_and`, `?`.
- No nesting deeper than two levels inside a function; extract a named
  helper instead.

## Hard rules

- **No inline `#[allow(...)]`** — CI greps and fails the build. Either
  fix the lint or add a visible, commented relaxation to
  `[lints.clippy]` in `Cargo.toml`.
- **Clippy pedantic, deny warnings.** `cargo clippy --all-targets --
  -D warnings` must pass exactly as CI runs it.
- **No async runtime.** This tool reads files and asks the filesystem
  about them. There is nothing to await.
- **`unsafe` is forbidden crate-wide** (`[lints.rust]`).
- **Dependencies are a cost.** Every one is justified by a comment in
  `Cargo.toml`, and one that stops being used comes out — `jsonc-parser`
  was declared and called nowhere, and `rust-ini` came out when the INI
  extractor stopped parsing, because which INI library each language
  installed was deciding the answer. Justify any addition; prefer the standard
  library; prefer what is already in the tree.
- **No network, ever.** Not even for a URL this tool just found. Link
  checking belongs to `lychee` and friends; the value here is the list.
- **Nothing writes, and nothing judges.** No `--fix`, no verdicts, no
  filtering.
- **Strict parsing, never silent defaults.** An unrecognised flag, a
  `--format` with no value, an input that does not exist: all are errors
  with actionable messages. A typo'd `--stict` that silently did nothing
  would report a clean audit that never ran the check asked for. A
  *format name* is the one thing this does not refuse, and only because
  every extractor is the whole-document scan minus an exclusion: an
  unrecognised name can never hide a URL, and the report says which pass
  ran.
- **Refuse rather than guess.** A file that cannot be read is reported
  as unexamined and the run exits 2 — never a clean result that quietly
  skipped it. Never report coverage you did not achieve.
- **Refusals speak the caller's vocabulary.** An MCP caller has no
  command line; no message aimed at one mentions `--no-resolve` or any
  other flag. A test asserts no MCP output contains `--`.
- **`extract_urls` belongs to both servers.** The npm server
  (`src/mcp/tools.ts`) and this one offer the same tool: same schema,
  same envelope, byte-identical output. `fixtures/mcp-extract-urls.json`
  runs against both, so changing one without the other fails a build.
  Every tool here returns that envelope — `{ ok, data, diagnostics,
  meta }` — where `ok` means the check ran, never that the answer was
  yes.

## The corpus contract

`fixtures/` lives inside this crate so the published package is
self-contained — `cargo package` cannot reach above its own directory.
The corpus is **not** needed to build the binary; that was checked
rather than assumed, by deleting it from an unpacked tarball and
building. It is needed to *verify*: `cargo test` on the published crate
runs every corpus case, so a consumer can check the parity claims
instead of trusting them. That is why it ships, and the release workflow
asserts it is in the tarball. It is still shared ground: the extension
reads the same files.
`../scripts/check-extraction-parity.ts` (the `parity` job in
`ci-crate.yml`) fails when the extension drifts. Changing a document or
an expectation is a behavior change for **both** frontends and needs a
CHANGELOG entry.

Where the two must disagree, the disagreement is written down in
SPEC.md and a test asserts what each side actually answers. There is no
other sanctioned way to differ.

## Testing

The bar, enforced by review:

- **`extract/`: 75% line coverage floor per module.** Everything in it
  is pure; if something is hard to test there, the design is wrong. Per
  module rather than the crate total, because a total lets one module
  slide while the others carry it.
- **The parity corpus is embedded.** Every `fixtures/` case runs as a
  unit test; the expected values are the extension's answers.
- **Exit codes belong in `tests/contracts.rs`.** They are the API —
  callers branch on them — so they are pinned by tests that drive the
  built binary against a temporary tree: no network, no privileged
  operation, so they run everywhere on every push. A new refusal adds
  its case there.
- **Anything needing the real filesystem to misbehave is
  `tests/scenarios.rs`** — symlink loops, unreadable directories, case
  folding — gated behind `URLS_LE_SCENARIOS` and run by CI on all three
  OSes. A skipped scenario is never reported as a pass; each one says
  plainly that it did not run.
- **Six jobs exist because something real got through.** Each has a test
  file and a CI job of the same name; none may be weakened to go green.
  - `tests/hazards.rs` — a tree built at runtime, driven through the
    built binary on all three OSes: a BOM, a lone CR, a NUL, invalid
    UTF-8, UTF-16LE, a 1 MB line, 100k lines, a FIFO, a symlink loop, a
    permission-denied directory, a path over 260 characters. Every case
    asserts no panic, no hang and an exit code of 0, 1 or 2 — never a
    signal. A case the platform cannot express says so by name.
  - `tests/platform.rs` — `/` in every reported path, independence from
    `TZ`, one report line per file on a case-folding filesystem, a walk
    that survives a reserved Windows filename, and a stdin race asserted
    on the exit code rather than on the write.
  - `../scripts/differential.ts` — generated documents and argument
    shapes through **both** MCP servers, requiring the shared
    `extract_urls` to answer identically. Scoped to that tool: the two
    *surfaces* are meant to differ. Seed printed on every run.
  - `extract/fuzz.rs` — a seeded net over the pure layer. Deterministic
    by default, sixty seconds in CI. Any panic, any hang, and any
    reported span that does not line up with its source is a failure.
  - `tests/budget.rs` — a wall-clock ceiling on a 500-file tree and a
    linearity check, both gated behind `URLS_LE_BUDGET`. The local
    measurement and the machine it came from are in the file.
  - `tests/coverage_matrix.rs` — one file per alias plus a dozen
    extensions the table has never heard of, and every advertised format
    must have a corpus document.
- **A fix is verified by reverting it and watching the check go red.** A
  test that cannot fail is not a test; the three halves of the
  JavaScript-whitespace fix were each checked that way.
- **Every bug fix ships with a regression test** that fails before the
  fix. The `escapes-root` bug that fired on every relative path is the
  cautionary one: every unit test passed, because every one of them
  built its own canonical root. Run the binary, not only the tests.
- Tests are deterministic: no clocks, no randomness, and **no filesystem
  in `extract/` tests** — everything there runs from the corpus.

## Verification — the definition of done

All of it, exactly as CI runs it, before every push:

```bash
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
bun ../scripts/check-extraction-parity.ts   # when extraction changed
```

The jobs that are gated locally, and what CI passes them:

```bash
URLS_LE_SCENARIOS=1 cargo test --test scenarios -- --test-threads=1
URLS_LE_BUDGET=1 cargo test --release --test budget -- --nocapture --test-threads=1
URLS_LE_FUZZ_SECONDS=60 cargo test --release extract::fuzz -- --nocapture
cd .. && URLS_LE_BIN=crate/target/release/urls-le bun scripts/differential.ts
```

CI additionally builds on macOS, Windows and Linux, checks the Rust 1.88
minimum version, runs `cargo audit`, the no-inline-`#[allow]` and
no-filesystem-in-`extract/` policy jobs, the per-module coverage floor
(which skips `corpus.rs` and `fuzz.rs` as test-only scaffolding), the
gated scenarios, the six jobs above, and parity — including on
extension-side edits to `src/extraction/**`, so neither frontend can
drift green. A change is
not done because it compiles; it is done when it is tested, linted,
documented where behavior changed (README / CHANGELOG / SPEC / this
file), and honest — claims in docs must match the code.

## Commits and pull requests

The repo root's convention applies unchanged (root `AGENTS.md`):
conventional prefix, imperative subject under 100 characters, body
carrying the *why* — enforced by the `commit-msg` hook and the
`Commit messages` CI job. One concern per change; if docs describe the
thing you changed, update them in the same commit. Release tags are
`crate-v*`, and a release goes out by dispatching `release-crate.yml`
with its publish opt-in — never by pushing a tag, because a crates.io
version can never be reused.
