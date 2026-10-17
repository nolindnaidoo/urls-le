# url-le

Get every URL in a codebase into one list, with the file, line and column
each came from: the reviewer checking which hosts a repository talks to, the
auditor listing every `http://` still in the docs, the migration that has to
find every link to the old domain.

```bash
npx url-le docs/
npx url-le --dedupe . > urls.jsonl
cat README.md | npx url-le --stdin --format markdown
```

The package is named `url-le` because `urls-le` was taken on npm. The
command it installs is `urls-le`, the same command line as the Rust crate
[`urls-le`](https://crates.io/crates/urls-le), and it behaves identically:
same flags, same walk, same positions, same output, same exit codes.
Install whichever toolchain you already have.

## What it reads

Every file. Markdown, HTML, CSS, JavaScript, TypeScript, JSON, YAML,
Properties, TOML, INI and XML each know what to exclude: a fenced code
block or inline code in Markdown, an HTML comment, everything that is not a
JSON string, a comment line in Properties and INI. Anything else is scanned
whole, and the report's `format` field says which pass ran. Directories are
walked the way ripgrep walks them: `.gitignore`, `.ignore` and hidden files
are respected unless you pass `--no-ignore` or `--hidden`, and a symlinked
directory is descended only with `--follow-symlinks`.

It finds `http`, `https`, `ftp`, `file`, `mailto` and `tel` URLs. Nothing is
fetched, nothing is filtered and nothing is scored. What the URLs mean is
yours to decide.

## Output

stdout carries one JSON report per file whenever it is piped or redirected,
and nothing when it is a terminal. stderr lists every URL with its position.

```text
$ urls-le docs Cargo.toml
Cargo.toml:2:13  https://example.com
docs/guide.md:2:17  https://spec.example.com/v2#auth
docs/guide.md:6:12  mailto:help@example.com
3 URLs in 2 files
```

```json
{"file":"docs/guide.md","format":"markdown","urls":[{"value":"https://spec.example.com/v2#auth","protocol":"https","domain":"spec.example.com","path":"/v2#auth","line":2,"column":17,"context":"Read [the spec](https://spec.example.com/v2#auth) first."},{"value":"mailto:help@example.com","protocol":"mailto","domain":null,"path":"help@example.com","line":6,"column":12,"context":"Questions: mailto:help@example.com"}],"diagnostics":[],"summary":{"urls":2}}
```

Columns count UTF-16 code units, as an editor does. A URL a TOML parser
resolved from text no run of characters spells, such as one written with a
`\u` escape, carries no `line`, `column` or `context`.

A file that is not UTF-8 text, or that cannot be opened, is named on stderr
and carried in its report as `skipped`. It does not fail the run on its own.

## Exit codes

grep's convention:

- **0**: URLs found.
- **1**: none found. That is an answer, not an error.
- **2**: the question was malformed, or `--strict` and a file could not be
  read.

## For agents

`urls-le mcp` serves the Model Context Protocol on stdio with two tools:
`extract_urls` for a document's text and `urls_le_scan` for files and
directories. Hosts that want the document tool alone can install
[`urls-le-mcp`](https://www.npmjs.com/package/urls-le-mcp).

`urls-le --help` lists every option.

MIT licensed. Part of [letools](https://letools.dev/tools/urls-le).
