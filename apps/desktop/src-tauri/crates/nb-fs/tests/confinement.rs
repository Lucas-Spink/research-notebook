//! Writes are confined to `_notebook/` (spec 6.5, P2, principle "analysis
//! files are never modified"): traversal, links, unsafe names and other
//! refused destinations leave everything untouched.
// disallowed_methods: the tests build links and read-only files in throwaway
// temporary projects to check that nb-fs refuses to write through them.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

use std::fs;

use common::{make_dir_link, rel, snapshot_outside_notebook, TestProject};
use nb_fs::{OpenError, ProjectRoot, WriteError};

fn kind(error: &WriteError) -> &'static str {
    match error {
        WriteError::Path(_) => "path",
        WriteError::OutsideNotebook { .. } => "outside",
        WriteError::UnsafeName { .. } => "unsafe name",
        WriteError::EscapesNotebook { .. } => "escapes",
        WriteError::TargetIsLink { .. } => "link",
        WriteError::TargetIsDirectory { .. } => "directory",
        WriteError::ReadOnly { .. } => "read-only",
        WriteError::Locked { .. } => "locked",
        WriteError::Io { .. } => "io",
    }
}

fn refused(project: &TestProject, path: &str) -> &'static str {
    let error = project
        .open()
        .write_atomic(&rel(path), b"evil")
        .unwrap_err();
    kind(&error)
}

fn notebook_entries(project: &TestProject) -> usize {
    fs::read_dir(project.on_disk("_notebook")).unwrap().count()
}

#[test]
fn refuses_destinations_outside_the_notebook_folder() {
    let project = TestProject::new();
    let before = snapshot_outside_notebook(project.root());
    for path in [
        "scripts/run.R",
        "results/pca/new.csv",
        "README.md",
        "data/counts.bin",
        "_notebook", // the folder itself, not a file inside it
        "_notebook2/x.md",
        "notebook/x.md",
        "_Notebook/x.md", // a case variant is never accepted silently
        "_NOTEBOOK/x.md",
    ] {
        assert_eq!(refused(&project, path), "outside", "{path}");
    }
    assert_eq!(snapshot_outside_notebook(project.root()), before);
    assert_eq!(notebook_entries(&project), 0);
}

#[test]
fn refuses_names_that_are_not_safe_on_windows() {
    let project = TestProject::new();
    for path in [
        "_notebook/CON",
        "_notebook/con.txt",
        "_notebook/NUL.md",
        "_notebook/COM1",
        "_notebook/lpt9.log",
        "_notebook/notes.md:stream",
        "_notebook/a<b.md",
        "_notebook/a>b.md",
        "_notebook/a\"b.md",
        "_notebook/a|b.md",
        "_notebook/a?b.md",
        "_notebook/a*b.md",
        "_notebook/trailing-dot.",
        "_notebook/trailing-space ",
        "_notebook/experiments/PRN/experiment.md",
    ] {
        assert_eq!(refused(&project, path), "unsafe name", "{path}");
    }
    assert_eq!(notebook_entries(&project), 0);
}

#[test]
fn accepts_ordinary_and_hidden_names() {
    let project = TestProject::new();
    let root = project.open();
    for path in [
        "_notebook/.history/EXP-001.md",
        "_notebook/.lock",
        "_notebook/questions/Q-003.md",
        "_notebook/experiments/EXP-042/evidence/pca_by_treatment.v2.pdf",
        "_notebook/\u{e9}cole.md",
        "_notebook/CONSOLE.md",
    ] {
        root.write_atomic(&rel(path), b"ok").unwrap();
        assert_eq!(project.read(path), b"ok", "{path}");
    }
}

#[test]
fn refuses_to_write_through_a_link_that_leads_outside_the_notebook() {
    let project = TestProject::new();
    make_dir_link(
        &project.on_disk("_notebook/link"),
        &project.on_disk("scripts"),
    );
    let before = snapshot_outside_notebook(project.root());

    assert_eq!(refused(&project, "_notebook/link/evil.txt"), "escapes");
    assert_eq!(
        refused(&project, "_notebook/link/new/deeper/evil.txt"),
        "escapes"
    );
    assert_eq!(refused(&project, "_notebook/link/run.R"), "escapes");

    assert_eq!(snapshot_outside_notebook(project.root()), before);
    assert!(!project.exists("scripts/new"));
    assert_eq!(project.read("scripts/run.R"), b"print('hello')\n");
}

#[test]
fn refuses_a_notebook_folder_that_is_a_link() {
    let project = TestProject::new();
    let other = TestProject::new();
    fs::remove_dir(other.on_disk("_notebook")).unwrap();
    make_dir_link(&other.on_disk("_notebook"), &project.on_disk("_notebook"));

    let error = ProjectRoot::open(other.root()).unwrap_err();
    assert!(
        matches!(error, OpenError::NotebookInvalid { .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_a_project_without_a_real_notebook_folder() {
    let project = TestProject::new();
    fs::remove_dir(project.on_disk("_notebook")).unwrap();
    assert!(matches!(
        ProjectRoot::open(project.root()).unwrap_err(),
        OpenError::NotebookInvalid { .. }
    ));

    fs::write(project.on_disk("_notebook"), b"a file").unwrap();
    assert!(matches!(
        ProjectRoot::open(project.root()).unwrap_err(),
        OpenError::NotebookInvalid { .. }
    ));
}

#[test]
fn reports_a_project_folder_that_does_not_exist() {
    let project = TestProject::new();
    let missing = project.on_disk("no-such-project");
    assert!(matches!(
        ProjectRoot::open(&missing).unwrap_err(),
        OpenError::Root { .. }
    ));
}

#[test]
fn refuses_to_replace_a_folder() {
    let project = TestProject::new();
    fs::create_dir_all(project.on_disk("_notebook/notes.md")).unwrap();
    assert_eq!(refused(&project, "_notebook/notes.md"), "directory");
    assert!(project.on_disk("_notebook/notes.md").is_dir());
    assert!(project.temp_files().is_empty());
}

// permissions_set_readonly_false: on Windows this only clears the read-only
// attribute so the temporary folder can be deleted; the file is not shared.
#[allow(clippy::permissions_set_readonly_false)]
#[test]
fn refuses_to_replace_a_read_only_file_and_leaves_it_unchanged() {
    let project = TestProject::new();
    let path = project.on_disk("_notebook/locked.md");
    fs::write(&path, b"keep me").unwrap();
    let mut permissions = fs::metadata(&path).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&path, permissions.clone()).unwrap();

    assert_eq!(refused(&project, "_notebook/locked.md"), "read-only");
    assert_eq!(fs::read(&path).unwrap(), b"keep me");
    assert!(project.temp_files().is_empty());

    // Windows cannot delete a read-only file when the folder is cleaned up.
    permissions.set_readonly(false);
    fs::set_permissions(&path, permissions).unwrap();
}

#[cfg(unix)]
#[test]
fn refuses_to_replace_a_file_link_and_leaves_its_target_alone() {
    let project = TestProject::new();
    std::os::unix::fs::symlink(
        project.on_disk("scripts/run.R"),
        project.on_disk("_notebook/notes.md"),
    )
    .unwrap();
    let before = snapshot_outside_notebook(project.root());

    assert_eq!(refused(&project, "_notebook/notes.md"), "link");

    assert_eq!(snapshot_outside_notebook(project.root()), before);
    assert!(fs::symlink_metadata(project.on_disk("_notebook/notes.md"))
        .unwrap()
        .file_type()
        .is_symlink());
}

#[cfg(unix)]
#[test]
fn keeps_the_permissions_of_the_file_it_replaces() {
    use std::os::unix::fs::PermissionsExt;
    let project = TestProject::new();
    let path = project.on_disk("_notebook/script.sh");
    fs::write(&path, b"#!/bin/sh\n").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o750)).unwrap();

    project
        .open()
        .write_atomic(&rel("_notebook/script.sh"), b"#!/bin/sh\necho\n")
        .unwrap();

    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o750
    );
}
