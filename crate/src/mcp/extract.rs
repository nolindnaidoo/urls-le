//! `extract_urls` — the tool **both** servers offer.
//!
//! The npm server (`src/mcp/tools.ts`) and this one are meant to be the
//! same tool, not two similar ones: same schema, same envelope,
//! byte-identical output. `fixtures/mcp-extract-urls.json` runs against
//! both, so changing one without the other fails a build.
//!
//! It touches no filesystem. An agent already has file-read tools;
//! duplicating them here would add a path-traversal surface for no
//! capability. The tool that needs a filesystem is `urls_le_scan`.

use serde_json::{Value, json};

use crate::extract::format::{SUPPORTED_FORMATS, resolve_format};
use crate::extract::{self, Protocol};

const DEFAULT_MAX_RESULTS: usize = 500;
const MAX_MAX_RESULTS: usize = 5000;

fn protocol_name(protocol: Protocol) -> &'static str {
    match protocol {
        Protocol::Http => "http",
        Protocol::Https => "https",
        Protocol::Ftp => "ftp",
        Protocol::File => "file",
        Protocol::Mailto => "mailto",
        Protocol::Tel => "tel",
    }
}

pub(crate) fn definition() -> Value {
    json!({
        "name": "extract_urls",
        "description": "Extract every URL from a document, with its protocol and 1-based line \
                        and column. Reads any text document. Markdown, HTML, CSS, JavaScript, \
                        TypeScript, JSON, YAML, .properties, TOML, INI and XML know what to \
                        exclude — code fences, comments, non-string tokens; everything else is \
                        scanned whole, and `fileType` says which happened. URLs are reported \
                        exactly as written — nothing is fetched, filtered or judged.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": { "type": "string", "description": "The document text to scan." },
                "format": {
                    "type": "string",
                    "enum": SUPPORTED_FORMATS,
                    "description": "Document format. Provide this or `filename`. Common \
                                    extensions and aliases are accepted; anything else is \
                                    scanned as plain text rather than refused.",
                },
                "filename": {
                    "type": "string",
                    "description": "Filename used to infer the format when `format` is absent, \
                                    e.g. \"README.md\".",
                },
                "dedupe": {
                    "type": "boolean",
                    "default": false,
                    "description": "Collapse repeated URLs to their first occurrence.",
                },
                "maxResults": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": MAX_MAX_RESULTS,
                    "default": DEFAULT_MAX_RESULTS,
                    "description": format!(
                        "Cap on returned URLs (default {DEFAULT_MAX_RESULTS}). meta.truncated \
                         reports whether any were dropped."
                    ),
                },
            },
            "required": ["content"],
            "additionalProperties": false,
        },
    })
}

pub(crate) fn run(arguments: &Value) -> Result<Value, String> {
    let content = arguments
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| "content is required and must be a string".to_string())?;
    let max_results = read_max_results(arguments)?;

    // Only a caller who named neither lands here — every name resolves,
    // to the plain-text scan if nothing else. The message stays because
    // "Unsupported language: undefined" tells nobody what to do.
    let language_id = resolve_format(
        arguments.get("format").and_then(Value::as_str),
        arguments.get("filename").and_then(Value::as_str),
    )
    .ok_or_else(|| {
        format!(
            "Provide `format` (one of: {}) or a `filename` with a recognised extension.",
            SUPPORTED_FORMATS.join(", ")
        )
    })?;

    let result = extract::extract(content, language_id);
    let mut values: Vec<Value> = result
        .urls
        .iter()
        .map(|url| {
            json!({
                "value": url.value,
                "protocol": protocol_name(url.protocol),
                "line": url.position.map(|position| position.line),
                "column": url.position.map(|position| position.column),
            })
        })
        .collect();

    if arguments.get("dedupe").and_then(Value::as_bool) == Some(true) {
        let mut seen: Vec<String> = Vec::new();
        values.retain(|value| {
            let text = value["value"].as_str().unwrap_or_default().to_string();
            if seen.contains(&text) {
                return false;
            }
            seen.push(text);
            true
        });
    }

    // The `truncated` flag matters more than the cap: a silently
    // incomplete answer is wrong in the most expensive way.
    let truncated = values.len() > max_results;
    values.truncate(max_results);

    let diagnostics: Vec<Value> = result
        .errors
        .iter()
        .map(|error| {
            json!({
                "severity": format!("{:?}", error.severity).to_lowercase(),
                "code": format!("{:?}", error.category).to_lowercase(),
                "message": error.message,
            })
        })
        .collect();

    // The extractor that ran, not the name the caller sent: `csv` and
    // `plaintext` are both read whole and both answer `unknown`, which
    // is the one bit a caller cannot work out for itself. The extension
    // has always reported it this way and is the reference.
    let file_type = serde_json::to_value(result.file_type).expect("a file type serializes");

    let count = values.len();
    Ok(super::envelope(
        "extract_urls",
        &json!({ "urls": values, "fileType": file_type }),
        count,
        &diagnostics,
        truncated,
    ))
}

/// Clamp quietly, reject loudly — the npm server's asymmetry.
fn read_max_results(arguments: &Value) -> Result<usize, String> {
    let Some(raw) = arguments.get("maxResults") else {
        return Ok(DEFAULT_MAX_RESULTS);
    };
    let invalid = "maxResults must be a positive integer".to_string();
    let value = raw.as_u64().ok_or(invalid.clone())?;
    if value < 1 {
        return Err(invalid);
    }
    Ok((value as usize).min(MAX_MAX_RESULTS))
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;
    use crate::extract::corpus::document;

    const CASES: &str = include_str!("../../fixtures/mcp-extract-urls.json");

    #[derive(Debug, Deserialize)]
    struct Case {
        name: String,
        file: Option<String>,
        content: Option<String>,
        arguments: Value,
        expected: Option<Value>,
        #[serde(rename = "expectedError")]
        expected_error: Option<String>,
    }

    #[test]
    fn every_shared_case_answers_identically() {
        let cases: Vec<Case> = serde_json::from_str(CASES).expect("the corpus is valid JSON");
        assert!(!cases.is_empty(), "the corpus is empty");

        for case in cases {
            let mut arguments = case.arguments.clone();
            let content = case
                .file
                .as_deref()
                .map(document)
                .map(str::to_string)
                .or(case.content);
            if let Some(content) = content {
                arguments["content"] = json!(content);
            }

            match (case.expected, case.expected_error) {
                (_, Some(expected)) => {
                    assert_eq!(
                        run(&arguments).expect_err(&case.name),
                        expected,
                        "{}",
                        case.name
                    );
                }
                (Some(expected), None) => {
                    assert_eq!(
                        run(&arguments).expect(&case.name),
                        expected,
                        "{}",
                        case.name
                    );
                }
                (None, None) => panic!("{} pins neither a result nor an error", case.name),
            }
        }
    }

    #[test]
    fn the_tool_name_is_pinned() {
        assert_eq!(definition()["name"], "extract_urls");
    }

    #[test]
    fn the_advertised_enum_matches_the_formats_that_resolve() {
        let definition = definition();
        let advertised: Vec<String> = definition["inputSchema"]["properties"]["format"]["enum"]
            .as_array()
            .expect("an enum")
            .iter()
            .filter_map(|value| value.as_str().map(str::to_string))
            .collect();
        assert_eq!(advertised, SUPPORTED_FORMATS);
    }

    #[test]
    fn a_fractional_cap_is_refused() {
        let error = run(&json!({ "content": "x", "format": "markdown", "maxResults": 1.5 }))
            .expect_err("a refusal");
        assert_eq!(error, "maxResults must be a positive integer");
    }
}
