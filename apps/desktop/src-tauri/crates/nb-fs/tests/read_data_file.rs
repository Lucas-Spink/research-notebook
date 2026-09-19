//! S2-T08 (ADR-0024): reading a notebook data file as text, so the webview
//! can reload it after an outside change and show both sides of a conflict.
//! It is a read of a fixed set of files, never a generic read (spec 6.5): the
//! text goes to `packages/format`, the only parser, and nothing is written.
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

use common::{make_dir_link, rel, snapshot_outside_notebook, TestProject};
use nb_fs::ReadError;
use sha2::{Digest, Sha256};

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn write(project: &TestProject, notebook_path: &str, bytes: &[u8]) {
    let path = project.on_disk(&format!("_notebook/{notebook_path}"));
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, bytes).unwrap();
}

#[test]
fn reads_each_kind_of_data_file_with_the_hash_of_its_bytes() {
    let project = TestProject::new();
    let root = project.open();
    for path in [
        "project.yaml",
        "bibliography.json",
        "questions/Q-01.md",
        "experiments/EXP-001/experiment.md",
        "experiments/EXP-001/artefacts.yaml",
    ] {
        let text = format!("contents of {path}\n");
        write(&project, path, text.as_bytes());
        let file = root
            .read_data_file(&rel(&format!("_notebook/{path}")))
            .unwrap();
        assert_eq!(file.text, text, "{path}");
        assert_eq!(file.sha256, sha256(text.as_bytes()), "{path}");
    }
}

#[test]
fn keeps_line_endings_and_a_byte_order_mark_for_the_parser_to_normalise() {
    let project = TestProject::new();
    let root = project.open();
    let bytes = b"\xEF\xBB\xBFid: x\r\ntitle: y\r\n";
    write(&project, "questions/Q-01.md", bytes);
    let file = root
        .read_data_file(&rel("_notebook/questions/Q-01.md"))
        .unwrap();
    assert_eq!(file.text.as_bytes(), bytes);
    assert_eq!(file.sha256, sha256(bytes));
}

#[test]
fn a_file_that_is_not_a_data_file_is_refused() {
    let project = TestProject::new();
    let root = project.open();
    for path in [
        "README.md",
        ".lock",
        "styles/nature.csl",
        ".history/questions/Q-01.md",
        "experiments/EXP-001/evidence/plot.csv",
        "experiments/EXP-001/notes.md",
        "questions/.Q-01.md.1.1.tmp",
    ] {
        write(&project, path, b"secret\n");
        assert!(
            matches!(
                root.read_data_file(&rel(&format!("_notebook/{path}"))),
                Err(ReadError::NotDataFile { .. })
            ),
            "{path}"
        );
    }
}

#[test]
fn a_path_outside_the_notebook_is_refused() {
    let project = TestProject::new();
    let root = project.open();
    for path in ["README.md", "scripts/run.R", "_notebook_other/project.yaml"] {
        assert!(
            matches!(
                root.read_data_file(&rel(path)),
                Err(ReadError::NotDataFile { .. })
            ),
            "{path}"
        );
    }
}

#[test]
fn a_missing_file_is_reported_as_missing() {
    let project = TestProject::new();
    let root = project.open();
    assert!(matches!(
        root.read_data_file(&rel("_notebook/questions/Q-99.md")),
        Err(ReadError::Missing { .. })
    ));
}

#[test]
fn a_folder_where_a_file_should_be_is_not_a_file() {
    let project = TestProject::new();
    let root = project.open();
    fs::create_dir_all(project.on_disk("_notebook/questions/Q-01.md")).unwrap();
    assert!(matches!(
        root.read_data_file(&rel("_notebook/questions/Q-01.md")),
        Err(ReadError::NotAFile { .. })
    ));
}

#[test]
fn text_that_is_not_utf8_is_refused() {
    let project = TestProject::new();
    let root = project.open();
    write(&project, "questions/Q-01.md", b"caf\xE9\n");
    assert!(matches!(
        root.read_data_file(&rel("_notebook/questions/Q-01.md")),
        Err(ReadError::NotUtf8 { .. })
    ));
}

#[test]
fn a_link_that_leads_out_of_the_notebook_is_not_followed() {
    let project = TestProject::new();
    let root = project.open();
    // `results/EXP-001/experiment.md` is analysis output, outside `_notebook/`.
    fs::create_dir_all(project.on_disk("results/EXP-001")).unwrap();
    fs::write(
        project.on_disk("results/EXP-001/experiment.md"),
        b"outside\n",
    )
    .unwrap();
    make_dir_link(
        &project.on_disk("_notebook/experiments"),
        &project.on_disk("results"),
    );

    assert!(matches!(
        root.read_data_file(&rel("_notebook/experiments/EXP-001/experiment.md")),
        Err(ReadError::EscapesNotebook { .. })
    ));
}

#[test]
fn reading_writes_nothing() {
    let project = TestProject::new();
    let root = project.open();
    write(&project, "questions/Q-01.md", b"one\n");
    let outside = snapshot_outside_notebook(project.root());
    let path = project.on_disk("_notebook/questions/Q-01.md");
    let before = fs::metadata(&path).unwrap().modified().unwrap();

    root.read_data_file(&rel("_notebook/questions/Q-01.md"))
        .unwrap();
    let _ = root.read_data_file(&rel("_notebook/questions/Q-02.md"));
    let _ = root.read_data_file(&rel("_notebook/README.md"));

    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), before);
    assert_eq!(snapshot_outside_notebook(project.root()), outside);
}
