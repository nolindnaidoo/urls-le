//! The terminal surface.
//!
//! stdout is always protocol — one JSON report per line, one line per
//! file. stderr is always for the human, and is a projection of the same
//! reports rather than parallel prose.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use crate::extract::format::resolve_format;
use crate::scan::{self, FileReport, ScanOptions};
use crate::walk::{self, WalkOptions};

const USAGE: &str = "usage: urls-le [options] <file|dir>...
       urls-le [options] --stdin --format <format>
       urls-le mcp
       urls-le --version | --help

Extracts every URL from a document, with its protocol and 1-based line
and column. One JSON report per line on stdout, human summary on stderr.

Every file is read. Eleven formats know what to exclude — a fenced code
block, an HTML comment, everything that is not a JSON string; anything
else is scanned whole, and the report's format field says which.

It reports what is there and nothing else: nothing is fetched, nothing
is filtered, nothing is scored. What the URLs mean is yours to decide.

Options:
  --dedupe             collapse repeated URLs to their first occurrence
  --format <format>    force a format instead of inferring it from the
                       file name; required with --stdin. A name with no
                       format-aware extractor scans the whole document
  --stdin              read one document from stdin
  --strict             exit 2 if any file could not be read, rather than
                       reporting it and carrying on
  --follow-symlinks    descend symlinked directories when walking a tree
  --hidden             walk hidden files and directories too
  --no-ignore          walk files that .gitignore excludes

Files that are not text, or that cannot be opened, are named on stderr
and carried in the report, and do not by themselves fail the run — every
repository has a PNG in it. --strict turns them back into a failure.

Exit codes follow grep: 0 URLs found · 1 none found · 2 malformed
question. Finding none is an answer, not an error.";

/// Every flag the parser accepts. Held equal to the flags named in USAGE
/// by a test, and consulted at runtime so the list is what the parser
/// actually honours.
const FLAGS: [&str; 7] = [
    "--dedupe",
    "--strict",
    "--format",
    "--stdin",
    "--follow-symlinks",
    "--hidden",
    "--no-ignore",
];

#[derive(Debug)]
struct Options {
    inputs: Vec<PathBuf>,
    stdin: bool,
    strict: bool,
    format: Option<&'static str>,
    scan: ScanOptions,
    walk: WalkOptions,
}

pub(crate) fn run() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();

    if let Some(first) = args.first() {
        match first.as_str() {
            "mcp" => return crate::mcp::serve(),
            "--help" | "-h" => {
                println!("{USAGE}");
                return ExitCode::SUCCESS;
            }
            "--version" | "-V" => {
                println!("urls-le {}", env!("CARGO_PKG_VERSION"));
                return ExitCode::SUCCESS;
            }
            _ => {}
        }
    }

    match execute(&args) {
        Ok(code) => ExitCode::from(code),
        Err(message) => {
            eprintln!("urls-le: {message}");
            ExitCode::from(2)
        }
    }
}

fn execute(args: &[String]) -> Result<u8, String> {
    let options = parse(args)?;
    let reports = if options.stdin {
        vec![scan_stdin(&options)?]
    } else {
        let targets = walk::collect(&options.inputs, &options.walk)?;
        targets
            .iter()
            .map(|target| scan::scan_file(target, options.scan))
            .collect()
    };

    let mut stdout = std::io::stdout().lock();
    for report in &reports {
        let line = serde_json::to_string(report).expect("a report serializes");
        writeln!(stdout, "{line}")
            .map_err(|error| format!("could not write the report: {error}"))?;
    }
    drop(stdout);

    summarise(&reports);
    Ok(scan::exit_code(&reports, options.strict))
}

fn scan_stdin(options: &Options) -> Result<FileReport, String> {
    let format = options.format.ok_or_else(|| {
        "reading from stdin needs --format: the name that would carry the format is not there"
            .to_string()
    })?;
    let mut content = String::new();
    std::io::stdin()
        .read_to_string(&mut content)
        .map_err(|error| format!("could not read stdin: {error}"))?;
    Ok(scan::scan_content(
        scan::without_bom(&content),
        "<stdin>".to_string(),
        format,
        options.scan,
    ))
}

fn parse(args: &[String]) -> Result<Options, String> {
    let mut options = Options {
        inputs: Vec::new(),
        stdin: false,
        strict: false,
        format: None,
        scan: ScanOptions { dedupe: false },
        walk: WalkOptions::default(),
    };

    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        // Strict parsing, never a silent default: a typo'd `--dedup`
        // that quietly did nothing would produce a report the caller
        // believed was deduplicated.
        if arg.starts_with('-') && !FLAGS.contains(&arg.as_str()) {
            return Err(format!("{arg} is not an option. Try --help."));
        }

        match arg.as_str() {
            "--dedupe" => options.scan.dedupe = true,
            "--stdin" => options.stdin = true,
            "--strict" => options.strict = true,
            "--hidden" => options.walk.hidden = true,
            "--no-ignore" => options.walk.respect_ignore = false,
            "--follow-symlinks" => options.walk.follow_symlinks = true,
            "--format" => {
                let value = rest
                    .next()
                    .ok_or_else(|| "--format needs a format".to_string())?;
                // A name nobody recognises resolves to the plain-text
                // scan rather than a refusal. That is not a silent
                // default: every format-aware extractor is that scan
                // minus an exclusion, so a mistyped name can only stop
                // something being excluded, never hide a URL — and the
                // report's format field says which pass ran.
                let resolved = resolve_format(Some(value), None)
                    .ok_or_else(|| "--format needs a format".to_string())?;
                options.format = Some(resolved);
                options.walk.format = Some(resolved);
            }
            path => options.inputs.push(PathBuf::from(path)),
        }
    }

    if options.stdin && !options.inputs.is_empty() {
        return Err("reading from stdin takes no file arguments".to_string());
    }
    if !options.stdin && options.inputs.is_empty() {
        return Err("name a file or a directory to scan. Try --help.".to_string());
    }
    Ok(options)
}

/// The human half. Every line restates something already in the JSON.
fn summarise(reports: &[FileReport]) {
    let mut stderr = std::io::stderr().lock();
    let mut urls = 0;

    for report in reports {
        for diagnostic in &report.diagnostics {
            let _ = writeln!(stderr, "{}: {}", report.file, diagnostic.message);
        }
        for url in &report.urls {
            urls += 1;
            let _ = writeln!(stderr, "{}", scan::describe(report, url));
        }
    }

    let _ = writeln!(
        stderr,
        "{} in {}",
        plural(urls, "URL", "URLs"),
        plural(reports.len(), "file", "files")
    );
}

fn plural(count: usize, one: &str, many: &str) -> String {
    format!("{count} {}", if count == 1 { one } else { many })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_documented_flag_is_parsed_and_the_reverse() {
        let mut documented: Vec<&str> = USAGE
            .split_whitespace()
            .filter(|word| word.starts_with("--"))
            .map(|word| word.trim_end_matches([',', '.', ':', ';']))
            .filter(|word| !matches!(*word, "--version" | "--help"))
            .collect();
        documented.sort_unstable();
        documented.dedup();

        let mut implemented = FLAGS.to_vec();
        implemented.sort_unstable();
        assert_eq!(documented, implemented);
    }

    #[test]
    fn the_parser_accepts_every_flag_it_lists() {
        for flag in FLAGS {
            let args: Vec<String> = match flag {
                "--format" => vec![flag.into(), "markdown".into(), "x".into()],
                "--stdin" => vec![flag.into()],
                _ => vec![flag.into(), "x".into()],
            };
            assert!(parse(&args).is_ok(), "{flag}");
        }
    }

    #[test]
    fn an_unknown_flag_is_refused_rather_than_ignored() {
        let error = parse(&["--dedup".into(), "x".into()]).expect_err("a refusal");
        assert!(error.contains("--dedup"), "{error}");
    }

    /// There is no verdict about a URL, so there is no flag that would
    /// produce one. If this ever needs changing, the tool has grown an
    /// opinion.
    ///
    /// `--strict` is deliberately not in this list. It says whether the
    /// scan covered everything it was pointed at, which is a statement
    /// about this run and not about any URL in it — the same axis as
    /// "none found", which has always been an exit code here.
    #[test]
    fn no_flag_asks_for_a_judgment() {
        for attempt in ["--check", "--insecure", "--fail-on", "--allow", "--score"] {
            assert!(
                parse(&[attempt.into(), "x".into()]).is_err(),
                "{attempt} was accepted"
            );
        }
        for word in ["insecure", "credential", "scored\u{20}as"] {
            assert!(!USAGE.contains(word), "the usage text offers {word}");
        }
    }

    /// Changed deliberately: `--format python` was refused,
    /// which made a Python file something this would not read even when
    /// told to. It now scans the whole document and says so in the
    /// report, so the answer is visible rather than guessed at.
    #[test]
    fn a_format_with_no_extractor_scans_the_whole_document() {
        let options =
            parse(&["--format".into(), "python".into(), "x".into()]).expect("it is accepted");
        assert_eq!(options.format, Some("plaintext"));
    }

    #[test]
    fn a_format_flag_with_no_value_is_refused() {
        assert!(parse(&["--format".into()]).is_err());
    }

    #[test]
    fn naming_nothing_is_refused() {
        assert!(parse(&[]).is_err());
    }

    #[test]
    fn stdin_and_file_arguments_together_are_refused() {
        assert!(parse(&["--stdin".into(), "x".into()]).is_err());
    }

    #[test]
    fn the_usage_text_states_greps_convention() {
        assert!(USAGE.contains("grep"));
        for code in ["0", "1", "2"] {
            assert!(USAGE.contains(code), "exit code {code} is undocumented");
        }
    }
}
