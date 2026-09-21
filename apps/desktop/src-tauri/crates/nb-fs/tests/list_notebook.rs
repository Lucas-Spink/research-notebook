//! S2-T10 (ADR-0026): listing the question files and experiment folders of a
//! project, so the webview knows which notebook data files to read. It only
//! looks: nothing is written, evidence and history are never walked, and no
//! link is followed. The files themselves are read and parsed elsewhere.
// disallowed_methods: tests build throwaway folders in temporary directories;
// the std::fs write calls are fixture setup.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

use std::fs;

use common::{make_dir_link, snapshot_outside_notebook, TestProject};

fn put(project: &TestProject, notebook_path: &str) {
    let path = project.on_disk(&format!("_notebook/{notebook_path}"));
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, b"x\n").unwrap();
}

#[test]
fn an_empty_notebook_lists_nothing() {
    let project = TestProject::new();
    let listing = project.open().list_notebook().unwrap();
    assert!(listing.question_files.is_empty());
    assert!(listing.experiment_folders.is_empty());
}

#[test]
fn lists_question_files_and_experiment_folders_by_name() {
    let project = TestProject::new();
    for path in [
        "questions/Q-002.md",
        "questions/Q-001.md",
        "experiments/EXP-010/experiment.md",
        "experiments/EXP-002/experiment.md",
        "experiments/EXP-002/artefacts.yaml",
    ] {
        put(&project, path);
    }
    let listing = project.open().list_notebook().unwrap();
    assert_eq!(listing.question_files, ["Q-001.md", "Q-002.md"]);
    assert_eq!(listing.experiment_folders, ["EXP-002", "EXP-010"]);
}

#[test]
fn a_folder_without_experiment_md_is_still_listed_because_it_holds_a_ref() {
    let project = TestProject::new();
    put(&project, "experiments/EXP-005/artefacts.yaml");
    fs::create_dir_all(project.on_disk("_notebook/experiments/EXP-006")).unwrap();
    let listing = project.open().list_notebook().unwrap();
    assert_eq!(listing.experiment_folders, ["EXP-005", "EXP-006"]);
}

#[test]
fn skips_hidden_names_other_files_and_the_rest_of_the_notebook() {
    let project = TestProject::new();
    for path in [
        "questions/.Q-001.md.1.1.tmp",
        "questions/.hidden.md",
        "questions/notes.txt",
        "questions/nested/Q-009.md",
        "experiments/.EXP-001/experiment.md",
        "experiments/loose-file.md",
        "experiments/EXP-001/evidence/plot.csv",
        "project.yaml",
        "README.md",
        ".history/questions/Q-001.md/2026-09-21T10-15-00Z.md",
        ".trash/2026-09-21T10-15-00Z/questions/Q-003.md",
        "backups/x/questions/Q-004.md",
    ] {
        put(&project, path);
    }
    let listing = project.open().list_notebook().unwrap();
    assert!(listing.question_files.is_empty(), "{listing:?}");
    assert_eq!(listing.experiment_folders, ["EXP-001"]);
}

#[test]
fn a_folder_that_is_not_a_folder_lists_nothing() {
    let project = TestProject::new();
    put(&project, "questions");
    put(&project, "experiments");
    let listing = project.open().list_notebook().unwrap();
    assert!(listing.question_files.is_empty());
    assert!(listing.experiment_folders.is_empty());
}

#[test]
fn a_link_is_never_followed_or_listed() {
    let project = TestProject::new();
    put(&project, "experiments/EXP-001/experiment.md");
    fs::create_dir_all(project.on_disk("_notebook/questions")).unwrap();
    // A junction or symlink to an analysis folder, where an experiment folder would be.
    make_dir_link(
        &project.on_disk("_notebook/experiments/EXP-002"),
        &project.on_disk("results"),
    );
    make_dir_link(
        &project.on_disk("_notebook/questions/Q-001.md"),
        &project.on_disk("data"),
    );
    let listing = project.open().list_notebook().unwrap();
    assert_eq!(listing.experiment_folders, ["EXP-001"]);
    assert!(listing.question_files.is_empty(), "{listing:?}");
}

#[test]
fn listing_changes_nothing_on_disk() {
    let project = TestProject::new();
    put(&project, "questions/Q-001.md");
    put(&project, "experiments/EXP-001/experiment.md");
    let before = snapshot_outside_notebook(project.root());
    let inside_before = project.read("_notebook/questions/Q-001.md");
    project.open().list_notebook().unwrap();
    assert_eq!(snapshot_outside_notebook(project.root()), before);
    assert_eq!(project.read("_notebook/questions/Q-001.md"), inside_before);
    assert!(project.temp_files().is_empty());
}
