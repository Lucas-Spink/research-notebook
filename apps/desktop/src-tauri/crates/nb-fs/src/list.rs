//! Listing which question files and experiment folders a project has, so the
//! webview can read them one by one (ADR-0026). Only the names come from
//! here; the files are read with [`ProjectRoot::read_data_file`] and parsed by
//! `packages/format`, the only parser (AGENTS.md rule 2).

use std::fs;
use std::io;
use std::path::Path;

use crate::error::ReadError;
use crate::project::{ProjectRoot, NOTEBOOK_DIR};

/// The question files and experiment folders found in `_notebook/`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotebookListing {
    /// Names of the `.md` files in `questions/`, such as `Q-001.md`, sorted.
    pub question_files: Vec<String>,
    /// Names of the folders in `experiments/`, such as `EXP-001`, sorted. A
    /// folder is listed even if it holds no `experiment.md`, because its name
    /// still occupies a ref that must not be given out again (FR-EXP-03).
    pub experiment_folders: Vec<String>,
}

impl ProjectRoot {
    /// Lists the question files and experiment folders, without reading them.
    ///
    /// Hidden names (the dot-prefixed temporary files of an atomic write), files
    /// that are not `.md`, and names that are not UTF-8 are skipped. A link is
    /// never followed or listed, so nothing outside `_notebook/` is reached.
    /// Evidence, history, the trash and backups are not walked. This is the
    /// set the watcher reports and `nb-index` scans. Never writes.
    pub fn list_notebook(&self) -> Result<NotebookListing, ReadError> {
        let mut question_files = names_in(&self.notebook.join("questions"), "questions", |kind| {
            kind.is_file()
        })?;
        question_files.retain(|name| name.ends_with(".md"));
        let experiment_folders =
            names_in(&self.notebook.join("experiments"), "experiments", |kind| {
                kind.is_dir()
            })?;
        Ok(NotebookListing {
            question_files,
            experiment_folders,
        })
    }
}

/// The sorted visible UTF-8 names in `dir` whose type (a link is neither a
/// file nor a folder here) satisfies `wanted`. A missing folder, or a file or
/// link in its place, has none.
fn names_in(
    dir: &Path,
    display: &str,
    wanted: impl Fn(fs::FileType) -> bool,
) -> Result<Vec<String>, ReadError> {
    let io_error = |source: io::Error| ReadError::Io {
        path: format!("{NOTEBOOK_DIR}/{display}"),
        source,
    };
    match fs::symlink_metadata(dir) {
        Ok(meta) if meta.is_dir() => {}
        Ok(_) => return Ok(Vec::new()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(io_error(e)),
    }
    let mut names = Vec::new();
    for entry in fs::read_dir(dir).map_err(io_error)? {
        let entry = entry.map_err(io_error)?;
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        // `DirEntry::file_type` does not follow links.
        let kind = entry.file_type().map_err(io_error)?;
        if !name.starts_with('.') && wanted(kind) {
            names.push(name);
        }
    }
    names.sort();
    Ok(names)
}
