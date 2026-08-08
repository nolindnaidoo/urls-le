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
const ALIASES: [(&str, &str); 24] = [
    ("markdown", "markdown"),
    ("md", "markdown"),
    ("mdx", "markdown"),
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
    ("json", "json"),
    ("jsonc", "json"),
    ("yaml", "yaml"),
    ("yml", "yaml"),
    ("properties", "properties"),
    ("toml", "toml"),
    ("ini", "ini"),
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
        .or(if key == "xml" { Some("xml") } else { None })
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
}
