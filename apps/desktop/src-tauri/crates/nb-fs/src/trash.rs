//! Moving deleted files and folders to `.trash/` (spec 5.11, FR-EXP-06,
//! FR-EVD-10, ADR-0025). Nothing is ever removed from the trash here.

use crate::clock::Clock;
use crate::error::WriteError;
use crate::path::ProjectRelPath;
use crate::project::ProjectRoot;

/// Where a trashed file or folder went.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Trashed {
    /// The project-relative path it now has, under `_notebook/.trash/`.
    pub location: String,
}

impl ProjectRoot {
    /// Moves the file or folder `path` to `_notebook/.trash/<timestamp>/<its
    /// path relative to _notebook>`. Recoverable by moving it back; emptied
    /// only by an explicit user action, which this crate does not offer yet.
    pub fn move_to_trash(
        &self,
        path: &ProjectRelPath,
        _clock: &impl Clock,
    ) -> Result<Trashed, WriteError> {
        Err(WriteError::NotTrashable {
            path: path.to_string(),
        })
    }
}
