//! Does this crate open what it claims to open?
//!
//! Two questions, both mechanical, both previously answered by hand:
//!
//! 1. **Every name in the alias table produces a report line.** A file
//!    per alias, plus a dozen extensions the table has never heard of,
//!    written into one tree and walked once. A file the walk skips is a
//!    failure; so is a file it reads and finds nothing in, because every
//!    one of them carries the same URL.
//! 2. **Every advertised format has a corpus document.** A name in
//!    `SUPPORTED_FORMATS` that no document exercises is a format nobody
//!    has ever checked, and this is the test that makes that visible
//!    without anyone counting by hand.
//!
//! Ubuntu only: nothing here is platform-dependent, and running it three
//! times would only buy three chances to trip over a case-folding
//! filesystem while asserting nothing new.

use std::path::{Path, PathBuf};
use std::process::Command;

const BINARY: &str = env!("CARGO_BIN_EXE_urls-le");
const VALUE: &str = "https://found.example/x";
const ALIASES: &str = include_str!("../fixtures/aliases.json");
const EXTRACTION: &str = include_str!("../fixtures/extraction.json");

/// Held equal to `extract::format::SUPPORTED_FORMATS` by the unit tests
/// in that module and by `fixtures/aliases.json`; repeated here because
/// an integration test cannot see a `pub(crate)` constant.
const SUPPORTED_FORMATS: [&str; 13] = [
    "markdown",
    "html",
    "css",
    "javascript",
    "typescript",
    "json",
    "yaml",
    "properties",
    "toml",
    "ini",
    "xml",
    "csv",
    "plaintext",
];

/// Extensions the alias table has never heard of. Every one must still
/// be walked, read and reported — that is the whole 0.2.0 change, and
/// the thing that used to make a clean audit out of a scan that never
/// looked at the source.
const UNKNOWN: [&str; 14] = [
    "rs",
    "py",
    "go",
    "sh",
    "sql",
    "rb",
    "java",
    "kt",
    "swift",
    "c",
    "h",
    "lua",
    "zig",
    "unheardof",
];

struct Tree {
    root: PathBuf,
}

impl Tree {
    fn new(name: &str) -> Self {
        let root =
            std::env::temp_dir().join(format!("urls-le-matrix-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("a temporary directory");
        Self {
            root: std::fs::canonicalize(&root).expect("a canonical directory"),
        }
    }

    fn path(&self) -> &Path {
        &self.root
    }

    fn write(&self, relative: &str, contents: &str) {
        let target = self.root.join(relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).expect("a parent directory");
        }
        std::fs::write(&target, contents).expect("a file");
    }
}

impl Drop for Tree {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn aliases() -> std::collections::BTreeMap<String, String> {
    serde_json::from_str(ALIASES).expect("the alias contract is valid JSON")
}

#[test]
fn every_name_in_the_alias_table_is_opened_and_read() {
    let tree = Tree::new("aliases");
    // Written as a quoted JSON pair rather than as prose, because JSON is
    // the one format that scans string tokens alone: a bare sentence has
    // none, and this test would be measuring the document rather than the
    // walk. Every other extractor reads it too — `{`, `}` and `"` are all
    // in the delimiter set, so the value terminates the same way in each.
    let document = format!("{{\"see\": \"{VALUE}\"}}\n");

    // One file per alias, named two ways: as a whole name (`.env`,
    // `pom`) and as an extension (`sample.env`). Both are resolution
    // paths, and a divergence between them is what this release found by
    // hand.
    let mut expected: Vec<String> = Vec::new();
    for (index, name) in aliases().keys().enumerate() {
        let whole = format!("whole{index:03}-{name}");
        tree.write(&whole, &document);
        expected.push(whole);
        let extended = format!("sample{index:03}.{name}");
        tree.write(&extended, &document);
        expected.push(extended);
    }
    for (index, extension) in UNKNOWN.iter().enumerate() {
        let name = format!("unknown{index:03}.{extension}");
        tree.write(&name, &document);
        expected.push(name);
    }
    // No extension at all, several dots, and the dotfiles that only the
    // whole-name lookup can resolve — `.env` is an alias and is hidden,
    // which is two ways for a file to disappear from an audit at once.
    for name in [
        "Makefile",
        "LICENSE",
        "noextension",
        "dotted.name.here",
        ".env",
        ".npmrc",
        ".hidden.md",
    ] {
        tree.write(name, &document);
        expected.push(name.to_string());
    }

    let output = Command::new(BINARY)
        // Hidden and ignored files are walked deliberately: `.env` is an
        // alias, and it is hidden.
        .args(["--hidden", "--no-ignore"])
        .arg(tree.path())
        .output()
        .expect("the binary runs");
    assert_eq!(
        output.status.code(),
        Some(0),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let reports: Vec<serde_json::Value> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str(line).expect("stdout carries only JSON"))
        .collect();

    let mut missing: Vec<&str> = Vec::new();
    let mut empty: Vec<&str> = Vec::new();
    for name in &expected {
        let Some(report) = reports.iter().find(|report| {
            report["file"]
                .as_str()
                .is_some_and(|file| file.ends_with(&format!("/{name}")))
        }) else {
            missing.push(name);
            continue;
        };
        if report["summary"]["urls"].as_u64() != Some(1) {
            empty.push(name);
        }
    }

    assert!(
        missing.is_empty(),
        "{} of {} files were never reported — the walk skipped them: {missing:?}",
        missing.len(),
        expected.len()
    );
    assert!(
        empty.is_empty(),
        "{} files were opened and the URL in them was not found: {empty:?}",
        empty.len()
    );
    assert_eq!(
        reports.len(),
        expected.len(),
        "the walk reported files nobody wrote"
    );
}

/// An advertised format with no corpus document is a format nobody has
/// ever run. `typescript`, `csv` and `plaintext` were exactly that until
/// this test asked.
#[test]
fn every_advertised_format_has_a_corpus_document() {
    #[derive(serde::Deserialize)]
    struct Corpus {
        documents: Vec<Document>,
    }
    #[derive(serde::Deserialize)]
    struct Document {
        #[serde(rename = "languageId")]
        language_id: String,
        expected: Vec<serde_json::Value>,
    }

    let corpus: Corpus = serde_json::from_str(EXTRACTION).expect("the corpus is valid JSON");
    let mut uncovered: Vec<&str> = Vec::new();
    for format in SUPPORTED_FORMATS {
        let covered = corpus
            .documents
            .iter()
            .any(|document| document.language_id == format && !document.expected.is_empty());
        if !covered {
            uncovered.push(format);
        }
    }
    assert!(
        uncovered.is_empty(),
        "these advertised formats have no corpus document that finds anything: {uncovered:?}"
    );
}

/// The alias table and the advertised list are one contract. Checked
/// from the shared file so this fails on either side's edit, the same
/// way `../scripts/check-extraction-parity.ts` does.
#[test]
fn every_alias_lands_on_an_advertised_format() {
    for (from, to) in aliases() {
        assert!(
            SUPPORTED_FORMATS.contains(&to.as_str()),
            "{from} -> {to} is not an advertised format"
        );
    }
}
