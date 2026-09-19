//! Releasing a lock removes it only if it is still ours.

use nb_fs::lock::{AcquireOutcome, ReleaseOutcome};

use crate::common::{snapshot_outside_notebook, TestProject};
use crate::{held, notebook_files, plant_lock, FakeEnv, LOCK};

#[test]
fn releasing_removes_our_lock_and_nothing_else() {
    let project = TestProject::new();
    std::fs::write(
        project.on_disk("_notebook/project.yaml"),
        b"format_version: 1\n",
    )
    .unwrap();
    let outside = snapshot_outside_notebook(project.root());
    let notebook_before = notebook_files(&project);
    let lock = held(
        project
            .open()
            .acquire_lock(&FakeEnv::new("lab-pc", 100), false)
            .unwrap(),
    );

    let outcome = project.open().release_lock(lock).unwrap();

    assert_eq!(outcome, ReleaseOutcome::Released);
    assert!(!project.exists(LOCK));
    assert_eq!(notebook_files(&project), notebook_before);
    assert_eq!(snapshot_outside_notebook(project.root()), outside);
}

#[test]
fn a_released_project_can_be_locked_at_once_by_another_instance() {
    let project = TestProject::new();
    let lock = held(
        project
            .open()
            .acquire_lock(&FakeEnv::new("lab-pc", 100), false)
            .unwrap(),
    );
    project.open().release_lock(lock).unwrap();

    let outcome = project
        .open()
        .acquire_lock(&FakeEnv::new("laptop", 200), false)
        .unwrap();

    assert!(
        matches!(outcome, AcquireOutcome::Acquired(_)),
        "{outcome:?}"
    );
}

#[test]
fn a_lock_taken_over_by_another_instance_is_not_released_by_the_old_owner() {
    let project = TestProject::new();
    let old = held(
        project
            .open()
            .acquire_lock(&FakeEnv::new("lab-pc", 100), false)
            .unwrap(),
    );
    let newer = FakeEnv::new("laptop", 200);
    newer.advance(3_600);
    held(project.open().acquire_lock(&newer, true).unwrap());
    let theirs = project.read(LOCK);

    let outcome = project.open().release_lock(old).unwrap();

    assert_eq!(outcome, ReleaseOutcome::NotOurs);
    assert_eq!(project.read(LOCK), theirs);
}

#[test]
fn a_lock_that_is_already_gone_is_not_an_error() {
    let project = TestProject::new();
    let lock = held(
        project
            .open()
            .acquire_lock(&FakeEnv::new("lab-pc", 100), false)
            .unwrap(),
    );
    std::fs::remove_file(project.on_disk(LOCK)).unwrap();

    assert_eq!(
        project.open().release_lock(lock).unwrap(),
        ReleaseOutcome::AlreadyGone
    );
}

#[test]
fn a_lock_replaced_by_something_unreadable_is_left_in_place() {
    let project = TestProject::new();
    let lock = held(
        project
            .open()
            .acquire_lock(&FakeEnv::new("lab-pc", 100), false)
            .unwrap(),
    );
    plant_lock(&project, b"someone else's file");

    assert_eq!(
        project.open().release_lock(lock).unwrap(),
        ReleaseOutcome::NotOurs
    );
    assert_eq!(project.read(LOCK), b"someone else's file");
}
