//! S3-T10 (spec 8, 6.7): previews read a captured version's file, and only
//! such a file: one under `_notebook/experiments/<experiment>/evidence/` or
//! `methods/` that resolves to a regular file there. Nothing is written.
// disallowed_methods: tests build and inspect throwaway folders in temporary
// directories; the std::fs write calls are fixture setup.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

use std::fs;
use std::io::Read;

use common::{make_dir_link, rel, snapshot_outside_notebook, TestProject};
use nb_fs::ReadError;

fn write(project: &TestProject, notebook_path: &str, bytes: &[u8]) {
    let path = project.on_disk(&format!("_notebook/{notebook_path}"));
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, bytes).unwrap();
}

#[test]
fn opens_evidence_and_methods_files_with_their_length() {
    let project = TestProject::new();
    let root = project.open();
    write(&project, "experiments/EXP-001/evidence/plot.png", b"png");
    write(
        &project,
        "experiments/EXP-001/methods/sub/run.py",
        b"print()\n",
    );

    for (path, bytes) in [
        (
            "_notebook/experiments/EXP-001/evidence/plot.png",
            &b"png"[..],
        ),
        (
            "_notebook/experiments/EXP-001/methods/sub/run.py",
            b"print()\n",
        ),
    ] {
        let mut opened = root.open_version_file(&rel(path)).unwrap();
        assert_eq!(opened.len, bytes.len() as u64);
        assert!(opened.path.is_absolute());
        let mut read = Vec::new();
        opened.file.read_to_end(&mut read).unwrap();
        assert_eq!(read, bytes);
    }
}

#[test]
fn other_paths_are_refused() {
    let project = TestProject::new();
    let root = project.open();
    write(&project, "experiments/EXP-001/experiment.md", b"text");
    write(&project, "experiments/EXP-001/artefacts.yaml", b"x: 1");
    write(&project, "questions/Q-01.md", b"q");
    fs::write(project.on_disk("analysis.csv"), b"a,b").unwrap();

    for path in [
        "_notebook/experiments/EXP-001/experiment.md",
        "_notebook/experiments/EXP-001/artefacts.yaml",
        "_notebook/experiments/EXP-001/evidence",
        "_notebook/experiments/evidence/x.png",
        "_notebook/questions/Q-01.md",
        "_notebook/project.yaml",
        "analysis.csv",
    ] {
        assert!(
            matches!(
                root.open_version_file(&rel(path)),
                Err(ReadError::NotVersionFile { .. })
            ),
            "expected `{path}` to be refused"
        );
    }
}

#[test]
fn a_missing_file_is_reported_as_missing() {
    let project = TestProject::new();
    let root = project.open();
    assert!(matches!(
        root.open_version_file(&rel("_notebook/experiments/EXP-001/evidence/gone.png")),
        Err(ReadError::Missing { .. })
    ));
}

#[test]
fn a_folder_is_not_a_file() {
    let project = TestProject::new();
    let root = project.open();
    fs::create_dir_all(project.on_disk("_notebook/experiments/EXP-001/evidence/dir")).unwrap();
    assert!(matches!(
        root.open_version_file(&rel("_notebook/experiments/EXP-001/evidence/dir")),
        Err(ReadError::NotAFile { .. })
    ));
}

#[test]
fn a_link_that_leads_out_of_the_notebook_is_not_followed() {
    let project = TestProject::new();
    let root = project.open();
    fs::create_dir_all(project.on_disk("results")).unwrap();
    fs::write(project.on_disk("results/data.csv"), b"a,b").unwrap();
    fs::create_dir_all(project.on_disk("_notebook/experiments/EXP-001")).unwrap();
    make_dir_link(
        &project.on_disk("_notebook/experiments/EXP-001/evidence"),
        &project.on_disk("results"),
    );

    assert!(matches!(
        root.open_version_file(&rel("_notebook/experiments/EXP-001/evidence/data.csv")),
        Err(ReadError::EscapesNotebook { .. })
    ));
}

#[test]
fn a_link_inside_the_notebook_to_another_file_is_refused() {
    let project = TestProject::new();
    let root = project.open();
    write(&project, "experiments/EXP-001/experiment.md", b"text");
    fs::create_dir_all(project.on_disk("_notebook/experiments/EXP-002")).unwrap();
    // evidence/ of EXP-002 is a link to the experiment folder of EXP-001, so
    // `evidence/experiment.md` would reach a notebook data file.
    make_dir_link(
        &project.on_disk("_notebook/experiments/EXP-002/evidence"),
        &project.on_disk("_notebook/experiments/EXP-001"),
    );

    assert!(matches!(
        root.open_version_file(&rel("_notebook/experiments/EXP-002/evidence/experiment.md")),
        Err(ReadError::NotVersionFile { .. })
    ));
}

#[test]
fn opening_writes_nothing() {
    let project = TestProject::new();
    let root = project.open();
    write(&project, "experiments/EXP-001/evidence/plot.png", b"png");
    let outside = snapshot_outside_notebook(project.root());
    let path = project.on_disk("_notebook/experiments/EXP-001/evidence/plot.png");
    let before = fs::metadata(&path).unwrap().modified().unwrap();

    drop(root.open_version_file(&rel("_notebook/experiments/EXP-001/evidence/plot.png")));

    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), before);
    assert_eq!(fs::read(&path).unwrap(), b"png");
    assert_eq!(snapshot_outside_notebook(project.root()), outside);
}
