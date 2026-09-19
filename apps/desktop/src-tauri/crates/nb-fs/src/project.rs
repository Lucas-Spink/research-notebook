use std::fs::{self, Permissions};
use std::io;
use std::path::{Path, PathBuf};

use crate::atomic::{self, AtomicIo, Destination, RealIo};
use crate::error::{OpenError, WriteError};
use crate::names::is_windows_safe_segment;
use crate::path::ProjectRelPath;

/// The name of the only folder the application may write inside a project.
pub const NOTEBOOK_DIR: &str = "_notebook";

/// A project folder opened for writing. Every write goes through this type,
/// which refuses any destination outside `_notebook/` (spec 6.5, P2).
#[derive(Debug, Clone)]
pub struct ProjectRoot {
    /// The resolved `_notebook` folder, which is never a link.
    notebook: PathBuf,
}

/// A write destination that passed every check.
struct Resolved {
    dir: PathBuf,
    name: String,
    permissions: Option<Permissions>,
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

    /// Checks that `path` names a file inside `_notebook/` that may be
    /// replaced, creates its missing folders, and returns where it is.
    fn resolve(&self, path: &ProjectRelPath) -> Result<Resolved, WriteError> {
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
        if !segments[1..].iter().all(|s| is_windows_safe_segment(s)) {
            return Err(WriteError::UnsafeName {
                path: display.to_owned(),
            });
        }

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

        let target = dir.join(name);
        let permissions = match fs::symlink_metadata(&target) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err(WriteError::TargetIsLink {
                    path: display.to_owned(),
                })
            }
            Ok(meta) if meta.is_dir() => {
                return Err(WriteError::TargetIsDirectory {
                    path: display.to_owned(),
                })
            }
            Ok(meta) if meta.permissions().readonly() => {
                return Err(WriteError::ReadOnly {
                    path: display.to_owned(),
                })
            }
            Ok(meta) => Some(meta.permissions()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => None,
            Err(e) => return Err(io_error("inspect", e)),
        };
        Ok(Resolved {
            dir,
            name: name.to_owned(),
            permissions,
        })
    }

    /// Whether the resolved path `resolved` lies inside `_notebook/`.
    fn is_inside(&self, resolved: &Path) -> bool {
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
