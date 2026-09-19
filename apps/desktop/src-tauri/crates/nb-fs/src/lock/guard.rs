use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use super::{HeldLock, LockEnv, RefreshOutcome, ReleaseOutcome};
use crate::error::LockError;
use crate::project::ProjectRoot;

/// How often a held lock's heartbeat is refreshed (spec 5.11).
pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(60);

/// Refreshes that may fail in a row before the lock is given up. Three
/// minutes of failures is still inside the five it takes another instance to
/// see the lock as stale, so this instance stops writing before anyone else
/// may start.
const MAX_FAILED_REFRESHES: u32 = 3;

fn relock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // A panic elsewhere must not stop the lock being released.
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

struct Shared {
    /// Taken out when the lock is released.
    held: Mutex<Option<HeldLock>>,
    lost: AtomicBool,
    stop: Mutex<bool>,
    wake: Condvar,
}

/// A held lock with its heartbeat running on a dedicated thread, so the
/// heartbeat does not depend on the webview being awake.
///
/// If another instance takes the lock over, or the heartbeat cannot be written
/// for [`MAX_FAILED_REFRESHES`] intervals, the guard reports itself lost and
/// stops. Nothing writes to the project after that (P6).
#[derive(Debug)]
pub struct LockGuard {
    root: ProjectRoot,
    shared: Arc<Shared>,
    worker: Option<JoinHandle<()>>,
}

impl std::fmt::Debug for Shared {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Shared")
            .field("lost", &self.lost.load(Ordering::SeqCst))
            .finish_non_exhaustive()
    }
}

impl LockGuard {
    /// Starts refreshing `held` every `interval`; production passes
    /// [`HEARTBEAT_INTERVAL`].
    pub fn start(
        root: ProjectRoot,
        env: Arc<dyn LockEnv + Send + Sync>,
        held: HeldLock,
        interval: Duration,
    ) -> Self {
        let shared = Arc::new(Shared {
            held: Mutex::new(Some(held)),
            lost: AtomicBool::new(false),
            stop: Mutex::new(false),
            wake: Condvar::new(),
        });
        let worker = {
            let (root, shared) = (root.clone(), Arc::clone(&shared));
            thread::Builder::new()
                .name("nb-lock-heartbeat".to_owned())
                .spawn(move || run(&root, env.as_ref(), &shared, interval))
                .ok()
        };
        if worker.is_none() {
            // Without a heartbeat the lock would go stale under us.
            shared.lost.store(true, Ordering::SeqCst);
        }
        Self {
            root,
            shared,
            worker,
        }
    }

    /// Whether the lock has been taken over or its heartbeat has failed, so
    /// the project must be treated as read-only.
    pub fn is_lost(&self) -> bool {
        self.shared.lost.load(Ordering::SeqCst)
    }

    /// Stops the heartbeat and removes the lock if it is still ours.
    pub fn release(mut self) -> Result<ReleaseOutcome, LockError> {
        self.stop_worker();
        match relock(&self.shared.held).take() {
            Some(held) => self.root.release_lock(held),
            None => Ok(ReleaseOutcome::AlreadyGone),
        }
    }

    fn stop_worker(&mut self) {
        *relock(&self.shared.stop) = true;
        self.shared.wake.notify_all();
        if let Some(worker) = self.worker.take() {
            // A panicking worker has already stopped; nothing more to do.
            let _ = worker.join();
        }
    }
}

/// Dropping the guard stops the heartbeat but leaves `.lock` in place, as a
/// crash would: it goes stale and can be taken over. Release explicitly to
/// remove it.
impl Drop for LockGuard {
    fn drop(&mut self) {
        self.stop_worker();
    }
}

fn run(root: &ProjectRoot, env: &(dyn LockEnv + Send + Sync), shared: &Shared, interval: Duration) {
    let mut failures = 0;
    loop {
        let stopped = {
            let stop = relock(&shared.stop);
            let (stop, _) = shared
                .wake
                .wait_timeout_while(stop, interval, |stopped| !*stopped)
                .unwrap_or_else(PoisonError::into_inner);
            *stop
        };
        if stopped {
            return;
        }
        let mut held = relock(&shared.held);
        let Some(held) = held.as_mut() else { return };
        match root.refresh_lock(env, held) {
            Ok(RefreshOutcome::Refreshed) => failures = 0,
            Ok(RefreshOutcome::Lost) => break,
            Err(_) => {
                failures += 1;
                if failures >= MAX_FAILED_REFRESHES {
                    break;
                }
            }
        }
    }
    shared.lost.store(true, Ordering::SeqCst);
}
