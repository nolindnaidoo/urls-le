//! A wall-clock ceiling on a fixed tree, and a linearity check on top of
//! it.
//!
//! A sibling in this family was fifty times slower than the rest for a
//! whole release and nobody noticed, because nothing measured it. This
//! measures it.
//!
//! **The tree is generated from a fixed seed**, not checked in: five
//! hundred files of source-shaped text would be half a megabyte of
//! fixtures nobody reads, and the generator is nine lines. The seed is
//! constant, so the tree is the same on every run and every machine.
//!
//! Gated behind `URLS_LE_BUDGET` and run on ubuntu only, because a
//! timing assertion on three shared runners is three chances to flake
//! for a reason that has nothing to do with the code. A skipped run says
//! so rather than passing quietly.
//!
//! ## The measurement this ceiling comes from
//!
//! Local run, release build, Apple M-series laptop (arm64), macOS 15,
//! best of three on the generated tree below — 500 files, ~2 MB of
//! source-shaped text:
//!
//! - single tree:  0.024 s
//! - tree ×4:      0.089 s  (ratio 3.7)
//!
//! The ceiling is **10× the single-tree measurement**, which is generous
//! enough not to flake on a shared runner and tight enough to catch an
//! order of magnitude. The linearity bound is 6× for a 4× tree, which is
//! what catches the quadratic class directly — a scan that goes quadratic
//! in the file count blows straight through it while the absolute
//! ceiling might not.

use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

const BINARY: &str = env!("CARGO_BIN_EXE_urls-le");
const FILES: usize = 500;
const SEED: u64 = 0x0002_0000_5455_524c;

/// 10× the local single-tree measurement recorded above.
const CEILING: Duration = Duration::from_millis(250);
/// Four times the tree may not cost more than six times the time.
const LINEARITY: f64 = 6.0;

fn enabled(name: &str) -> bool {
    if std::env::var_os("URLS_LE_BUDGET").is_some() {
        return true;
    }
    eprintln!("SKIPPED {name}: set URLS_LE_BUDGET to run it");
    false
}

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
}

struct Tree {
    root: PathBuf,
}

impl Tree {
    fn new(name: &str) -> Self {
        let root =
            std::env::temp_dir().join(format!("urls-le-budget-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("a temporary directory");
        Self { root }
    }

    fn path(&self) -> &Path {
        &self.root
    }
}

impl Drop for Tree {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

/// Source-shaped text: mostly ordinary lines, some URLs, across the
/// extensions a real repository actually holds.
const EXTENSIONS: [&str; 10] = [
    "md", "ts", "js", "json", "yaml", "toml", "ini", "py", "go", "css",
];

fn populate(root: &Path, seed: u64, prefix: &str) {
    let mut rng = Rng(seed);
    for index in 0..FILES {
        let directory = root.join(format!("{prefix}pkg{:02}", index % 25));
        std::fs::create_dir_all(&directory).expect("a directory");
        let extension = EXTENSIONS[index % EXTENSIONS.len()];
        let mut content = String::with_capacity(4_000);
        for line in 0..80 {
            let written = match rng.below(5) {
                0 => writeln!(
                    content,
                    "  reference {line}: https://example{}.test/path/{line}",
                    rng.below(50)
                ),
                1 => writeln!(content, "  # a comment with no address in it at all"),
                _ => writeln!(
                    content,
                    "  value_{line} = \"a plain line of source text number {line}\""
                ),
            };
            written.expect("a string accepts writes");
        }
        std::fs::write(
            directory.join(format!("file{index:03}.{extension}")),
            content,
        )
        .expect("a file");
    }
}

/// One timed run, with the report thrown away — writing half a megabyte
/// of JSON to a pipe nobody reads would be timing the pipe.
fn measure(root: &Path) -> Duration {
    let started = Instant::now();
    let output = Command::new(BINARY)
        .arg(root)
        .output()
        .expect("the binary runs");
    let elapsed = started.elapsed();
    assert_eq!(
        output.status.code(),
        Some(0),
        "the scan did not succeed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    elapsed
}

/// The fastest of three. A shared runner's slowest run measures the
/// runner; its fastest measures the code, which is what the ceiling is
/// about.
fn best_of_three(root: &Path) -> Duration {
    (0..3)
        .map(|_| measure(root))
        .min()
        .expect("three measurements")
}

#[test]
fn a_five_hundred_file_tree_scans_inside_its_budget() {
    if !enabled("a_five_hundred_file_tree_scans_inside_its_budget") {
        return;
    }
    let tree = Tree::new("single");
    populate(tree.path(), SEED, "");

    let elapsed = best_of_three(tree.path());
    println!("budget: {FILES} files in {elapsed:?} (ceiling {CEILING:?})");
    assert!(
        elapsed < CEILING,
        "scanning {FILES} files took {elapsed:?}, over the {CEILING:?} ceiling — \
         that is ten times the recorded local measurement, so this is an order \
         of magnitude, not a slow runner"
    );
}

/// The check that catches the quadratic class directly. An absolute
/// ceiling can be met by something that is quadratic and small; a shape
/// that costs six times as much for four times the input cannot be.
#[test]
fn four_times_the_tree_does_not_cost_six_times_the_time() {
    if !enabled("four_times_the_tree_does_not_cost_six_times_the_time") {
        return;
    }
    let one = Tree::new("linear-one");
    populate(one.path(), SEED, "");
    let four = Tree::new("linear-four");
    for copy in 0..4 {
        populate(four.path(), SEED, &format!("copy{copy}-"));
    }

    let single = best_of_three(one.path());
    let quadrupled = best_of_three(four.path());
    let ratio = quadrupled.as_secs_f64() / single.as_secs_f64().max(f64::EPSILON);
    println!("budget: 1× {single:?}, 4× {quadrupled:?}, ratio {ratio:.2}");
    assert!(
        ratio < LINEARITY,
        "four times the tree cost {ratio:.2}× the time — the scan is not linear \
         in the number of files ({single:?} for {FILES}, {quadrupled:?} for {})",
        FILES * 4
    );
}
