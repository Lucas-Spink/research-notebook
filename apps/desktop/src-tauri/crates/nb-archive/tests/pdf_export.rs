//! FR-ARC-06 (ADR-0056): the project PDF is written only as
//! `_notebook/exports/pdf/project-<stamp>.pdf`, one file per run so an earlier
//! export is never replaced (issue #102).
#![allow(clippy::unwrap_used, clippy::disallowed_methods)]

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use nb_archive::{write_project_pdf, ExportStamp, FileVerdict};
use nb_fs::ProjectRoot;
use tempfile::TempDir;

const PDF: &str = "_notebook/exports/pdf/project-2026-10-11T14-30-05Z.pdf";
const LATER_PDF: &str = "_notebook/exports/pdf/project-2026-10-11T15-00-00Z.pdf";

fn stamp() -> ExportStamp {
    ExportStamp::parse("2026-10-11T14-30-05Z").unwrap()
}

fn later_stamp() -> ExportStamp {
    ExportStamp::parse("2026-10-11T15-00-00Z").unwrap()
}

fn project() -> (TempDir, ProjectRoot) {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("_notebook/experiments/EXP-001")).unwrap();
    fs::write(dir.path().join("analysis.R"), "print(1)\n").unwrap();
    let root = ProjectRoot::open(dir.path()).unwrap();
    (dir, root)
}

/// Every file under the project, with its bytes, so a change anywhere shows.
fn snapshot(dir: &TempDir) -> BTreeMap<String, Vec<u8>> {
    fn walk(base: &Path, at: &Path, found: &mut BTreeMap<String, Vec<u8>>) {
        for entry in fs::read_dir(at).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(base, &path, found);
            } else {
                let name = path.strip_prefix(base).unwrap().to_string_lossy();
                found.insert(name.replace('\\', "/"), fs::read(&path).unwrap());
            }
        }
    }
    let mut found = BTreeMap::new();
    walk(dir.path(), dir.path(), &mut found);
    found
}

#[test]
fn the_pdf_is_written_under_its_stamp() {
    let (dir, root) = project();

    assert_eq!(
        write_project_pdf(&root, &stamp(), b"%PDF-1.7 x"),
        FileVerdict::Written
    );

    assert_eq!(fs::read(dir.path().join(PDF)).unwrap(), b"%PDF-1.7 x");
}

#[test]
fn a_rerun_with_the_same_stamp_replaces_that_pdf() {
    let (dir, root) = project();
    write_project_pdf(&root, &stamp(), b"old");

    write_project_pdf(&root, &stamp(), b"new");

    assert_eq!(fs::read(dir.path().join(PDF)).unwrap(), b"new");
}

#[test]
fn writing_changes_nothing_outside_exports_pdf() {
    let (dir, root) = project();
    let before = snapshot(&dir);

    write_project_pdf(&root, &stamp(), b"%PDF");

    let after = snapshot(&dir);
    for (path, bytes) in &before {
        assert_eq!(after.get(path), Some(bytes), "{path} changed");
    }
    let new: Vec<_> = after.keys().filter(|p| !before.contains_key(*p)).collect();
    assert_eq!(new, [&PDF.to_owned()]);
}

#[test]
fn a_later_run_is_kept_beside_the_first_and_the_first_does_not_change() {
    let (dir, root) = project();
    write_project_pdf(&root, &stamp(), b"first");

    write_project_pdf(&root, &later_stamp(), b"second");

    assert_eq!(fs::read(dir.path().join(PDF)).unwrap(), b"first");
    assert_eq!(fs::read(dir.path().join(LATER_PDF)).unwrap(), b"second");
}
