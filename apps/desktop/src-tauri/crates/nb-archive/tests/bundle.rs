//! FR-ARC-08 (ADR-0057): the notebook bundle and the full archive, written as
//! ZIP64 files beside the project, never inside it.
// disallowed_methods: the tests build and inspect throwaway projects in
// temporary directories, outside any real project.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use std::time::{Duration, UNIX_EPOCH};

use nb_archive::{
    exceeds_fat32_limit, plan_bundle, write_bundle, BundleKind, BundleOutcome, ExtraEntry,
    BUNDLE_EXTENSION, FAT32_MAX_FILE,
};
use nb_fs::ProjectRoot;
use proptest::prelude::*;
use sha2::{Digest, Sha256};
use tempfile::TempDir;
use zip::{CompressionMethod, ZipArchive};

const MARKER: &str = "NOTEBOOK-BUNDLE.json";

fn project() -> (TempDir, ProjectRoot) {
    let dir = tempfile::tempdir().unwrap();
    let write = |rel: &str, bytes: &[u8]| {
        let path = dir.path().join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, bytes).unwrap();
    };
    write("_notebook/project.yaml", b"format_version: 1\n");
    write("_notebook/experiments/EXP-001/experiment.md", b"# One\n");
    write("_notebook/experiments/EXP-001/evidence/plot.png", &[7; 300]);
    write("_notebook/.lock", b"lock");
    write("_notebook/.project.yaml.9.9.tmp", b"half");
    write("scripts/run.R", b"print('hello')\n");
    write("data/counts.csv", b"a,b\n1,2\n");
    write("data/counts.csv.gz", &[1, 2, 3, 4]);
    let root = ProjectRoot::open(dir.path()).unwrap();
    (dir, root)
}

fn write_to(root: &ProjectRoot, kind: BundleKind, folder: &Path) -> BundleOutcome {
    write_bundle(root, kind, folder, "lab", &[])
}

fn entries(file: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut archive = ZipArchive::new(File::open(file).unwrap()).unwrap();
    let mut found = BTreeMap::new();
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).unwrap();
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).unwrap();
        found.insert(entry.name().unwrap().into_owned(), bytes);
    }
    found
}

fn written(outcome: BundleOutcome) -> (String, u64, usize) {
    match outcome {
        BundleOutcome::Written { name, bytes, files } => (name, bytes, files),
        other => panic!("expected a written bundle, got {other:?}"),
    }
}

#[test]
fn a_notebook_bundle_holds_the_notebook_files_and_a_marker_only() {
    let (_project, root) = project();
    let target = tempfile::tempdir().unwrap();

    let (name, bytes, files) = written(write_to(&root, BundleKind::Notebook, target.path()));

    assert_eq!(name, format!("lab.{BUNDLE_EXTENSION}"));
    assert_eq!(files, 3);
    assert_eq!(
        bytes,
        fs::metadata(target.path().join(&name)).unwrap().len()
    );
    let found = entries(&target.path().join(&name));
    let names: Vec<&str> = found.keys().map(String::as_str).collect();
    assert_eq!(
        names,
        [
            MARKER,
            "_notebook/experiments/EXP-001/evidence/plot.png",
            "_notebook/experiments/EXP-001/experiment.md",
            "_notebook/project.yaml",
        ]
    );
    assert_eq!(found["_notebook/project.yaml"], b"format_version: 1\n");
    assert_eq!(
        found[MARKER],
        b"{\"bundle_version\":1,\"kind\":\"notebook\"}\n"
    );
}

#[test]
fn a_full_archive_holds_the_whole_project() {
    let (_project, root) = project();
    let target = tempfile::tempdir().unwrap();

    let (name, _, files) = written(write_to(&root, BundleKind::Archive, target.path()));

    assert_eq!(files, 6);
    let found = entries(&target.path().join(name));
    assert_eq!(found["scripts/run.R"], b"print('hello')\n");
    assert_eq!(found["data/counts.csv"], b"a,b\n1,2\n");
    assert_eq!(found["_notebook/project.yaml"], b"format_version: 1\n");
    assert!(!found
        .keys()
        .any(|n| n.ends_with(".lock") || n.ends_with(".tmp")));
    assert_eq!(
        found[MARKER],
        b"{\"bundle_version\":1,\"kind\":\"archive\"}\n"
    );
}

#[test]
fn extra_entries_are_added_beside_the_files() {
    let (_project, root) = project();
    let target = tempfile::tempdir().unwrap();
    let extras = [ExtraEntry {
        path: "LINKED_FILES.txt".to_owned(),
        bytes: b"/data/big.bam\n".to_vec(),
    }];

    let (name, _, files) = written(write_bundle(
        &root,
        BundleKind::Archive,
        target.path(),
        "lab",
        &extras,
    ));

    assert_eq!(files, 7);
    assert_eq!(
        entries(&target.path().join(name))["LINKED_FILES.txt"],
        b"/data/big.bam\n"
    );
}

#[test]
fn an_extra_entry_cannot_take_the_name_of_a_project_file() {
    let (_project, root) = project();
    let target = tempfile::tempdir().unwrap();
    let extras = [ExtraEntry {
        path: "scripts/run.R".to_owned(),
        bytes: b"x".to_vec(),
    }];

    let outcome = write_bundle(&root, BundleKind::Archive, target.path(), "lab", &extras);

    assert_eq!(outcome, BundleOutcome::Failed);
    assert_eq!(fs::read_dir(target.path()).unwrap().count(), 0);
}

#[test]
fn compressed_formats_are_stored_and_text_is_deflated() {
    let (_project, root) = project();
    let target = tempfile::tempdir().unwrap();
    let (name, _, _) = written(write_to(&root, BundleKind::Archive, target.path()));

    let mut archive = ZipArchive::new(File::open(target.path().join(name)).unwrap()).unwrap();
    let method =
        |archive: &mut ZipArchive<File>, entry: &str| archive.by_name(entry).unwrap().compression();

    assert_eq!(
        method(&mut archive, "data/counts.csv.gz"),
        CompressionMethod::Stored
    );
    assert_eq!(
        method(
            &mut archive,
            "_notebook/experiments/EXP-001/evidence/plot.png"
        ),
        CompressionMethod::Stored
    );
    assert_eq!(
        method(&mut archive, "data/counts.csv"),
        CompressionMethod::Deflated
    );
    assert_eq!(
        method(&mut archive, "scripts/run.R"),
        CompressionMethod::Deflated
    );
}

#[test]
fn an_entry_keeps_the_files_modification_time() {
    let (project, root) = project();
    let target = tempfile::tempdir().unwrap();
    // 2024-03-05 10:20:30 UTC.
    let when = UNIX_EPOCH + Duration::from_secs(1_709_634_030);
    File::options()
        .write(true)
        .open(project.path().join("scripts/run.R"))
        .unwrap()
        .set_modified(when)
        .unwrap();

    let (name, _, _) = written(write_to(&root, BundleKind::Archive, target.path()));

    let mut archive = ZipArchive::new(File::open(target.path().join(name)).unwrap()).unwrap();
    let stamp = archive
        .by_name("scripts/run.R")
        .unwrap()
        .last_modified()
        .unwrap();
    assert_eq!((stamp.year(), stamp.month(), stamp.day()), (2024, 3, 5));
    assert_eq!((stamp.hour(), stamp.minute(), stamp.second()), (10, 20, 30));
}

#[test]
fn bundling_changes_nothing_in_the_project() {
    let (project, root) = project();
    let before = snapshot(project.path());
    let target = tempfile::tempdir().unwrap();

    write_to(&root, BundleKind::Archive, target.path());
    write_to(&root, BundleKind::Notebook, target.path());

    assert_eq!(snapshot(project.path()), before);
}

#[test]
fn a_destination_inside_the_project_is_refused_and_nothing_is_written() {
    let (project, root) = project();
    let before = snapshot(project.path());

    for inside in [
        project.path().join("data"),
        project.path().join("_notebook"),
    ] {
        let outcome = write_to(&root, BundleKind::Archive, &inside);
        assert_eq!(outcome, BundleOutcome::InsideProject, "{inside:?}");
    }

    assert_eq!(snapshot(project.path()), before);
}

#[test]
fn a_missing_destination_and_an_unusable_name_are_reported() {
    let (_project, root) = project();
    let target = tempfile::tempdir().unwrap();

    assert_eq!(
        write_to(&root, BundleKind::Notebook, &target.path().join("nowhere")),
        BundleOutcome::FolderInvalid
    );
    assert_eq!(
        write_bundle(&root, BundleKind::Notebook, target.path(), "a/b", &[]),
        BundleOutcome::UnsafeName
    );
    assert_eq!(
        write_bundle(&root, BundleKind::Notebook, target.path(), "CON", &[]),
        BundleOutcome::UnsafeName
    );
}

#[test]
fn an_earlier_bundle_is_never_replaced() {
    let (_project, root) = project();
    let target = tempfile::tempdir().unwrap();

    let (first, _, _) = written(write_to(&root, BundleKind::Notebook, target.path()));
    let before = fs::read(target.path().join(&first)).unwrap();
    let (second, _, _) = written(write_to(&root, BundleKind::Notebook, target.path()));

    assert_eq!(first, "lab.nbk");
    assert_eq!(second, "lab (2).nbk");
    assert_eq!(fs::read(target.path().join(first)).unwrap(), before);
}

#[test]
fn a_folder_in_the_place_of_a_file_is_not_stored_as_one() {
    let (project, root) = project();
    let target = tempfile::tempdir().unwrap();
    fs::remove_file(project.path().join("scripts/run.R")).unwrap();
    fs::create_dir(project.path().join("scripts/run.R")).unwrap();

    let outcome = write_to(&root, BundleKind::Archive, target.path());

    let (name, _, files) = written(outcome);
    assert_eq!(files, 5);
    assert!(!entries(&target.path().join(name)).contains_key("scripts/run.R"));
}

#[test]
fn the_plan_counts_files_and_bytes_before_anything_is_written() {
    let (_project, root) = project();

    let notebook = plan_bundle(&root, BundleKind::Notebook).unwrap();
    let archive = plan_bundle(&root, BundleKind::Archive).unwrap();

    assert_eq!(notebook.files, 3);
    assert_eq!(notebook.bytes, 18 + 6 + 300);
    assert_eq!(archive.files, 6);
    assert!(archive.bytes > notebook.bytes);
    assert!(!archive.exceeds_fat32_limit);
}

#[test]
fn fat32_cannot_hold_a_file_of_four_gibibytes() {
    assert!(!exceeds_fat32_limit(0));
    assert!(!exceeds_fat32_limit(FAT32_MAX_FILE - 1));
    assert!(exceeds_fat32_limit(FAT32_MAX_FILE));
    assert!(exceeds_fat32_limit(5 * 1024 * 1024 * 1024));
}

fn snapshot(root: &Path) -> BTreeMap<String, (u64, String, u128)> {
    let mut found = BTreeMap::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                stack.push(path);
            } else {
                let meta = fs::metadata(&path).unwrap();
                let key = path
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                let nanos = meta
                    .modified()
                    .unwrap()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos();
                let sha = format!("{:x}", Sha256::digest(fs::read(&path).unwrap()));
                found.insert(key, (meta.len(), sha, nanos));
            }
        }
    }
    found
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(24))]

    /// Whatever files a project holds, the archive holds each one byte for
    /// byte and nothing else (S6-G05).
    #[test]
    fn every_file_round_trips_through_an_archive(
        files in proptest::collection::btree_map(
            "[a-z]{1,6}(/[a-z]{1,6}){0,2}\\.(txt|csv|png|gz|R)",
            proptest::collection::vec(any::<u8>(), 0..2048),
            1..8,
        )
    ) {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("_notebook")).unwrap();
        let mut expected = BTreeMap::new();
        for (name, bytes) in &files {
            let path = dir.path().join(name);
            // A generated name can be a folder of another: keep the first.
            if path.is_dir() || path.ancestors().skip(1).any(Path::is_file) {
                continue;
            }
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, bytes).unwrap();
            expected.insert(name.clone(), bytes.clone());
        }
        let root = ProjectRoot::open(dir.path()).unwrap();
        let target = tempfile::tempdir().unwrap();

        let (name, _, _) = written(write_to(&root, BundleKind::Archive, target.path()));

        let mut found = entries(&target.path().join(name));
        found.remove(MARKER);
        prop_assert_eq!(found, expected);
    }
}

#[test]
fn a_notebook_bundle_opens_when_extracted_and_its_files_match_by_checksum() {
    let (project, root) = project();
    let target = tempfile::tempdir().unwrap();
    let (name, _, _) = written(write_to(&root, BundleKind::Notebook, target.path()));

    let extracted = tempfile::tempdir().unwrap();
    let mut archive = ZipArchive::new(File::open(target.path().join(name)).unwrap()).unwrap();
    archive.extract(extracted.path()).unwrap();

    // Opens as a project even though the analysis files are not there.
    let reopened = ProjectRoot::open(extracted.path()).unwrap();
    assert!(!extracted.path().join("scripts").exists());
    let expected: Vec<nb_archive::Expected> = ["_notebook/experiments/EXP-001/evidence/plot.png"]
        .iter()
        .map(|path| nb_archive::Expected {
            path: (*path).to_owned(),
            size: fs::metadata(project.path().join(path)).unwrap().len(),
            sha256: format!(
                "{:x}",
                Sha256::digest(fs::read(project.path().join(path)).unwrap())
            ),
        })
        .collect();
    assert_eq!(
        nb_archive::verify(&reopened, &expected),
        [nb_archive::Verdict::Matches]
    );
}
