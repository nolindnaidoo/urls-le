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
    /// Whether this file could not be examined at all. A run containing
    /// one exits 2: a report that silently skipped a file would be
    /// claiming coverage it does not have.
    pub(crate) fn is_unexamined(&self) -> bool {
        self.diagnostics
            .iter()
            .any(|diagnostic| diagnostic.severity == "error")
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
    match std::fs::read_to_string(&target.path) {
        Ok(content) => scan_content(&content, file, target.language_id, options),
        Err(error) => FileReport {
            file,
            format: target.language_id.to_string(),
            urls: Vec::new(),
            diagnostics: vec![Diagnostic {
                severity: "error".to_string(),
                code: "unreadable".to_string(),
                message: format!("could not be read: {error}"),
            }],
            summary: Summary { urls: 0 },
        },
    }
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
pub(crate) fn exit_code(reports: &[FileReport]) -> u8 {
    if reports.iter().any(FileReport::is_unexamined) {
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
        assert_eq!(exit_code(&[report]), 0);
    }

    /// grep's convention: nothing found is 1, and it is not an error.
    #[test]
    fn a_document_with_none_exits_one() {
        let tree = TempTree::new("scan-none");
        tree.write("docs/a.md", "nothing to see\n");
        let report = scan_file(&target(&tree, "docs/a.md", "markdown"), options());
        assert_eq!(report.summary.urls, 0);
        assert_eq!(exit_code(&[report]), 1);
    }

    #[test]
    fn one_file_with_urls_is_enough_for_zero() {
        let empty = scan_content("nothing", "a".into(), "markdown", options());
        let found = scan_content("https://a.example", "b".into(), "markdown", options());
        assert_eq!(exit_code(&[empty, found]), 0);
    }

    #[test]
    fn an_unreadable_file_ends_the_run_at_two() {
        let tree = TempTree::new("scan-unreadable");
        let report = scan_file(&target(&tree, "gone.md", "markdown"), options());
        assert!(report.is_unexamined());
        assert_eq!(report.diagnostics[0].code, "unreadable");
        assert_eq!(exit_code(&[report]), 2);
    }

    #[test]
    fn nothing_to_examine_reports_none_found() {
        assert_eq!(exit_code(&[]), 1);
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
