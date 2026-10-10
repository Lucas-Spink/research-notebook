//! Bundles and archives (FR-ARC-08, ADR-0057): reading the files they hold,
//! and the one write the application makes outside a project.
//!
//! Reading never changes the project. The write is a new file in a folder the
//! person chose: never inside the project, never over an existing file, and
//! placed only once it is complete.

use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use crate::atomic::{self, Destination, RealIo};
use crate::error::ReadError;
use crate::names::{is_windows_safe, split_extension};
use crate::path::ProjectRelPath;
use crate::project::{ProjectRoot, NOTEBOOK_DIR};

/// How many numbered names are tried before giving up on a free one.
const NAME_ATTEMPTS: u32 = 1000;

/// Which files an archive holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveScope {
    /// `_notebook/` only: the notebook bundle.
    Notebook,
    /// The whole project folder: the full archive.
    Project,
}

/// One file an archive will hold.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArchiveFile {
    /// Project-relative, `/` separators, such as `_notebook/project.yaml`.
    pub path: String,
    pub size: u64,
    pub modified: Option<SystemTime>,
}

/// The files an archive will hold, in path order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArchiveListing {
    pub files: Vec<ArchiveFile>,
    /// Links and names that are not UTF-8, which are left out. A link may
    /// lead anywhere, so it is never followed.
    pub skipped: usize,
}

/// A file written outside the project.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Exported {
    /// The name it was given, which differs from the one asked for when that
    /// was taken.
    pub name: String,
    pub bytes: u64,
}

/// Why an export could not be placed.
#[derive(Debug, thiserror::Error)]
pub enum ExportError<E> {
    /// The destination does not exist or is not a folder.
    #[error("the destination is not a folder")]
    FolderInvalid,
    /// The destination is the project or lies within it (spec 6.5, P2).
    #[error("the destination is inside the project")]
    InsideProject,
    /// Not one ordinary file name that Windows accepts.
    #[error("the file name is not usable")]
    UnsafeName,
    /// No free name was found, or the file could not be created or placed.
    #[error("cannot {operation} the file: {source}")]
    Io {
        operation: &'static str,
        source: io::Error,
    },
    /// The producer failed; nothing was left in the folder.
    #[error("the file could not be produced")]
    Produce(E),
}

impl ProjectRoot {
    /// The project folder, which holds `_notebook/`.
    fn project_dir(&self) -> &Path {
        self.notebook.parent().unwrap_or(&self.notebook)
    }

    /// Lists the files an archive of `scope` holds. Reads only; a link is
    /// never followed. The project lock and the half-written temporary files
    /// of an atomic write are left out, because neither is part of the record.
    pub fn list_archive_files(&self, scope: ArchiveScope) -> Result<ArchiveListing, ReadError> {
        let (start, prefix) = match scope {
            ArchiveScope::Notebook => (self.notebook.clone(), NOTEBOOK_DIR.to_owned()),
            ArchiveScope::Project => (self.project_dir().to_path_buf(), String::new()),
        };
        let mut listing = ArchiveListing {
            files: Vec::new(),
            skipped: 0,
        };
        walk(&start, &prefix, &mut listing).map_err(|source| ReadError::Io {
            path: prefix.clone(),
            source,
        })?;
        listing.files.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(listing)
    }

    /// Opens a file of the project for reading. `path` must be a plain
    /// forward path below the project folder naming a file that is not a link,
    /// and not one `list_archive_files` leaves out.
    pub fn open_archive_file(&self, path: &str) -> Result<File, ReadError> {
        let invalid = || ReadError::NotAFile {
            path: path.to_owned(),
        };
        if path.contains('\\') || ProjectRelPath::parse(path).is_err() {
            return Err(invalid());
        }
        let segments: Vec<&str> = path.split('/').collect();
        if segments.last().is_some_and(|name| {
            is_left_out(name, segments.len() == 2 && segments[0] == NOTEBOOK_DIR)
        }) {
            return Err(invalid());
        }
        let on_disk = segments
            .iter()
            .fold(self.project_dir().to_path_buf(), |dir, s| dir.join(s));
        let io_error = |source| ReadError::Io {
            path: path.to_owned(),
            source,
        };
        let meta = fs::symlink_metadata(&on_disk).map_err(|source| match source.kind() {
            io::ErrorKind::NotFound => ReadError::Missing {
                path: path.to_owned(),
            },
            _ => io_error(source),
        })?;
        if !meta.is_file() {
            return Err(invalid());
        }
        // A link further up the path would lead outside the project.
        let resolved = fs::canonicalize(&on_disk).map_err(io_error)?;
        if !resolved.starts_with(self.project_dir()) {
            return Err(ReadError::EscapesNotebook {
                path: path.to_owned(),
            });
        }
        File::open(&resolved).map_err(io_error)
    }

    /// Writes a new file named `name` into `folder`, which must exist and lie
    /// outside the project. `produce` fills a temporary file made in `folder`;
    /// only if it succeeds is the file given its name. If `name` is taken the
    /// file is called `stem (2).ext`, `stem (3).ext`, and so on: nothing that
    /// is already there is replaced. A failure removes the temporary file.
    ///
    /// The check for a free name and the rename are two steps, so a file
    /// created by another program in between could be replaced; this is
    /// accepted because hard links, the alternative, are missing on the FAT
    /// and exFAT drives bundles are often copied to.
    pub fn write_new_outside<E, F>(
        &self,
        folder: &Path,
        name: &str,
        produce: F,
    ) -> Result<Exported, ExportError<E>>
    where
        F: FnOnce(&mut File) -> Result<(), E>,
    {
        if !is_plain_file_name(name) {
            return Err(ExportError::UnsafeName);
        }
        let folder = self.outside_folder(folder)?;
        let mut io = RealIo;
        let destination = Destination {
            dir: &folder,
            name,
            display: name,
            permissions: None,
        };
        let (temp, mut file) =
            atomic::create_temp(&mut io, &destination).map_err(|error| ExportError::Io {
                operation: "create",
                source: write_source(error),
            })?;
        let placed = produce(&mut file)
            .map_err(ExportError::Produce)
            .and_then(|()| {
                file.sync_all().map_err(|source| ExportError::Io {
                    operation: "flush",
                    source,
                })?;
                let bytes = file
                    .metadata()
                    .map_err(|source| ExportError::Io {
                        operation: "measure",
                        source,
                    })?
                    .len();
                // Closed before the rename, which Windows requires.
                drop(file);
                place(&temp, &folder, name, bytes)
            });
        if placed.is_err() {
            let _ = fs::remove_file(&temp);
        }
        placed
    }

    /// The resolved `folder`, refused unless it is an existing folder outside
    /// the project. Resolving first means a link into the project is caught.
    fn outside_folder<E>(&self, folder: &Path) -> Result<PathBuf, ExportError<E>> {
        let resolved = fs::canonicalize(folder).map_err(|_| ExportError::FolderInvalid)?;
        if !resolved.is_dir() {
            return Err(ExportError::FolderInvalid);
        }
        if resolved.starts_with(self.project_dir()) {
            return Err(ExportError::InsideProject);
        }
        Ok(resolved)
    }
}

/// Renames the finished temporary file to the first free name.
fn place<E>(
    temp: &Path,
    folder: &Path,
    name: &str,
    bytes: u64,
) -> Result<Exported, ExportError<E>> {
    let (stem, extension) = split_extension(name);
    for n in 1..=NAME_ATTEMPTS {
        let candidate = if n == 1 {
            name.to_owned()
        } else {
            format!("{stem} ({n}){extension}")
        };
        let target = folder.join(&candidate);
        match fs::symlink_metadata(&target) {
            Ok(_) => continue,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(source) => {
                return Err(ExportError::Io {
                    operation: "inspect",
                    source,
                })
            }
        }
        fs::rename(temp, &target).map_err(|source| ExportError::Io {
            operation: "place",
            source,
        })?;
        return Ok(Exported {
            name: candidate,
            bytes,
        });
    }
    Err(ExportError::Io {
        operation: "name",
        source: io::Error::other("no free name"),
    })
}

fn write_source(error: crate::error::WriteError) -> io::Error {
    match error {
        crate::error::WriteError::Io { source, .. } => source,
        other => io::Error::other(other.to_string()),
    }
}

/// One file name, not hidden, that Windows treats as an ordinary file.
fn is_plain_file_name(name: &str) -> bool {
    !name.starts_with('.') && !name.contains(['/', '\\']) && is_windows_safe(name)
}

/// The lock and the temporary files of an atomic write.
fn is_left_out(name: &str, directly_in_notebook: bool) -> bool {
    (directly_in_notebook && name == ".lock") || (name.starts_with('.') && name.ends_with(".tmp"))
}

fn walk(dir: &Path, prefix: &str, listing: &mut ArchiveListing) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            listing.skipped += 1;
            continue;
        };
        let relative = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            listing.skipped += 1;
        } else if kind.is_dir() {
            walk(&entry.path(), &relative, listing)?;
        } else if kind.is_file() {
            if is_left_out(&name, relative == format!("{NOTEBOOK_DIR}/{name}")) {
                continue;
            }
            let meta = entry.metadata()?;
            listing.files.push(ArchiveFile {
                path: relative,
                size: meta.len(),
                modified: meta.modified().ok(),
            });
        }
    }
    Ok(())
}
