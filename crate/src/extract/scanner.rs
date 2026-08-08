//! The single URL scanner every format extractor shares.
//!
//! The extension's history is why this is one function rather than
//! eleven: v1.x had the same five protocol patterns copy-pasted into ten
//! files with divergent behaviour — CSS labelled every `http` URL as
//! `https`, TOML and INI returned no positions, XML emitted attribute
//! URLs twice, and three formats silently dropped repeat occurrences.
//! Porting it as one scanner is the whole point.

use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};

use super::position::{Position, PositionIndex};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Protocol {
    Http,
    Https,
    Ftp,
    File,
    Mailto,
    Tel,
}

/// A URL ends at whitespace or at any of `< > " { } | \ ^ ` [ ] ; ) '`.
///
/// That is the extension's delimiter set, kept verbatim so quoted and
/// bracketed sources terminate the same way. Trailing punctuation a URL
/// may legally contain (`.`, `,`) is deliberately **not** stripped —
/// `https://x.com/a.` keeps its dot, because stripping it would corrupt
/// the URLs that genuinely end that way.
const DELIMS: &str = r#"[^\s<>"{}|\\^`\[\];)']"#;

struct PatternSpec {
    pattern: Regex,
    /// `http` versus `https` is decided by the scheme actually matched,
    /// never hardcoded — the v1.x bug this replaced.
    protocol: fn(&str) -> Protocol,
}

static PATTERNS: LazyLock<Vec<PatternSpec>> = LazyLock::new(|| {
    let compile = |pattern: &str| Regex::new(pattern).expect("a constant pattern compiles");
    vec![
        PatternSpec {
            pattern: compile(&format!(r"https?://{DELIMS}+")),
            protocol: |value| {
                if value.starts_with("https") {
                    Protocol::Https
                } else {
                    Protocol::Http
                }
            },
        },
        PatternSpec {
            pattern: compile(&format!(r"ftp://{DELIMS}+")),
            protocol: |_| Protocol::Ftp,
        },
        PatternSpec {
            pattern: compile(&format!(r"file://{DELIMS}+")),
            protocol: |_| Protocol::File,
        },
        PatternSpec {
            pattern: compile(&format!(r"mailto:{DELIMS}+")),
            protocol: |_| Protocol::Mailto,
        },
        PatternSpec {
            pattern: compile(&format!(r"tel:{DELIMS}+")),
            protocol: |_| Protocol::Tel,
        },
    ]
});

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct UrlMatch {
    pub(crate) value: String,
    pub(crate) protocol: Protocol,
    pub(crate) start: usize,
}

/// Scan text for every URL occurrence, in document order. `base` shifts
/// reported offsets when `text` is a slice of a larger document.
pub(crate) fn scan_urls(text: &str, base: usize) -> Vec<UrlMatch> {
    let mut matches: Vec<UrlMatch> = Vec::new();
    // A set, not a Vec. With a linear scan this is quadratic in the
    // number of URLs, and a document holding tens of thousands of them
    // — which the 50,000 cap says is expected — takes minutes instead
    // of milliseconds. Found by the test that exercises the cap.
    let mut claimed: std::collections::HashSet<usize> = std::collections::HashSet::new();

    for spec in PATTERNS.iter() {
        for found in spec.pattern.find_iter(text) {
            let value = found.as_str();
            let start = base + found.start();
            if claimed.contains(&start) || !is_well_formed(value) {
                continue;
            }
            claimed.insert(start);
            matches.push(UrlMatch {
                value: value.to_string(),
                protocol: (spec.protocol)(value),
                start,
            });
        }
    }

    matches.sort_by_key(|found| found.start);
    matches
}

/// `mailto:` needs an `@` and `tel:` needs a subject — the checks the
/// extension once applied in markdown and HTML alone, now applied
/// everywhere so no two formats can disagree.
fn is_well_formed(value: &str) -> bool {
    if let Some(rest) = value.strip_prefix("mailto:") {
        return rest.contains('@') && rest.len() > 1;
    }
    if let Some(rest) = value.strip_prefix("tel:") {
        return rest.len() > 1;
    }
    // `scheme://<delims>+` already guarantees a non-empty body.
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct Url {
    pub(crate) value: String,
    pub(crate) protocol: Protocol,
    pub(crate) domain: Option<String>,
    pub(crate) path: Option<String>,
    #[serde(flatten)]
    pub(crate) position: Option<Position>,
    pub(crate) context: Option<String>,
}

/// `domain` and `path`, from a WHATWG URL parse.
///
/// The extension uses the platform parser; this is the same standard and
/// a different implementation, so the corpus pins the cases where they
/// could disagree — an internationalised domain above all, where both
/// are expected to emit punycode.
fn components(value: &str) -> Option<(Option<String>, Option<String>)> {
    let parsed = url::Url::parse(value).ok()?;
    let domain = parsed.host_str().map(str::to_string);
    // `pathname + search + hash`, spelled out.
    let mut path = parsed.path().to_string();
    if let Some(query) = parsed.query() {
        path.push('?');
        path.push_str(query);
    }
    if let Some(fragment) = parsed.fragment() {
        path.push('#');
        path.push_str(fragment);
    }
    Some((domain, Some(path)))
}

/// Build the reported URLs for a document: offsets to line/column, the
/// trimmed source line as context, and the parsed components.
pub(crate) fn to_urls(content: &str, matches: &[UrlMatch]) -> Vec<Url> {
    let index = PositionIndex::new(content);
    let lines: Vec<&str> = content.split('\n').collect();

    matches
        .iter()
        .map(|found| {
            let position = index.at(found.start);
            let (domain, path) = components(&found.value).unwrap_or((None, None));
            Url {
                value: found.value.clone(),
                protocol: found.protocol,
                domain: domain.filter(|host| !host.is_empty()),
                path: path.filter(|path| !path.is_empty()),
                context: Some(
                    lines
                        .get(position.line - 1)
                        .map_or(String::new(), |line| line.trim().to_string()),
                ),
                position: Some(position),
            }
        })
        .collect()
}

/// URLs from a parsed value that could not be located in the source.
/// They keep their components and lose their position, rather than being
/// dropped or given a made-up one.
pub(crate) fn to_unpositioned_urls(matches: &[UrlMatch]) -> Vec<Url> {
    matches
        .iter()
        .map(|found| {
            let (domain, path) = components(&found.value).unwrap_or((None, None));
            Url {
                value: found.value.clone(),
                protocol: found.protocol,
                domain: domain.filter(|host| !host.is_empty()),
                path: path.filter(|path| !path.is_empty()),
                position: None,
                context: None,
            }
        })
        .collect()
}

/// Find where each parsed string sits in the source, so a value that a
/// parser handed back can still be reported at its real position.
///
/// The cursor per value is what makes repeats land on successive
/// occurrences rather than all on the first.
pub(crate) fn locate_parsed_values(
    content: &str,
    values: &[String],
) -> (Vec<UrlMatch>, Vec<UrlMatch>) {
    let mut located: Vec<UrlMatch> = Vec::new();
    let mut unlocated: Vec<UrlMatch> = Vec::new();
    let mut cursors: Vec<(String, usize)> = Vec::new();

    for value in values {
        let inner = scan_urls(value, 0);
        if inner.is_empty() {
            continue;
        }
        let from = cursors
            .iter()
            .find(|(seen, _)| seen == value)
            .map_or(0, |(_, cursor)| *cursor);
        let Some(offset) = content
            .get(from..)
            .and_then(|tail| tail.find(value.as_str()))
        else {
            unlocated.extend(inner);
            continue;
        };
        let index = from + offset;
        match cursors.iter_mut().find(|(seen, _)| seen == value) {
            Some((_, cursor)) => *cursor = index + 1,
            None => cursors.push((value.clone(), index + 1)),
        }
        located.extend(inner.into_iter().map(|found| UrlMatch {
            start: index + found.start,
            ..found
        }));
    }

    located.sort_by_key(|found| found.start);
    (located, unlocated)
}

/// Every string in a parsed document, in order — the shape TOML and INI
/// hand back.
pub(crate) fn collect_strings(value: &serde_json::Value) -> Vec<String> {
    match value {
        serde_json::Value::String(text) => vec![text.clone()],
        serde_json::Value::Array(items) => items.iter().flat_map(collect_strings).collect(),
        serde_json::Value::Object(map) => map.values().flat_map(collect_strings).collect(),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn values(text: &str) -> Vec<String> {
        scan_urls(text, 0)
            .into_iter()
            .map(|found| found.value)
            .collect()
    }

    #[test]
    fn the_scheme_decides_the_protocol() {
        assert_eq!(scan_urls("http://a.example", 0)[0].protocol, Protocol::Http);
        assert_eq!(
            scan_urls("https://a.example", 0)[0].protocol,
            Protocol::Https
        );
    }

    #[test]
    fn delimiters_terminate_a_url() {
        assert_eq!(
            values("see https://a.example/x for more"),
            ["https://a.example/x"]
        );
        assert_eq!(values("\"https://a.example/x\""), ["https://a.example/x"]);
        assert_eq!(values("[https://a.example/x]"), ["https://a.example/x"]);
        assert_eq!(values("(https://a.example/x)"), ["https://a.example/x"]);
        assert_eq!(values("<https://a.example/x>"), ["https://a.example/x"]);
        assert_eq!(values("`https://a.example/x`"), ["https://a.example/x"]);
        assert_eq!(values("https://a.example/x;"), ["https://a.example/x"]);
    }

    /// Documented limitation, ported: a trailing dot or comma is legal
    /// inside a URL, so it is kept rather than guessed away.
    #[test]
    fn trailing_punctuation_is_kept() {
        assert_eq!(values("end https://a.example/x."), ["https://a.example/x."]);
        assert_eq!(
            values("list https://a.example/x,"),
            ["https://a.example/x,"]
        );
    }

    #[test]
    fn mailto_needs_an_address_and_tel_needs_a_subject() {
        assert_eq!(
            values("mailto:someone@a.example"),
            ["mailto:someone@a.example"]
        );
        assert!(values("mailto:nobody").is_empty());
        assert!(values("mailto:").is_empty());
        assert_eq!(values("tel:+15551234567"), ["tel:+15551234567"]);
        assert!(values("tel:").is_empty());
        assert!(values("tel:1").is_empty());
    }

    #[test]
    fn every_occurrence_is_reported_with_its_own_offset() {
        let found = scan_urls("https://a.example https://a.example", 0);
        assert_eq!(found.len(), 2, "repeats are not collapsed by the scanner");
        assert_ne!(found[0].start, found[1].start);
    }

    #[test]
    fn a_base_offset_shifts_the_reported_start() {
        assert_eq!(scan_urls("https://a.example", 100)[0].start, 100);
    }

    #[test]
    fn results_come_back_in_document_order() {
        let found = scan_urls("ftp://b.example https://a.example", 0);
        assert!(found[0].start < found[1].start);
        assert_eq!(found[0].protocol, Protocol::Ftp);
    }

    #[test]
    fn components_are_split_out() {
        let urls = to_urls(
            "x https://a.example/p?q=1#f y",
            &scan_urls("x https://a.example/p?q=1#f y", 0),
        );
        assert_eq!(urls[0].domain.as_deref(), Some("a.example"));
        assert_eq!(urls[0].path.as_deref(), Some("/p?q=1#f"));
    }

    #[test]
    fn an_unparseable_value_keeps_no_components() {
        let urls = to_unpositioned_urls(&[UrlMatch {
            value: "tel:+15551234567".to_string(),
            protocol: Protocol::Tel,
            start: 0,
        }]);
        assert_eq!(urls[0].domain, None);
        assert_eq!(urls[0].position, None);
    }

    #[test]
    fn repeated_parsed_values_land_on_successive_occurrences() {
        let content = "a = \"https://a.example\"\nb = \"https://a.example\"\n";
        let (located, unlocated) = locate_parsed_values(
            content,
            &[
                "https://a.example".to_string(),
                "https://a.example".to_string(),
            ],
        );
        assert!(unlocated.is_empty());
        assert_eq!(located.len(), 2);
        assert_ne!(located[0].start, located[1].start);
    }

    #[test]
    fn a_value_absent_from_the_source_is_unlocated_not_dropped() {
        let (located, unlocated) =
            locate_parsed_values("nothing here", &["https://a.example".to_string()]);
        assert!(located.is_empty());
        assert_eq!(unlocated.len(), 1);
    }

    #[test]
    fn strings_are_collected_from_any_nesting() {
        let value = serde_json::json!({ "a": "one", "b": ["two", { "c": "three" }], "d": 4 });
        assert_eq!(collect_strings(&value), ["one", "two", "three"]);
    }
}
