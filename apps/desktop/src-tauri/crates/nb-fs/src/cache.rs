//! The application cache folder (spec 9.4), such as
//! `%LOCALAPPDATA%\<app id>\cache`. It holds derived data only (the index and
//! thumbnails), so losing it loses nothing. Like the settings folder it lies
//! outside every project; the spec lets `nb-fs` delete in it (spec 6.3).
//!
//! The index (`nb-index`) writes its own database through SQLite and asks
//! for removal only to discard a database it cannot read (ADR-0023). The
//! thumbnail cache (`nb-preview`) keeps its files in a child folder and
//! writes, lists, touches and removes them here (ADR-0037). Every operation
//! names one plain file in one folder, so none can reach outside the cache.

use std::fs::{self, File};
use std::io;
use std::path::PathBuf;
use std::time::SystemTime;

use crate::atomic::{self, Destination, RealIo};
use crate::target::check_target;
use crate::WriteError;

/// Why the cache folder could not be prepared or a file in it removed.
#[derive(Debug, thiserror::Error)]
pub enum CacheError {
    /// The name is empty, hidden, a path or contains a control character, so
    /// it could name something outside the cache folder.
    #[error("`{name}` is not a plain file name")]
    InvalidName { name: String },
    #[error("`{name}` in the cache is not a file")]
    NotAFile { name: String },
    #[error("`{name}` is not in the cache")]
    Missing { name: String },
    #[error("cannot write `{name}` in the cache: {source}")]
    Write { name: String, source: WriteError },
    #[error("cannot {operation} `{name}` in the cache: {source}")]
    Io {
        operation: &'static str,
        name: String,
        source: io::Error,
    },
}

/// A plain file in a cache folder, as [`CacheDir::list_files`] found it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CacheFile {
    pub name: String,
    pub size: u64,
    pub modified: SystemTime,
}

/// The cache folder. It need not exist yet.
#[derive(Debug, Clone)]
pub struct CacheDir {
    dir: PathBuf,
}

impl CacheDir {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    /// Where a file of the cache lives. Reading is not restricted.
    pub fn path_of(&self, name: &str) -> Result<PathBuf, CacheError> {
        check_name(name)?;
        Ok(self.dir.join(name))
    }

    /// Creates the folder and any missing parents. An existing folder is left
    /// as it is.
    pub fn ensure(&self) -> Result<(), CacheError> {
        fs::create_dir_all(&self.dir).map_err(|source| CacheError::Io {
            operation: "create the folder",
            name: String::new(),
            source,
        })
    }

    /// A child folder of this one, such as `thumbnails`. It need not exist
    /// yet; [`CacheDir::ensure`] on it creates it.
    pub fn subdir(&self, name: &str) -> Result<CacheDir, CacheError> {
        Ok(CacheDir::new(self.path_of(name)?))
    }

    /// Writes one file of the cache atomically, replacing an existing file.
    /// A folder or link of that name is refused. The folder must exist.
    pub fn write_file(&self, name: &str, contents: &[u8]) -> Result<(), CacheError> {
        check_name(name)?;
        let write_error = |source| CacheError::Write {
            name: name.to_owned(),
            source,
        };
        let permissions = check_target(&self.dir, name, name).map_err(write_error)?;
        let destination = Destination {
            dir: &self.dir,
            name,
            display: name,
            permissions,
        };
        atomic::write(&mut RealIo, &destination, contents).map_err(write_error)
    }

    /// The plain files directly in this folder with their size and
    /// modification time. Folders, links and names [`CacheDir::path_of`]
    /// would refuse, such as the hidden temporary files of an unfinished
    /// write, are left out. A folder that does not exist has no files.
    pub fn list_files(&self) -> Result<Vec<CacheFile>, CacheError> {
        let io_error = |source| CacheError::Io {
            operation: "list",
            name: String::new(),
            source,
        };
        let entries = match fs::read_dir(&self.dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(io_error(e)),
        };
        let mut files = Vec::new();
        for entry in entries {
            let entry = entry.map_err(io_error)?;
            let Ok(name) = entry.file_name().into_string() else {
                continue;
            };
            if check_name(&name).is_err() {
                continue;
            }
            // `DirEntry::metadata` does not follow links, so a link is not a file.
            match entry.metadata() {
                Ok(meta) if meta.is_file() => files.push(CacheFile {
                    name,
                    size: meta.len(),
                    modified: meta.modified().map_err(io_error)?,
                }),
                Ok(_) => {}
                // Removed between listing and inspecting it.
                Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                Err(e) => return Err(io_error(e)),
            }
        }
        Ok(files)
    }

    /// Sets the modification time of one file of the cache, leaving its
    /// bytes alone. The thumbnail cache records use this way, so the least
    /// recently used order survives a restart.
    pub fn touch(&self, name: &str, at: SystemTime) -> Result<(), CacheError> {
        let path = self.path_of(name)?;
        let io_error = |source| CacheError::Io {
            operation: "touch",
            name: name.to_owned(),
            source,
        };
        let missing = || CacheError::Missing {
            name: name.to_owned(),
        };
        match fs::symlink_metadata(&path) {
            Ok(meta) if meta.is_file() => {}
            Ok(_) => {
                return Err(CacheError::NotAFile {
                    name: name.to_owned(),
                })
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Err(missing()),
            Err(e) => return Err(io_error(e)),
        }
        // Opened for writing only because setting the time needs it; nothing
        // is truncated or written.
        let file = match File::options().write(true).open(&path) {
            Ok(file) => file,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Err(missing()),
            Err(e) => return Err(io_error(e)),
        };
        file.set_modified(at).map_err(io_error)
    }

    /// Removes one file of the cache. A file that is already gone counts as
    /// removed. A folder or a link is refused, so a link cannot make this
    /// delete something elsewhere.
    pub fn remove_file(&self, name: &str) -> Result<(), CacheError> {
        let path = self.path_of(name)?;
        let io_error = |source| CacheError::Io {
            operation: "remove",
            name: name.to_owned(),
            source,
        };
        match fs::symlink_metadata(&path) {
            Ok(meta) if meta.is_file() => fs::remove_file(&path).map_err(io_error),
            Ok(_) => Err(CacheError::NotAFile {
                name: name.to_owned(),
            }),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(io_error(e)),
        }
    }
}

/// One plain, visible file name: no separator of either kind, no drive
/// letter, no `.` or `..`, no leading dot and no control character.
fn check_name(name: &str) -> Result<(), CacheError> {
    let bad = name.is_empty()
        || name.starts_with('.')
        || name
            .chars()
            .any(|c| c.is_control() || matches!(c, '/' | '\\' | ':'));
    if bad {
        return Err(CacheError::InvalidName {
            name: name.to_owned(),
        });
    }
    Ok(())
}
