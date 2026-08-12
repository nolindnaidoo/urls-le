//! Documents and filesystems that break tools, run against the **built
//! binary**.
//!
//! Not a fixture directory: Windows cannot check in a FIFO, a symlink
//! loop or a permission-denied file, so every tree here is built at
//! runtime and each case the platform cannot express says plainly, by
//! name, that it did not run.
//!
//! Every case asserts the same floor first: **the process does not
//! panic, does not hang, and exits 0, 1 or 2 — never a signal.**
//!
//! Each content hazard carries a value the crate should find, so "no
//! crash" is never mistaken for "no answer".

use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

const BINARY: &str = env!("CARGO_BIN_EXE_urls-le");
/// The value every content hazard hides. Distinctive enough that finding
/// it in stdout is proof the document was read, not merely opened.
const VALUE: &str = "https://found.example/x";
static COUNTER: AtomicUsize = AtomicUsize::new(0);

struct Tree {
    root: PathBuf,
}

impl Tree {
    fn new(name: &str) -> Self {
        let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "urls-le-hazard-{name}-{}-{unique}",
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

    fn write(&self, relative: &str, bytes: &[u8]) -> PathBuf {
        let target = self.root.join(relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).expect("a parent directory");
        }
        std::fs::write(&target, bytes).expect("a file");
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

fn run(args: &[&str]) -> Run {
    let output = Command::new(BINARY)
        .args(args)
        .output()
        .expect("the binary runs");
    Run {
        code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    }
}

/// The floor every hazard shares. `None` from `code()` means the process
/// died on a signal — the SIGABRT class this file exists to catch.
fn assert_survived(case: &str, run: &Run) {
    let Some(code) = run.code else {
        panic!(
            "{case}: the process died on a signal\nstderr: {}",
            run.stderr
        );
    };
    assert!(
        (0..=2).contains(&code),
        "{case}: exit {code} is outside grep's convention\nstderr: {}",
        run.stderr
    );
}

fn reports(run: &Run) -> Vec<serde_json::Value> {
    run.stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str(line).expect("stdout carries only JSON"))
        .collect()
}

/// The report for one file, found by the tail of its reported path.
fn report_for<'a>(reports: &'a [serde_json::Value], name: &str) -> &'a serde_json::Value {
    reports
        .iter()
        .find(|report| {
            report["file"]
                .as_str()
                .is_some_and(|file| file.ends_with(name))
        })
        .unwrap_or_else(|| panic!("{name} has no report line — it vanished from the audit"))
}

fn url_count(report: &serde_json::Value) -> usize {
    report["urls"].as_array().map_or(0, Vec::len)
}

fn was_skipped(report: &serde_json::Value) -> bool {
    report["diagnostics"]
        .as_array()
        .is_some_and(|list| list.iter().any(|entry| entry["code"] == "skipped"))
}

/// UTF-16LE bytes with a BOM, which is what a PowerShell redirect writes.
fn utf16le(text: &str) -> Vec<u8> {
    let mut bytes = vec![0xFF, 0xFE];
    for unit in text.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    bytes
}

/// Every content hazard in one tree, one run of the binary.
///
/// `expected` is the number of URLs the file must yield; `skipped` is
/// whether it must come back as unexamined. A case is here rather than in
/// a unit test because the byte-level shapes — a BOM, a lone CR, a NUL —
/// only exist on the way in from the filesystem.
#[test]
fn every_content_hazard_is_read_or_reported() {
    let tree = Tree::new("content");
    let line = format!("see {VALUE} here\n");
    let long = format!("{} {VALUE}\n", "x".repeat(1_000_000));
    let mut many = String::with_capacity(1_200_000);
    for index in 0..100_000 {
        writeln!(many, "line {index}").expect("a string accepts writes");
    }
    many.push_str(&line);

    let cases: Vec<(&str, Vec<u8>, usize, bool)> = vec![
        ("plain.md", line.clone().into_bytes(), 1, false),
        ("bom.md", format!("\u{feff}{line}").into_bytes(), 1, false),
        (
            "crlf.md",
            format!("first\r\nsee {VALUE} here\r\n").into_bytes(),
            1,
            false,
        ),
        (
            "lone-cr.md",
            format!("first\rsee {VALUE} here\r").into_bytes(),
            1,
            false,
        ),
        (
            "no-trailing-newline.md",
            format!("see {VALUE} here").into_bytes(),
            1,
            false,
        ),
        ("empty.md", Vec::new(), 0, false),
        ("whitespace.md", b"   \n\t\n \n".to_vec(), 0, false),
        (
            "nul-mid-file.md",
            format!("first\u{0}see {VALUE} here\n").into_bytes(),
            1,
            false,
        ),
        (
            "emoji-before.md",
            format!("\u{1f3af} see {VALUE} here\n").into_bytes(),
            1,
            false,
        ),
        // The task's shape: a URL that runs to the end of a 1 MB line.
        ("one-megabyte-line.md", long.into_bytes(), 1, false),
        ("hundred-thousand-lines.md", many.into_bytes(), 1, false),
        // Undecodable, so unexamined: named, carried, and never silently
        // dropped from the report.
        (
            "invalid-utf8.md",
            [b"\x80\x81 see ".to_vec(), VALUE.as_bytes().to_vec()].concat(),
            0,
            true,
        ),
        ("utf16le.md", utf16le(&line), 0, true),
    ];

    for (name, bytes, _, _) in &cases {
        tree.write(name, bytes);
    }

    let run = run(&[&tree.path().to_string_lossy()]);
    assert_survived("every_content_hazard_is_read_or_reported", &run);
    let reports = reports(&run);
    assert_eq!(run.code, Some(0), "URLs were found\nstderr: {}", run.stderr);

    for (name, _, expected, skipped) in &cases {
        let report = report_for(&reports, name);
        assert_eq!(url_count(report), *expected, "{name}: {report}");
        assert_eq!(was_skipped(report), *skipped, "{name}: {report}");
    }

    // A BOM is three invisible bytes. It must not move the column, or
    // every position on the first line of a Windows-written file is off
    // by three against the editor the reader has open.
    let plain = report_for(&reports, "plain.md");
    let marked = report_for(&reports, "bom.md");
    assert_eq!(
        marked["urls"][0]["column"], plain["urls"][0]["column"],
        "a BOM moved the reported column"
    );
    assert_eq!(marked["urls"][0]["line"], plain["urls"][0]["line"]);
}

/// An undecodable file is unexamined, so `--strict` must refuse the run.
/// The default must not: every repository holds a PNG, and a tool that
/// exits 2 on one never gets run in CI at all.
#[test]
fn an_undecodable_file_is_carried_by_default_and_refused_by_strict() {
    let tree = Tree::new("undecodable");
    tree.write("docs/a.md", format!("see {VALUE}\n").as_bytes());
    tree.write(
        "logo.png",
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\xff\xfe\x00binary",
    );

    let lenient = run(&[&tree.path().to_string_lossy()]);
    assert_survived("an_undecodable_file, default", &lenient);
    assert_eq!(lenient.code, Some(0), "stderr: {}", lenient.stderr);

    // This crate makes no distinction between "binary" and "text but
    // undecodable": both are bytes that are not UTF-8, and SPEC.md rules
    // out the third option of a file that silently vanishes from the
    // report. So the PNG keeps a report line carrying a `skipped`
    // diagnostic rather than disappearing, and `--strict` is what a
    // pipeline with zero tolerance reaches for.
    let lenient_reports = reports(&lenient);
    let png = report_for(&lenient_reports, "logo.png");
    assert!(was_skipped(png), "{png}");
    assert_eq!(url_count(png), 0);

    let strict = run(&["--strict", &tree.path().to_string_lossy()]);
    assert_survived("an_undecodable_file, --strict", &strict);
    assert_eq!(strict.code, Some(2), "stderr: {}", strict.stderr);
}

/// Both limits are behaviour a caller can observe, so both are asserted
/// rather than trusted: 50,000 URLs from one document, and a refusal
/// above 10 MB of content.
#[test]
fn the_documented_limits_hold() {
    let tree = Tree::new("limits");
    tree.write("many.md", "https://a.example\n".repeat(50_010).as_bytes());
    // Just past the ceiling, built from a byte that cannot look like a
    // URL so the refusal is the only thing under test.
    tree.write("oversized.md", &b"a".repeat(10_000_001));

    let lenient = run(&[&tree.path().to_string_lossy()]);
    assert_survived("the_documented_limits_hold", &lenient);
    let reports = reports(&lenient);

    let many = report_for(&reports, "many.md");
    assert_eq!(url_count(many), 50_000, "the 50,000 cap was not applied");
    assert!(
        many["diagnostics"]
            .as_array()
            .is_some_and(|list| list.iter().any(|entry| entry["message"]
                .as_str()
                .is_some_and(|message| message.contains("Too many URLs")))),
        "the truncation was silent: {many}"
    );

    let oversized = report_for(&reports, "oversized.md");
    assert_eq!(url_count(oversized), 0);
    assert!(
        oversized["diagnostics"]
            .as_array()
            .is_some_and(|list| list.iter().any(|entry| entry["message"]
                .as_str()
                .is_some_and(|message| message.contains("maximum size is 10MB")))),
        "the refusal was silent: {oversized}"
    );

    // A document refused for its size was not examined. `--strict` means
    // zero tolerance for that, or it is promising coverage nobody got.
    let strict = run(&["--strict", &tree.path().to_string_lossy()]);
    assert_survived("the_documented_limits_hold, --strict", &strict);
    assert_eq!(strict.code, Some(2), "stderr: {}", strict.stderr);
}

/// Names a filesystem accepts and a walker can trip over.
#[test]
fn awkward_names_are_walked() {
    let tree = Tree::new("names");
    tree.write("with spaces.md", format!("see {VALUE}\n").as_bytes());
    tree.write("naïve-документ.md", format!("see {VALUE}\n").as_bytes());
    tree.write("emoji-\u{1f3af}.md", format!("see {VALUE}\n").as_bytes());
    // A directory whose name looks like a document. The walk must descend
    // it rather than trying to read it.
    tree.write("x.json/inside.md", format!("see {VALUE}\n").as_bytes());

    let run = run(&[&tree.path().to_string_lossy()]);
    assert_survived("awkward_names_are_walked", &run);
    assert_eq!(run.code, Some(0), "stderr: {}", run.stderr);
    let reports = reports(&run);
    for name in [
        "with spaces.md",
        "naïve-документ.md",
        "emoji-\u{1f3af}.md",
        "inside.md",
    ] {
        assert_eq!(url_count(report_for(&reports, name)), 1, "{name}");
    }
    assert!(
        !reports.iter().any(|report| report["file"]
            .as_str()
            .is_some_and(|f| f.ends_with("x.json"))),
        "a directory was read as a document"
    );
}

/// A path past the Windows 260-character limit. Creating it is what
/// differs by platform, so the failure to create is tolerated and named;
/// what is asserted is that the walk survives whichever happened.
#[test]
fn a_very_long_path_does_not_break_the_walk() {
    let tree = Tree::new("longpath");
    tree.write("shallow.md", format!("see {VALUE}\n").as_bytes());

    let mut deep = tree.path().to_path_buf();
    for _ in 0..8 {
        deep.push("a".repeat(34));
    }
    let created = std::fs::create_dir_all(&deep)
        .and_then(|()| std::fs::write(deep.join("deep.md"), format!("see {VALUE}\n")))
        .is_ok();
    if !created {
        eprintln!(
            "SKIPPED a_very_long_path_does_not_break_the_walk: this filesystem \
             refused a path of {} characters",
            deep.to_string_lossy().chars().count()
        );
    }

    let run = run(&[&tree.path().to_string_lossy()]);
    assert_survived("a_very_long_path_does_not_break_the_walk", &run);
    assert_eq!(run.code, Some(0), "stderr: {}", run.stderr);
    let reports = reports(&run);
    assert_eq!(url_count(report_for(&reports, "shallow.md")), 1);
    if created {
        assert_eq!(url_count(report_for(&reports, "deep.md")), 1);
    }
}

/// Exit 2 is for a malformed **question**, never for a file that could
/// not be read. One locked directory used to exit 2 with an empty report,
/// which deleted the audit of everything readable beside it.
#[test]
fn an_unreadable_path_never_becomes_exit_two() {
    let tree = Tree::new("unreadable");
    tree.write("readable.md", format!("see {VALUE}\n").as_bytes());

    #[cfg(unix)]
    let locked = {
        use std::os::unix::fs::PermissionsExt as _;
        tree.write("locked/inside.md", b"https://hidden.example\n");
        let locked = tree.path().join("locked");
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000))
            .expect("permissions");
        Some(locked)
    };
    // Windows permissions are ACL-based and there is no `chmod` to
    // express this with, so the case is the readable tree alone there.
    #[cfg(not(unix))]
    let locked: Option<PathBuf> = {
        eprintln!(
            "SKIPPED an_unreadable_path_never_becomes_exit_two/locked-directory: \
             Windows has no chmod 000"
        );
        None
    };

    let lenient = run(&[&tree.path().to_string_lossy()]);
    let strict = run(&["--strict", &tree.path().to_string_lossy()]);

    #[cfg(unix)]
    if let Some(locked) = &locked {
        use std::os::unix::fs::PermissionsExt as _;
        // Restored before asserting, or a failure leaves a directory the
        // cleanup cannot remove.
        std::fs::set_permissions(locked, std::fs::Permissions::from_mode(0o755))
            .expect("permissions");
    }

    assert_survived("an_unreadable_path_never_becomes_exit_two", &lenient);
    assert_eq!(
        lenient.code,
        Some(0),
        "an unreadable path ended the run\nstderr: {}",
        lenient.stderr
    );
    assert_eq!(
        url_count(report_for(&reports(&lenient), "readable.md")),
        1,
        "the readable half of the tree was lost"
    );

    let root_reads_anything = locked.is_some() && strict.code == Some(0);
    if root_reads_anything {
        eprintln!(
            "SKIPPED an_unreadable_path_never_becomes_exit_two/strict: \
             this user can read a 0o000 directory"
        );
    }
    if locked.is_some() && !root_reads_anything {
        assert_survived(
            "an_unreadable_path_never_becomes_exit_two, --strict",
            &strict,
        );
        assert_eq!(
            strict.code,
            Some(2),
            "--strict ignored a path that could not be examined\nstderr: {}",
            strict.stderr
        );
    }

    // A malformed question is the only other way to reach 2.
    assert_eq!(run(&["--no-such-flag", "."]).code, Some(2));
    assert_eq!(run(&["/no/such/place-xyz"]).code, Some(2));
}

/// Links, pipes and loops. Unix only: `std::os::windows::fs::symlink_*`
/// needs developer mode or elevation on Windows, so a failure there would
/// be the test environment's, not the tool's.
#[cfg(unix)]
#[test]
fn links_pipes_and_loops_are_survived() {
    let tree = Tree::new("links");
    tree.write("real.md", format!("see {VALUE}\n").as_bytes());
    std::os::unix::fs::symlink("real.md", tree.path().join("link.md")).expect("a symlink");
    std::os::unix::fs::symlink("nowhere.md", tree.path().join("broken.md")).expect("a symlink");

    // A FIFO blocks forever on open. The walk must not read it, which is
    // what "only regular files are examined" buys.
    let fifo = tree.path().join("pipe.md");
    let made_fifo = std::process::Command::new("mkfifo")
        .arg(&fifo)
        .status()
        .is_ok_and(|status| status.success());
    if !made_fifo {
        eprintln!("SKIPPED links_pipes_and_loops_are_survived/fifo: mkfifo is unavailable");
    }

    let plain = run(&[&tree.path().to_string_lossy()]);
    assert_survived("links_pipes_and_loops_are_survived", &plain);
    assert_eq!(plain.code, Some(0), "stderr: {}", plain.stderr);
    assert_eq!(url_count(report_for(&reports(&plain), "real.md")), 1);

    // Symlinks are not followed by default — ripgrep's rule, and the
    // reason `--follow-symlinks` exists. Pinned so it stays a decision.
    assert!(
        !reports(&plain).iter().any(|report| report["file"]
            .as_str()
            .is_some_and(|f| f.ends_with("link.md"))),
        "a symlink was walked without --follow-symlinks"
    );

    if made_fifo {
        std::fs::remove_file(&fifo).expect("the fifo is removed");
    }

    // A loop under --follow-symlinks is reported, not fatal: the tree
    // beside it still gets audited.
    std::os::unix::fs::symlink(tree.path(), tree.path().join("loop")).expect("a symlink");
    let followed = run(&["--follow-symlinks", &tree.path().to_string_lossy()]);
    assert_survived(
        "links_pipes_and_loops_are_survived, --follow-symlinks",
        &followed,
    );
    assert_eq!(
        followed.code,
        Some(0),
        "a symlink loop ended the run\nstderr: {}",
        followed.stderr
    );
    assert_eq!(url_count(report_for(&reports(&followed), "real.md")), 1);
}
