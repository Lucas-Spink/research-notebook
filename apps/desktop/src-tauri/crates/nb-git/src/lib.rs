//! Spike for S1-T09: reads git provenance for a captured file using gix
//! (spec 7.4, FR-EVD-12). Validated against real temporary repositories
//! that gix alone is sufficient for HEAD commit, file-dirty and
//! tree-dirty detection — no git CLI fallback is needed for this. The
//! CLI fallback named in spec 6.1 stays relevant for unrelated future
//! needs (e.g. `git bundle` in S6-T04), which gix does not implement.
//!
//! This is spike evidence, not the production client. In particular,
//! `repo_root` is returned absolute: turning it into the project-relative
//! `repo` field from spec 5.8 needs the project root, which is the future
//! caller's (nb-fs capture code's) context, not this crate's.

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
