//! FR-ARC-07 (ADR-0055): the machine-readable export is written only under
//! `_notebook/exports/machine/`, in the order given, with plain file names.
#![allow(clippy::unwrap_used, clippy::disallowed_methods)]

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use nb_archive::{write_machine_files, FileVerdict};
use nb_fs::ProjectRoot;
use tempfile::TempDir;

const MACHINE: &str = "_notebook/exports/machine";

fn project() -> (TempDir, ProjectRoot) {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("_notebook/experiments/EXP-001")).unwrap();
    fs::write(dir.path().join("analysis.R"), "print(1)\n").unwrap();
    let root = ProjectRoot::open(dir.path()).unwrap();
    (dir, root)
}

fn file(name: &str, text: &str) -> (String, String) {
    (name.to_owned(), text.to_owned())
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
fn the_three_kinds_of_file_are_written_under_exports_machine() {
    let (dir, root) = project();

    let verdicts = write_machine_files(
        &root,
        &[
            file("schemas/notebook.schema.json", "{}\n"),
            file("markdown/EXP-001.md", "# EXP-001\n"),
            file("notebook.json", "{}\n"),
        ],
    );

    assert_eq!(verdicts, [FileVerdict::Written; 3]);
    let base = dir.path().join(MACHINE);
    assert_eq!(
        fs::read_to_string(base.join("markdown/EXP-001.md")).unwrap(),
        "# EXP-001\n"
    );
    assert!(base.join("schemas/notebook.schema.json").is_file());
    assert!(base.join("notebook.json").is_file());
}

#[test]
fn a_name_that_is_not_one_the_export_makes_is_refused_and_nothing_is_written() {
    let (dir, root) = project();
    let before = snapshot(&dir);

    let verdicts = write_machine_files(
        &root,
        &[
            file("../notebook.json", "x"),
            file("markdown/../../x.md", "x"),
            file("markdown/a/b.md", "x"),
            file("markdown\\EXP-001.md", "x"),
            file("markdown/.md", "x"),
            file("markdown/EXP-001.txt", "x"),
            file("schemas/x.json", "x"),
            file("other/notebook.json", "x"),
            file("/notebook.json", "x"),
            file("C:notebook.json", "x"),
            file("Notebook.json", "x"),
            file("", "x"),
        ],
    );

    assert_eq!(verdicts, [FileVerdict::Refused; 12]);
    assert_eq!(snapshot(&dir), before);
}

#[test]
fn one_refused_file_does_not_stop_the_others_and_a_rerun_replaces_a_file() {
    let (dir, root) = project();
    write_machine_files(&root, &[file("notebook.json", "old")]);

    let verdicts = write_machine_files(
        &root,
        &[file("markdown/bad.txt", "x"), file("notebook.json", "new")],
    );

    assert_eq!(verdicts, [FileVerdict::Refused, FileVerdict::Written]);
    assert_eq!(
        fs::read_to_string(dir.path().join(MACHINE).join("notebook.json")).unwrap(),
        "new"
    );
}

#[test]
fn writing_changes_nothing_outside_exports_machine() {
    let (dir, root) = project();
    let before = snapshot(&dir);

    write_machine_files(
        &root,
        &[file("markdown/Q-001.md", "q"), file("notebook.json", "{}")],
    );

    let after = snapshot(&dir);
    for (path, bytes) in &before {
        assert_eq!(after.get(path), Some(bytes), "{path} changed");
    }
    for path in after.keys().filter(|p| !before.contains_key(*p)) {
        assert!(path.starts_with(&format!("{MACHINE}/")), "{path} is new");
    }
}
