//! The pure extraction layer: document text in, URLs out.
//!
//! **Nothing in here touches the filesystem**, which is what makes the
//! whole decision layer testable from a fixture file. A `std::fs` call
//! below this line is a bug, and CI greps for one.

pub(crate) mod format;
pub(crate) mod scanner;

mod formats;
mod position;

#[cfg(test)]
pub(crate) mod corpus;

pub(crate) use format::{FileType, determine_file_type};
pub(crate) use scanner::Url;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ErrorCategory {
    Parsing,
    Format,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Severity {
    Warning,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct ExtractionError {
    pub(crate) category: ErrorCategory,
    pub(crate) severity: Severity,
    pub(crate) message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct Extraction {
    pub(crate) success: bool,
    pub(crate) urls: Vec<Url>,
    pub(crate) errors: Vec<ExtractionError>,
    pub(crate) file_type: FileType,
}

/// Limits that are behaviour, not tuning: the extension refuses content
/// over 10 MB with a message, and returns at most 50,000 URLs from one
/// document. Both are ported because a caller can observe either.
const MAX_CONTENT_SIZE: usize = 10_000_000;
const MAX_URL_COUNT: usize = 50_000;

pub(crate) fn extract(content: &str, language_id: &str) -> Extraction {
    if content.len() > MAX_CONTENT_SIZE {
        return Extraction {
            success: false,
            urls: Vec::new(),
            errors: vec![ExtractionError {
                category: ErrorCategory::Format,
                severity: Severity::Error,
                message: format!(
                    "Content too large ({} characters), maximum size is 10MB",
                    content.len()
                ),
            }],
            file_type: FileType::Unknown,
        };
    }

    let file_type = determine_file_type(language_id);
    if file_type == FileType::Unknown {
        return Extraction {
            success: false,
            urls: Vec::new(),
            errors: vec![ExtractionError {
                category: ErrorCategory::Format,
                severity: Severity::Warning,
                message: format!("Unsupported file type: {language_id}"),
            }],
            file_type,
        };
    }

    let mut urls = formats::extract_by_file_type(content, file_type);
    let truncated = urls.len() > MAX_URL_COUNT;
    urls.truncate(MAX_URL_COUNT);

    Extraction {
        success: true,
        urls,
        errors: if truncated {
            vec![ExtractionError {
                category: ErrorCategory::Parsing,
                severity: Severity::Warning,
                message: format!("Too many URLs, truncated to {MAX_URL_COUNT}"),
            }]
        } else {
            Vec::new()
        },
        file_type,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_supported_document_succeeds() {
        let result = extract("see https://a.example", "markdown");
        assert!(result.success);
        assert_eq!(result.urls.len(), 1);
        assert!(result.errors.is_empty());
        assert_eq!(result.file_type, FileType::Markdown);
    }

    #[test]
    fn an_unsupported_language_is_refused_by_name() {
        let result = extract("https://a.example", "python");
        assert!(!result.success);
        assert_eq!(result.errors[0].category, ErrorCategory::Format);
        assert_eq!(result.errors[0].severity, Severity::Warning);
        assert!(result.errors[0].message.contains("python"));
    }

    /// The 10 MB ceiling is behaviour a caller can observe, so it is
    /// ported and pinned rather than treated as tuning.
    #[test]
    fn content_over_the_ceiling_is_refused_with_its_size() {
        let oversized = "a".repeat(MAX_CONTENT_SIZE + 1);
        let result = extract(&oversized, "markdown");
        assert!(!result.success);
        assert_eq!(result.errors[0].severity, Severity::Error);
        assert!(result.errors[0].message.contains("maximum size is 10MB"));
        assert!(result.urls.is_empty());
    }

    // The 50,000 cap is exercised in `tests/scenarios.rs`, not here: a
    // document with that many URLs takes long enough to build and scan
    // that it does not belong on the path run for every push.

    #[test]
    fn an_empty_document_succeeds_with_nothing() {
        for language in SUPPORTED_LANGUAGES {
            let result = extract("", language);
            assert!(result.success, "{language}");
            assert!(result.urls.is_empty(), "{language}");
        }
    }

    const SUPPORTED_LANGUAGES: [&str; 12] = [
        "markdown",
        "html",
        "css",
        "javascript",
        "typescript",
        "json",
        "yaml",
        "yml",
        "properties",
        "toml",
        "ini",
        "xml",
    ];
}
