//! The shared corpus, run against this implementation.
//!
//! `../scripts/check-extraction-parity.ts` runs the extension over these
//! same files; this module runs the crate over them. Neither side may be
//! the sole author of a case.

use serde::Deserialize;

use super::scanner::{Protocol, scan_urls};
use super::{FileType, extract};

const EXTRACTION: &str = include_str!("../../fixtures/extraction.json");

const DOCUMENTS: [(&str, &str); 14] = [
    ("urls.md", include_str!("../../fixtures/documents/urls.md")),
    (
        "urls.html",
        include_str!("../../fixtures/documents/urls.html"),
    ),
    (
        "urls.css",
        include_str!("../../fixtures/documents/urls.css"),
    ),
    ("urls.js", include_str!("../../fixtures/documents/urls.js")),
    (
        "urls.json",
        include_str!("../../fixtures/documents/urls.json"),
    ),
    (
        "urls.yaml",
        include_str!("../../fixtures/documents/urls.yaml"),
    ),
    (
        "urls.properties",
        include_str!("../../fixtures/documents/urls.properties"),
    ),
    (
        "urls.toml",
        include_str!("../../fixtures/documents/urls.toml"),
    ),
    (
        "urls.ini",
        include_str!("../../fixtures/documents/urls.ini"),
    ),
    (
        "urls.xml",
        include_str!("../../fixtures/documents/urls.xml"),
    ),
    (
        "broken.toml",
        include_str!("../../fixtures/documents/broken.toml"),
    ),
    // Read through the fallback: no format-aware extractor, nothing to
    // exclude, and every URL still found.
    ("urls.py", include_str!("../../fixtures/documents/urls.py")),
    ("urls.go", include_str!("../../fixtures/documents/urls.go")),
    ("urls.sh", include_str!("../../fixtures/documents/urls.sh")),
];

pub(crate) fn document(name: &str) -> &'static str {
    DOCUMENTS
        .iter()
        .find(|(file, _)| *file == name)
        .map_or_else(
            || panic!("the corpus refers to {name}, which is not embedded"),
            |(_, content)| *content,
        )
}

#[derive(Debug, Deserialize)]
struct Corpus {
    documents: Vec<DocumentCase>,
    scan: Vec<ScanCase>,
}

#[derive(Debug, Deserialize)]
struct DocumentCase {
    name: String,
    file: String,
    #[serde(rename = "languageId")]
    language_id: String,
    success: bool,
    expected: Vec<ExpectedUrl>,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
struct ExpectedUrl {
    value: String,
    protocol: Protocol,
    domain: Option<String>,
    path: Option<String>,
    line: Option<usize>,
    column: Option<usize>,
    context: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ScanCase {
    input: String,
    expected: Vec<ExpectedMatch>,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
struct ExpectedMatch {
    value: String,
    protocol: Protocol,
    start: usize,
}

fn corpus() -> Corpus {
    serde_json::from_str(EXTRACTION).expect("the corpus is valid JSON")
}

#[test]
fn every_document_case_reproduces() {
    let corpus = corpus();
    assert!(!corpus.documents.is_empty(), "the corpus is empty");

    for case in corpus.documents {
        let result = extract(document(&case.file), &case.language_id);
        assert_eq!(result.success, case.success, "{}", case.name);
        let actual: Vec<ExpectedUrl> = result
            .urls
            .iter()
            .map(|url| ExpectedUrl {
                value: url.value.clone(),
                protocol: url.protocol,
                domain: url.domain.clone(),
                path: url.path.clone(),
                line: url.position.map(|position| position.line),
                column: url.position.map(|position| position.column),
                context: url.context.clone(),
            })
            .collect();
        assert_eq!(actual, case.expected, "{}", case.name);
    }
}

#[test]
fn every_scan_case_reproduces() {
    for case in corpus().scan {
        let actual: Vec<ExpectedMatch> = scan_urls(&case.input, 0)
            .into_iter()
            .map(|found| ExpectedMatch {
                value: found.value,
                protocol: found.protocol,
                start: found.start,
            })
            .collect();
        assert_eq!(actual, case.expected, "scan {:?}", case.input);
    }
}

/// Every embedded document must be used by a case, and every case must
/// name an embedded document.
#[test]
fn the_corpus_and_the_embedded_documents_match() {
    let corpus = corpus();
    for (name, _) in DOCUMENTS {
        assert!(
            corpus.documents.iter().any(|case| case.file == name),
            "{name} is embedded but no case uses it"
        );
    }
    for case in &corpus.documents {
        assert!(
            DOCUMENTS.iter().any(|(name, _)| *name == case.file),
            "{} names {}, which is not embedded",
            case.name,
            case.file
        );
    }
}

/// A document that does not parse still yields its URLs, through the
/// fallback scan. Pinned separately because it is the one case where a
/// parser failure must not become an empty result.
#[test]
fn a_broken_document_still_yields_its_urls() {
    let result = extract(document("broken.toml"), "toml");
    assert!(result.success);
    assert!(!result.urls.is_empty(), "the fallback scan found nothing");
}

/// Changed deliberately: a language with no format-aware
/// extractor was refused with a warning and no URLs. It is now read
/// whole — the corpus's `urls.py`, `urls.go` and `urls.sh` are the
/// documents that pin what comes back — and `Unknown` stops meaning
/// "refused" and starts meaning "scanned whole".
#[test]
fn a_language_with_no_extractor_is_read_rather_than_refused() {
    let result = extract("see https://a.example", "python");
    assert!(result.success);
    assert_eq!(result.urls.len(), 1);
    assert!(result.errors.is_empty());
    assert_eq!(result.file_type, FileType::Unknown);
}
