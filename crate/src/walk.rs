//! Turning what the caller named into the list of files to examine.
//!
//! **This file is a near-copy of paths-le's `walk.rs`.** The family's
//! crates are self-contained by decision — no shared crate, no published
//! core — so code two of them need is duplicated and held equal by a
//! drift check, the same way `biome.json` and `ci.yml` are. Fix a bug
//! here and it needs fixing there.
//!
//! Directories are walked with ripgrep's `ignore`, so "what this tool
//! looks at" and "what ripgrep looks at" are the same answer — which is
//! the answer a person auditing a repository already has in their head.
//! A file named explicitly is always read, ignore rules included: you
//! asked for it.

use std::path::{Path as StdPath, PathBuf};

use crate::extract::format::resolve_format;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Target {
    pub(crate) path: PathBuf,
    /// The VS Code language id the extraction engine wants.
    pub(crate) language_id: &'static str,
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
            // say. Only an unrecognised format refuses it, and that
            // refusal names the problem rather than returning nothing.
            let language_id = options
                .format
                .or_else(|| language_for(input))
                .ok_or_else(|| {
                    format!(
                        "{}: no format could be inferred from the name; name one explicitly",
                        input.display()
                    )
                })?;
            targets.push(Target {
                path: input.clone(),
                language_id,
            });
            continue;
        }

        targets.extend(walk_directory(input, options)?);
    }

    targets.sort_by(|a, b| a.path.cmp(&b.path));
    targets.dedup();
    Ok(targets)
}

fn walk_directory(root: &StdPath, options: &WalkOptions) -> Result<Vec<Target>, String> {
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
        let entry = entry.map_err(|error| format!("{}: {error}", root.display()))?;
        if !entry.file_type().is_some_and(|kind| kind.is_file()) {
            continue;
        }
        let Some(language_id) = options.format.or_else(|| language_for(entry.path())) else {
            continue;
        };
        targets.push(Target {
            path: entry.path().to_path_buf(),
            language_id,
        });
    }
    Ok(targets)
}

/// A walked file with no recognisable format is skipped silently; one
/// named explicitly is refused loudly. The difference is intent — a
/// repository is full of files this tool has nothing to say about, and
/// naming one means you expected it to.
fn language_for(path: &StdPath) -> Option<&'static str> {
    let name = path.file_name()?.to_str()?;
    resolve_format(None, Some(name))
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

    #[test]
    fn a_directory_yields_only_the_formats_it_understands() {
        let tree = TempTree::new("walk-formats");
        tree.write("a.md", "# yes");
        tree.write("b.toml", "");
        tree.write("c.rs", "// no");
        tree.write("d.py", "pass");
        let targets = collect(&[tree.path().to_path_buf()], &WalkOptions::default())
            .expect("the walk succeeds");
        assert_eq!(names(&targets), ["a.md", "b.toml"]);
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

    #[test]
    fn an_explicitly_named_file_of_unknown_format_is_refused_by_name() {
        let tree = TempTree::new("walk-unknown");
        let file = tree.write("notes.rs", "// x");
        let error = collect(&[file], &WalkOptions::default()).expect_err("a refusal");
        assert!(error.contains("notes.rs"), "{error}");
        assert!(error.contains("no format could be inferred"), "{error}");
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

    #[test]
    fn naming_the_same_file_twice_examines_it_once() {
        let tree = TempTree::new("walk-dedupe");
        let file = tree.write("a.json", "{}");
        let targets =
            collect(&[file.clone(), file], &WalkOptions::default()).expect("the walk succeeds");
        assert_eq!(targets.len(), 1);
    }
}
