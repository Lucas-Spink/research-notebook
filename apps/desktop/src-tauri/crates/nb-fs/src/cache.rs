//! The application cache folder (spec 9.4).

use std::path::PathBuf;

/// Why the cache folder could not be prepared or a file in it removed.
#[derive(Debug, thiserror::Error)]
pub enum CacheError {
    #[error("`{name}` is not a plain file name")]
    InvalidName { name: String },
    #[error("`{name}` in the cache is not a file")]
    NotAFile { name: String },
}

/// The cache folder.
#[derive(Debug, Clone)]
pub struct CacheDir {
    dir: PathBuf,
}

impl CacheDir {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn ensure(&self) -> Result<(), CacheError> {
        let _ = &self.dir;
        Ok(())
    }

    pub fn remove_file(&self, _name: &str) -> Result<(), CacheError> {
        Ok(())
    }
}
