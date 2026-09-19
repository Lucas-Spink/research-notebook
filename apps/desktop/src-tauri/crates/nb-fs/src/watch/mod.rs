//! Watching `_notebook/` for changes made outside the application (spec
//! 6.4 step 5, FR-HIS-05, ADR-0024).

mod coalesce;
mod filter;
mod registry;
mod state;
mod watcher;

pub use coalesce::{Coalescer, Due};
pub use filter::{is_notebook_data_folder, is_notebook_data_path};
pub use registry::WatchRegistry;
pub use watcher::ProjectWatcher;

use crate::path::ProjectRelPath;

/// What is on disk for a changed file, once the burst of events settled.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileState {
    Present { sha256: String },
    Missing,
    Unreadable,
}

/// One notebook data file that changed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Change {
    pub path: ProjectRelPath,
    pub state: FileState,
}

/// Changes since the last time they were taken.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ChangeBatch {
    pub changes: Vec<Change>,
    pub needs_rescan: bool,
}

impl ChangeBatch {
    pub fn is_empty(&self) -> bool {
        self.changes.is_empty() && !self.needs_rescan
    }
}

/// Why watching could not start.
#[derive(Debug, thiserror::Error)]
pub enum WatchError {
    #[error("cannot watch `_notebook`: {0}")]
    Start(String),
}
