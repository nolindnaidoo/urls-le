//! The agent surface: the same extraction over the Model Context
//! Protocol on stdio, so a model can ask for the URLs rather than be
//! handed the files and pattern-match them itself.
//!
//! Three rules the family's MCP surfaces established:
//!
//! - **An empty answer is not an error.** A document with no URLs comes
//!   back as an ordinary result carrying `ok: true` — the scan ran.
//!   Only a malformed question is a protocol error.
//! - **Refusals speak the caller's vocabulary.** An MCP caller has no
//!   command line, so no message here mentions a flag.
//! - **An argument that does not fit the schema is a protocol error.**
//!   Three servers ship from this repository, and a client cannot be
//!   allowed to tell them apart by what it sent: the same `-32602`, in the
//!   same words, for a wrong type, an undeclared argument or a cap that is
//!   not a whole number.
//!
//! Read-only by construction: nothing on this surface writes, so unlike
//! pixelactions there is no consent gate to design.

pub(crate) mod extract;

use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use serde_json::{Value, json};

use crate::scan::{self, ScanOptions};
use crate::walk::{self, WalkOptions};

const PROTOCOL_VERSION: &str = "2025-06-18";

/// JSON-RPC error codes, from the spec.
const INVALID_PARAMS: i64 = -32602;
const METHOD_NOT_FOUND: i64 = -32601;

/// Why a tool did not answer.
///
/// An argument that does not fit the tool's schema is a protocol error,
/// `-32602`, in the words the npm server and the extension's use: a host
/// counts it against the sender, and the schema is what the agent read
/// before sending. A tool that fails on what it was given at run time,
/// a path that is not there, is a result carrying `isError`, so a model
/// reads the reason and reacts rather than concluding the server is
/// broken.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Refusal {
    InvalidParams(String),
    Failure(String),
}

impl Refusal {
    #[cfg(test)]
    pub(crate) fn message(&self) -> &str {
        match self {
            Self::InvalidParams(message) | Self::Failure(message) => message,
        }
    }
}

/// `additionalProperties: false`, enforced: an argument the schema does
/// not declare is refused by name, the names sorted as serde sorts keys.
pub(crate) fn refuse_unknown(arguments: &Value, known: &[&str]) -> Result<(), Refusal> {
    let Some(object) = arguments.as_object() else {
        return Ok(());
    };
    let unknown: Vec<&str> = object
        .keys()
        .map(String::as_str)
        .filter(|key| !known.contains(key))
        .collect();
    match unknown.as_slice() {
        [] => Ok(()),
        [one] => Err(Refusal::InvalidParams(format!("unknown argument: {one}"))),
        many => Err(Refusal::InvalidParams(format!(
            "unknown arguments: {}",
            many.join(", ")
        ))),
    }
}

/// An optional argument that must be a string when present.
pub(crate) fn optional_str<'a>(
    arguments: &'a Value,
    name: &str,
) -> Result<Option<&'a str>, Refusal> {
    match arguments.get(name) {
        None => Ok(None),
        Some(value) => value
            .as_str()
            .map(Some)
            .ok_or_else(|| Refusal::InvalidParams(format!("{name} must be a string"))),
    }
}

/// An optional argument that must be a boolean when present; absent is false.
pub(crate) fn optional_bool(arguments: &Value, name: &str) -> Result<bool, Refusal> {
    match arguments.get(name) {
        None => Ok(false),
        Some(value) => value
            .as_bool()
            .ok_or_else(|| Refusal::InvalidParams(format!("{name} must be a boolean"))),
    }
}

pub(crate) fn serve() -> ExitCode {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(line) => line,
            // A frame that is not UTF-8 is a malformed frame: it carries
            // no id, so it is dropped like one that is not JSON, and the
            // frames after it are still served.
            Err(error) if error.kind() == std::io::ErrorKind::InvalidData => continue,
            // Anything else is the stream itself failing. Reading on would
            // spin.
            Err(_) => return ExitCode::from(2),
        };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(request) = serde_json::from_str::<Value>(&line) else {
            // A frame that is not JSON has no id to answer against;
            // dropping it is the only honest option.
            continue;
        };
        let Some(response) = handle(&request) else {
            continue; // a notification: no reply
        };
        if writeln!(stdout, "{response}").is_err() || stdout.flush().is_err() {
            return ExitCode::from(2);
        }
    }
    ExitCode::SUCCESS
}

fn handle(request: &Value) -> Option<Value> {
    let id = request.get("id").cloned();
    let method = request.get("method")?.as_str()?;
    // Notifications carry no id and get no reply.
    id.as_ref()?;

    let result = match method {
        "initialize" => Ok(json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "urls-le", "version": env!("CARGO_PKG_VERSION") },
        })),
        "tools/list" => Ok(json!({ "tools": tool_definitions() })),
        "tools/call" => call_tool(request.get("params")),
        "ping" => Ok(json!({})),
        other => Err((
            METHOD_NOT_FOUND,
            format!("this server does not implement {other}"),
        )),
    };

    Some(match result {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err((code, message)) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": code, "message": message },
        }),
    })
}

fn tool_definitions() -> Value {
    json!([
        extract::definition(),
        {
            "name": "urls_le_scan",
            "description": "Extract every URL from files or directories, with protocol and \
                            position. Reads the filesystem; never writes to it, never fetches \
                            anything, and never judges a URL.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "a file or directory to scan" },
                    "paths": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "several files or directories, instead of `path`",
                    },
                    "dedupe": {
                        "type": "boolean",
                        "default": false,
                        "description": "Collapse repeated URLs to their first occurrence.",
                    },
                    "hidden": {
                        "type": "boolean",
                        "default": false,
                        "description": "Walk hidden files and directories too.",
                    },
                    "ignored": {
                        "type": "boolean",
                        "default": false,
                        "description": "Walk files excluded by .gitignore too.",
                    },
                },
                "additionalProperties": false,
            },
        },
    ])
}

/// Protocol failures (no tool named, an unknown tool, an argument that
/// does not fit the schema) are JSON-RPC errors; a tool that fails on
/// what it was given at run time returns a result carrying `isError`, so
/// a model reads the reason and reacts rather than concluding the server
/// is broken. Same rule, same words, as the npm server.
fn call_tool(params: Option<&Value>) -> Result<Value, (i64, String)> {
    let params = params.ok_or((INVALID_PARAMS, "no tool call was supplied".to_string()))?;
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or((INVALID_PARAMS, "the tool call named no tool".to_string()))?;
    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));

    match name {
        "extract_urls" => answer(extract::run(&arguments)),
        "urls_le_scan" => answer(scan_tool(&arguments)),
        other => Err((
            INVALID_PARAMS,
            format!("this server offers no tool named {other}"),
        )),
    }
}

fn answer(outcome: Result<Value, Refusal>) -> Result<Value, (i64, String)> {
    match outcome {
        Ok(result) => Ok(tool_result(&result)),
        Err(Refusal::InvalidParams(message)) => Err((INVALID_PARAMS, message)),
        Err(Refusal::Failure(message)) => Ok(tool_failure(&message)),
    }
}

fn scan_tool(arguments: &Value) -> Result<Value, Refusal> {
    refuse_unknown(arguments, &["path", "paths", "dedupe", "hidden", "ignored"])?;
    let inputs = requested_paths(arguments)?;
    // Read as the schema types them. A `hidden: "yes"` was read as false,
    // a silence the schema never allowed.
    let walk_options = WalkOptions {
        hidden: optional_bool(arguments, "hidden")?,
        respect_ignore: !optional_bool(arguments, "ignored")?,
        follow_symlinks: false,
        format: None,
    };
    let options = ScanOptions {
        dedupe: optional_bool(arguments, "dedupe")?,
    };

    // A path that is not there is a fact about the filesystem, not the
    // schema: a tool failure the model reads, not a protocol error.
    let targets = walk::collect(&inputs, &walk_options).map_err(Refusal::Failure)?;
    let reports: Vec<Value> = targets
        .iter()
        .map(|target| {
            serde_json::to_value(scan::scan_file(target, options)).expect("a report serializes")
        })
        .collect();

    let urls: u64 = reports
        .iter()
        .map(|report| report["summary"]["urls"].as_u64().unwrap_or(0))
        .sum();
    // The same predicate `--strict` uses on the terminal surface. It
    // checked `severity == "error"` alone, which is the one shape a
    // skipped file never has — so an MCP caller was told a scan covered a
    // tree it could not fully read. Both surfaces call one entry point;
    // this is the rule that had grown a second copy.
    let diagnostics: Vec<Value> = reports
        .iter()
        .filter(|report| {
            report["diagnostics"].as_array().is_some_and(|list| {
                list.iter()
                    .any(|d| d["severity"] == "error" || d["code"] == "skipped")
            })
        })
        .map(|report| {
            warning(
                "unreadable",
                &format!(
                    "{} could not be examined, so this scan does not cover it",
                    report["file"].as_str().unwrap_or("a file")
                ),
            )
        })
        .collect();

    let count = reports.len();
    Ok(envelope(
        "urls_le_scan",
        &json!({ "reports": reports, "urls": urls }),
        count,
        &diagnostics,
        false,
    ))
}

fn requested_paths(arguments: &Value) -> Result<Vec<PathBuf>, Refusal> {
    let invalid = |message: &str| Refusal::InvalidParams(message.to_string());
    if let Some(path) = arguments.get("path") {
        let path = path
            .as_str()
            .ok_or_else(|| invalid("path must be a string"))?;
        return Ok(vec![PathBuf::from(path)]);
    }
    if let Some(items) = arguments.get("paths").and_then(Value::as_array) {
        // An entry that is not a string is named rather than dropped:
        // `["dir", 7]` was answered for `dir` alone and the 7 vanished
        // without a word.
        let mut paths = Vec::with_capacity(items.len());
        for (index, item) in items.iter().enumerate() {
            let Some(path) = item.as_str() else {
                return Err(invalid(&format!("entry {index} of paths is not a string")));
            };
            paths.push(PathBuf::from(path));
        }
        if paths.is_empty() {
            return Err(invalid("the list of paths was empty"));
        }
        return Ok(paths);
    }
    Err(invalid("no file or directory was supplied to audit"))
}

/// The one result shape every tool returns, matching the npm server's
/// envelope field for field: `{ ok, data, diagnostics, meta }`.
///
/// **`ok` reports whether the check ran, not whether the answer is
/// yes.** A file full of broken paths is the answer, not a failure to
/// produce one — conflating the two would have a model report a broken
/// tool when what it actually learned is that the paths are wrong.
pub(crate) fn envelope(
    tool: &str,
    data: &Value,
    count: usize,
    diagnostics: &[Value],
    truncated: bool,
) -> Value {
    let ok = !diagnostics
        .iter()
        .any(|diagnostic| diagnostic["severity"].as_str() == Some("error"));
    json!({
        "ok": ok,
        "data": data,
        "diagnostics": diagnostics,
        "meta": { "tool": tool, "count": count, "truncated": truncated },
    })
}

/// An MCP tool result: the envelope as text (what a model reads) and
/// the same envelope structured. Identical to what the npm server
/// emits, so a caller diffing the two servers finds nothing.
fn tool_result(envelope: &Value) -> Value {
    let text = serde_json::to_string_pretty(envelope).expect("an envelope serializes");
    json!({
        "content": [{ "type": "text", "text": text }],
        "structuredContent": envelope,
        "isError": false,
    })
}

fn warning(code: &str, message: &str) -> Value {
    json!({ "severity": "warning", "code": code, "message": message })
}

/// The tool could not run on what it was given at run time. `isError` so
/// a model reads the message and corrects itself.
fn tool_failure(message: &str) -> Value {
    json!({
        "content": [{ "type": "text", "text": message }],
        "isError": true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempTree;

    fn request(method: &str, params: &Value) -> Value {
        json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params })
    }

    fn call(name: &str, arguments: &Value) -> Value {
        handle(&request(
            "tools/call",
            &json!({ "name": name, "arguments": arguments }),
        ))
        .expect("a reply")
    }

    #[test]
    fn initialize_answers_with_the_protocol_version() {
        let response = handle(&request("initialize", &json!({}))).expect("a reply");
        assert_eq!(response["result"]["protocolVersion"], PROTOCOL_VERSION);
        assert_eq!(response["result"]["serverInfo"]["name"], "urls-le");
    }

    #[test]
    fn tools_list_offers_both_tools() {
        let response = handle(&request("tools/list", &json!({}))).expect("a reply");
        let tools = response["result"]["tools"].as_array().expect("tools");
        let names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
        assert_eq!(names, ["extract_urls", "urls_le_scan"]);
    }

    #[test]
    fn a_notification_gets_no_reply() {
        let notification = json!({ "jsonrpc": "2.0", "method": "initialized" });
        assert!(handle(&notification).is_none());
    }

    #[test]
    fn an_unknown_method_is_a_protocol_error() {
        let response = handle(&request("does/not/exist", &json!({}))).expect("a reply");
        assert_eq!(response["error"]["code"], METHOD_NOT_FOUND);
    }

    #[test]
    fn an_unknown_tool_is_a_protocol_error() {
        let response = call("urls_le_fetch", &json!({}));
        assert_eq!(response["error"]["code"], INVALID_PARAMS);
    }

    /// An argument that does not fit the schema is a protocol error, in
    /// the words the npm server and the extension's use; a path that is
    /// not there is a fact about the filesystem, not the schema, and comes
    /// back as a result carrying isError. A `hidden: "yes"` was read as
    /// false, a `format: 7` as absent, an entry of `paths` that is not a
    /// string was dropped, and an argument the schema does not declare was
    /// accepted.
    #[test]
    fn a_wrong_typed_or_undeclared_argument_is_a_protocol_error() {
        for (tool, arguments, message) in [
            (
                "urls_le_scan",
                json!({}),
                "no file or directory was supplied to audit",
            ),
            (
                "urls_le_scan",
                json!({ "paths": [] }),
                "the list of paths was empty",
            ),
            (
                "urls_le_scan",
                json!({ "paths": ["a", 7] }),
                "entry 1 of paths is not a string",
            ),
            (
                "urls_le_scan",
                json!({ "path": 7 }),
                "path must be a string",
            ),
            (
                "urls_le_scan",
                json!({ "path": "x", "hidden": "yes" }),
                "hidden must be a boolean",
            ),
            (
                "urls_le_scan",
                json!({ "path": "x", "bogus": 1 }),
                "unknown argument: bogus",
            ),
            (
                "extract_urls",
                json!({ "content": "x", "format": 7 }),
                "format must be a string",
            ),
            (
                "extract_urls",
                json!({ "content": "x", "format": "markdown", "filename": 7 }),
                "filename must be a string",
            ),
            (
                "extract_urls",
                json!({ "content": "x", "format": "markdown", "dedupe": "yes" }),
                "dedupe must be a boolean",
            ),
            (
                "extract_urls",
                json!({ "content": "x", "format": "markdown", "extra": true, "another": 1 }),
                "unknown arguments: another, extra",
            ),
            (
                "extract_urls",
                json!({ "format": "markdown" }),
                "content is required and must be a string",
            ),
            (
                "extract_urls",
                json!({ "content": "x", "format": "markdown", "maxResults": 0 }),
                "maxResults must be a positive integer",
            ),
        ] {
            let response = call(tool, &arguments);
            assert_eq!(
                response["error"]["code"], INVALID_PARAMS,
                "{arguments}: {response}"
            );
            assert_eq!(response["error"]["message"], message, "{arguments}");
        }

        let response = call("urls_le_scan", &json!({ "path": "/no/such/place-xyz" }));
        assert!(response.get("error").is_none(), "{response}");
        assert_eq!(response["result"]["isError"], true);
        assert!(
            response["result"]["content"][0]["text"]
                .as_str()
                .expect("a message")
                .contains("/no/such/place-xyz")
        );
    }

    /// `1E20` was refused and the extension's server clamped it: JSON
    /// Schema's `integer` is any number with a zero fractional part.
    #[test]
    fn a_cap_written_as_an_exponent_or_an_integer_valued_float_is_a_cap() {
        let content = "https://a.example https://b.example";
        for (cap, count, truncated) in [
            (json!(1e20), 2, false),
            (json!(1.0), 1, true),
            (json!(1e3), 2, false),
        ] {
            let response = call(
                "extract_urls",
                &json!({ "content": content, "format": "markdown", "maxResults": cap }),
            );
            let meta = &response["result"]["structuredContent"]["meta"];
            assert_eq!(meta["count"], count, "{cap}: {response}");
            assert_eq!(meta["truncated"], truncated, "{cap}");
        }
    }

    #[test]
    fn the_shared_tool_is_offered_and_answers() {
        let response = call(
            "extract_urls",
            &json!({ "content": "see https://a.example/x", "format": "markdown" }),
        );
        let envelope = &response["result"]["structuredContent"];
        assert_eq!(envelope["meta"]["tool"], "extract_urls");
        assert_eq!(envelope["data"]["urls"][0]["value"], "https://a.example/x");
        assert_eq!(envelope["ok"], true);
        assert_eq!(response["result"]["isError"], false);
    }

    /// The shared tool reaches no filesystem — that is the property that
    /// lets an agent call it anywhere, and it must not regress.
    #[test]
    fn the_shared_tool_needs_no_filesystem() {
        let response = call(
            "extract_urls",
            &json!({ "content": "file:///definitely/not/here", "format": "markdown" }),
        );
        let url = &response["result"]["structuredContent"]["data"]["urls"][0];
        assert_eq!(url["value"], "file:///definitely/not/here");
        assert!(
            url.get("exists").is_none(),
            "a field like this means it looked"
        );
    }

    /// An empty answer is the scan running and finding nothing, not the
    /// tool breaking.
    #[test]
    fn a_document_with_no_urls_is_an_ordinary_result() {
        let response = call(
            "extract_urls",
            &json!({ "content": "nothing here", "format": "markdown" }),
        );
        let envelope = &response["result"]["structuredContent"];
        assert_eq!(response["result"]["isError"], false);
        assert_eq!(envelope["ok"], true);
        assert_eq!(envelope["meta"]["count"], 0);
    }

    #[test]
    fn the_scan_tool_reports_what_it_found() {
        let tree = TempTree::new("mcp-scan");
        tree.write("docs/a.md", "see https://a.example/x\n");
        let response = call(
            "urls_le_scan",
            &json!({ "path": tree.path().to_string_lossy() }),
        );
        let envelope = &response["result"]["structuredContent"];
        assert_eq!(response["result"]["isError"], false);
        assert_eq!(envelope["ok"], true);
        assert_eq!(envelope["data"]["urls"], 1);
    }

    #[test]
    fn the_scan_tool_dedupes_on_request() {
        let tree = TempTree::new("mcp-dedupe");
        tree.write("docs/a.md", "https://a.example\nhttps://a.example\n");
        let kept = call(
            "urls_le_scan",
            &json!({ "path": tree.path().to_string_lossy() }),
        );
        assert_eq!(kept["result"]["structuredContent"]["data"]["urls"], 2);
        let deduped = call(
            "urls_le_scan",
            &json!({ "path": tree.path().to_string_lossy(), "dedupe": true }),
        );
        assert_eq!(deduped["result"]["structuredContent"]["data"]["urls"], 1);
    }

    /// Refusals speak the caller's vocabulary: an MCP caller has no
    /// command line, so no message may name a flag.
    #[test]
    fn no_message_mentions_a_command_line_flag() {
        let definitions = serde_json::to_string(&tool_definitions()).expect("serializes");
        assert!(!definitions.contains("--"), "{definitions}");

        let tree = TempTree::new("mcp-vocabulary");
        tree.write("a.md", "https://a.example\n");
        for arguments in [
            json!({}),
            json!({ "paths": [] }),
            json!({ "path": "/no/such/place-xyz" }),
            json!({ "path": tree.path().to_string_lossy(), "resolve": false }),
        ] {
            let rendered =
                serde_json::to_string(&call("urls_le_scan", &arguments)).expect("serializes");
            assert!(!rendered.contains("--"), "{rendered}");
        }
    }

    /// Every tool returns the same envelope, so a caller writes one
    /// reader for all of them and for both servers.
    #[test]
    fn every_tool_returns_the_same_envelope_shape() {
        let tree = TempTree::new("mcp-envelope");
        tree.write("a.md", "x");
        let results = [
            call(
                "extract_urls",
                &json!({ "content": "x", "format": "markdown" }),
            ),
            call(
                "urls_le_scan",
                &json!({ "path": tree.path().to_string_lossy() }),
            ),
        ];
        for result in results {
            let envelope = &result["result"]["structuredContent"];
            assert!(envelope["ok"].is_boolean(), "{envelope}");
            assert!(!envelope["data"].is_null(), "{envelope}");
            assert!(envelope["diagnostics"].is_array(), "{envelope}");
            assert!(envelope["meta"]["tool"].is_string(), "{envelope}");
            assert!(envelope["meta"]["count"].is_number(), "{envelope}");
            assert!(envelope["meta"]["truncated"].is_boolean(), "{envelope}");
        }
    }
}
