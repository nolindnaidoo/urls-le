//! One file end to end — the only path either surface calls.
//!
//! `cli.rs` and `mcp/` both come through here, so a rule can only be
//! written once. `tests/contracts.rs` asserts the two agree.

use serde::Serialize;

use crate::extract::{self, Url};
use crate::walk::Target;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct Diagnostic {
    pub(crate) severity: String,
    pub(crate) code: String,
    pub(crate) message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub(crate) struct Summary {
    pub(crate) urls: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct FileReport {
    pub(crate) file: String,
    pub(crate) format: String,
    pub(crate) urls: Vec<Url>,
    pub(crate) diagnostics: Vec<Diagnostic>,
    pub(crate) summary: Summary,
}

impl FileReport {
    /// Whether this file was not read at all — not text, or not
    /// openable.
    ///
    /// It is reported rather than swallowed, because a report that
    /// quietly skipped a file would be claiming coverage it does not
    /// have. It does **not** fail the run on its own: every repository
    /// has a PNG and a zip in it, and exiting 2 on those makes the tool
    /// unusable in CI, which is the one place it is most worth running.
    /// `--strict` is there for a pipeline that wants zero tolerance.
    pub(crate) fn was_skipped(&self) -> bool {
        self.diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "skipped")
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct ScanOptions {
    /// Collapse repeated URLs to their first occurrence. Opt-in here
    /// because it is opt-in in the extension: every occurrence is a real
    /// occurrence, and which ones matter is the reader's call.
    pub(crate) dedupe: bool,
}

pub(crate) fn scan_file(target: &Target, options: ScanOptions) -> FileReport {
    let file = target.path.to_string_lossy().into_owned();
    let skipped = |reason: String| FileReport {
        file: file.clone(),
        format: target.language_id.to_string(),
        urls: Vec::new(),
        diagnostics: vec![Diagnostic {
            severity: "warning".to_string(),
            code: "skipped".to_string(),
            message: reason,
        }],
        summary: Summary { urls: 0 },
    };

    let bytes = match std::fs::read(&target.path) {
        Ok(bytes) => bytes,
        Err(error) => return skipped(error.to_string()),
    };
    let Ok(content) = String::from_utf8(bytes) else {
        return skipped("not UTF-8 text".to_string());
    };
    scan_content(without_bom(&content), file, target.language_id, options)
}

/// Drop a leading byte-order mark.
///
/// No editor shows it and VS Code strips it before the extension ever
/// sees a document, so without this the two frontends read the same file
/// differently the moment anything on Windows saves it — Notepad, Excel,
/// a PowerShell redirect. It is three invisible bytes that shift every
/// column on the first line, and in a structured format it can lose the
/// document entirely.
pub(crate) fn without_bom(content: &str) -> &str {
    content.strip_prefix('\u{feff}').unwrap_or(content)
}

pub(crate) fn scan_content(
    content: &str,
    file: String,
    language_id: &str,
    options: ScanOptions,
) -> FileReport {
    let extraction = extract::extract(content, language_id);
    let mut urls = extraction.urls;

    if options.dedupe {
        let mut seen: Vec<String> = Vec::new();
        urls.retain(|url| {
            if seen.contains(&url.value) {
                return false;
            }
            seen.push(url.value.clone());
            true
        });
    }

    FileReport {
        file,
        format: language_id.to_string(),
        summary: Summary { urls: urls.len() },
        urls,
        diagnostics: extraction
            .errors
            .iter()
            .map(|error| Diagnostic {
                severity: format!("{:?}", error.severity).to_lowercase(),
                code: format!("{:?}", error.category).to_lowercase(),
                message: error.message.clone(),
            })
            .collect(),
    }
}

/// The exit code for a whole run, following grep: **0 found, 1 none
/// found, 2 could not answer.**
///
/// "None found" is not an error and not a judgment about the URLs — it
/// is the honest answer to "is there anything here", and it is what
/// makes the tool composable in a shell.
pub(crate) fn exit_code(reports: &[FileReport], strict: bool) -> u8 {
    if strict && reports.iter().any(FileReport::was_skipped) {
        return 2;
    }
    u8::from(!reports.iter().any(|report| report.summary.urls > 0))
}

/// The one-line human projection of a URL. It says exactly what the JSON
/// says — never prose the report does not carry, and never a verdict,
/// because there are none.
pub(crate) fn describe(report: &FileReport, url: &Url) -> String {
    match url.position {
        Some(position) => format!(
            "{}:{}:{}  {}",
            report.file, position.line, position.column, url.value
        ),
        // A URL a parser handed back that could not be located in the
        // source keeps its value and loses its position, rather than
        // being dropped or given a made-up one.
        None => format!("{}:-:-  {}", report.file, url.value),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempTree;

    fn target(tree: &TempTree, relative: &str, language_id: &'static str) -> Target {
        Target {
            path: tree.path().join(relative),
            language_id,
        }
    }

    fn options() -> ScanOptions {
        ScanOptions { dedupe: false }
    }

    #[test]
    fn a_document_with_urls_exits_zero() {
        let tree = TempTree::new("scan-found");
        tree.write("docs/a.md", "see https://a.example/x\n");
        let report = scan_file(&target(&tree, "docs/a.md", "markdown"), options());
        assert_eq!(report.summary.urls, 1);
        assert_eq!(exit_code(&[report], false), 0);
    }

    /// grep's convention: nothing found is 1, and it is not an error.
    #[test]
    fn a_document_with_none_exits_one() {
        let tree = TempTree::new("scan-none");
        tree.write("docs/a.md", "nothing to see\n");
        let report = scan_file(&target(&tree, "docs/a.md", "markdown"), options());
        assert_eq!(report.summary.urls, 0);
        assert_eq!(exit_code(&[report], false), 1);
    }

    #[test]
    fn one_file_with_urls_is_enough_for_zero() {
        let empty = scan_content("nothing", "a".into(), "markdown", options());
        let found = scan_content("https://a.example", "b".into(), "markdown", options());
        assert_eq!(exit_code(&[empty, found], false), 0);
    }

    /// Changed deliberately: a file that could not be read is reported
    /// and does not fail the run, because every repository has one and
    /// exiting 2 on it meant the tool never got run in CI at all.
    #[test]
    fn an_unreadable_file_is_reported_and_does_not_end_the_run() {
        let tree = TempTree::new("scan-unreadable");
        let report = scan_file(&target(&tree, "gone.md", "markdown"), options());
        assert!(report.was_skipped());
        assert_eq!(report.diagnostics[0].code, "skipped");
        assert_eq!(report.diagnostics[0].severity, "warning");
        assert_eq!(exit_code(std::slice::from_ref(&report), false), 1);
        assert_eq!(exit_code(&[report], true), 2);
    }

    #[test]
    fn nothing_to_examine_reports_none_found() {
        assert_eq!(exit_code(&[], false), 1);
    }

    #[test]
    fn dedupe_collapses_repeats_to_the_first_occurrence() {
        let content = "https://a.example\nhttps://b.example\nhttps://a.example\n";
        let kept = scan_content(content, "x".into(), "markdown", options());
        assert_eq!(kept.summary.urls, 3, "every occurrence is real");

        let deduped = scan_content(
            content,
            "x".into(),
            "markdown",
            ScanOptions { dedupe: true },
        );
        assert_eq!(deduped.summary.urls, 2);
        assert_eq!(deduped.urls[0].position.expect("a position").line, 1);
    }

    #[test]
    fn the_human_line_carries_the_url_and_its_position() {
        let report = scan_content("x https://a.example", "a.md".into(), "markdown", options());
        assert_eq!(
            describe(&report, &report.urls[0]),
            "a.md:1:3  https://a.example"
        );
    }
}

#[cfg(test)]
mod hazards {
    use super::*;

    /// Three invisible bytes that Notepad, Excel and a PowerShell
    /// redirect all add, and that VS Code strips before the extension
    /// ever sees a document.
    #[test]
    fn a_byte_order_mark_is_not_part_of_the_document() {
        assert_eq!(
            without_bom("\u{feff}https://a.example"),
            "https://a.example"
        );
        assert_eq!(without_bom("https://a.example"), "https://a.example");
        // Only a leading one: elsewhere it is a zero-width no-break
        // space and belongs to the text.
        assert_eq!(without_bom("a\u{feff}b"), "a\u{feff}b");
    }

    #[test]
    fn a_byte_order_mark_does_not_move_the_first_column() {
        let options = ScanOptions { dedupe: false };
        let plain = scan_content("https://a.example", "x".to_string(), "markdown", options);
        let marked = scan_content(
            without_bom("\u{feff}https://a.example"),
            "x".to_string(),
            "markdown",
            options,
        );
        assert!(!plain.urls.is_empty(), "the baseline must find something");
        assert_eq!(marked.urls.len(), plain.urls.len());
        assert_eq!(
            marked.urls[0].position.map(|p| p.column),
            plain.urls[0].position.map(|p| p.column)
        );
    }

    /// The one that decides whether this is usable in CI. Every real
    /// repository contains something that is not text, and failing the
    /// build over it means the tool never gets run at all.
    #[test]
    fn a_skipped_file_does_not_fail_the_run() {
        let skipped = FileReport {
            file: "logo.png".to_string(),
            format: "markdown".to_string(),
            urls: Vec::new(),
            diagnostics: vec![Diagnostic {
                severity: "warning".to_string(),
                code: "skipped".to_string(),
                message: "not UTF-8 text".to_string(),
            }],
            summary: Summary { urls: 0 },
        };
        assert!(skipped.was_skipped());
        assert_eq!(exit_code(std::slice::from_ref(&skipped), false), 1);
        assert_eq!(exit_code(&[skipped], true), 2, "--strict is opt-in");
    }
}
