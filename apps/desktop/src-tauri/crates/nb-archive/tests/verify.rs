//! S6-G03: Verify detects corruption (FR-ARC-03).
#![allow(clippy::unwrap_used, clippy::disallowed_methods)]

use std::fs;

use nb_archive::{verify, Expected, Verdict};
use nb_fs::ProjectRoot;
use proptest::prelude::*;
use tempfile::TempDir;

const DIR: &str = "_notebook/experiments/EXP-001/evidence";

fn sha256_of(bytes: &[u8]) -> String {
    // Known-answer hashes would hide a wrong comparison; derive via nb-fs instead.
    let dir = tempfile::tempdir().unwrap();
    let rel = format!("{DIR}/probe.bin");
    let path = dir.path().join(&rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, bytes).unwrap();
    let root = ProjectRoot::open(dir.path()).unwrap();
    let rel = nb_fs::ProjectRelPath::parse(&rel).unwrap();
    root.observe_version_file(&rel).unwrap().sha256
}

fn project(files: &[(String, Vec<u8>)]) -> (TempDir, ProjectRoot, Vec<Expected>) {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("_notebook")).unwrap();
    let mut expected = Vec::new();
    for (name, bytes) in files {
        let rel = format!("{DIR}/{name}");
        let path = dir.path().join(&rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, bytes).unwrap();
        expected.push(Expected {
            path: rel,
            size: bytes.len() as u64,
            sha256: sha256_of(bytes),
        });
    }
    let root = ProjectRoot::open(dir.path()).unwrap();
    (dir, root, expected)
}

fn files() -> impl Strategy<Value = Vec<(String, Vec<u8>)>> {
    prop::collection::vec(prop::collection::vec(any::<u8>(), 1..300), 1..5).prop_map(|all| {
        all.into_iter()
            .enumerate()
            .map(|(i, bytes)| (format!("file{i}.bin"), bytes))
            .collect()
    })
}

proptest! {
    #[test]
    fn verify_reports_a_single_flipped_byte(
        files in files(), which in any::<prop::sample::Index>(),
        at in any::<prop::sample::Index>(), mask in 1u8..=255,
    ) {
        let (dir, root, expected) = project(&files);
        prop_assert!(verify(&root, &expected).iter().all(|v| *v == Verdict::Matches));

        let target = which.index(files.len());
        let rel = &expected[target].path;
        let path = dir.path().join(rel);
        let mut bytes = fs::read(&path).unwrap();
        let i = at.index(bytes.len());
        bytes[i] ^= mask;
        fs::write(&path, bytes).unwrap();

        for (i, verdict) in verify(&root, &expected).into_iter().enumerate() {
            if i == target {
                prop_assert_eq!(verdict, Verdict::Differs { size_changed: false, hash_changed: true });
            } else {
                prop_assert_eq!(verdict, Verdict::Matches);
            }
        }
    }
}

#[test]
fn verify_reports_a_missing_file() {
    let (dir, root, expected) = project(&[("a.bin".into(), b"abc".to_vec())]);
    fs::remove_file(dir.path().join(&expected[0].path)).unwrap();
    assert_eq!(verify(&root, &expected), vec![Verdict::Missing]);
}

#[test]
fn verify_reports_a_size_change_and_a_hash_change() {
    let (dir, root, expected) = project(&[("a.bin".into(), b"abc".to_vec())]);
    fs::write(dir.path().join(&expected[0].path), b"abcd").unwrap();
    assert_eq!(
        verify(&root, &expected),
        vec![Verdict::Differs {
            size_changed: true,
            hash_changed: true
        }]
    );
}

#[test]
fn verify_reports_a_path_that_is_not_a_captured_file() {
    let (_dir, root, mut expected) = project(&[("a.bin".into(), b"abc".to_vec())]);
    expected[0].path = "_notebook/artefacts.yaml".into();
    assert_eq!(verify(&root, &expected), vec![Verdict::Unreadable]);
    expected[0].path = "../outside.bin".into();
    assert_eq!(verify(&root, &expected), vec![Verdict::Unreadable]);
}

#[test]
fn verify_changes_nothing_on_disk() {
    let (dir, root, expected) = project(&[("a.bin".into(), b"abc".to_vec())]);
    let path = dir.path().join(&expected[0].path);
    let before = fs::metadata(&path).unwrap().modified().unwrap();
    verify(&root, &expected);
    assert_eq!(fs::read(&path).unwrap(), b"abc");
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), before);
}
