use super::{ChangeBatch, WatchError};
use crate::project::ProjectRoot;

/// The watchers one running application holds, one per project.
#[derive(Clone, Default)]
pub struct WatchRegistry {}

impl WatchRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn start(&self, _root: &ProjectRoot) -> Result<(), WatchError> {
        Ok(())
    }

    pub fn poll(&self, _root: &ProjectRoot) -> Option<ChangeBatch> {
        None
    }

    pub fn wait(&self, _root: &ProjectRoot, _timeout: std::time::Duration) -> Option<ChangeBatch> {
        None
    }

    pub fn stop(&self, _root: &ProjectRoot) {}

    pub fn stop_all(&self) {}
}
