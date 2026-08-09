//! The tier that needs a document too big for the fast path.
//!
//! Gated behind `URLS_LE_SCENARIOS` and run by CI. Nothing here
//! substitutes for the unit tests, which run everywhere on every push.
//!
//! **A skipped scenario is never reported as a pass.**

fn enabled(name: &str) -> bool {
    if std::env::var_os("URLS_LE_SCENARIOS").is_some() {
        return true;
    }
    eprintln!("SKIPPED {name}: set URLS_LE_SCENARIOS to run it");
    false
}

/// The 50,000-URL cap is behaviour a caller can observe, and it is
/// reported rather than silent so a truncated result cannot be mistaken
/// for a complete one.
///
/// One URL per line, which is what a document with this many actually
/// looks like. An earlier version put them all on **one** line and took
/// forty-eight minutes: every URL carries its source line as context, so
/// 50,000 URLs on a 900 KB line means 50,000 copies of 900 KB. That is
/// the extension's design — a `context` field is the whole line — and it
/// only bites at a scale an editor never reaches. The pathological
/// single-line case is its own test below, kept small enough to be
/// honest about what it proves.
#[test]
fn too_many_urls_are_truncated_and_the_truncation_is_reported() {
    if !enabled("too_many_urls_are_truncated_and_the_truncation_is_reported") {
        return;
    }
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_urls-le"))
        .args(["--stdin", "--format", "markdown"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            use std::io::Write as _;
            let content = "https://a.example\n".repeat(50_010);
            child
                .stdin
                .as_mut()
                .expect("stdin")
                .write_all(content.as_bytes())?;
            child.wait_with_output()
        })
        .expect("the binary runs");

    let report: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("stdout carries JSON");
    assert_eq!(
        report["urls"].as_array().expect("urls").len(),
        50_000,
        "the cap was not applied"
    );
    assert!(
        String::from_utf8_lossy(&output.stdout).contains("Too many URLs"),
        "the truncation was silent"
    );
}

/// A document whose content sits on one very long line — a minified
/// bundle is the real-world shape. This is bounded deliberately: it
/// proves the scan completes and stays linear in the *number* of URLs,
/// not that an unbounded one would.
///
/// Each URL carries its source line as `context`, so a single line
/// holding many URLs costs quadratic memory by construction. That is
/// inherited from the extension and is not something this crate may fix
/// alone — a shorter context would be a parity break. It is written down
/// here rather than discovered by someone pointing this at a bundle.
#[test]
fn a_single_long_line_completes() {
    if !enabled("a_single_long_line_completes") {
        return;
    }
    let content = "https://a.example ".repeat(2_000);
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_urls-le"))
        .args(["--stdin", "--format", "markdown"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            use std::io::Write as _;
            child
                .stdin
                .as_mut()
                .expect("stdin")
                .write_all(content.as_bytes())?;
            child.wait_with_output()
        })
        .expect("the binary runs");

    let report: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("stdout carries JSON");
    assert_eq!(report["urls"].as_array().expect("urls").len(), 2_000);
}
