//! The background heartbeat that keeps a held lock live, and stops when the
//! lock is lost. Intervals are milliseconds here; the real one is a minute.

use std::fs;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use nb_fs::lock::{
    AcquireOutcome, LockEnv, LockGuard, LockInfo, ReleaseOutcome, Timestamp, HEARTBEAT_INTERVAL,
    HEARTBEAT_INTERVAL_SECONDS,
};

use crate::common::TestProject;
use crate::{FakeEnv, LOCK, START};

const TICK: Duration = Duration::from_millis(10);

/// A clock that moves a minute every time it is read, so each heartbeat
/// differs from the last even though the test runs in milliseconds.
struct RacingClock {
    now: AtomicI64,
}

impl LockEnv for RacingClock {
    fn now(&self) -> Timestamp {
        Timestamp::from_unix(
            self.now
                .fetch_add(HEARTBEAT_INTERVAL_SECONDS, Ordering::SeqCst),
        )
    }
    fn host(&self) -> String {
        "lab-pc".to_owned()
    }
    fn pid(&self) -> u32 {
        100
    }
    fn app_version(&self) -> String {
        "0.1.0".to_owned()
    }
}

fn racing_clock() -> Arc<RacingClock> {
    Arc::new(RacingClock {
        now: AtomicI64::new(START),
    })
}

/// Locks the project with the racing clock and starts the heartbeat.
fn guarded(project: &TestProject) -> LockGuard {
    let env = racing_clock();
    let held = match project.open().acquire_lock(&*env, false).unwrap() {
        AcquireOutcome::Acquired(held) => held,
        other => panic!("expected the lock, got {other:?}"),
    };
    LockGuard::start(project.open(), env, held, TICK)
}

/// Polls until `done` holds, failing the test if it never does.
fn eventually(what: &str, mut done: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !done() {
        assert!(Instant::now() < deadline, "timed out waiting for {what}");
        std::thread::sleep(TICK);
    }
}

fn heartbeat_on_disk(project: &TestProject) -> Option<i64> {
    let bytes = fs::read(project.on_disk(LOCK)).ok()?;
    LockInfo::parse(&bytes).map(|info| info.heartbeat.unix())
}

#[test]
fn the_real_interval_is_a_minute() {
    assert_eq!(HEARTBEAT_INTERVAL, Duration::from_secs(60));
    assert_eq!(
        HEARTBEAT_INTERVAL.as_secs() as i64,
        HEARTBEAT_INTERVAL_SECONDS
    );
}

#[test]
fn the_heartbeat_is_refreshed_again_and_again_while_the_guard_lives() {
    let project = TestProject::new();
    let guard = guarded(&project);

    eventually("three refreshes", || {
        heartbeat_on_disk(&project).is_some_and(|h| h >= START + 3 * HEARTBEAT_INTERVAL_SECONDS)
    });

    assert!(!guard.is_lost());
    assert_eq!(guard.release().unwrap(), ReleaseOutcome::Released);
}

#[test]
fn a_lock_taken_over_by_someone_else_is_lost_and_never_overwritten() {
    let project = TestProject::new();
    let guard = guarded(&project);
    let intruder = FakeEnv::new("laptop", 200);
    intruder.advance(86_400);
    // The other instance confirms a takeover once ours looks stale to it.
    let theirs = loop {
        if let AcquireOutcome::Acquired(_) = project.open().acquire_lock(&intruder, true).unwrap() {
            break project.read(LOCK);
        }
        intruder.advance(86_400);
    };

    eventually("the lock to be reported lost", || guard.is_lost());

    std::thread::sleep(TICK * 10);
    assert_eq!(project.read(LOCK), theirs);
    assert_eq!(guard.release().unwrap(), ReleaseOutcome::NotOurs);
    assert_eq!(project.read(LOCK), theirs);
}

#[test]
fn a_heartbeat_that_keeps_failing_is_lost_before_the_lock_can_go_stale() {
    let project = TestProject::new();
    let guard = guarded(&project);
    // A read-only lock file cannot be replaced, so every refresh fails.
    let mut permissions = fs::metadata(project.on_disk(LOCK)).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(project.on_disk(LOCK), permissions).unwrap();

    eventually("repeated failures to be reported as lost", || {
        guard.is_lost()
    });

    let mut permissions = fs::metadata(project.on_disk(LOCK)).unwrap().permissions();
    #[allow(clippy::permissions_set_readonly_false)]
    permissions.set_readonly(false);
    fs::set_permissions(project.on_disk(LOCK), permissions).unwrap();
    drop(guard);
}

#[test]
fn releasing_stops_the_heartbeat_and_removes_the_lock() {
    let project = TestProject::new();
    let guard = guarded(&project);
    eventually("a first refresh", || {
        heartbeat_on_disk(&project).is_some_and(|h| h > START)
    });

    assert_eq!(guard.release().unwrap(), ReleaseOutcome::Released);

    std::thread::sleep(TICK * 10);
    assert!(
        !project.exists(LOCK),
        "a stopped heartbeat must not recreate the lock"
    );
    assert!(project.temp_files().is_empty());
}

#[test]
fn dropping_the_guard_stops_the_heartbeat_and_leaves_the_lock_to_go_stale() {
    let project = TestProject::new();
    let guard = guarded(&project);
    eventually("a first refresh", || {
        heartbeat_on_disk(&project).is_some_and(|h| h > START)
    });

    drop(guard);

    let frozen = project.read(LOCK);
    std::thread::sleep(TICK * 10);
    assert_eq!(project.read(LOCK), frozen);
}
