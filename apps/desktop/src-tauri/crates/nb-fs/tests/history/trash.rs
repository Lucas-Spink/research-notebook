//! Deleting means moving to `.trash/<timestamp>/<original path>` (spec 5.11,
//! FR-EXP-06, FR-EVD-10). The application never removes anything itself.

use std::collections::BTreeMap;

use nb_fs::WriteError;

use super::{files_under, plant, FakeClock};
use crate::common::{make_dir_link, rel, snapshot_outside_notebook, TestProject};

/// A project with a question and an experiment that has captured evidence.
fn project() -> TestProject {
    let project = TestProject::new();
    plant(&project, "_notebook/project.yaml", b"format_version: 1\n");
    plant(&project, "_notebook/bibliography.json", b"[]");
    plant(&project, "_notebook/questions/Q-001.md", b"question one");
    plant(
        &project,
        "_notebook/experiments/EXP-001/experiment.md",
        b"exp",
    );
    plant(
        &project,
        "_notebook/experiments/EXP-001/artefacts.yaml",
        b"a: 1\n",
    );
    plant(
        &project,
        "_notebook/experiments/EXP-001/evidence/plot/v1.csv",
        &[0, 1, 2, 255],
    );
    project
}

fn notebook_files(project: &TestProject) -> BTreeMap<String, Vec<u8>> {
    files_under(project, "_notebook")
}

#[test]
fn a_file_moves_to_the_trash_under_its_original_relative_path() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let trashed = root
        .move_to_trash(&rel("_notebook/questions/Q-001.md"), &clock)
        .unwrap();
    let there = "_notebook/.trash/2026-09-21T10-15-00Z/questions/Q-001.md";
    assert_eq!(trashed.location, there);
    assert_eq!(project.read(there), b"question one");
    assert!(!project.exists("_notebook/questions/Q-001.md"));
}

#[test]
fn a_folder_moves_whole_with_everything_in_it() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let before = files_under(&project, "_notebook/experiments/EXP-001");
    let trashed = root
        .move_to_trash(&rel("_notebook/experiments/EXP-001"), &clock)
        .unwrap();
    assert_eq!(
        trashed.location,
        "_notebook/.trash/2026-09-21T10-15-00Z/experiments/EXP-001"
    );
    assert!(!project.exists("_notebook/experiments/EXP-001"));
    let after = files_under(
        &project,
        "_notebook/.trash/2026-09-21T10-15-00Z/experiments/EXP-001",
    );
    let renamed: BTreeMap<String, Vec<u8>> = before
        .into_iter()
        .map(|(path, bytes)| {
            let inside = path.strip_prefix("_notebook/experiments/EXP-001/").unwrap();
            (
                format!("_notebook/.trash/2026-09-21T10-15-00Z/experiments/EXP-001/{inside}"),
                bytes,
            )
        })
        .collect();
    assert_eq!(after, renamed);
    assert_eq!(after.len(), 3);
}

#[test]
fn two_deletions_in_one_second_share_the_folder() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    root.move_to_trash(&rel("_notebook/questions/Q-001.md"), &clock)
        .unwrap();
    root.move_to_trash(&rel("_notebook/experiments/EXP-001"), &clock)
        .unwrap();
    let trash = files_under(&project, "_notebook/.trash");
    assert_eq!(trash.len(), 4);
    assert!(trash
        .keys()
        .all(|k| k.starts_with("_notebook/.trash/2026-09-21T10-15-00Z/")));
}

#[test]
fn the_same_path_deleted_twice_in_a_second_keeps_both() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    root.move_to_trash(&rel("_notebook/questions/Q-001.md"), &clock)
        .unwrap();
    plant(&project, "_notebook/questions/Q-001.md", b"question again");
    let second = root
        .move_to_trash(&rel("_notebook/questions/Q-001.md"), &clock)
        .unwrap();
    assert_eq!(
        second.location,
        "_notebook/.trash/2026-09-21T10-15-00Z-2/questions/Q-001.md"
    );
    assert_eq!(
        project.read("_notebook/.trash/2026-09-21T10-15-00Z/questions/Q-001.md"),
        b"question one"
    );
    assert_eq!(project.read(&second.location), b"question again");
}

#[test]
fn a_path_that_does_not_exist_is_reported() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let result = root.move_to_trash(&rel("_notebook/questions/Q-404.md"), &clock);
    assert!(
        matches!(result, Err(WriteError::Missing { .. })),
        "{result:?}"
    );
    assert!(!project.exists("_notebook/.trash"));
}

#[test]
fn the_notebooks_own_files_and_folders_are_never_trashed() {
    let project = project();
    plant(&project, "_notebook/.lock", b"{}");
    plant(
        &project,
        "_notebook/.history/x/2026-09-21T10-15-00Z.md",
        b"h",
    );
    plant(
        &project,
        "_notebook/.trash/2026-01-01T00-00-00Z/old.md",
        b"t",
    );
    plant(
        &project,
        "_notebook/backups/2026-01-01T00-00-00Z-before-0.1.0/a",
        b"b",
    );
    let root = project.open();
    let before = notebook_files(&project);
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    for path in [
        "_notebook",
        "_notebook/project.yaml",
        "_notebook/bibliography.json",
        "_notebook/.lock",
        "_notebook/.history",
        "_notebook/.history/x/2026-09-21T10-15-00Z.md",
        "_notebook/.trash",
        "_notebook/.trash/2026-01-01T00-00-00Z/old.md",
        "_notebook/backups",
        "_notebook/backups/2026-01-01T00-00-00Z-before-0.1.0",
    ] {
        let result = root.move_to_trash(&rel(path), &clock);
        assert!(
            matches!(result, Err(WriteError::NotTrashable { .. })),
            "{path}: {result:?}"
        );
    }
    assert_eq!(notebook_files(&project), before);
}

#[test]
fn nothing_outside_the_notebook_can_be_trashed() {
    let project = project();
    let root = project.open();
    let before = snapshot_outside_notebook(project.root());
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    for path in [
        "scripts/run.R",
        "results/pca",
        "README.md",
        "_notebook/../scripts/run.R",
        "../elsewhere",
        "/etc/hosts",
        "C:/Windows/win.ini",
        "_Notebook/questions/Q-001.md",
        "_notebook2/x",
    ] {
        // Some are already refused when parsed, before a command could ask.
        if let Ok(parsed) = nb_fs::ProjectRelPath::parse(path) {
            assert!(root.move_to_trash(&parsed, &clock).is_err(), "{path}");
        }
    }
    assert_eq!(snapshot_outside_notebook(project.root()), before);
    assert!(!project.exists("_notebook/.trash"));
}

#[test]
fn a_link_is_never_followed_or_moved() {
    let project = project();
    make_dir_link(
        &project.on_disk("_notebook/linked"),
        &project.on_disk("results/pca"),
    );
    let root = project.open();
    let before = snapshot_outside_notebook(project.root());
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    // The link itself, and a file reached through it.
    for path in ["_notebook/linked", "_notebook/linked/pca.csv"] {
        let result = root.move_to_trash(&rel(path), &clock);
        assert!(
            matches!(
                result,
                Err(WriteError::TargetIsLink { .. } | WriteError::EscapesNotebook { .. })
            ),
            "{path}: {result:?}"
        );
    }
    assert_eq!(snapshot_outside_notebook(project.root()), before);
    assert!(project.exists("_notebook/linked"));
}

#[test]
fn a_trash_folder_that_is_a_link_out_of_the_notebook_is_refused() {
    let project = project();
    make_dir_link(
        &project.on_disk("_notebook/.trash"),
        &project.on_disk("results/pca"),
    );
    let root = project.open();
    let before = snapshot_outside_notebook(project.root());
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let result = root.move_to_trash(&rel("_notebook/questions/Q-001.md"), &clock);
    assert!(result.is_err(), "{result:?}");
    assert_eq!(
        project.read("_notebook/questions/Q-001.md"),
        b"question one"
    );
    assert_eq!(snapshot_outside_notebook(project.root()), before);
}

#[test]
fn names_windows_would_misread_are_refused() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    for path in [
        "_notebook/CON",
        "_notebook/x:stream",
        "_notebook/questions/Q-001.md.",
    ] {
        assert!(root.move_to_trash(&rel(path), &clock).is_err(), "{path}");
    }
}
