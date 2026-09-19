//! The application cache folder (spec 9.4), such as
//! `%LOCALAPPDATA%\<app id>\cache`. It holds derived data only (the index and
//! thumbnails), so losing it loses nothing. Like the settings folder it lies
//! outside every project; the spec lets `nb-fs` delete in it (spec 6.3).
//!
//! Only two things happen here: the folder is created, and a named file in it
//! is removed. The index (`nb-index`) writes its own database through SQLite
//! and asks for removal only to discard a database it cannot read (ADR-0023).

use std::fs;
use std::io;
use std::path::PathBuf;

/// Why the cache folder could not be prepared or a file in it removed.
#[derive(Debug, thiserror::Error)]
pub enum CacheError {
    /// The name is empty, hidden, a path or contains a control character, so
    /// it could name something outside the cache folder.
    #[error("`{name}` is not a plain file name")]
    InvalidName { name: String },
    #[error("`{name}` in the cache is not a file")]
    NotAFile { name: String },
    #[error("cannot {operation} `{name}` in the cache: {source}")]
    Io {
        operation: &'static str,
        name: String,
        source: io::Error,
    },
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
