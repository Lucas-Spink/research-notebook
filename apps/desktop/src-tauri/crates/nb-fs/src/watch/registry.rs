use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use super::{ChangeBatch, ProjectWatcher, WatchError};
use crate::project::ProjectRoot;

/// The watchers one running application holds, one per project, started
/// when a project opens and stopped when it closes or the application
/// exits. Projects are told apart by their resolved `_notebook` folder, as
/// the lock registry does, so opening the same folder again finds the
/// watcher already running.
#[derive(Clone, Default)]
pub struct WatchRegistry {
    watchers: Arc<Mutex<HashMap<PathBuf, Arc<ProjectWatcher>>>>,
}

impl WatchRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    fn watchers(&self) -> MutexGuard<'_, HashMap<PathBuf, Arc<ProjectWatcher>>> {
        // A panic elsewhere must not stop watchers being stopped.
        self.watchers.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn get(&self, root: &ProjectRoot) -> Option<Arc<ProjectWatcher>> {
        self.watchers().get(root.notebook_dir()).cloned()
    }

    /// Starts watching `root`, unless it is already watched.
    pub fn start(&self, root: &ProjectRoot) -> Result<(), WatchError> {
        let mut watchers = self.watchers();
        if !watchers.contains_key(root.notebook_dir()) {
            let watcher = root.watch()?;
            watchers.insert(root.notebook_dir().to_path_buf(), Arc::new(watcher));
        }
        Ok(())
    }

    /// Takes the changes waiting for `root`, or `None` if it is not watched.
    pub fn poll(&self, root: &ProjectRoot) -> Option<ChangeBatch> {
        self.get(root).map(|watcher| watcher.poll())
    }

    /// As [`WatchRegistry::poll`], waiting up to `timeout` for a change first.
    /// The wait does not hold up other projects.
    pub fn wait(&self, root: &ProjectRoot, timeout: Duration) -> Option<ChangeBatch> {
        self.get(root).map(|watcher| watcher.wait(timeout))
    }

    /// Stops watching `root`. Stopping a project that is not watched is fine.
    pub fn stop(&self, root: &ProjectRoot) {
        let removed = self.watchers().remove(root.notebook_dir());
        // Dropped outside the lock: stopping joins the worker thread.
        drop(removed);
    }

    /// Stops every watcher, for when the application exits.
    pub fn stop_all(&self) {
        let removed: Vec<_> = self.watchers().drain().collect();
        drop(removed);
    }
}
