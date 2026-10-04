//! S6-T02 (FR-ARC-02, spec 7.12): the manifest records what a captured
//! version's file is on disk now: its size, modification time and SHA-256,
//! read through the same confined path as previews. Nothing is written.
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
use std::time::UNIX_EPOCH;

use common::{make_dir_link, rel, snapshot_outside_notebook, TestProject};
use nb_fs::ReadError;
use proptest::prelude::*;
use sha2::{Digest, Sha256};

const EVIDENCE: &str = "_notebook/experiments/EXP-001/evidence";

fn write(project: &TestProject, notebook_path: &str, bytes: &[u8]) {
    let path = project.on_disk(&format!("_notebook/{notebook_path}"));
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, bytes).unwrap();
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[test]
fn reports_the_known_hash_of_a_file() {
    let project = TestProject::new();
    let root = project.open();
    write(&project, "experiments/EXP-001/evidence/abc.txt", b"abc");

    let seen = root
        .observe_version_file(&rel(&format!("{EVIDENCE}/abc.txt")))
        .unwrap();

    assert_eq!(
        seen.sha256,
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    assert_eq!(seen.size, 3);
}

#[test]
fn an_empty_file_has_the_hash_of_nothing() {
    let project = TestProject::new();
    let root = project.open();
    write(&project, "experiments/EXP-001/methods/empty.R", b"");

    let seen = root
        .observe_version_file(&rel("_notebook/experiments/EXP-001/methods/empty.R"))
        .unwrap();

    assert_eq!(seen.size, 0);
    assert_eq!(
        seen.sha256,
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
}

#[test]
fn a_file_larger_than_one_read_is_hashed_whole() {
    let project = TestProject::new();
    let root = project.open();
    let bytes: Vec<u8> = (0..1_000_003u32).map(|n| (n % 251) as u8).collect();
    write(&project, "experiments/EXP-001/evidence/big.bin", &bytes);

    let seen = root
        .observe_version_file(&rel(&format!("{EVIDENCE}/big.bin")))
        .unwrap();

    assert_eq!(seen.size, 1_000_003);
    assert_eq!(seen.sha256, sha256(&bytes));
}

#[test]
fn the_modification_time_is_the_files_own_in_milliseconds() {
    let project = TestProject::new();
    let root = project.open();
    write(&project, "experiments/EXP-001/evidence/t.txt", b"x");
    let on_disk = project.on_disk(&format!("{EVIDENCE}/t.txt"));
    let expected = fs::metadata(on_disk)
        .unwrap()
        .modified()
        .unwrap()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let seen = root
        .observe_version_file(&rel(&format!("{EVIDENCE}/t.txt")))
        .unwrap();

    assert_eq!(u128::from(seen.modified_ms), expected);
}

#[test]
fn a_missing_file_is_reported_as_missing() {
    let project = TestProject::new();
    let root = project.open();

    let error = root
        .observe_version_file(&rel(&format!("{EVIDENCE}/gone.txt")))
        .unwrap_err();

    assert!(matches!(error, ReadError::Missing { .. }));
}

#[test]
fn a_folder_where_a_version_file_belongs_is_not_a_file() {
    let project = TestProject::new();
    let root = project.open();
    write(&project, "experiments/EXP-001/evidence/dir/inner.txt", b"x");

    let error = root
        .observe_version_file(&rel(&format!("{EVIDENCE}/dir")))
        .unwrap_err();

    assert!(matches!(error, ReadError::NotAFile { .. }));
}

#[test]
fn only_captured_version_files_can_be_observed() {
    let project = TestProject::new();
    let root = project.open();
    write(&project, "experiments/EXP-001/experiment.md", b"text");
    write(&project, "project.yaml", b"x: 1");
    fs::write(project.on_disk("data/counts.bin"), b"data").unwrap();

    for path in [
        "_notebook/experiments/EXP-001/experiment.md",
        "_notebook/project.yaml",
        "_notebook/exports/manifest.csv",
        "data/counts.bin",
        "scripts/run.R",
    ] {
        let error = root.observe_version_file(&rel(path)).unwrap_err();
        assert!(
            matches!(error, ReadError::NotVersionFile { .. }),
            "{path}: {error:?}"
        );
    }
}

#[test]
fn a_link_out_of_the_notebook_is_not_followed() {
    let project = TestProject::new();
    let root = project.open();
    let folder = project.on_disk("_notebook/experiments/EXP-001/evidence");
    fs::create_dir_all(&folder).unwrap();
    make_dir_link(&folder.join("out"), &project.on_disk("data"));

    let error = root
        .observe_version_file(&rel(&format!("{EVIDENCE}/out/counts.bin")))
        .unwrap_err();

    assert!(matches!(error, ReadError::EscapesNotebook { .. }));
}

#[test]
fn observing_changes_nothing_not_even_the_modification_time() {
    let project = TestProject::new();
    let root = project.open();
    write(&project, "experiments/EXP-001/evidence/keep.txt", b"keep");
    let on_disk = project.on_disk(&format!("{EVIDENCE}/keep.txt"));
    let before = fs::metadata(&on_disk).unwrap().modified().unwrap();
    let outside = snapshot_outside_notebook(project.root());

    root.observe_version_file(&rel(&format!("{EVIDENCE}/keep.txt")))
        .unwrap();

    assert_eq!(fs::read(&on_disk).unwrap(), b"keep");
    assert_eq!(fs::metadata(&on_disk).unwrap().modified().unwrap(), before);
    assert_eq!(snapshot_outside_notebook(project.root()), outside);
}

proptest! {
    #[test]
    fn the_hash_and_size_always_describe_the_bytes(bytes in proptest::collection::vec(any::<u8>(), 0..70_000)) {
        let project = TestProject::new();
        let root = project.open();
        write(&project, "experiments/EXP-001/evidence/p.bin", &bytes);

        let seen = root
            .observe_version_file(&rel(&format!("{EVIDENCE}/p.bin")))
            .unwrap();

        prop_assert_eq!(seen.size, bytes.len() as u64);
        prop_assert_eq!(seen.sha256, sha256(&bytes));
    }
}
