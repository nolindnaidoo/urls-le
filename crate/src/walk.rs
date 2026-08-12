//! Turning what the caller named into the list of files to examine.
//!
//! Each crate in this family stands on its own: no shared crate, no
//! published core, and nothing holding this file equal to the similar
//! ones in the sibling repos. Where they agree it is because the same
//! answer was right twice; where they diverge that is the point, and
//! neither has to justify itself to the other.

use std::path::{Path as StdPath, PathBuf};

use crate::extract::format::{FALLBACK_FORMAT, resolve_format};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Target {
    pub(crate) path: PathBuf,
    /// The VS Code language id the extraction engine wants.
    pub(crate) language_id: &'static str,
    /// Why the walk could not examine this path, when it could not.
    ///
    /// Carried rather than returned as an error. A directory the walk
    /// cannot enter, or a symlink loop under `--follow-symlinks`, used to
    /// end the whole run with exit 2 and an **empty** report — one locked
    /// directory deleted the audit of everything beside it. That is the
    /// failure SPEC.md rules out for a file that cannot be opened, and
    /// the rule is the same one layer up: named on stderr, carried in the
    /// report as `skipped`, left out of the exit code, and turned back
    /// into a failure by `--strict`.
    pub(crate) unreadable: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct WalkOptions {
    pub(crate) hidden: bool,
    pub(crate) respect_ignore: bool,
    pub(crate) follow_symlinks: bool,
    /// Forces the format for every target, instead of inferring it from
    /// each filename.
    pub(crate) format: Option<&'static str>,
}

impl Default for WalkOptions {
    fn default() -> Self {
        Self {
            hidden: false,
            respect_ignore: true,
            follow_symlinks: false,
            format: None,
        }
    }
}

/// Collect every file to examine, in a stable order.
///
/// The sort is not cosmetic: `ignore` makes no ordering guarantee, and
/// a report whose lines move between two runs over an unchanged tree
/// cannot be diffed — which is most of what a report in CI is for.
pub(crate) fn collect(inputs: &[PathBuf], options: &WalkOptions) -> Result<Vec<Target>, String> {
    let mut targets = Vec::new();

    for input in inputs {
        let metadata =
            std::fs::metadata(input).map_err(|error| format!("{}: {error}", input.display()))?;

        if metadata.is_file() {
            // Named explicitly, so it is read whatever the ignore rules
            // say — and whatever its name suggests. Naming a file is an
            // instruction, and this used to answer it with a refusal
            // when the extension was one it had no extractor for.
            targets.push(Target {
                path: input.clone(),
                language_id: options.format.unwrap_or_else(|| language_for(input)),
                unreadable: None,
            });
            continue;
        }

        targets.extend(walk_directory(input, options));
    }

    targets.sort_by(|a, b| a.path.cmp(&b.path));
    targets.dedup();
    Ok(targets)
}

fn walk_directory(root: &StdPath, options: &WalkOptions) -> Vec<Target> {
    let mut builder = ignore::WalkBuilder::new(root);
    builder
        .hidden(!options.hidden)
        .git_ignore(options.respect_ignore)
        .git_global(options.respect_ignore)
        .git_exclude(options.respect_ignore)
        .ignore(options.respect_ignore)
        .parents(options.respect_ignore)
        .follow_links(options.follow_symlinks);

    let mut targets = Vec::new();
    for entry in builder.build() {
        let entry = match entry {
            Ok(entry) => entry,
            // Not fatal. This used to be `?`, which meant a single
            // permission-denied directory — or a symlink loop under
            // `--follow-symlinks` — exited 2 with nothing on stdout, so
            // the answer for every readable file in the tree was thrown
            // away along with the one that could not be read.
            Err(error) => {
                targets.push(Target {
                    path: errored_path(&error).unwrap_or_else(|| root.to_path_buf()),
                    language_id: FALLBACK_FORMAT,
                    unreadable: Some(error.to_string()),
                });
                continue;
            }
        };
        if !entry.file_type().is_some_and(|kind| kind.is_file()) {
            continue;
        }
        targets.push(Target {
            path: entry.path().to_path_buf(),
            language_id: options.format.unwrap_or_else(|| language_for(entry.path())),
            unreadable: None,
        });
    }
    targets
}

/// Which path a walk error is about, when the error knows.
///
/// Most carry it directly; a filesystem loop names the link that closed
/// it instead, and the caller falls back to the root for anything that
/// names nothing — a report line pointing at the wrong directory is still
/// better than a run that says nothing at all.
fn errored_path(error: &ignore::Error) -> Option<PathBuf> {
    match error {
        ignore::Error::WithPath { path, .. } => Some(path.clone()),
        ignore::Error::Loop { child, .. } => Some(child.clone()),
        ignore::Error::WithDepth { err, .. } | ignore::Error::WithLineNumber { err, .. } => {
            errored_path(err)
        }
        ignore::Error::Partial(errors) => errors.iter().find_map(errored_path),
        _ => None,
    }
}

/// Every file gets a format, because every file gets read.
///
/// A name this recognises picks the extractor that knows what to
/// exclude; anything else gets the whole-document scan, which is what
/// those extractors are before they exclude anything. A file that is not
/// text still ends up reported as skipped by `scan.rs` — that is the
/// honest place to find out, not a guess from an extension.
fn language_for(path: &StdPath) -> &'static str {
    path.file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| resolve_format(None, Some(name)))
        .unwrap_or(FALLBACK_FORMAT)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempTree;

    fn names(targets: &[Target]) -> Vec<String> {
        targets
            .iter()
            .map(|target| {
                target
                    .path
                    .file_name()
                    .expect("a name")
                    .to_string_lossy()
                    .into_owned()
            })
            .collect()
    }

    /// Changed deliberately: this asserted that `c.rs` and
    /// `d.py` were skipped. They were the files a URL audit most wanted
    /// — a codebase is mostly source — and skipping them silently made
    /// a clean report out of a scan that never looked.
    #[test]
    fn a_directory_yields_every_file_and_names_the_format_of_each() {
        let tree = TempTree::new("walk-formats");
        tree.write("a.md", "# yes");
        tree.write("b.toml", "");
        tree.write("c.rs", "// no");
        tree.write("d.py", "pass");
        let targets = collect(&[tree.path().to_path_buf()], &WalkOptions::default())
            .expect("the walk succeeds");
        assert_eq!(names(&targets), ["a.md", "b.toml", "c.rs", "d.py"]);
        assert_eq!(targets[0].language_id, "markdown");
        assert_eq!(targets[2].language_id, FALLBACK_FORMAT);
    }

    #[test]
    fn the_order_is_stable() {
        let tree = TempTree::new("walk-order");
        for name in ["z.md", "a.md", "m.md"] {
            tree.write(name, "{}");
        }
        let first = collect(&[tree.path().to_path_buf()], &WalkOptions::default())
            .expect("the walk succeeds");
        let second = collect(&[tree.path().to_path_buf()], &WalkOptions::default())
            .expect("the walk succeeds");
        assert_eq!(names(&first), ["a.md", "m.md", "z.md"]);
        assert_eq!(first, second);
    }

    #[test]
    fn gitignored_files_are_skipped_by_default_and_walked_on_request() {
        let tree = TempTree::new("walk-ignore");
        // `.gitignore` applies inside a git repository, which is
        // ripgrep's rule and therefore this tool's — see the test below.
        tree.mkdir(".git");
        tree.write(".gitignore", "skipped.md\n");
        tree.write("skipped.md", "x");
        tree.write("kept.md", "x");

        let default = collect(&[tree.path().to_path_buf()], &WalkOptions::default())
            .expect("the walk succeeds");
        assert_eq!(names(&default), ["kept.md"]);

        let everything = collect(
            &[tree.path().to_path_buf()],
            &WalkOptions {
                respect_ignore: false,
                ..WalkOptions::default()
            },
        )
        .expect("the walk succeeds");
        assert_eq!(names(&everything), ["kept.md", "skipped.md"]);
    }

    /// Outside a git repository a `.gitignore` is inert, because that
    /// is what ripgrep does and matching it is the whole reason the
    /// walker uses `ignore`. Pinned so the behaviour is a decision
    /// rather than a default nobody checked.
    #[test]
    fn a_gitignore_outside_a_repository_is_inert() {
        let tree = TempTree::new("walk-ignore-nogit");
        tree.write(".gitignore", "skipped.md\n");
        tree.write("skipped.md", "x");
        let targets = collect(&[tree.path().to_path_buf()], &WalkOptions::default())
            .expect("the walk succeeds");
        assert_eq!(names(&targets), ["skipped.md"]);
    }

    #[test]
    fn hidden_files_are_skipped_by_default_and_walked_on_request() {
        let tree = TempTree::new("walk-hidden");
        tree.write(".hidden.md", "x");
        tree.write("shown.md", "x");

        let default = collect(&[tree.path().to_path_buf()], &WalkOptions::default())
            .expect("the walk succeeds");
        assert_eq!(names(&default), ["shown.md"]);

        let everything = collect(
            &[tree.path().to_path_buf()],
            &WalkOptions {
                hidden: true,
                ..WalkOptions::default()
            },
        )
        .expect("the walk succeeds");
        assert_eq!(names(&everything), [".hidden.md", "shown.md"]);
    }

    /// A file named on the command line is read even when the ignore
    /// rules exclude it. Refusing it would mean the tool silently
    /// disagreed with an explicit instruction.
    #[test]
    fn an_explicitly_named_file_beats_the_ignore_rules() {
        let tree = TempTree::new("walk-explicit");
        tree.write(".gitignore", "skipped.json\n");
        let file = tree.write("skipped.md", "x");
        let targets = collect(&[file], &WalkOptions::default()).expect("the walk succeeds");
        assert_eq!(names(&targets), ["skipped.md"]);
    }

    /// Changed deliberately: naming a file used to be refused
    /// when its extension was one this had no extractor for. Naming a
    /// file is an instruction, and the answer to it is the file.
    #[test]
    fn an_explicitly_named_file_of_unknown_format_is_read_anyway() {
        let tree = TempTree::new("walk-unknown");
        let file = tree.write("notes.rs", "// x");
        let targets = collect(&[file], &WalkOptions::default()).expect("the walk succeeds");
        assert_eq!(names(&targets), ["notes.rs"]);
        assert_eq!(targets[0].language_id, FALLBACK_FORMAT);
    }

    #[test]
    fn a_forced_format_overrides_the_filename() {
        let tree = TempTree::new("walk-forced");
        let file = tree.write("notes.rs", "x");
        let targets = collect(
            &[file],
            &WalkOptions {
                format: Some("markdown"),
                ..WalkOptions::default()
            },
        )
        .expect("the walk succeeds");
        assert_eq!(targets[0].language_id, "markdown");
    }

    #[test]
    fn a_missing_input_is_refused_by_name() {
        let tree = TempTree::new("walk-missing");
        let error =
            collect(&[tree.path().join("nope")], &WalkOptions::default()).expect_err("a refusal");
        assert!(error.contains("nope"), "{error}");
    }

    /// A directory the walk cannot enter is one unreadable target among
    /// the readable ones, not the end of the run. Unix only: Windows
    /// permissions are ACL-based and `chmod` does not express this, so
    /// there is nothing to construct there.
    #[cfg(unix)]
    #[test]
    fn a_directory_that_cannot_be_entered_is_carried_not_fatal() {
        use std::os::unix::fs::PermissionsExt as _;

        let tree = TempTree::new("walk-locked");
        tree.write("readable.md", "https://a.example\n");
        let locked = tree.mkdir("locked");
        tree.write("locked/hidden.md", "https://b.example\n");
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000))
            .expect("permissions");

        let targets = collect(&[tree.path().to_path_buf()], &WalkOptions::default());
        // Restore before asserting, or a failure leaves a directory the
        // temporary-tree cleanup cannot remove.
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755))
            .expect("permissions");
        let targets = targets.expect("the walk succeeds");

        // Running as root reads it anyway, which is not this test's
        // subject. Say so rather than passing on a case that never ran.
        let Some(unreadable) = targets.iter().find(|t| t.unreadable.is_some()) else {
            eprintln!(
                "SKIPPED a_directory_that_cannot_be_entered_is_carried_not_fatal: \
                 this user can read a 0o000 directory"
            );
            return;
        };
        assert!(unreadable.path.ends_with("locked"), "{unreadable:?}");
        assert!(
            names(&targets).contains(&"readable.md".to_string()),
            "the rest of the tree survives one unreadable directory"
        );
    }

    #[test]
    fn naming_the_same_file_twice_examines_it_once() {
        let tree = TempTree::new("walk-dedupe");
        let file = tree.write("a.json", "{}");
        let targets =
            collect(&[file.clone(), file], &WalkOptions::default()).expect("the walk succeeds");
        assert_eq!(targets.len(), 1);
    }
}
