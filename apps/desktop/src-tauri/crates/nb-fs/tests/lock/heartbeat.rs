//! The heartbeat keeps a lock live, and reports when the lock is no longer ours.

use std::fs;

use nb_fs::lock::{AcquireOutcome, RefreshOutcome, HEARTBEAT_INTERVAL_SECONDS};

use crate::common::TestProject;
use crate::{held, plant_lock, FakeEnv, LOCK};

#[test]
fn refreshing_moves_only_the_heartbeat() {
    let project = TestProject::new();
    let env = FakeEnv::new("lab-pc", 4242);
    let mut lock = held(project.open().acquire_lock(&env, false).unwrap());

    env.advance(HEARTBEAT_INTERVAL_SECONDS);
    let outcome = project.open().refresh_lock(&env, &mut lock).unwrap();

    assert_eq!(outcome, RefreshOutcome::Refreshed);
    assert_eq!(
        String::from_utf8(project.read(LOCK)).unwrap(),
        concat!(
            "{\n",
            "  \"host\": \"lab-pc\",\n",
            "  \"pid\": 4242,\n",
            "  \"app_version\": \"0.1.0\",\n",
            "  \"opened\": \"2026-09-19T10:00:00Z\",\n",
            "  \"heartbeat\": \"2026-09-19T10:01:00Z\"\n",
            "}\n",
        )
    );
    assert!(project.temp_files().is_empty());
}

#[test]
fn a_lock_that_keeps_its_heartbeat_never_goes_stale() {
    let project = TestProject::new();
    let owner = FakeEnv::new("lab-pc", 100);
    let mut lock = held(project.open().acquire_lock(&owner, false).unwrap());

    // Twenty minutes, refreshed every minute.
    for _ in 0..20 {
        owner.advance(HEARTBEAT_INTERVAL_SECONDS);
        assert_eq!(
            project.open().refresh_lock(&owner, &mut lock).unwrap(),
            RefreshOutcome::Refreshed
        );
    }

    let other = FakeEnv::new("laptop", 200);
    other.set(owner.unix());
    let outcome = project.open().acquire_lock(&other, true).unwrap();
    assert!(matches!(outcome, AcquireOutcome::Live(_)), "{outcome:?}");
}

#[test]
fn a_lock_taken_over_by_someone_else_is_reported_lost_and_not_overwritten() {
    let project = TestProject::new();
    let owner = FakeEnv::new("lab-pc", 100);
    let mut lock = held(project.open().acquire_lock(&owner, false).unwrap());

    // The owner stalls for an hour; another instance confirms a takeover.
    let other = FakeEnv::new("laptop", 200);
    other.advance(3_600);
    held(project.open().acquire_lock(&other, true).unwrap());
    let theirs = project.read(LOCK);

    owner.advance(3_600);
    let outcome = project.open().refresh_lock(&owner, &mut lock).unwrap();

    assert_eq!(outcome, RefreshOutcome::Lost);
    assert_eq!(project.read(LOCK), theirs);
}

#[test]
fn a_deleted_lock_is_reported_lost_and_not_recreated() {
    let project = TestProject::new();
    let env = FakeEnv::new("lab-pc", 100);
    let mut lock = held(project.open().acquire_lock(&env, false).unwrap());
    fs::remove_file(project.on_disk(LOCK)).unwrap();

    let outcome = project.open().refresh_lock(&env, &mut lock).unwrap();

    assert_eq!(outcome, RefreshOutcome::Lost);
    assert!(!project.exists(LOCK));
}

#[test]
fn a_lock_replaced_by_garbage_is_reported_lost_and_left_alone() {
    let project = TestProject::new();
    let env = FakeEnv::new("lab-pc", 100);
    let mut lock = held(project.open().acquire_lock(&env, false).unwrap());
    plant_lock(&project, b"not ours");

    let outcome = project.open().refresh_lock(&env, &mut lock).unwrap();

    assert_eq!(outcome, RefreshOutcome::Lost);
    assert_eq!(project.read(LOCK), b"not ours");
}

#[test]
fn the_heartbeat_interval_is_sixty_seconds() {
    assert_eq!(HEARTBEAT_INTERVAL_SECONDS, 60);
}
