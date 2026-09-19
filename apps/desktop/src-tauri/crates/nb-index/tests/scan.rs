//! S2-T07, spec 6.4 step 4: the index is brought up to date by comparing
//! file size, modification time and content hash.
// disallowed_methods: tests build and inspect throwaway folders in temporary
// directories; the std::fs write calls are fixture setup.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

use std::time::UNIX_EPOCH;

use common::{changed_paths, later, removed_paths, sha256_hex, TestProject};
use nb_index::ScanMode;

fn project_with_files() -> TestProject {
    let project = TestProject::new();
    project.write("project.yaml", "format_version: 1\n");
    project.write("bibliography.json", "z:u:AAAA2222|A paper\n");
    project.write("questions/q1.md", "Why do batches differ?\n");
    project.write("experiments/e1/experiment.md", "PCA\nTreatment separates\n");
    project.write(
        "experiments/e1/artefacts.yaml",
        "PCA plot|evidence/pca.pdf\n",
    );
    project
}

#[test]
fn a_new_index_reports_every_notebook_data_file_as_changed() {
    let project = project_with_files();
    let (mut index, _) = project.open_index();
    let scan = index.scan(&project.root(), ScanMode::Quick).unwrap();
    assert_eq!(
        changed_paths(&scan),
        [
            "_notebook/bibliography.json",
            "_notebook/experiments/e1/artefacts.yaml",
            "_notebook/experiments/e1/experiment.md",
            "_notebook/project.yaml",
            "_notebook/questions/q1.md",
        ]
    );
    assert!(scan.removed.is_empty());
    assert_eq!(scan.unchanged, 0);
}

#[test]
fn each_changed_file_carries_its_size_time_and_hash() {
    let project = project_with_files();
    let (mut index, _) = project.open_index();
    let scan = index.scan(&project.root(), ScanMode::Quick).unwrap();
    let q1 = scan
        .changed
        .iter()
        .find(|m| m.path.as_str() == "_notebook/questions/q1.md")
        .unwrap();
    let text = b"Why do batches differ?\n";
    assert_eq!(q1.size, text.len() as u64);
    assert_eq!(q1.sha256, sha256_hex(text));
    let expected = project
        .mtime("questions/q1.md")
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    assert_eq!(i128::from(q1.mtime_ns), i128::try_from(expected).unwrap());
}

#[test]
fn only_notebook_data_files_are_indexed() {
    let project = project_with_files();
    project.write("experiments/e1/evidence/pca.pdf", "binary");
    project.write("experiments/e1/methods/run.R", "print(1)");
    project.write("experiments/e1/notes.md", "stray");
    project.write("questions/.q2.md.1.1.tmp", "temporary");
    project.write("questions/readme.txt", "not a question");
    project.write(".history/old.md", "old");
    project.write(".lock", "{}");
    project.write("inbox/01JAX/request.json", "{}");
    project.write("styles/nature.csl", "<style/>");
    project.write("README.md", "guide");
    let (mut index, _) = project.open_index();
    let scan = index.scan(&project.root(), ScanMode::Quick).unwrap();
    assert_eq!(scan.changed.len(), 5, "{:?}", changed_paths(&scan));
}

#[test]
fn a_file_the_index_already_holds_is_unchanged() {
    let project = project_with_files();
    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    for mode in [ScanMode::Quick, ScanMode::Full] {
        let scan = project.sync(&mut index, mode);
        assert!(scan.changed.is_empty(), "{mode:?}");
        assert!(scan.removed.is_empty(), "{mode:?}");
        assert_eq!(scan.unchanged, 5, "{mode:?}");
    }
}

#[test]
fn an_edit_that_changes_the_size_is_found() {
    let project = project_with_files();
    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    project.write("questions/q1.md", "Why do batches differ, really?\n");
    let scan = project.sync(&mut index, ScanMode::Quick);
    assert_eq!(changed_paths(&scan), ["_notebook/questions/q1.md"]);
}

#[test]
fn an_edit_that_keeps_the_size_but_changes_the_time_is_found() {
    let project = project_with_files();
    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    let before = project.mtime("questions/q1.md");
    project.write("questions/q1.md", "Why do batches differ!\n");
    project.set_mtime("questions/q1.md", later(before, 5));
    let scan = project.sync(&mut index, ScanMode::Quick);
    assert_eq!(changed_paths(&scan), ["_notebook/questions/q1.md"]);
}

#[test]
fn a_new_time_with_the_same_content_is_not_a_change() {
    let project = project_with_files();
    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    let before = project.mtime("questions/q1.md");
    project.set_mtime("questions/q1.md", later(before, 5));
    let scan = project.sync(&mut index, ScanMode::Quick);
    assert!(scan.changed.is_empty());
    // The new time was remembered, so the next quick scan need not hash it.
    let nanos = later(before, 5)
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dump = index.dump().unwrap();
    assert!(dump.contains(&nanos.to_string()), "{dump}");
}

#[test]
fn only_a_full_scan_finds_an_edit_that_kept_size_and_time() {
    let project = project_with_files();
    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    let before = project.mtime("questions/q1.md");
    project.write("questions/q1.md", "Why do batches differ!\n");
    project.set_mtime("questions/q1.md", before);

    let quick = index.scan(&project.root(), ScanMode::Quick).unwrap();
    assert!(quick.changed.is_empty(), "Quick trusts size and time");
    let full = index.scan(&project.root(), ScanMode::Full).unwrap();
    assert_eq!(changed_paths(&full), ["_notebook/questions/q1.md"]);
}

#[test]
fn a_deleted_file_is_reported_removed_and_its_rows_go() {
    let project = project_with_files();
    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    assert!(index.dump().unwrap().contains("Why do batches differ?"));
    project.remove("questions/q1.md");
    let scan = project.sync(&mut index, ScanMode::Quick);
    assert_eq!(removed_paths(&scan), ["_notebook/questions/q1.md"]);
    let dump = index.dump().unwrap();
    assert!(!dump.contains("Why do batches differ?"), "{dump}");
    assert!(!dump.contains("questions/q1.md"), "{dump}");
}

#[cfg(unix)]
#[test]
fn links_are_not_followed() {
    let project = project_with_files();
    std::os::unix::fs::symlink(
        project.root_dir().join("results/pca.csv"),
        project.file("questions/q2.md"),
    )
    .unwrap();
    let (mut index, _) = project.open_index();
    let scan = index.scan(&project.root(), ScanMode::Quick).unwrap();
    assert_eq!(scan.changed.len(), 5);
}

#[test]
fn apply_replaces_the_rows_of_a_changed_file_only() {
    let project = project_with_files();
    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    project.write("questions/q1.md", "A new title\n");
    project.sync(&mut index, ScanMode::Quick);
    let dump = index.dump().unwrap();
    assert!(dump.contains("A new title"));
    assert!(!dump.contains("Why do batches differ?"));
    assert!(dump.contains("PCA plot"), "other files keep their rows");
}
