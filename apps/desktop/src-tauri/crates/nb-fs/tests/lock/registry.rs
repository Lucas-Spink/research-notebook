//! The locks one running application holds, keyed by project, as the
//! commands use them: acquire, adopt after a reload, poll, release, release
//! everything on exit.

use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use nb_fs::lock::{LockAttempt, LockEnv, LockHealth, LockRegistry, ReleaseOutcome, Timestamp};

use crate::common::TestProject;
use crate::{plant_lock, FakeEnv, LOCK, START};

/// One running application: a name, a pid and a clock the test moves.
struct AppEnv {
    host: &'static str,
    pid: u32,
    now: AtomicI64,
}

impl LockEnv for AppEnv {
    fn now(&self) -> Timestamp {
        Timestamp::from_unix(self.now.load(Ordering::SeqCst))
    }
    fn host(&self) -> String {
        self.host.to_owned()
    }
    fn pid(&self) -> u32 {
        self.pid
    }
    fn app_version(&self) -> String {
        "0.1.0".to_owned()
    }
}

/// An application whose heartbeat runs every 10 ms.
fn app(host: &'static str, pid: u32, at: i64) -> LockRegistry {
    let env = Arc::new(AppEnv {
        host,
        pid,
        now: AtomicI64::new(at),
    });
    LockRegistry::with_interval(env, Duration::from_millis(10))
}

fn eventually(what: &str, mut done: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !done() {
        assert!(Instant::now() < deadline, "timed out waiting for {what}");
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn acquiring_holds_the_lock_and_reports_it_held() {
    let project = TestProject::new();
    let registry = app("lab-pc", 100, START);
    let root = project.open();

    assert!(matches!(
        registry.acquire(&root, false).unwrap(),
        LockAttempt::Held
    ));

    assert_eq!(registry.health(&root), LockHealth::Held);
    assert!(project.exists(LOCK));
}

#[test]
fn acquiring_a_project_this_application_already_holds_adopts_it() {
    let project = TestProject::new();
    let registry = app("lab-pc", 100, START);
    registry.acquire(&project.open(), false).unwrap();
    let before = project.read(LOCK);

    // A reloaded webview asks again through a fresh handle to the same folder.
    let again = registry.acquire(&project.open(), false).unwrap();

    assert!(matches!(again, LockAttempt::Held), "{again:?}");
    assert_eq!(project.read(LOCK), before);
}

#[test]
fn a_second_application_is_refused_while_the_first_holds_the_lock() {
    let project = TestProject::new();
    let first = app("lab-pc", 100, START);
    let second = app("laptop", 200, START + 60);
    first.acquire(&project.open(), false).unwrap();

    let attempt = second.acquire(&project.open(), true).unwrap();

    match attempt {
        LockAttempt::Live(info) => assert_eq!((info.host.as_str(), info.pid), ("lab-pc", 100)),
        other => panic!("expected a live lock, got {other:?}"),
    }
    assert_eq!(second.health(&project.open()), LockHealth::NotHeld);
}

#[test]
fn releasing_removes_the_lock_and_lets_another_application_in() {
    let project = TestProject::new();
    let first = app("lab-pc", 100, START);
    first.acquire(&project.open(), false).unwrap();

    assert_eq!(
        first.release(&project.open()).unwrap(),
        Some(ReleaseOutcome::Released)
    );

    assert_eq!(first.health(&project.open()), LockHealth::NotHeld);
    assert!(!project.exists(LOCK));
    let second = app("laptop", 200, START);
    assert!(matches!(
        second.acquire(&project.open(), false).unwrap(),
        LockAttempt::Held
    ));
}

#[test]
fn releasing_a_project_that_is_not_held_does_nothing() {
    let project = TestProject::new();
    let registry = app("lab-pc", 100, START);

    assert_eq!(registry.release(&project.open()).unwrap(), None);
    assert!(!project.exists(LOCK));
}

#[test]
fn a_stale_lock_needs_confirmation_before_the_registry_takes_it() {
    let project = TestProject::new();
    plant_lock(&project, stale_lock().as_bytes());
    let registry = app("laptop", 200, START);

    let unconfirmed = registry.acquire(&project.open(), false).unwrap();
    assert!(
        matches!(unconfirmed, LockAttempt::Stale(_)),
        "{unconfirmed:?}"
    );
    assert_eq!(registry.health(&project.open()), LockHealth::NotHeld);

    let confirmed = registry.acquire(&project.open(), true).unwrap();
    assert!(matches!(confirmed, LockAttempt::Held), "{confirmed:?}");
    assert_eq!(registry.health(&project.open()), LockHealth::Held);
}

fn stale_lock() -> String {
    nb_fs::lock::LockInfo {
        host: "lab-pc".to_owned(),
        pid: 100,
        app_version: "0.1.0".to_owned(),
        opened: Timestamp::from_unix(START - 3_600),
        heartbeat: Timestamp::from_unix(START - 3_600),
    }
    .to_file_text()
}

#[test]
fn a_lock_taken_over_meanwhile_is_reported_lost_and_asking_again_is_refused() {
    let project = TestProject::new();
    let registry = app("lab-pc", 100, START);
    registry.acquire(&project.open(), false).unwrap();

    // Another instance decides ours is stale, and confirms a takeover.
    let intruder = FakeEnv::new("laptop", 200);
    intruder.advance(3_600);
    project.open().acquire_lock(&intruder, true).unwrap();
    eventually("the lock to be reported lost", || {
        registry.health(&project.open()) == LockHealth::Lost
    });
    let theirs = project.read(LOCK);

    let again = registry.acquire(&project.open(), false).unwrap();

    assert!(matches!(again, LockAttempt::Live(_)), "{again:?}");
    assert_eq!(registry.health(&project.open()), LockHealth::NotHeld);
    assert_eq!(project.read(LOCK), theirs);
}

#[test]
fn releasing_everything_on_exit_removes_every_lock_this_application_holds() {
    let (one, two) = (TestProject::new(), TestProject::new());
    let registry = app("lab-pc", 100, START);
    registry.acquire(&one.open(), false).unwrap();
    registry.acquire(&two.open(), false).unwrap();
    assert!(one.exists(LOCK) && two.exists(LOCK));

    registry.release_all();

    assert!(!one.exists(LOCK) && !two.exists(LOCK));
    assert_eq!(registry.health(&one.open()), LockHealth::NotHeld);
}
