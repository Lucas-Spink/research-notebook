use std::io;

use nb_fs::cache::CacheError;

/// Why the index could not be opened, read or updated. The index is
/// disposable: every variant except `InvalidProjectId` is answered by
/// discarding it and rebuilding from the files.
#[derive(Debug, thiserror::Error)]
pub enum IndexError {
    /// The project id would not make a safe file name in the cache folder.
    #[error("`{id}` is not a usable project id")]
    InvalidProjectId { id: String },
    #[error(transparent)]
    Cache(#[from] CacheError),
    #[error("the index database failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    /// A notebook folder could not be listed. Paths are notebook-relative.
    #[error("cannot read `{path}`: {source}")]
    Io { path: String, source: io::Error },
    /// The database opened but holds something this version never wrote.
    #[error("the index holds unexpected data: {reason}")]
    Damaged { reason: String },
}
