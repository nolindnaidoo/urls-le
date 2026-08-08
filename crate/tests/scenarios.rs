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
/// It lives here because building and scanning a document with that many
/// URLs is slow — and slow was itself a finding: the scanner tracked
/// claimed offsets in a `Vec`, which made it quadratic and took this
/// from milliseconds to minutes.
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
            let content = "https://a.example ".repeat(50_010);
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
