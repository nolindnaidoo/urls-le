//! The eleven format extractors, plus the scan every other document
//! gets. Each reduces to the shared scanner over some subset of the
//! document — which subset is the whole difference between them, and
//! "all of it" is a legitimate answer.

use super::format::FileType;
use super::position::PositionIndex;
use super::scanner::{
    Url, UrlMatch, collect_strings, locate_parsed_values, scan_urls, to_unpositioned_urls, to_urls,
};

pub(crate) fn extract_by_file_type(content: &str, file_type: FileType) -> Vec<Url> {
    match file_type {
        FileType::Markdown => markdown(content),
        FileType::Html => html(content),
        FileType::Json => json(content),
        FileType::Properties => properties(content),
        FileType::Toml => toml(content),
        FileType::Ini => ini(content),
        // CSS, JavaScript, TypeScript, YAML and XML are whole-content
        // scans: nothing in them needs excluding, and pretending
        // otherwise would be five more chances to disagree.
        //
        // Unknown joins them rather than returning nothing. Every
        // extractor above is this scan minus an exclusion, so this is
        // the superset — a Python file, a CSV, a log — and a URL is
        // unambiguous in any of them.
        FileType::Css
        | FileType::Javascript
        | FileType::Typescript
        | FileType::Yaml
        | FileType::Xml
        | FileType::Unknown => to_urls(content, &scan_urls(content, 0)),
    }
}

/// Markdown: whole-content scan, minus fenced code blocks and inline
/// code spans. Links, autolinks and bare URLs all reduce to the same
/// scan; relative link targets are not URLs and are never extracted.
fn markdown(content: &str) -> Vec<Url> {
    let lines: Vec<&str> = content.split('\n').collect();
    let fenced = fenced_lines(&lines);
    let index = PositionIndex::new(content);

    let matches: Vec<UrlMatch> = scan_urls(content, 0)
        .into_iter()
        .filter(|found| {
            let position = index.at(found.start);
            if fenced.contains(&position.line) {
                return false;
            }
            let line = lines.get(position.line - 1).copied().unwrap_or_default();
            !is_in_inline_code(line, position.column - 1)
        })
        .collect();
    to_urls(content, &matches)
}

/// 1-based line numbers inside a triple-backtick fenced block, and
/// the fence lines themselves.
fn fenced_lines(lines: &[&str]) -> Vec<usize> {
    let mut fenced = Vec::new();
    let mut in_block = false;
    for (index, line) in lines.iter().enumerate() {
        let is_fence = line.trim_start().starts_with("```");
        if is_fence || in_block {
            fenced.push(index + 1);
        }
        if is_fence {
            in_block = !in_block;
        }
    }
    fenced
}

fn is_in_inline_code(line: &str, column: usize) -> bool {
    line.chars().take(column).filter(|c| *c == '`').count() % 2 == 1
}

/// HTML: whole-content scan, minus comments.
fn html(content: &str) -> Vec<Url> {
    let spans = comment_spans(content);
    let matches: Vec<UrlMatch> = scan_urls(content, 0)
        .into_iter()
        .filter(|found| {
            !spans
                .iter()
                .any(|(start, end)| found.start >= *start && found.start < *end)
        })
        .collect();
    to_urls(content, &matches)
}

/// `<!--…-->`, including one left unterminated at end of file.
fn comment_spans(content: &str) -> Vec<(usize, usize)> {
    let mut spans = Vec::new();
    let mut cursor = 0;
    while let Some(offset) = content[cursor..].find("<!--") {
        let start = cursor + offset;
        let end = content[start..]
            .find("-->")
            .map_or(content.len(), |close| start + close + 3);
        spans.push((start, end));
        cursor = end;
        if cursor >= content.len() {
            break;
        }
    }
    spans
}

/// JSON: a token scan, so URLs come only from string literals at their
/// real offsets. Escaped forms (`https:\/\/…`) do not match, as before.
fn json(content: &str) -> Vec<Url> {
    let mut matches = Vec::new();
    for range in json_string_ranges(content) {
        let raw = &content[range.0..range.1];
        matches.extend(scan_urls(raw, range.0));
    }
    matches.sort_by_key(|found| found.start);
    to_urls(content, &matches)
}

/// The byte ranges of every string token, including its quotes — which
/// is what the extension's scanner reports and what makes the offsets
/// line up.
fn json_string_ranges(content: &str) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let bytes = content.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'"' {
            index += 1;
            continue;
        }
        let start = index;
        index += 1;
        while index < bytes.len() {
            match bytes[index] {
                b'\\' => index += 2,
                b'"' => {
                    index += 1;
                    break;
                }
                _ => index += 1,
            }
        }
        ranges.push((start, index.min(bytes.len())));
    }
    ranges
}

/// `.properties`: whole-content scan, minus comment lines.
fn properties(content: &str) -> Vec<Url> {
    let lines: Vec<&str> = content.split('\n').collect();
    let index = PositionIndex::new(content);
    let matches: Vec<UrlMatch> = scan_urls(content, 0)
        .into_iter()
        .filter(|found| {
            let line = lines
                .get(index.at(found.start).line - 1)
                .map(|line| line.trim())
                .unwrap_or_default();
            !line.starts_with('#') && !line.starts_with('!')
        })
        .collect();
    to_urls(content, &matches)
}

/// TOML and INI parse first, then locate each parsed string back in the
/// source. A document that does not parse falls back to a whole-content
/// scan — which is why `broken.toml` still yields its URLs.
fn toml(content: &str) -> Vec<Url> {
    match content.parse::<::toml::Table>() {
        Ok(parsed) => {
            let value = serde_json::to_value(&parsed).unwrap_or(serde_json::Value::Null);
            positioned_from_parsed(content, &collect_strings(&value))
        }
        Err(_) => to_urls(content, &scan_urls(content, 0)),
    }
}

fn ini(content: &str) -> Vec<Url> {
    match ::ini::Ini::load_from_str(content) {
        Ok(parsed) => {
            let strings: Vec<String> = parsed
                .iter()
                .flat_map(|(_, properties)| {
                    properties
                        .iter()
                        .map(|(_, value)| value.to_string())
                        .collect::<Vec<String>>()
                })
                .collect();
            positioned_from_parsed(content, &strings)
        }
        Err(_) => to_urls(content, &scan_urls(content, 0)),
    }
}

fn positioned_from_parsed(content: &str, strings: &[String]) -> Vec<Url> {
    let (located, unlocated) = locate_parsed_values(content, strings);
    let mut urls = to_urls(content, &located);
    urls.extend(to_unpositioned_urls(&unlocated));
    urls
}

#[cfg(test)]
mod tests {
    use super::*;

    fn values(content: &str, file_type: FileType) -> Vec<String> {
        extract_by_file_type(content, file_type)
            .into_iter()
            .map(|url| url.value)
            .collect()
    }

    #[test]
    fn a_fenced_block_is_excluded_from_markdown() {
        let content = "see https://a.example\n\n```\nhttps://b.example\n```\n";
        assert_eq!(values(content, FileType::Markdown), ["https://a.example"]);
    }

    #[test]
    fn an_inline_code_span_is_excluded_from_markdown() {
        let content = "a `https://b.example` and https://a.example\n";
        assert_eq!(values(content, FileType::Markdown), ["https://a.example"]);
    }

    #[test]
    fn an_html_comment_is_excluded() {
        let content = "<a href=\"https://a.example\">x</a><!-- https://b.example -->";
        assert_eq!(values(content, FileType::Html), ["https://a.example"]);
    }

    #[test]
    fn an_unterminated_html_comment_swallows_the_rest() {
        let content = "<a href=\"https://a.example\">x</a><!-- https://b.example";
        assert_eq!(values(content, FileType::Html), ["https://a.example"]);
    }

    #[test]
    fn json_reads_string_literals_only() {
        let content = "{\n  \"a\": \"https://a.example\"\n}\n// https://b.example\n";
        assert_eq!(values(content, FileType::Json), ["https://a.example"]);
    }

    #[test]
    fn a_properties_comment_is_excluded() {
        let content = "# https://b.example\n! https://c.example\na=https://a.example\n";
        assert_eq!(values(content, FileType::Properties), ["https://a.example"]);
    }

    #[test]
    fn a_toml_document_that_does_not_parse_falls_back_to_a_scan() {
        let content = "[package\nhomepage = \"https://a.example\"\n";
        assert_eq!(values(content, FileType::Toml), ["https://a.example"]);
    }

    #[test]
    fn the_whole_content_formats_need_no_exclusions() {
        for file_type in [
            FileType::Css,
            FileType::Javascript,
            FileType::Typescript,
            FileType::Yaml,
            FileType::Xml,
            FileType::Unknown,
        ] {
            assert_eq!(
                values("x https://a.example y", file_type),
                ["https://a.example"],
                "{file_type:?}"
            );
        }
    }
}
