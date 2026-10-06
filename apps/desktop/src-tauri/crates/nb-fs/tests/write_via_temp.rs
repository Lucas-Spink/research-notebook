//! A file another program fills (a git bundle, ADR-0053) is still placed
//! atomically and only inside `_notebook/` (spec 6.5, P2).
// disallowed_methods: the producer in these tests stands in for an external
// program that writes the file it is handed.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

use std::fs;

use common::{rel, snapshot_outside_notebook, TestProject};
use nb_fs::{StageError, WriteError};

const TARGET: &str = "_notebook/exports/git/code.bundle";

#[test]
fn the_produced_file_is_placed_at_the_destination() {
    let project = TestProject::new();

    project
        .open()
        .write_via_temp(&rel(TARGET), |temp| fs::write(temp, b"bundle"))
        .unwrap();

    assert_eq!(project.read(TARGET), b"bundle");
    assert!(project.temp_files().is_empty());
}

#[test]
fn the_producer_is_handed_a_file_beside_the_destination_inside_the_notebook() {
    let project = TestProject::new();
    let mut handed = None;

    project
        .open()
        .write_via_temp(&rel(TARGET), |temp| {
            handed = Some(temp.to_path_buf());
            fs::write(temp, b"x")
        })
        .unwrap();

    let temp = handed.unwrap();
    let folder = fs::canonicalize(project.on_disk(TARGET).parent().unwrap()).unwrap();
    assert_eq!(temp.parent().unwrap(), folder);
    assert!(temp.starts_with(project.open().notebook_dir()));
}

#[test]
fn a_failed_producer_leaves_the_old_file_and_no_temporary_file() {
    let project = TestProject::new();
    let root = project.open();
    root.write_via_temp(&rel(TARGET), |temp| fs::write(temp, b"old"))
        .unwrap();

    let error = root
        .write_via_temp(&rel(TARGET), |temp| {
            fs::write(temp, b"partial")?;
            Err::<(), _>(std::io::Error::other("git failed"))
        })
        .unwrap_err();

    assert!(matches!(error, StageError::Produce(_)));
    assert_eq!(project.read(TARGET), b"old");
    assert!(project.temp_files().is_empty());
}

#[test]
fn a_replaced_file_is_the_new_one_in_full() {
    let project = TestProject::new();
    let root = project.open();
    root.write_via_temp(&rel(TARGET), |temp| fs::write(temp, b"first version"))
        .unwrap();
    root.write_via_temp(&rel(TARGET), |temp| fs::write(temp, b"second"))
        .unwrap();

    assert_eq!(project.read(TARGET), b"second");
}

#[test]
fn a_destination_outside_the_notebook_is_refused_without_running_the_producer() {
    let project = TestProject::new();
    let before = snapshot_outside_notebook(project.root());
    let mut ran = false;

    let error = project
        .open()
        .write_via_temp(&rel("scripts/run.R"), |temp| {
            ran = true;
            fs::write(temp, b"evil")
        })
        .unwrap_err();

    assert!(matches!(
        error,
        StageError::Write(WriteError::OutsideNotebook { .. })
    ));
    assert!(!ran);
    assert_eq!(snapshot_outside_notebook(project.root()), before);
}
