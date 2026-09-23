//! Reads git provenance for a captured file using gix (spec 7.4, FR-EVD-12,
//! ADR-0018, ADR-0032). Validated against real temporary repositories that
//! gix alone is sufficient for HEAD commit, file-dirty and tree-dirty
//! detection — no git CLI fallback is needed for this. The CLI fallback
//! named in spec 6.1 stays relevant for unrelated future needs (e.g. `git
//! bundle` in S6-T04), which gix does not implement.
//!
//! [`provenance_for_path`] is the S1-T09 spike primitive: an absolute
//! `repo_root`. [`provenance_in_project`] is what a capture caller actually
//! wants — spec 5.8's `provenance` object, with `repo` already expressed
//! relative to the project root.

use std::path::{Path, PathBuf};

use gix::bstr::BString;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitProvenance {
    /// Absolute path to the repository's working tree root.
    pub repo_root: PathBuf,
    /// 40-character hexadecimal HEAD commit SHA.
    pub commit: String,
    /// Forward-slash path of the file relative to `repo_root`.
    pub path_in_repo: String,
    /// Whether this specific file differs from HEAD (working tree or index).
    pub file_dirty: bool,
    /// Whether the repository has any uncommitted change to a tracked file.
    /// Matches gix's `is_dirty()`: untracked files do not count.
    pub tree_dirty: bool,
}

// gix's own error types are large (hundreds of bytes); boxing keeps
// GitProvenanceError itself small, per clippy::result_large_err.
#[derive(Debug, thiserror::Error)]
pub enum GitProvenanceError {
    #[error("git repository has no working tree")]
    BareRepository,
    #[error("path is not inside the discovered repository's working tree")]
    PathOutsideWorkdir,
    #[error("failed to canonicalise a path: {0}")]
    Canonicalize(#[from] std::io::Error),
    #[error("failed to open the repository: {0}")]
    Open(Box<gix::open::Error>),
    #[error("failed to read HEAD: {0}")]
    HeadId(Box<gix::reference::head_id::Error>),
    #[error("failed to compute repository status: {0}")]
    Status(Box<gix::status::Error>),
    #[error("failed to compute repository status: {0}")]
    IsDirty(Box<gix::status::is_dirty::Error>),
    #[error("failed to scope the status walk to one path: {0}")]
    IntoIter(Box<gix::status::into_iter::Error>),
    #[error("failed to read a status entry: {0}")]
    StatusEntry(Box<gix::status::iter::Error>),
}

impl From<gix::open::Error> for GitProvenanceError {
    fn from(err: gix::open::Error) -> Self {
        Self::Open(Box::new(err))
    }
}

impl From<gix::reference::head_id::Error> for GitProvenanceError {
    fn from(err: gix::reference::head_id::Error) -> Self {
        Self::HeadId(Box::new(err))
    }
}

impl From<gix::status::Error> for GitProvenanceError {
    fn from(err: gix::status::Error) -> Self {
        Self::Status(Box::new(err))
    }
}

impl From<gix::status::is_dirty::Error> for GitProvenanceError {
    fn from(err: gix::status::is_dirty::Error) -> Self {
        Self::IsDirty(Box::new(err))
    }
}

impl From<gix::status::into_iter::Error> for GitProvenanceError {
    fn from(err: gix::status::into_iter::Error) -> Self {
        Self::IntoIter(Box::new(err))
    }
}

impl From<gix::status::iter::Error> for GitProvenanceError {
    fn from(err: gix::status::iter::Error) -> Self {
        Self::StatusEntry(Box::new(err))
    }
}

/// Git provenance for `file_path`, or `None` if it is not inside a git
/// repository (FR-EVD-12: provenance is recorded only "when the source
/// lies in a repository"). `file_path` must be absolute.
pub fn provenance_for_path(file_path: &Path) -> Result<Option<GitProvenance>, GitProvenanceError> {
    let file_path = file_path.canonicalize()?;
    let start_dir = file_path
        .parent()
        .ok_or(GitProvenanceError::PathOutsideWorkdir)?;

    let repo = match gix::discover(start_dir) {
        Ok(repo) => repo,
        Err(_) => return Ok(None),
    };

    let repo_root = repo.workdir().ok_or(GitProvenanceError::BareRepository)?;
    let repo_root = repo_root.canonicalize()?;

    let relative = file_path
        .strip_prefix(&repo_root)
        .map_err(|_| GitProvenanceError::PathOutsideWorkdir)?;
    let path_in_repo = relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");

    let commit = repo.head_id()?.to_string();
    let tree_dirty = repo.is_dirty()?;

    let pattern = BString::from(path_in_repo.as_str());
    let status_items = repo
        .status(gix::progress::Discard)?
        .into_iter([pattern])?
        .collect::<Result<Vec<_>, _>>()?;
    let file_dirty = !status_items.is_empty();

    Ok(Some(GitProvenance {
        repo_root,
        commit,
        path_in_repo,
        file_dirty,
        tree_dirty,
    }))
}

/// Git provenance for `file_path` as spec 5.8's `provenance` object stores
/// it, with `repo` expressed relative to `project_root` rather than
/// absolute.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Provenance {
    /// The repository root, forward-slash relative to `project_root`, or
    /// `"."` when they are the same path.
    pub repo: String,
    /// 40-character hexadecimal HEAD commit SHA.
    pub commit: String,
    /// Forward-slash path of the file relative to the repository root.
    pub path_in_repo: String,
    pub file_dirty: bool,
    pub tree_dirty: bool,
}

/// `repo_root` expressed relative to `project_root` (spec 5.8
/// `provenance.repo`): `"."` when they are the same path, a forward-slash
/// relative path when `repo_root` is a descendant of `project_root`, or
/// `None` when it cannot be expressed as a forward-only relative path —
/// spec 5.2's `path` type forbids `..` segments, which is what a repository
/// that contains the project root, or one unrelated to it entirely, would
/// need (ADR-0032). Both paths must already be in the same form (both
/// canonicalised, or neither).
fn repo_relative_to_project(repo_root: &Path, project_root: &Path) -> Option<String> {
    let relative = repo_root.strip_prefix(project_root).ok()?;
    if relative.as_os_str().is_empty() {
        return Some(".".to_owned());
    }
    Some(
        relative
            .components()
            .map(|component| component.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/"),
    )
}

/// Git provenance for `file_path` (FR-EVD-12, ADR-0032), the caller ADR-0018
/// deferred the project-relative `repo` field to: `None` when the file is
/// not inside a git repository, or when the repository's root is not the
/// project root or a descendant of it (see [`repo_relative_to_project`]).
/// `file_path` and `project_root` must both be absolute.
pub fn provenance_in_project(
    file_path: &Path,
    project_root: &Path,
) -> Result<Option<Provenance>, GitProvenanceError> {
    let Some(found) = provenance_for_path(file_path)? else {
        return Ok(None);
    };
    let project_root = project_root.canonicalize()?;
    let Some(repo) = repo_relative_to_project(&found.repo_root, &project_root) else {
        return Ok(None);
    };
    Ok(Some(Provenance {
        repo,
        commit: found.commit,
        path_in_repo: found.path_in_repo,
        file_dirty: found.file_dirty,
        tree_dirty: found.tree_dirty,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    use proptest::prelude::*;

    #[test]
    fn the_same_path_is_a_dot() {
        let root = Path::new("/a/b/c");
        assert_eq!(repo_relative_to_project(root, root), Some(".".to_owned()));
    }

    #[test]
    fn a_descendant_is_a_forward_slash_relative_path() {
        let project_root = Path::new("/a/b");
        let repo_root = Path::new("/a/b/vendor/analysis-repo");
        assert_eq!(
            repo_relative_to_project(repo_root, project_root),
            Some("vendor/analysis-repo".to_owned()),
        );
    }

    #[test]
    fn an_ancestor_of_the_project_root_is_not_expressible() {
        let project_root = Path::new("/a/b/my-project");
        let repo_root = Path::new("/a/b");
        assert_eq!(repo_relative_to_project(repo_root, project_root), None);
    }

    #[test]
    fn an_unrelated_path_is_not_expressible() {
        let project_root = Path::new("/a/b");
        let repo_root = Path::new("/x/y");
        assert_eq!(repo_relative_to_project(repo_root, project_root), None);
    }

    fn segment() -> impl Strategy<Value = String> {
        "[a-zA-Z0-9_-]{1,8}"
    }

    proptest! {
        /// Whatever the project root, a repository root built by appending
        /// more segments to it always comes back as those segments joined
        /// with `/`, regardless of how deep the project root itself is.
        #[test]
        fn a_descendant_always_round_trips_its_own_suffix(
            base_segments in prop::collection::vec(segment(), 0..5),
            suffix_segments in prop::collection::vec(segment(), 1..5),
        ) {
            let mut project_root = PathBuf::from("/root");
            for segment in &base_segments {
                project_root.push(segment);
            }
            let mut repo_root = project_root.clone();
            for segment in &suffix_segments {
                repo_root.push(segment);
            }

            let expected = suffix_segments.join("/");
            prop_assert_eq!(
                repo_relative_to_project(&repo_root, &project_root),
                Some(expected)
            );
        }

        /// A repository root that is a strict ancestor of the project root
        /// (one or more segments removed) is never expressible.
        #[test]
        fn a_strict_ancestor_is_never_expressible(
            base_segments in prop::collection::vec(segment(), 1..5),
            extra_segments in prop::collection::vec(segment(), 1..5),
        ) {
            let mut repo_root = PathBuf::from("/root");
            for segment in &base_segments {
                repo_root.push(segment);
            }
            let mut project_root = repo_root.clone();
            for segment in &extra_segments {
                project_root.push(segment);
            }

            prop_assert_eq!(repo_relative_to_project(&repo_root, &project_root), None);
        }
    }
}
