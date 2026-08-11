//! The exit codes and the stdout contract, driven against the built
//! binary.
//!
//! These are the API: a shell branches on the exit code and parses
//! stdout, so both are pinned here rather than inferred from unit tests
//! of the functions behind them. Nothing here needs a network or a
//! privileged filesystem operation, so it runs everywhere on every push.
//!
//! A new refusal adds its case here.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};

const BINARY: &str = env!("CARGO_BIN_EXE_urls-le");
static COUNTER: AtomicUsize = AtomicUsize::new(0);

struct Tree {
    root: PathBuf,
}

impl Tree {
    fn new(name: &str) -> Self {
        let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "urls-le-contract-{name}-{}-{unique}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("a temporary directory");
        Self {
            root: std::fs::canonicalize(&root).expect("a canonical directory"),
        }
    }

    fn path(&self) -> &Path {
        &self.root
    }

    fn write(&self, relative: &str, contents: &str) -> PathBuf {
        let target = self.root.join(relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).expect("a parent directory");
        }
        std::fs::write(&target, contents).expect("a file");
        target
    }
}

impl Drop for Tree {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

struct Run {
    code: i32,
    stdout: String,
    stderr: String,
}

fn run(args: &[&str]) -> Run {
    let output = Command::new(BINARY)
        .args(args)
        .output()
        .expect("the binary runs");
    Run {
        code: output.status.code().expect("an exit code"),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    }
}

/// Every line of stdout, parsed. Doubles as the assertion that stdout
/// is JSON Lines and nothing else — a stray human message there would
/// fail to parse.
fn reports(run: &Run) -> Vec<serde_json::Value> {
    run.stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str(line).expect("stdout carries only JSON"))
        .collect()
}

fn docs_tree(name: &str) -> Tree {
    let tree = Tree::new(name);
    tree.write(
        "docs/guide.md",
        "# Guide\n\nSee [the API](https://example.com/api) and https://example.com/ref.\n\n\
         ```\nhttps://in-a-fence.example\n```\n",
    );
    tree.write("config.toml", "homepage = \"https://example.org/start\"\n");
    tree.write("notes.rs", "// https://not-a-supported-format.example\n");
    tree
}

#[test]
fn a_tree_with_urls_exits_zero() {
    let tree = docs_tree("found");
    let run = run(&[&tree.path().to_string_lossy()]);
    assert_eq!(run.code, 0, "{}", run.stderr);
    let total: u64 = reports(&run)
        .iter()
        .filter_map(|report| report["summary"]["urls"].as_u64())
        .sum();
    assert_eq!(total, 3, "the fenced block and the .rs file are not read");
}

/// grep's convention, and the reason it is worth having: finding
/// nothing is an answer, not an error.
#[test]
fn a_tree_with_none_exits_one() {
    let tree = Tree::new("none");
    tree.write("docs/a.md", "nothing to see here\n");
    let run = run(&[&tree.path().to_string_lossy()]);
    assert_eq!(run.code, 1);
    assert!(run.stderr.contains("0 URLs"), "{}", run.stderr);
}

#[test]
fn an_unreadable_input_exits_two() {
    assert_eq!(run(&["/no/such/place-xyz"]).code, 2);
}

#[test]
fn an_unknown_flag_exits_two_and_names_itself() {
    let tree = docs_tree("badflag");
    let run = run(&["--dedup", &tree.path().to_string_lossy()]);
    assert_eq!(run.code, 2);
    assert!(run.stderr.contains("--dedup"), "{}", run.stderr);
    assert!(run.stdout.is_empty(), "a refusal writes no report");
}

/// The tool has no opinions about a URL, so there is no flag that would
/// produce one. If this ever passes for a new flag, it has grown a
/// position.
///
/// `--strict` is deliberately not in this list. It says whether the scan
/// covered everything it was pointed at, which is a statement about this
/// run and not about any URL in it — the same axis as "none found",
/// which has always been an exit code here.
#[test]
fn no_flag_asks_for_a_judgment() {
    let tree = docs_tree("nojudgment");
    for attempt in ["--check", "--insecure", "--fail-on", "--no-http", "--score"] {
        assert_eq!(
            run(&[attempt, &tree.path().to_string_lossy()]).code,
            2,
            "{attempt} was accepted"
        );
    }
}

#[test]
fn dedupe_collapses_repeats() {
    let tree = Tree::new("dedupe");
    tree.write("a.md", "https://a.example\nhttps://a.example\n");
    let kept: u64 = reports(&run(&[&tree.path().to_string_lossy()]))[0]["summary"]["urls"]
        .as_u64()
        .expect("a count");
    let deduped: u64 =
        reports(&run(&["--dedupe", &tree.path().to_string_lossy()]))[0]["summary"]["urls"]
            .as_u64()
            .expect("a count");
    assert_eq!((kept, deduped), (2, 1));
}

#[test]
fn version_and_help_exit_clear() {
    let version = run(&["--version"]);
    assert_eq!(version.code, 0);
    assert!(version.stdout.contains("urls-le"));
    let help = run(&["--help"]);
    assert_eq!(help.code, 0);
    assert!(help.stdout.contains("usage: urls-le"));
    assert!(
        help.stdout.contains("grep"),
        "the exit convention is stated"
    );
}

#[test]
fn stdout_carries_only_reports_and_stderr_only_the_summary() {
    let tree = docs_tree("streams");
    let run = run(&[&tree.path().to_string_lossy()]);
    assert!(!reports(&run).is_empty());
    assert!(!run.stderr.contains('{'), "{}", run.stderr);
    assert!(run.stderr.contains("URLs in"), "{}", run.stderr);
}

#[test]
fn a_document_on_stdin_is_scanned() {
    let mut child = Command::new(BINARY)
        .args(["--stdin", "--format", "markdown"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("the binary runs");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(b"see https://a.example/x\n")
        .expect("written");
    let output = child.wait_with_output().expect("finishes");
    assert_eq!(output.status.code(), Some(0));
    let report: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("stdout carries JSON");
    assert_eq!(report["file"], "<stdin>");
    assert_eq!(report["urls"][0]["value"], "https://a.example/x");
}

#[test]
fn stdin_without_a_format_exits_two() {
    let mut child = Command::new(BINARY)
        .args(["--stdin"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("the binary runs");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(b"x")
        .expect("written");
    assert_eq!(
        child.wait_with_output().expect("finishes").status.code(),
        Some(2)
    );
}

/// **The cross-surface contract.** Both surfaces call one entry point,
/// so they must answer identically for the same tree.
#[test]
fn the_cli_and_the_mcp_server_report_the_same_thing() {
    let tree = docs_tree("agreement");
    let cli = run(&[&tree.path().to_string_lossy()]);
    let from_cli = reports(&cli);

    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "urls_le_scan",
            "arguments": { "path": tree.path().to_string_lossy() },
        },
    });
    let mut child = Command::new(BINARY)
        .arg("mcp")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("the server starts");
    writeln!(child.stdin.as_mut().expect("stdin"), "{request}").expect("written");
    let output = child.wait_with_output().expect("finishes");
    let response: serde_json::Value = serde_json::from_slice(
        output
            .stdout
            .split(|byte| *byte == b'\n')
            .next()
            .expect("a line"),
    )
    .expect("the reply is JSON");

    let from_mcp = response["result"]["structuredContent"]["data"]["reports"]
        .as_array()
        .expect("reports")
        .clone();
    assert_eq!(from_mcp, from_cli, "the two surfaces disagree");
}
