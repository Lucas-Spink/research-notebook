//! Git bundles of the repositories provenance references (FR-ARC-04,
//! ADR-0053). Each bundle is made by `nb-git` into a temporary file that
//! `nb-fs` hands out inside `_notebook/exports/git/`, checked by git, and
//! only then put in place. The repositories are only read.

use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

use nb_fs::{ProjectRelPath, ProjectRoot, StageError};
use nb_git::BundleError;

/// The folder bundles go in, inside `_notebook/`.
const BUNDLE_DIR: &str = "_notebook/exports/git";
/// Longest repository name kept in a file name, so the path stays legal.
const NAME_CHARS: usize = 100;

/// What happened to one repository. Carries no system text: a message from
/// git may name paths the person did not ask about.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BundleVerdict {
    /// Bundled and accepted by `git bundle verify`.
    Written {
        /// Project-relative, beginning `_notebook/`.
        file: String,
        bytes: u64,
    },
    /// The `git` program could not be started.
    GitMissing,
    /// The path is not the root of a git repository, or nothing is there.
    NotARepository,
    /// HEAD points at no commit.
    NoCommits,
    /// The path is not a folder inside the project.
    Refused,
    /// Git failed, or did not accept what it made. The old bundle is kept.
    Failed,
    /// The bundle could not be placed in `_notebook/exports/git/`.
    WriteFailed,
}

/// Writes one bundle for each of `repos`, in order, and says what happened to
/// each. A repository that cannot be bundled never stops the others. `repos`
/// are `.` or project-relative folders, as provenance records them. A re-run
/// replaces the last bundle of the same repository.
pub fn write_git_bundles(root: &ProjectRoot, repos: &[String]) -> Vec<BundleVerdict> {
    write_git_bundles_with(OsStr::new("git"), root, repos)
}

/// As [`write_git_bundles`], naming the `git` program so a test can use one
/// that is not installed.
pub fn write_git_bundles_with(
    git: &OsStr,
    root: &ProjectRoot,
    repos: &[String],
) -> Vec<BundleVerdict> {
    let mut taken = HashSet::new();
    repos
        .iter()
        .map(|repo| bundle_one(git, root, repo, &mut taken))
        .collect()
}

fn bundle_one(
    git: &OsStr,
    root: &ProjectRoot,
    repo: &str,
    taken: &mut HashSet<String>,
) -> BundleVerdict {
    let Some(folder) = repository_folder(root, repo) else {
        return BundleVerdict::Refused;
    };
    let file = format!("{BUNDLE_DIR}/{}.bundle", unique_name(repo, taken));
    let Ok(destination) = ProjectRelPath::parse(&file) else {
        return BundleVerdict::WriteFailed;
    };
    let mut bytes = 0;
    let placed = root.write_via_temp(&destination, |temp| {
        nb_git::create_bundle_with(git, &folder, temp)?;
        // Read after git has finished with the file.
        bytes = fs::metadata(temp).map_or(0, |m| m.len());
        Ok::<(), BundleError>(())
    });
    match placed {
        Ok(()) => BundleVerdict::Written { file, bytes },
        Err(StageError::Write(_)) => BundleVerdict::WriteFailed,
        Err(StageError::Produce(error)) => match error {
            BundleError::GitMissing => BundleVerdict::GitMissing,
            BundleError::NotARepository => BundleVerdict::NotARepository,
            BundleError::NoCommits => BundleVerdict::NoCommits,
            BundleError::Failed(_) | BundleError::VerifyFailed(_) => BundleVerdict::Failed,
        },
    }
}

/// Where `repo` is, if it names a folder inside the project. Provenance only
/// records `.` or a forward-only path (spec 5.8), so anything else, and any
/// link that leads out of the project, is refused rather than followed.
fn repository_folder(root: &ProjectRoot, repo: &str) -> Option<PathBuf> {
    let project = root.notebook_dir().parent()?;
    if repo == "." {
        return Some(project.to_path_buf());
    }
    let rel = ProjectRelPath::parse(repo).ok()?;
    let folder = project.join(rel.as_str());
    match fs::canonicalize(&folder) {
        Ok(resolved) if inside(&resolved, project) => Some(folder),
        // Nothing there: let git say it is not a repository.
        Err(_) => Some(folder),
        Ok(_) => None,
    }
}

fn inside(resolved: &Path, project: &Path) -> bool {
    fs::canonicalize(project).is_ok_and(|project| resolved.starts_with(project))
}

/// A file name for `repo` that no earlier repository in this run has taken.
/// `.` is `root`; `a/b` is `a-b`; characters a file name should not hold
/// become `_`. Two repositories that would share a name get `-2`, `-3`, ….
fn unique_name(repo: &str, taken: &mut HashSet<String>) -> String {
    let base = if repo == "." {
        "root".to_owned()
    } else {
        let joined: String = repo
            .split('/')
            .collect::<Vec<_>>()
            .join("-")
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                    c
                } else {
                    '_'
                }
            })
            .take(NAME_CHARS)
            .collect();
        // A leading dot would hide the file.
        joined.trim_start_matches('.').to_owned()
    };
    let base = if base.is_empty() {
        "repository".to_owned()
    } else {
        base
    };
    let mut name = base.clone();
    let mut n = 2;
    while !taken.insert(name.to_lowercase()) {
        name = format!("{base}-{n}");
        n += 1;
    }
    name
}
