use std::fs::{self, Permissions};
use std::io;
use std::path::{Path, PathBuf};

use crate::atomic::{self, AtomicIo, Destination, RealIo};
use crate::error::{OpenError, WriteError};
use crate::names::is_windows_safe_segment;
use crate::path::ProjectRelPath;
use crate::target::check_target;

/// The name of the only folder the application may write inside a project.
pub const NOTEBOOK_DIR: &str = "_notebook";

/// A project folder opened for writing. Every write goes through this type,
/// which refuses any destination outside `_notebook/` (spec 6.5, P2).
#[derive(Debug, Clone)]
pub struct ProjectRoot {
    /// The resolved `_notebook` folder, which is never a link.
    pub(crate) notebook: PathBuf,
}

/// A write destination that passed every check.
pub(crate) struct Resolved {
    pub(crate) dir: PathBuf,
    pub(crate) name: String,
    pub(crate) permissions: Option<Permissions>,
}

impl ProjectRoot {
    /// Opens the project folder `root`, which must contain a real
    /// `_notebook` folder: not missing, not a file, not a link, and spelt
    /// exactly `_notebook`. A link would make "inside `_notebook/`" depend
    /// on somewhere else, so it is refused (P6, when unsure, read-only).
    pub fn open(root: &Path) -> Result<Self, OpenError> {
        let canonical_root = fs::canonicalize(root).map_err(|source| OpenError::Root {
            path: root.to_path_buf(),
            source,
        })?;
        let notebook = canonical_root.join(NOTEBOOK_DIR);
        let invalid = || OpenError::NotebookInvalid {
            path: root.to_path_buf(),
        };
        let resolved = fs::canonicalize(&notebook).map_err(|_| invalid())?;
        // Resolving a link, or the on-disk spelling of a case variant,
        // gives a different path from the one joined above.
        if resolved != notebook || !resolved.is_dir() {
            return Err(invalid());
        }
        Ok(Self { notebook })
    }

    /// The resolved `_notebook` folder.
    pub fn notebook_dir(&self) -> &Path {
        &self.notebook
    }

    /// Writes `contents` to `path` atomically: readers see the old file or
    /// the complete new one, never a partial file. Missing folders are
    /// created. The write is refused unless `path` is inside `_notebook/`
    /// once links are resolved.
    ///
    /// Blocks while a locked file is retried, for up to five seconds.
    pub fn write_atomic(&self, path: &ProjectRelPath, contents: &[u8]) -> Result<(), WriteError> {
        self.write_atomic_with(&mut RealIo, path, contents)
    }

    /// As [`ProjectRoot::write_atomic`], with the filesystem steps supplied
    /// by `io` so tests can inject failures.
    pub fn write_atomic_with<I: AtomicIo>(
        &self,
        io: &mut I,
        path: &ProjectRelPath,
        contents: &[u8],
    ) -> Result<(), WriteError> {
        let resolved = self.resolve(path)?;
        let destination = Destination {
            dir: &resolved.dir,
            name: &resolved.name,
            display: path.as_str(),
            permissions: resolved.permissions,
        };
        atomic::write(io, &destination, contents)
    }

    /// Creates the folder `path` and any missing parents, all inside
    /// `_notebook/`. Nothing is created unless the whole path resolves inside
    /// `_notebook/` once links are followed. An existing folder is left as it is.
    pub fn create_folder(&self, path: &ProjectRelPath) -> Result<(), WriteError> {
        self.resolve_folder(path).map(|_| ())
    }

    /// As [`ProjectRoot::create_folder`], returning where the folder is.
    /// Shared with capture, which places files in an already-confined
    /// `evidence/` or `methods/` folder.
    pub(crate) fn resolve_folder(&self, path: &ProjectRelPath) -> Result<PathBuf, WriteError> {
        let display = path.as_str();
        match path.segments().collect::<Vec<_>>().as_slice() {
            [first, folders @ ..] if *first == NOTEBOOK_DIR && !folders.is_empty() => {
                self.check_names(folders, display)?;
                self.confined_folder(folders, display)
            }
            _ => Err(WriteError::OutsideNotebook {
                path: display.to_owned(),
            }),
        }
    }

    /// Checks that `path` names a file inside `_notebook/` that may be
    /// replaced, creates its missing folders, and returns where it is.
    pub(crate) fn resolve(&self, path: &ProjectRelPath) -> Result<Resolved, WriteError> {
        let display = path.as_str();
        let segments: Vec<&str> = path.segments().collect();
        let (name, folders) = match segments.as_slice() {
            [first, rest @ .., name] if *first == NOTEBOOK_DIR => (*name, rest),
            _ => {
                return Err(WriteError::OutsideNotebook {
                    path: display.to_owned(),
                })
            }
        };
        self.check_names(&segments[1..], display)?;
        let dir = self.confined_folder(folders, display)?;
        let permissions = check_target(&dir, name, display)?;
        Ok(Resolved {
            dir,
            name: name.to_owned(),
            permissions,
        })
    }

    /// Refuses names Windows would treat as something else (spec 9.2).
    pub(crate) fn check_names(&self, segments: &[&str], display: &str) -> Result<(), WriteError> {
        if segments.iter().all(|s| is_windows_safe_segment(s)) {
            Ok(())
        } else {
            Err(WriteError::UnsafeName {
                path: display.to_owned(),
            })
        }
    }

    /// Creates the folder `_notebook/<folders...>` if missing and returns
    /// where it is, refusing it unless it lies inside `_notebook/`.
    pub(crate) fn confined_folder(
        &self,
        folders: &[&str],
        display: &str,
    ) -> Result<PathBuf, WriteError> {
        let mut folder = self.notebook.clone();
        folder.extend(folders);
        let escapes = || WriteError::EscapesNotebook {
            path: display.to_owned(),
        };
        let io_error = |operation, source| WriteError::Io {
            operation,
            path: display.to_owned(),
            source,
        };

        // Confine before creating anything: a link in the middle of the
        // path must not be followed to make folders outside `_notebook/`.
        match nearest_existing(&folder).map_err(|e| io_error("inspect", e))? {
            Some(existing) if self.is_inside(&existing) => {}
            _ => return Err(escapes()),
        }
        fs::create_dir_all(&folder).map_err(|e| io_error("create folder", e))?;
        // And again once created, in case something changed in between.
        let dir = fs::canonicalize(&folder).map_err(|e| io_error("inspect", e))?;
        if !self.is_inside(&dir) {
            return Err(escapes());
        }
        Ok(dir)
    }

    /// Whether the resolved path `resolved` lies inside `_notebook/`.
    pub(crate) fn is_inside(&self, resolved: &Path) -> bool {
        resolved.starts_with(&self.notebook)
    }
}

/// The resolved location of the deepest part of `folder` that exists, or
/// `None` when that part is a link that leads nowhere, which cannot be
/// confined.
fn nearest_existing(folder: &Path) -> io::Result<Option<PathBuf>> {
    let mut probe = folder;
    loop {
        match fs::symlink_metadata(probe) {
            Ok(_) => {
                return match fs::canonicalize(probe) {
                    Ok(resolved) => Ok(Some(resolved)),
                    Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
                    Err(e) => Err(e),
                };
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => match probe.parent() {
                Some(parent) => probe = parent,
                None => return Err(e),
            },
            Err(e) => return Err(e),
        }
    }
}
