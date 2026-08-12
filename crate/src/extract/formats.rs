//! The eleven format extractors, plus the scan every other document
//! gets. Each reduces to the shared scanner over some subset of the
//! document — which subset is the whole difference between them, and
//! "all of it" is a legitimate answer.

use super::format::FileType;
use super::js;
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
        let is_fence = js::trim_start(line).starts_with("```");
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
///
/// **Comments are trivia, not strings.** `jsonc` is in the alias table
/// and the extension reads these documents with `jsonc-parser`'s scanner,
/// which classifies `//` and `/* */` as trivia — so a quoted URL inside a
/// comment is not a string token there. This was a bare quote scanner and
/// found one, which made `extract_urls` answer differently depending on
/// which of the two servers an agent reached. Generated documents found
/// it; the doc comment above had claimed a token scan all along.
fn json_string_ranges(content: &str) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let bytes = content.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        // A comment runs to its terminator, or to end of file when it has
        // none — which is how the scanner treats an unclosed one too.
        if bytes[index] == b'/' && bytes.get(index + 1) == Some(&b'/') {
            index = find_from(bytes, index + 2, b"\n").map_or(bytes.len(), |end| end + 1);
            continue;
        }
        if bytes[index] == b'/' && bytes.get(index + 1) == Some(&b'*') {
            index = find_from(bytes, index + 2, b"*/").map_or(bytes.len(), |end| end + 2);
            continue;
        }
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

/// The offset of `needle` at or after `from`, in bytes.
fn find_from(haystack: &[u8], from: usize, needle: &[u8]) -> Option<usize> {
    if from >= haystack.len() {
        return None;
    }
    haystack[from..]
        .windows(needle.len())
        .position(|window| window == needle)
        .map(|offset| from + offset)
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
                .map(|line| js::trim(line))
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

/// INI: whole-content scan, minus comment lines (`;` or `#`).
///
/// **No parser.** This used to parse and then locate, like TOML — and
/// that made the answer depend on which INI library each language
/// happened to install. `rust-ini` refuses a line with no `=` and this
/// fell back to a whole-document scan; the npm server's `ini` never
/// refuses anything, turning the same line into a key with the value
/// `true`, so its declared fallback could not fire and the URL was
/// silently dropped. One document, `extract_urls`, two servers, two
/// answers. Generated documents found it in under two hundred cases.
///
/// A rule both sides can state in three lines cannot drift that way, and
/// it is what `.properties` has always done. The corpus is unchanged: a
/// URL in a comment stays excluded, which is the pinned decision.
fn ini(content: &str) -> Vec<Url> {
    let lines: Vec<&str> = content.split('\n').collect();
    let index = PositionIndex::new(content);
    let matches: Vec<UrlMatch> = scan_urls(content, 0)
        .into_iter()
        .filter(|found| {
            let line = lines
                .get(index.at(found.start).line - 1)
                .map(|line| js::trim(line))
                .unwrap_or_default();
            !line.starts_with(';') && !line.starts_with('#')
        })
        .collect();
    to_urls(content, &matches)
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

    /// A comment is trivia, so a **quoted** URL inside one is not a
    /// string token. This scanned quotes without knowing what a comment
    /// was, and answered differently from the npm server for the same
    /// `jsonc` document.
    #[test]
    fn a_quoted_url_inside_a_json_comment_is_trivia() {
        let content = concat!(
            "{\n",
            "  // \"https://in-a-line-comment.example\"\n",
            "  /* \"https://in-a-block-comment.example\" */\n",
            "  \"a\": \"https://a.example\"\n",
            "}\n",
        );
        assert_eq!(values(content, FileType::Json), ["https://a.example"]);
    }

    /// An unterminated comment swallows the rest, which is what the
    /// scanner on the other side does with one too.
    #[test]
    fn an_unterminated_json_block_comment_swallows_the_rest() {
        let content = "{ \"a\": \"https://a.example\" } /* \"https://b.example\"";
        assert_eq!(values(content, FileType::Json), ["https://a.example"]);
    }

    /// A fence or a comment marker behind a byte-order mark is still a
    /// fence or a comment marker: the line is trimmed by JavaScript's
    /// whitespace set, which includes U+FEFF. Rust's does not, so this
    /// used to see the marker on one server only.
    #[test]
    fn a_marker_behind_a_byte_order_mark_is_still_a_marker() {
        let fenced = "\u{feff}```\nhttps://b.example\n```\n";
        assert!(values(fenced, FileType::Markdown).is_empty());
        assert!(values("\u{feff}# https://b.example\n", FileType::Properties).is_empty());
        assert!(values("\u{feff}! https://b.example\n", FileType::Properties).is_empty());
        assert!(values("\u{feff}; https://b.example\n", FileType::Ini).is_empty());
        // U+0085 is whitespace to Rust and not to JavaScript, so the
        // marker is *not* at the start of the trimmed line and the URL
        // stays. Stated so a switch back to `str::trim` fails loudly.
        assert_eq!(
            values("\u{85}# https://b.example\n", FileType::Properties),
            ["https://b.example"]
        );
    }

    #[test]
    fn an_ini_comment_is_excluded() {
        let content = "; https://b.example\n# https://c.example\nkey=https://a.example\n";
        assert_eq!(values(content, FileType::Ini), ["https://a.example"]);
    }

    /// A document that is not INI is read whole rather than yielding
    /// nothing. It used to depend on whether the INI library each
    /// language installed refused the line — one did and one did not.
    #[test]
    fn a_document_that_is_not_ini_is_still_read() {
        let content = "bare https://a.example with no equals sign\n";
        assert_eq!(values(content, FileType::Ini), ["https://a.example"]);
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
