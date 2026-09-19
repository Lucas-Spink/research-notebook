use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use super::{AcquireOutcome, LockEnv, LockGuard, LockInfo, ReleaseOutcome, HEARTBEAT_INTERVAL};
use crate::error::LockError;
use crate::project::ProjectRoot;

/// What came of asking the registry to lock a project.
#[derive(Debug)]
pub enum LockAttempt {
    /// This application holds the lock and keeps its heartbeat going.
    Held,
    Live(LockInfo),
    Stale(LockInfo),
    Unreadable {
        replaceable: bool,
    },
    ReadOnlyMedia,
}

/// Whether this application still holds the lock on a project.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LockHealth {
    Held,
    /// Another instance took the lock over, or the heartbeat could not be
    /// written. The project must be treated as read-only.
    Lost,
    NotHeld,
}

/// The locks one running application holds, one per project, each with its
/// heartbeat running. Projects are told apart by their resolved `_notebook`
/// folder, so reopening the same folder finds the lock it already holds.
#[derive(Clone)]
pub struct LockRegistry {
    held: Arc<Mutex<HashMap<PathBuf, LockGuard>>>,
    env: Arc<dyn LockEnv + Send + Sync>,
    interval: Duration,
}

impl LockRegistry {
    pub fn new(env: Arc<dyn LockEnv + Send + Sync>) -> Self {
        Self::with_interval(env, HEARTBEAT_INTERVAL)
    }

    /// As [`LockRegistry::new`], refreshing at `interval` so tests need not
    /// wait a minute.
    pub fn with_interval(env: Arc<dyn LockEnv + Send + Sync>, interval: Duration) -> Self {
        Self {
            held: Arc::default(),
            env,
            interval,
        }
    }

    fn held(&self) -> MutexGuard<'_, HashMap<PathBuf, LockGuard>> {
        // A panic elsewhere must not stop locks being released.
        self.held.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Locks `root`, unless this application already holds it, in which case
    /// it keeps that lock: a reloaded window asks again for the same folder.
    /// A lock this application lost is given up first, so the answer reflects
    /// what is on disk now. `confirm_takeover` is as for
    /// [`ProjectRoot::acquire_lock`].
    ///
    /// Blocks while a locked file is retried, for up to five seconds.
    pub fn acquire(
        &self,
        root: &ProjectRoot,
        confirm_takeover: bool,
    ) -> Result<LockAttempt, LockError> {
        let key = root.notebook_dir().to_path_buf();
        let mut held = self.held();
        match held.remove(&key) {
            Some(guard) if !guard.is_lost() => {
                held.insert(key, guard);
                return Ok(LockAttempt::Held);
            }
            // Lost: releasing only removes a lock that is still ours.
            Some(guard) => {
                let _ = guard.release();
            }
            None => {}
        }
        Ok(
            match root.acquire_lock(self.env.as_ref(), confirm_takeover)? {
                AcquireOutcome::Acquired(lock) => {
                    let guard =
                        LockGuard::start(root.clone(), Arc::clone(&self.env), lock, self.interval);
                    held.insert(key, guard);
                    LockAttempt::Held
                }
                AcquireOutcome::Live(info) => LockAttempt::Live(info),
                AcquireOutcome::Stale(info) => LockAttempt::Stale(info),
                AcquireOutcome::Unreadable { replaceable } => {
                    LockAttempt::Unreadable { replaceable }
                }
                AcquireOutcome::ReadOnlyMedia => LockAttempt::ReadOnlyMedia,
            },
        )
    }

    pub fn health(&self, root: &ProjectRoot) -> LockHealth {
        match self.held().get(root.notebook_dir()) {
            Some(guard) if guard.is_lost() => LockHealth::Lost,
            Some(_) => LockHealth::Held,
            None => LockHealth::NotHeld,
        }
    }

    /// Stops the heartbeat and removes the lock if it is still ours. `None`
    /// when this application held no lock on the project.
    pub fn release(&self, root: &ProjectRoot) -> Result<Option<ReleaseOutcome>, LockError> {
        let guard = self.held().remove(root.notebook_dir());
        guard.map(LockGuard::release).transpose()
    }

    /// Releases every lock, as the application exits. One that fails to
    /// release is left to go stale, which is what a crash would do.
    pub fn release_all(&self) {
        let guards: Vec<LockGuard> = self.held().drain().map(|(_, guard)| guard).collect();
        for guard in guards {
            let _ = guard.release();
        }
    }
}
