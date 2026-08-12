//! Behaviour that differs by operating system, asserted rather than
//! hoped.
//!
//! Everything here runs the **built binary** on all three platforms. The
//! cases that cannot be constructed on one of them say so by name and
//! keep asserting whatever the platform did instead — a reserved Windows
//! filename that could not be created still has to leave the walk
//! standing.

use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};

const BINARY: &str = env!("CARGO_BIN_EXE_urls-le");
const VALUE: &str = "https://found.example/x";
static COUNTER: AtomicUsize = AtomicUsize::new(0);

struct Tree {
    root: PathBuf,
}

impl Tree {
    fn new(name: &str) -> Self {
        let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "urls-le-platform-{name}-{}-{unique}",
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
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

/// The binary, with the environment named rather than inherited: `Some`
/// sets `TZ`, `None` removes it.
fn run_with_tz(args: &[&str], tz: Option<&str>) -> Run {
    let mut command = Command::new(BINARY);
    command.args(args);
    match tz {
        Some(value) => command.env("TZ", value),
        None => command.env_remove("TZ"),
    };
    let output = command.output().expect("the binary runs");
    Run {
        code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    }
}

fn run(args: &[&str]) -> Run {
    run_with_tz(args, Some("UTC"))
}

fn reports(run: &Run) -> Vec<serde_json::Value> {
    run.stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str(line).expect("stdout carries only JSON"))
        .collect()
}

fn files(reports: &[serde_json::Value]) -> Vec<String> {
    reports
        .iter()
        .filter_map(|report| report["file"].as_str().map(str::to_string))
        .collect()
}

/// **Every path in the report uses `/`.** A sibling in this family
/// shipped `\` on Windows for a release, which makes a report undiffable
/// between two machines and forces every consumer to know which operating
/// system produced it.
#[test]
fn every_reported_path_uses_forward_slashes() {
    let tree = Tree::new("separators");
    tree.write("docs/guide/deep.md", &format!("see {VALUE}\n"));
    tree.write("top.md", &format!("see {VALUE}\n"));

    let run = run(&[&tree.path().to_string_lossy()]);
    assert_eq!(run.code, Some(0), "stderr: {}", run.stderr);
    let reported = files(&reports(&run));
    assert_eq!(reported.len(), 2, "{reported:?}");
    for file in &reported {
        assert!(!file.contains('\\'), "a backslash in a report path: {file}");
    }
    assert!(
        reported
            .iter()
            .any(|file| file.ends_with("docs/guide/deep.md")),
        "{reported:?}"
    );

    // The human projection on stderr is the same paths, so it inherits
    // the same rule rather than growing its own spelling.
    assert!(
        !run.stderr.contains('\\'),
        "a backslash on stderr: {}",
        run.stderr
    );
}

/// **`TZ` independence.** Windows ignores the variable entirely, so a
/// suite that depends on it passes on two platforms and fails on the
/// third. Nothing here reads a clock; this asserts that, byte for byte,
/// rather than assuming it.
#[test]
fn the_answer_does_not_depend_on_the_timezone() {
    let tree = Tree::new("timezone");
    tree.write("docs/a.md", &format!("see {VALUE}\n"));
    tree.write("config.toml", "homepage = \"https://example.org/start\"\n");
    let root = tree.path().to_string_lossy().into_owned();

    let utc = run_with_tz(&[&root], Some("UTC"));
    let tokyo = run_with_tz(&[&root], Some("Asia/Tokyo"));
    let unset = run_with_tz(&[&root], None);

    assert_eq!(utc.stdout, unset.stdout, "TZ unset changed the report");
    assert_eq!(utc.stdout, tokyo.stdout, "TZ=Asia/Tokyo changed the report");
    assert_eq!(utc.stderr, unset.stderr, "TZ unset changed the summary");
    assert_eq!(
        (utc.code, unset.code, tokyo.code),
        (Some(0), Some(0), Some(0))
    );
}

/// `README.md` and `readme.md` are one file on macOS and Windows and two
/// on Linux. Either is correct; reporting one file **twice** is not.
#[test]
fn a_case_insensitive_filesystem_reports_each_file_once() {
    let tree = Tree::new("casefold");
    tree.write("README.md", &format!("see {VALUE}\n"));
    tree.write("readme.md", &format!("see {VALUE}\n"));

    let on_disk = std::fs::read_dir(tree.path())
        .expect("the tree is readable")
        .count();
    assert!(
        (1..=2).contains(&on_disk),
        "the filesystem folded case in some third way: {on_disk} entries"
    );
    if on_disk == 1 {
        eprintln!(
            "NOTE a_case_insensitive_filesystem_reports_each_file_once: this \
             filesystem folds case, so the two names are one file"
        );
    }

    let run = run(&[&tree.path().to_string_lossy()]);
    assert_eq!(run.code, Some(0), "stderr: {}", run.stderr);
    let reported = files(&reports(&run));
    assert_eq!(
        reported.len(),
        on_disk,
        "the walk reported {} lines for {on_disk} files: {reported:?}",
        reported.len()
    );
    let mut unique = reported.clone();
    unique.sort();
    unique.dedup();
    assert_eq!(unique.len(), reported.len(), "a file was reported twice");
}

/// `CON`, `PRN`, `AUX`, `NUL` and `COM1` are device names on Windows and
/// ordinary filenames everywhere else. **The creation is what is allowed
/// to fail**, not the walk: the test never asserts they exist.
#[test]
fn reserved_windows_filenames_do_not_break_the_walk() {
    let tree = Tree::new("reserved");
    tree.write("ordinary.md", &format!("see {VALUE}\n"));

    let mut created = Vec::new();
    for name in ["CON", "PRN", "AUX", "NUL", "COM1"] {
        match std::fs::write(tree.path().join(name), format!("see {VALUE}\n")) {
            Ok(()) => created.push(name),
            Err(error) => eprintln!(
                "SKIPPED reserved_windows_filenames_do_not_break_the_walk/{name}: \
                 this platform refuses the name ({error})"
            ),
        }
    }

    let run = run(&[&tree.path().to_string_lossy()]);
    assert_eq!(
        run.code,
        Some(0),
        "the walk did not survive a reserved name\nstderr: {}",
        run.stderr
    );
    let reported = files(&reports(&run));
    assert!(
        reported.iter().any(|file| file.ends_with("ordinary.md")),
        "{reported:?}"
    );
    for name in created {
        assert!(
            reported.iter().any(|file| file.ends_with(name)),
            "{name} was created and then vanished from the report: {reported:?}"
        );
    }
}

/// A child that refuses before the write lands closes the pipe under it.
/// **Assert the exit code, never the write** — the opposite cost a red CI
/// in this repository once, and the race is the behaviour, not a flaw in
/// the test.
#[test]
fn stdin_closed_early_is_the_exit_code_not_the_write() {
    let mut child = Command::new(BINARY)
        .args(["--stdin"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("the binary runs");
    // Deliberately unchecked. `--stdin` with no `--format` is refused
    // before this lands, so the pipe may already be gone.
    let _ = child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(&b"x".repeat(256 * 1024));
    let output = child.wait_with_output().expect("finishes");
    assert_eq!(output.status.code(), Some(2));

    // The other half: stdin closed with nothing written at all is an
    // empty document, which is "none found" and not a failure.
    let mut child = Command::new(BINARY)
        .args(["--stdin", "--format", "markdown"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("the binary runs");
    drop(child.stdin.take());
    let output = child.wait_with_output().expect("finishes");
    assert_eq!(
        output.status.code(),
        Some(1),
        "an empty document is not an error"
    );
}
