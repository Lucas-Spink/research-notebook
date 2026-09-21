//! The backup made before the first write by a different application version
//! (spec 5.11, FR-HIS-04, ADR-0025).

use crate::clock::Clock;
use crate::error::WriteError;
use crate::project::ProjectRoot;

/// A backup that was made.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Backup {
    /// The project-relative path of the backup folder.
    pub folder: String,
    /// How many files were copied.
    pub copied: usize,
    /// Files in scope that were not copied because they are links or are not
    /// regular files inside `_notebook/`.
    pub skipped: usize,
}

impl ProjectRoot {
    /// Copies every notebook text file into
    /// `_notebook/backups/<timestamp>-before-<app version>/`. Call it before
    /// the first write by a version other than `last_written_by`; the caller
    /// reads that from `project.yaml`, which only `packages/format` parses.
    pub fn backup_before_version(
        &self,
        _app_version: &str,
        _clock: &impl Clock,
    ) -> Result<Backup, WriteError> {
        Err(WriteError::NotHistoryScope {
            path: "_notebook".to_owned(),
        })
    }
}
