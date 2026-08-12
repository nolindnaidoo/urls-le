//! A standing net over the pure layer: the URL scanner, the five
//! protocol patterns, the delimiter class, and the eleven subset rules
//! built on them.
//!
//! It lives inside the crate because `extract/` is `pub(crate)` — the
//! layer worth fuzzing is the one an integration test cannot reach. It is
//! test-only scaffolding, like `corpus.rs`, and the coverage floor skips
//! it for the same reason.
//!
//! **Deterministic by default.** `cargo test` runs a fixed number of
//! cases from a fixed seed, so the suite never varies with the clock.
//! `URLS_LE_FUZZ_SECONDS` switches it to a wall-clock box, which is what
//! CI runs — sixty seconds, not to convergence. The point is a net, not
//! a proof.
//!
//! Three failures it is looking for, each seen in this family before:
//! a panic slicing a multi-byte character, a hang on a pathological run
//! of delimiters, and a reported span that does not line up with the
//! source it came from.
//!
//! Reproduce any failure with the seed and case number it prints:
//! `URLS_LE_FUZZ_SEED=… URLS_LE_FUZZ_CASES=… cargo test extract::fuzz`

use std::time::{Duration, Instant};

use super::corpus::document;
use super::js;
use super::{FileType, extract};

const DEFAULT_SEED: u64 = 0x5152_4c53_4c45_0002;
const DEFAULT_CASES: usize = 4_000;
/// No single document may take this long. A pathological input that
/// merely takes a hundred times as long as the rest is the hang this
/// catches — waiting for a true infinite loop would just time the job
/// out with nothing to read.
const PER_CASE_CEILING: Duration = Duration::from_secs(5);

/// xorshift64*. Small enough to read, and the seed is the whole
/// reproduction recipe.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        let mut state = self.0;
        state ^= state >> 12;
        state ^= state << 25;
        state ^= state >> 27;
        self.0 = state;
        state.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    fn below(&mut self, bound: usize) -> usize {
        (self.next() % bound as u64) as usize
    }

    fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[self.below(items.len())]
    }
}

/// The pieces a URL scanner has opinions about: every scheme it knows,
/// every delimiter that ends a match, the characters that make a value
/// well-formed or not, and text that is multi-byte or astral so a byte
/// offset and a character offset stop agreeing.
const PIECES: [&str; 46] = [
    "https://",
    "http://",
    "ftp://",
    "file://",
    "mailto:",
    "tel:",
    "HTTPS://",
    "https:/",
    "://",
    ":",
    "//",
    "a.example",
    "example.com",
    "münchen.example",
    "[2001:db8::1]",
    "127.0.0.1",
    ":8443",
    "/path",
    "/a.",
    "?q=1",
    "#frag",
    "%20",
    "@",
    "+15551234567",
    " ",
    "\t",
    "\n",
    "\r\n",
    "<",
    ">",
    "\"",
    "{",
    "}",
    "|",
    "\\",
    "^",
    "`",
    "[",
    "]",
    ";",
    ")",
    "'",
    "é",
    "🎯",
    "\u{feff}",
    "\u{0}",
];

/// Every language id worth driving, including the ones with no
/// format-aware extractor.
const LANGUAGES: [&str; 15] = [
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
    "python",
    "",
];

const CORPUS: [&str; 14] = [
    "urls.md",
    "urls.html",
    "urls.css",
    "urls.js",
    "urls.json",
    "urls.yaml",
    "urls.properties",
    "urls.toml",
    "urls.ini",
    "urls.xml",
    "broken.toml",
    "urls.py",
    "urls.go",
    "urls.sh",
];

fn spliced(rng: &mut Rng) -> String {
    let mut text = String::new();
    let pieces = rng.below(60) + 1;
    for _ in 0..pieces {
        text.push_str(rng.pick(&PIECES));
    }
    text
}

/// A long run of one delimiter behind a scheme. The shape that turns a
/// backtracking engine into a hang, kept as a named generator so the
/// case is deliberate rather than hoped for.
fn pathological(rng: &mut Rng) -> String {
    let filler = rng.pick(&["a", "/", ".", ":", "-", "%", "\\", "'"]);
    let length = rng.below(20_000) + 1_000;
    let mut text = String::with_capacity(length + 16);
    text.push_str(rng.pick(&["https://", "mailto:", "tel:", "file://"]));
    for _ in 0..length {
        text.push_str(filler);
    }
    if rng.below(2) == 0 {
        text.push_str(rng.pick(&["<", "\"", "]", " "]));
    }
    text
}

/// A corpus document with a bite taken out of it, at a character
/// boundary — the mutation most likely to leave a half-formed construct
/// an extractor has to survive.
fn mutated_corpus(rng: &mut Rng) -> String {
    let source = document(rng.pick(&CORPUS));
    let mut text = source.to_string();
    for _ in 0..=rng.below(4) {
        if text.is_empty() {
            break;
        }
        let mut at = rng.below(text.len());
        while at > 0 && !text.is_char_boundary(at) {
            at -= 1;
        }
        match rng.below(3) {
            0 => text.truncate(at),
            1 => text.insert_str(at, rng.pick(&PIECES)),
            _ => {
                let tail = text.split_off(at);
                text.push_str(rng.pick(&PIECES));
                text.push_str(&tail);
            }
        }
    }
    text
}

fn input(rng: &mut Rng) -> String {
    match rng.below(10) {
        0..=4 => spliced(rng),
        5..=6 => mutated_corpus(rng),
        7 => pathological(rng),
        _ => format!("{}{}", spliced(rng), mutated_corpus(rng)),
    }
}

/// The byte offset of a 1-based line and a 1-based **UTF-16** column,
/// which is what a position means here.
fn offset_of(content: &str, line: usize, column: usize) -> Option<usize> {
    let line_start = content
        .split_inclusive('\n')
        .take(line - 1)
        .map(str::len)
        .sum::<usize>();
    let rest = content.get(line_start..)?;
    let mut units = 1;
    for (index, character) in rest.char_indices() {
        if units == column {
            return Some(line_start + index);
        }
        units += character.len_utf16();
    }
    (units == column).then_some(content.len())
}

/// What every case must be true of, whatever the input was.
///
/// The span check is the one worth the trouble: a value reported at a
/// line and column that does not hold it is a report that reads correct
/// and sends the reader to the wrong place.
fn check(content: &str, language: &str, case: usize, seed: u64) {
    let blame = || {
        format!(
            "seed {seed}, case {case}, language {language:?}, input {:?}",
            content.chars().take(400).collect::<String>()
        )
    };

    let started = Instant::now();
    let result = extract(content, language);
    let elapsed = started.elapsed();
    assert!(
        elapsed < PER_CASE_CEILING,
        "one document took {elapsed:?} — {}",
        blame()
    );

    let lines: Vec<&str> = content.split('\n').collect();
    for url in &result.urls {
        let Some(position) = url.position else {
            // A parsed value that could not be located keeps no position
            // rather than being given a made-up one. Nothing to check.
            continue;
        };
        assert!(position.line >= 1 && position.column >= 1, "{}", blame());
        let offset = offset_of(content, position.line, position.column).unwrap_or_else(|| {
            panic!(
                "{}:{} is not a position in this document — {}",
                position.line,
                position.column,
                blame()
            )
        });
        assert!(
            content[offset..].starts_with(&url.value),
            "{:?} was reported at {}:{} where the document says {:?} — {}",
            url.value,
            position.line,
            position.column,
            content[offset..]
                .chars()
                .take(url.value.chars().count())
                .collect::<String>(),
            blame()
        );
        let expected_context = lines
            .get(position.line - 1)
            .map_or(String::new(), |line| js::trim(line).to_string());
        assert_eq!(
            url.context.as_deref(),
            Some(expected_context.as_str()),
            "the context is not the line the position names — {}",
            blame()
        );
    }
}

fn number(name: &str) -> Option<u64> {
    std::env::var(name).ok()?.trim().parse().ok()
}

#[test]
fn the_pure_layer_survives_generated_documents() {
    let seed = number("URLS_LE_FUZZ_SEED").unwrap_or(DEFAULT_SEED) | 1;
    let budget = number("URLS_LE_FUZZ_SECONDS").map(Duration::from_secs);
    let cases = number("URLS_LE_FUZZ_CASES").map_or(DEFAULT_CASES, |value| value as usize);
    let mut rng = Rng(seed);
    let started = Instant::now();

    // Printed on every run, pass or fail. A red build that does not say
    // which seed produced it is a red build somebody reruns rather than
    // reads.
    println!(
        "fuzz: seed {seed}, {}",
        budget.map_or_else(
            || format!("{cases} cases (deterministic)"),
            |budget| format!("{budget:?} wall clock")
        )
    );

    let mut ran = 0usize;
    loop {
        match budget {
            Some(budget) if started.elapsed() >= budget => break,
            None if ran >= cases => break,
            _ => {}
        }
        let content = input(&mut rng);
        let language = *rng.pick(&LANGUAGES);
        check(&content, language, ran, seed);
        ran += 1;
    }

    println!("fuzz: {ran} documents, no panic, no hang, every span aligned");
    assert!(ran > 0, "the fuzz target ran nothing");
}

/// The three shapes worth pinning by hand, so they run on every push even
/// when the generated cases happen not to produce them.
#[test]
fn the_shapes_that_broke_this_family_before() {
    // A multi-byte character straddling every offset an extractor
    // computes. SIGABRT slicing one is the bug this remembers.
    for language in LANGUAGES {
        for filler in ["é", "🎯", "\u{feff}"] {
            let content = format!("{filler}https://a.example/{filler}?q={filler}#{filler}");
            check(&content, language, 0, DEFAULT_SEED);
        }
    }

    // A URL that never terminates, at the length where a quadratic
    // position lookup stopped being invisible.
    let long = format!("https://a.example/{}", "a".repeat(200_000));
    check(&long, "markdown", 1, DEFAULT_SEED);

    // Every delimiter, immediately after a scheme.
    for delimiter in [
        "<", ">", "\"", "{", "}", "|", "\\", "^", "`", "[", "]", ";", ")", "'", " ", "\t", "\n",
    ] {
        check(
            &format!("https://{delimiter}a mailto:{delimiter}@x tel:{delimiter}1"),
            "markdown",
            2,
            DEFAULT_SEED,
        );
    }
}

/// The position arithmetic the span check leans on, checked against the
/// index it is meant to be the inverse of.
#[test]
fn the_span_check_agrees_with_the_position_index() {
    for content in ["abc", "a\nbc", "é!\nx", "🎯!\ny", "", "\n\n"] {
        let index = super::position::PositionIndex::new(content);
        for offset in 0..=content.len() {
            if !content.is_char_boundary(offset) {
                continue;
            }
            let position = index.at(offset);
            assert_eq!(
                offset_of(content, position.line, position.column),
                Some(offset),
                "{content:?} at {offset}"
            );
        }
    }
}

/// Deliberately not part of the generated run: it proves the checker can
/// fail, which is the only way to know a green run means anything.
#[test]
fn the_span_check_rejects_a_position_that_does_not_hold_the_value() {
    let content = "x https://a.example";
    assert_eq!(offset_of(content, 1, 3), Some(2));
    assert!(content[2..].starts_with("https://a.example"));
    assert!(!content[offset_of(content, 1, 1).expect("an offset")..].starts_with("https://"));
}

/// `FileType` is exercised through `extract`, but the enum is what
/// decides which subset ran — so every variant is named here rather than
/// left to chance in the generator.
#[test]
fn every_file_type_is_reachable_from_a_language_id() {
    let seen: Vec<FileType> = LANGUAGES
        .iter()
        .map(|language| super::determine_file_type(language))
        .collect();
    for expected in [
        FileType::Markdown,
        FileType::Html,
        FileType::Css,
        FileType::Javascript,
        FileType::Typescript,
        FileType::Json,
        FileType::Yaml,
        FileType::Properties,
        FileType::Toml,
        FileType::Ini,
        FileType::Xml,
        FileType::Unknown,
    ] {
        assert!(seen.contains(&expected), "{expected:?} is never fuzzed");
    }
}
