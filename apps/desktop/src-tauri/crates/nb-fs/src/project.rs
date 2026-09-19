use std::path::{Path, PathBuf};

use crate::atomic::{AtomicIo, RealIo};
use crate::error::{OpenError, WriteError};
use crate::path::ProjectRelPath;

/// The name of the only folder the application may write inside a project.
pub const NOTEBOOK_DIR: &str = "_notebook";

/// A project folder opened for writing. Every write goes through this type,
/// which refuses any destination outside `_notebook/` (spec 6.5, P2).
#[derive(Debug, Clone)]
pub struct ProjectRoot {
    notebook: PathBuf,
}

impl ProjectRoot {
    /// Opens the project folder `root`, which must contain a real
    /// `_notebook` folder (not a link).
    pub fn open(root: &Path) -> Result<Self, OpenError> {
        Err(OpenError::NotebookInvalid {
            path: root.to_path_buf(),
        })
    }

    /// The resolved `_notebook` folder.
    pub fn notebook_dir(&self) -> &Path {
        &self.notebook
    }

    /// Writes `contents` to `path` atomically: readers see the old file or
    /// the complete new one, never a partial file.
    pub fn write_atomic(&self, path: &ProjectRelPath, contents: &[u8]) -> Result<(), WriteError> {
        self.write_atomic_with(&mut RealIo, path, contents)
    }

    /// As [`ProjectRoot::write_atomic`], with the filesystem steps supplied
    /// by `io` so tests can inject failures.
    pub fn write_atomic_with<I: AtomicIo>(
        &self,
        _io: &mut I,
        path: &ProjectRelPath,
        _contents: &[u8],
    ) -> Result<(), WriteError> {
        Err(WriteError::Io {
            operation: "write",
            path: path.to_string(),
            source: std::io::Error::other("not implemented"),
        })
    }
}
