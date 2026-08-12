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

pub(crate) const SUPPORTED_FORMATS: [&str; 11] = [
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
];

/// Every language id the engine understands, keyed by what a caller
/// might send.
///
/// Held equal to the extension's table by `fixtures/aliases.json`: the
/// two MCP servers offer the same `extract_urls`, so an extension that
/// reads `icon.svg` while this refuses it makes them two different
/// tools.
const ALIASES: [(&str, &str); 35] = [
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
/// `None` rather than a guess: a wrong format extracts nothing and looks
/// like a document with no URLs.
pub(crate) fn resolve_format(format: Option<&str>, filename: Option<&str>) -> Option<&'static str> {
    if let Some(format) = format
        && let Some(direct) = alias(&normalise(format))
    {
        return Some(direct);
    }
    let filename = filename?;
    let bare = normalise(filename);
    if let Some(whole) = alias(bare.strip_prefix('.').unwrap_or(&bare)) {
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

    #[test]
    fn nothing_recognisable_returns_none() {
        assert_eq!(resolve_format(Some("python"), None), None);
        assert_eq!(resolve_format(None, Some("script.py")), None);
        assert_eq!(resolve_format(None, None), None);
    }

    /// Every format the schema advertises must resolve, or the enum
    /// promises something the engine refuses.
    #[test]
    fn every_advertised_format_resolves() {
        for format in SUPPORTED_FORMATS {
            assert!(resolve_format(Some(format), None).is_some(), "{format}");
        }
    }

    /// Every alias must land on a language id the engine understands.
    #[test]
    fn every_alias_lands_on_a_known_file_type() {
        for (from, to) in ALIASES {
            assert_ne!(determine_file_type(to), FileType::Unknown, "{from} -> {to}");
        }
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
