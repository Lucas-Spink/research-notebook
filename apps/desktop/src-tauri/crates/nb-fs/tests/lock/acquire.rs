//! Acquiring a lock on a project that has none, and being refused by a live one.

use std::fs;

use nb_fs::lock::{AcquireOutcome, HEARTBEAT_INTERVAL_SECONDS};

use crate::common::{snapshot_outside_notebook, TestProject};
use crate::{held, notebook_files, FakeEnv, LOCK};

#[test]
fn a_project_without_a_lock_gets_one_in_the_documented_layout() {
    let project = TestProject::new();
    let env = FakeEnv::new("lab-pc", 4242);

    held(project.open().acquire_lock(&env, false).unwrap());

    // Format-v1 3.5: two-space indent, keys in documented order, final LF.
    // The same text is checked against the LockFile schema in
    // packages/format/src/lock-sample.test.ts; change both together.
    assert_eq!(
        String::from_utf8(project.read(LOCK)).unwrap(),
        concat!(
            "{\n",
            "  \"host\": \"lab-pc\",\n",
            "  \"pid\": 4242,\n",
            "  \"app_version\": \"0.1.0\",\n",
            "  \"opened\": \"2026-09-19T10:00:00Z\",\n",
            "  \"heartbeat\": \"2026-09-19T10:00:00Z\"\n",
            "}\n",
        )
    );
}

#[test]
fn acquiring_writes_only_the_lock_inside_notebook() {
    let project = TestProject::new();
    let before = snapshot_outside_notebook(project.root());

    held(
        project
            .open()
            .acquire_lock(&FakeEnv::new("lab-pc", 1), false)
            .unwrap(),
    );

    assert_eq!(snapshot_outside_notebook(project.root()), before);
    assert_eq!(
        notebook_files(&project).keys().collect::<Vec<_>>(),
        ["_notebook/.lock"]
    );
    assert!(project.temp_files().is_empty());
}

#[test]
fn a_second_instance_is_refused_while_the_heartbeat_is_fresh() {
    let project = TestProject::new();
    let first = FakeEnv::new("lab-pc", 100);
    let second = FakeEnv::new("laptop", 200);
    held(project.open().acquire_lock(&first, false).unwrap());
    let lock_before = project.read(LOCK);
    let files_before = notebook_files(&project);

    second.advance(HEARTBEAT_INTERVAL_SECONDS);
    let outcome = project.open().acquire_lock(&second, false).unwrap();

    match outcome {
        AcquireOutcome::Live(info) => {
            assert_eq!((info.host.as_str(), info.pid), ("lab-pc", 100));
            assert_eq!(info.opened.to_rfc3339(), "2026-09-19T10:00:00Z");
        }
        other => panic!("expected a live lock, got {other:?}"),
    }
    assert_eq!(project.read(LOCK), lock_before);
    assert_eq!(notebook_files(&project), files_before);
}

#[test]
fn confirming_never_takes_over_a_live_lock() {
    let project = TestProject::new();
    held(
        project
            .open()
            .acquire_lock(&FakeEnv::new("lab-pc", 100), false)
            .unwrap(),
    );
    let lock_before = project.read(LOCK);

    let outcome = project
        .open()
        .acquire_lock(&FakeEnv::new("laptop", 200), true)
        .unwrap();

    assert!(matches!(outcome, AcquireOutcome::Live(_)), "{outcome:?}");
    assert_eq!(project.read(LOCK), lock_before);
}

#[test]
fn a_lock_that_is_a_folder_is_blocked_and_left_alone() {
    let project = TestProject::new();
    fs::create_dir(project.on_disk(LOCK)).unwrap();

    for confirm in [false, true] {
        let outcome = project
            .open()
            .acquire_lock(&FakeEnv::new("lab-pc", 1), confirm)
            .unwrap();
        assert!(
            matches!(outcome, AcquireOutcome::Unreadable { replaceable: false }),
            "{outcome:?}"
        );
    }
    assert!(project.on_disk(LOCK).is_dir());
}

#[test]
fn a_refused_open_leaves_every_notebook_file_untouched() {
    let project = TestProject::new();
    fs::write(
        project.on_disk("_notebook/project.yaml"),
        b"format_version: 1\n",
    )
    .unwrap();
    held(
        project
            .open()
            .acquire_lock(&FakeEnv::new("lab-pc", 100), false)
            .unwrap(),
    );
    let before = notebook_files(&project);

    project
        .open()
        .acquire_lock(&FakeEnv::new("laptop", 200), true)
        .unwrap();

    assert_eq!(notebook_files(&project), before);
}
