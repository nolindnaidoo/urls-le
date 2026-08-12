//! What format a document is, from a language id or a filename.
//!
//! Two layers, matching the extension's split. `determine_file_type`
//! accepts VS Code language ids and nothing else, because that is what
//! the extension's engine accepts and its behaviour is pinned by the
//! corpus. `resolve_format` widens for callers that hold a filename or a
//! loose alias.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum FileType {
    Markdown,
    Html,
    Css,
    Javascript,
    Typescript,
    Json,
    Yaml,
    Properties,
    Toml,
    Ini,
    Xml,
    /// No format-aware extractor: the document is scanned whole. Not
    /// "we could not tell" — it is the answer for a `.py`, a `.csv` or
    /// anything else with no structure worth excluding, and it is what
    /// the `fileType` field says so a caller can tell which of the two
    /// passes ran.
    Unknown,
}

pub(crate) fn determine_file_type(language_id: &str) -> FileType {
    match language_id {
        "markdown" => FileType::Markdown,
        "html" => FileType::Html,
        "css" => FileType::Css,
        "javascript" => FileType::Javascript,
        "typescript" => FileType::Typescript,
        "json" => FileType::Json,
        "yaml" | "yml" => FileType::Yaml,
        "properties" => FileType::Properties,
        "toml" => FileType::Toml,
        "ini" => FileType::Ini,
        "xml" => FileType::Xml,
        _ => FileType::Unknown,
    }
}

/// What a caller gets when nothing recognises the name. A URL is
/// unambiguous in any text, so refusing a document this has no extractor
/// for was never protecting anyone from a wrong answer — it withheld the
/// right one.
pub(crate) const FALLBACK_FORMAT: &str = "plaintext";

pub(crate) const SUPPORTED_FORMATS: [&str; 13] = [
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

/// Every language id the engine understands, keyed by what a caller
/// might send.
///
/// Held equal to the extension's table by `fixtures/aliases.json`: the
/// two MCP servers offer the same `extract_urls`, so an extension that
/// reads `icon.svg` while this refuses it makes them two different
/// tools.
const ALIASES: [(&str, &str); 40] = [
    ("markdown", "markdown"),
    ("md", "markdown"),
    ("mdx", "markdown"),
    ("mdown", "markdown"),
    ("mkd", "markdown"),
    ("html", "html"),
    ("htm", "html"),
    ("xhtml", "html"),
    ("css", "css"),
    ("scss", "css"),
    ("less", "css"),
    ("javascript", "javascript"),
    ("js", "javascript"),
    ("jsx", "javascript"),
    ("mjs", "javascript"),
    ("cjs", "javascript"),
    ("typescript", "typescript"),
    ("ts", "typescript"),
    ("tsx", "typescript"),
    ("mts", "typescript"),
    ("cts", "typescript"),
    ("json", "json"),
    ("jsonc", "json"),
    ("yaml", "yaml"),
    ("yml", "yaml"),
    ("properties", "properties"),
    ("env", "properties"),
    ("toml", "toml"),
    ("ini", "ini"),
    ("cfg", "ini"),
    ("conf", "ini"),
    ("xml", "xml"),
    ("svg", "xml"),
    ("xsl", "xml"),
    ("pom", "xml"),
    // Named rather than left to the fallback: an agent that sends `csv`
    // should see it in the advertised enum, and see the same answer it
    // would get from a filename.
    ("csv", "csv"),
    ("tsv", "csv"),
    ("plaintext", "plaintext"),
    ("txt", "plaintext"),
    ("log", "plaintext"),
];

fn normalise(value: &str) -> String {
    let trimmed = value.trim().to_lowercase();
    trimmed.strip_prefix('.').unwrap_or(&trimmed).to_string()
}

fn alias(key: &str) -> Option<&'static str> {
    ALIASES
        .iter()
        .find(|(from, _)| *from == key)
        .map(|(_, to)| *to)
}

/// Resolve a language id from an explicit format, else from a filename.
///
/// Anything named resolves: an unrecognised name yields
/// [`FALLBACK_FORMAT`] rather than a refusal. A format-aware extractor
/// only ever *excludes* part of a document — a fenced block, a comment,
/// everything that is not a JSON string — so the fallback is a superset
/// of all eleven, and a name nobody recognises can never hide a URL. It
/// can only stop excluding one, and the `format` field in the report
/// says which pass ran.
///
/// `None` only when nothing was named at all, which is a caller with no
/// question rather than a document with no format.
pub(crate) fn resolve_format(format: Option<&str>, filename: Option<&str>) -> Option<&'static str> {
    if let Some(format) = format
        && let Some(direct) = alias(&normalise(format))
    {
        return Some(direct);
    }
    if let Some(filename) = filename
        && let Some(by_name) = from_filename(filename)
    {
        return Some(by_name);
    }
    (format.is_some() || filename.is_some()).then_some(FALLBACK_FORMAT)
}

/// The whole name first, so `.env` and `pom.xml` both land, then the
/// extension.
fn from_filename(filename: &str) -> Option<&'static str> {
    let bare = normalise(filename);
    if let Some(whole) = alias(&bare) {
        return Some(whole);
    }
    let extension = filename.rsplit_once('.').map(|(_, ext)| ext)?;
    alias(&normalise(extension))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_ids_map_to_file_types() {
        assert_eq!(determine_file_type("markdown"), FileType::Markdown);
        assert_eq!(determine_file_type("yml"), FileType::Yaml);
        assert_eq!(determine_file_type("python"), FileType::Unknown);
    }

    #[test]
    fn an_explicit_format_wins() {
        assert_eq!(resolve_format(Some("md"), None), Some("markdown"));
        assert_eq!(resolve_format(Some(".TOML"), None), Some("toml"));
    }

    #[test]
    fn a_filename_resolves_by_extension() {
        assert_eq!(resolve_format(None, Some("README.md")), Some("markdown"));
        assert_eq!(resolve_format(None, Some("a/b/app.yaml")), Some("yaml"));
        assert_eq!(resolve_format(None, Some("data.xml")), Some("xml"));
    }

    /// Changed deliberately: a name nobody recognises used to
    /// be refused, which made `script.py` a document this tool would not
    /// read rather than one it had no special handling for.
    #[test]
    fn nothing_recognisable_falls_back_rather_than_refusing() {
        assert_eq!(resolve_format(Some("python"), None), Some(FALLBACK_FORMAT));
        assert_eq!(
            resolve_format(None, Some("script.py")),
            Some(FALLBACK_FORMAT)
        );
        assert_eq!(
            resolve_format(None, Some("Makefile")),
            Some(FALLBACK_FORMAT)
        );
    }

    /// Naming nothing is still nothing: the caller asked no question,
    /// and answering one they did not ask is the guess this refuses.
    #[test]
    fn naming_neither_returns_none() {
        assert_eq!(resolve_format(None, None), None);
    }

    /// An unrecognised format hint still lets the filename answer,
    /// rather than short-circuiting to the fallback.
    #[test]
    fn a_filename_is_consulted_when_the_format_hint_is_not_known() {
        assert_eq!(
            resolve_format(Some("klingon"), Some("README.md")),
            Some("markdown")
        );
    }

    /// Every format the schema advertises must resolve, or the enum
    /// promises something the engine refuses.
    #[test]
    fn every_advertised_format_resolves() {
        for format in SUPPORTED_FORMATS {
            assert!(resolve_format(Some(format), None).is_some(), "{format}");
        }
    }

    /// Every alias must land on a language id the schema advertises.
    ///
    /// Stronger than the file-type check it replaces: `csv` and
    /// `plaintext` are read by the whole-document scan, so they are
    /// deliberately `Unknown` file types, and the old assertion would
    /// have had to be weakened to keep them. What actually matters is
    /// that no alias points at a name the enum does not offer.
    #[test]
    fn every_alias_lands_on_an_advertised_format() {
        for (from, to) in ALIASES {
            assert!(SUPPORTED_FORMATS.contains(&to), "{from} -> {to}");
        }
    }

    /// The fallback must itself be a format the schema offers, or the
    /// answer names something a caller cannot ask for.
    #[test]
    fn the_fallback_is_an_advertised_format() {
        assert!(SUPPORTED_FORMATS.contains(&FALLBACK_FORMAT));
        assert_eq!(determine_file_type(FALLBACK_FORMAT), FileType::Unknown);
    }

    /// The two frontends offer the same `extract_urls`, so a name one
    /// reads and the other refuses makes them two different tools. That
    /// shipped in 0.1.0 — `svg`, `cfg`, `conf` and five more were the
    /// extension's alone, `mdx` was this crate's — and nothing failed,
    /// because nothing compared the tables. This is that comparison;
    /// `../scripts/check-extraction-parity.ts` is the other side of it.
    #[test]
    fn the_alias_table_matches_the_shared_contract() {
        let shared: std::collections::BTreeMap<String, String> =
            serde_json::from_str(include_str!("../../fixtures/aliases.json"))
                .expect("the alias contract is valid JSON");
        let mine: std::collections::BTreeMap<String, String> = ALIASES
            .iter()
            .map(|(from, to)| ((*from).to_string(), (*to).to_string()))
            .collect();
        assert_eq!(mine.len(), ALIASES.len(), "an alias is listed twice");
        assert_eq!(mine, shared);
    }
}
