//! Moving deleted files and folders to `.trash/` (spec 5.11, FR-EXP-06,
//! FR-EVD-10, ADR-0025). Nothing is ever removed from the trash here.

use std::fs;
use std::io;
use std::path::PathBuf;

use crate::atomic::{replace, Destination};
use crate::clock::Clock;
use crate::error::WriteError;
use crate::history::Snapshot;
use crate::lock::Timestamp;
use crate::path::ProjectRelPath;
use crate::project::{ProjectRoot, NOTEBOOK_DIR};
use crate::RealIo;

/// Where trashed files go, inside `_notebook/` (spec 5.11).
const TRASH_DIR: &str = ".trash";
/// How many deletions of one path may share a second before giving up.
const MAX_SAME_SECOND: u32 = 10_000;
/// Files at the top of `_notebook/` that are never trashed: without them the
/// project is not a project.
const KEPT_FILES: [&str; 2] = ["project.yaml", "bibliography.json"];
/// Top-level names that are the application's own state, never trashed.
const KEPT_FOLDERS: [&str; 4] = [".lock", ".history", ".trash", "backups"];

/// Where a trashed file or folder went.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Trashed {
    /// The project-relative path it now has, under `_notebook/.trash/`.
    pub location: String,
}

/// Whether the path (split into segments, relative to `_notebook/`) may be
/// trashed. Compared without regard to case, because on Windows and macOS
/// `.TRASH` is `.trash`.
fn is_trashable(segments: &[&str]) -> bool {
    let is = |name: &str, kept: &[&str]| kept.iter().any(|k| k.eq_ignore_ascii_case(name));
    match segments {
        [] => false,
        [only] if is(only, &KEPT_FILES) => false,
        [first, ..] if is(first, &KEPT_FOLDERS) => false,
        _ => true,
    }
}

impl ProjectRoot {
    /// Moves the file or folder `path` to `_notebook/.trash/<timestamp>/<its
    /// path relative to _notebook>`. Recoverable by moving it back; emptied
    /// only by an explicit user action, which this crate does not offer yet.
    ///
    /// A link is never followed or moved, and neither is anything reached
    /// through one. Two deletions of one path in one second go to
    /// `<timestamp>-2` and so on, so nothing in the trash is replaced.
    pub fn move_to_trash(
        &self,
        path: &ProjectRelPath,
        clock: &impl Clock,
    ) -> Result<Trashed, WriteError> {
        let display = path.as_str();
        let segments: Vec<&str> = path.segments().collect();
        let inside = match segments.as_slice() {
            [first, rest @ ..] if *first == NOTEBOOK_DIR => rest,
            _ => {
                return Err(WriteError::OutsideNotebook {
                    path: display.to_owned(),
                })
            }
        };
        if !is_trashable(inside) {
            return Err(WriteError::NotTrashable {
                path: display.to_owned(),
            });
        }
        self.check_names(inside, display)?;
        let Some((name, parents)) = inside.split_last() else {
            return Err(WriteError::NotTrashable {
                path: display.to_owned(),
            });
        };

        let source = self.existing_unlinked(parents, name, display)?;
        let relative = inside.join("/");
        let folder = self.free_trash_folder(clock.now(), &relative, display)?;
        let mut folders = vec![TRASH_DIR, folder.as_str()];
        folders.extend(parents);
        let target_dir = self.confined_folder(&folders, display)?;
        let destination = Destination {
            dir: &target_dir,
            name,
            display,
            permissions: None,
        };
        replace(&mut RealIo, &source, &target_dir.join(name), &destination)?;
        Ok(Trashed {
            location: format!("{NOTEBOOK_DIR}/{TRASH_DIR}/{folder}/{relative}"),
        })
    }

    /// Where the file or folder `name` in `_notebook/<parents>` is, checking
    /// it exists, is not itself a link, and is not reached through one.
    fn existing_unlinked(
        &self,
        parents: &[&str],
        name: &str,
        display: &str,
    ) -> Result<PathBuf, WriteError> {
        let io_error = |source| WriteError::Io {
            operation: "inspect",
            path: display.to_owned(),
            source,
        };
        let missing = || WriteError::Missing {
            path: display.to_owned(),
        };
        let mut parent = self.notebook.clone();
        parent.extend(parents);
        let parent = match fs::canonicalize(&parent) {
            Ok(resolved) => resolved,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Err(missing()),
            Err(e) => return Err(io_error(e)),
        };
        if !self.is_inside(&parent) {
            return Err(WriteError::EscapesNotebook {
                path: display.to_owned(),
            });
        }
        let source = parent.join(name);
        match fs::symlink_metadata(&source) {
            Ok(meta) if meta.file_type().is_symlink() => Err(WriteError::TargetIsLink {
                path: display.to_owned(),
            }),
            Ok(_) => Ok(source),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Err(missing()),
            Err(e) => Err(io_error(e)),
        }
    }

    /// The name of the folder under `.trash/` in which `relative` can go
    /// without replacing anything: the stamp, or the stamp with a suffix if
    /// the same path was already trashed in this second.
    fn free_trash_folder(
        &self,
        now: Timestamp,
        relative: &str,
        display: &str,
    ) -> Result<String, WriteError> {
        for seq in 1..=MAX_SAME_SECOND {
            let folder = Snapshot { at: now, seq }.file_stem();
            let candidate = self.notebook.join(TRASH_DIR).join(&folder).join(relative);
            match fs::symlink_metadata(&candidate) {
                Ok(_) => {}
                Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(folder),
                Err(source) => {
                    return Err(WriteError::Io {
                        operation: "inspect",
                        path: display.to_owned(),
                        source,
                    })
                }
            }
        }
        Err(WriteError::Io {
            operation: "name a trash folder for",
            path: display.to_owned(),
            source: io::Error::other("too many deletions in one second"),
        })
    }
}
