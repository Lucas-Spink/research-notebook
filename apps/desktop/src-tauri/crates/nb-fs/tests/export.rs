//! FR-ARC-08 (ADR-0057): the files a bundle reads, and the one write the
//! application makes outside the project, a new file in a folder the person
//! chose. The project is only read; nothing already in the folder is replaced.
// disallowed_methods: the tests build folders and a stand-in producer with
// std::fs, outside any real project.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

use std::fs;
use std::io::{Read, Write};

use common::{make_dir_link, snapshot_outside_notebook, TestProject};
use nb_fs::{ArchiveScope, ExportError};

fn project_with_notebook_files() -> TestProject {
    let project = TestProject::new();
    fs::create_dir_all(project.on_disk("_notebook/experiments/EXP-001/evidence")).unwrap();
    fs::write(
        project.on_disk("_notebook/project.yaml"),
        b"format_version: 1\n",
    )
    .unwrap();
    fs::write(
        project.on_disk("_notebook/experiments/EXP-001/evidence/a.png"),
        b"png",
    )
    .unwrap();
    fs::write(project.on_disk("_notebook/.lock"), b"lock").unwrap();
    fs::write(project.on_disk("_notebook/.project.yaml.1.2.tmp"), b"half").unwrap();
    project
}

fn paths(project: &TestProject, scope: ArchiveScope) -> Vec<String> {
    project
        .open()
        .list_archive_files(scope)
        .unwrap()
        .files
        .into_iter()
        .map(|f| f.path)
        .collect()
}

#[test]
fn a_notebook_listing_holds_only_notebook_files_in_path_order() {
    let project = project_with_notebook_files();

    assert_eq!(
        paths(&project, ArchiveScope::Notebook),
        [
            "_notebook/experiments/EXP-001/evidence/a.png",
            "_notebook/project.yaml"
        ]
    );
}

#[test]
fn a_project_listing_adds_the_analysis_files() {
    let project = project_with_notebook_files();

    let listed = paths(&project, ArchiveScope::Project);

    for expected in [
        "README.md",
        "scripts/run.R",
        "results/pca/pca.csv",
        "data/counts.bin",
        "_notebook/project.yaml",
    ] {
        assert!(listed.contains(&expected.to_owned()), "{expected}");
    }
    assert!(!listed
        .iter()
        .any(|p| p.ends_with(".lock") || p.ends_with(".tmp")));
}

#[test]
fn the_listing_records_sizes() {
    let project = project_with_notebook_files();

    let listing = project
        .open()
        .list_archive_files(ArchiveScope::Notebook)
        .unwrap();

    let png = listing
        .files
        .iter()
        .find(|f| f.path.ends_with("a.png"))
        .unwrap();
    assert_eq!(png.size, 3);
}

#[test]
fn a_link_is_neither_followed_nor_listed_but_is_counted() {
    let project = project_with_notebook_files();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("secret.txt"), b"secret").unwrap();
    make_dir_link(&project.on_disk("linked"), outside.path());

    let listing = project
        .open()
        .list_archive_files(ArchiveScope::Project)
        .unwrap();

    assert!(!listing.files.iter().any(|f| f.path.starts_with("linked")));
    assert_eq!(listing.skipped, 1);
}

#[test]
fn listing_changes_nothing_in_the_project() {
    let project = project_with_notebook_files();
    let before = snapshot_outside_notebook(project.root());

    project
        .open()
        .list_archive_files(ArchiveScope::Project)
        .unwrap();

    assert_eq!(snapshot_outside_notebook(project.root()), before);
}

#[test]
fn a_listed_file_opens_and_reads_back_its_bytes() {
    let project = project_with_notebook_files();

    let mut file = project.open().open_archive_file("scripts/run.R").unwrap();
    let mut text = String::new();
    file.read_to_string(&mut text).unwrap();

    assert_eq!(text, "print('hello')\n");
}

#[test]
fn only_a_plain_forward_path_below_the_project_opens() {
    let project = project_with_notebook_files();
    let root = project.open();

    for bad in ["../x", "a/../b", "/abs", "C:/x", "", "_notebook/.lock"] {
        assert!(root.open_archive_file(bad).is_err(), "{bad}");
    }
}

#[test]
fn an_export_is_placed_in_the_chosen_folder_under_the_requested_name() {
    let project = project_with_notebook_files();
    let target = tempfile::tempdir().unwrap();

    let exported = project
        .open()
        .write_new_outside(target.path(), "lab.nbk", |file| {
            file.write_all(b"zip")?;
            Ok::<_, std::io::Error>(())
        })
        .unwrap();

    assert_eq!(exported.name, "lab.nbk");
    assert_eq!(exported.bytes, 3);
    assert_eq!(fs::read(target.path().join("lab.nbk")).unwrap(), b"zip");
    assert_eq!(
        fs::read_dir(target.path()).unwrap().count(),
        1,
        "no temp file"
    );
}

#[test]
fn an_existing_file_is_never_replaced() {
    let project = project_with_notebook_files();
    let target = tempfile::tempdir().unwrap();
    fs::write(target.path().join("lab.nbk"), b"mine").unwrap();
    let root = project.open();
    let write = |bytes: &'static [u8]| {
        root.write_new_outside(target.path(), "lab.nbk", move |file| {
            file.write_all(bytes)?;
            Ok::<_, std::io::Error>(())
        })
        .unwrap()
    };

    let first = write(b"one");
    let second = write(b"two");

    assert_eq!(first.name, "lab (2).nbk");
    assert_eq!(second.name, "lab (3).nbk");
    assert_eq!(fs::read(target.path().join("lab.nbk")).unwrap(), b"mine");
    assert_eq!(fs::read(target.path().join("lab (2).nbk")).unwrap(), b"one");
}

#[test]
fn a_failed_producer_leaves_nothing_behind() {
    let project = project_with_notebook_files();
    let target = tempfile::tempdir().unwrap();

    let result = project
        .open()
        .write_new_outside(target.path(), "lab.nbk", |file| {
            file.write_all(b"partial")?;
            Err::<(), _>(std::io::Error::other("stop"))
        });

    assert!(matches!(result, Err(ExportError::Produce(_))));
    assert_eq!(fs::read_dir(target.path()).unwrap().count(), 0);
}

#[test]
fn a_folder_inside_the_project_is_refused_and_nothing_is_written() {
    let project = project_with_notebook_files();
    let before = snapshot_outside_notebook(project.root());
    let root = project.open();

    for inside in [
        project.root().to_path_buf(),
        project.on_disk("scripts"),
        project.on_disk("_notebook"),
        project.on_disk("_notebook/experiments"),
    ] {
        let result = root.write_new_outside(&inside, "lab.nbk", |_| Ok::<_, std::io::Error>(()));
        assert!(
            matches!(result, Err(ExportError::InsideProject)),
            "{inside:?}"
        );
    }

    assert_eq!(snapshot_outside_notebook(project.root()), before);
    assert!(!project.exists("lab.nbk"));
}

#[test]
fn a_folder_that_links_into_the_project_is_refused() {
    let project = project_with_notebook_files();
    let holder = tempfile::tempdir().unwrap();
    make_dir_link(&holder.path().join("back"), &project.on_disk("scripts"));

    let result = project
        .open()
        .write_new_outside(&holder.path().join("back"), "lab.nbk", |_| {
            Ok::<_, std::io::Error>(())
        });

    assert!(matches!(result, Err(ExportError::InsideProject)));
    assert!(!project.exists("scripts/lab.nbk"));
}

#[test]
fn a_missing_folder_or_a_file_in_its_place_is_refused() {
    let project = project_with_notebook_files();
    let target = tempfile::tempdir().unwrap();
    fs::write(target.path().join("file"), b"x").unwrap();
    let root = project.open();

    for bad in [target.path().join("nowhere"), target.path().join("file")] {
        let result = root.write_new_outside(&bad, "lab.nbk", |_| Ok::<_, std::io::Error>(()));
        assert!(matches!(result, Err(ExportError::FolderInvalid)), "{bad:?}");
    }
}

#[test]
fn only_a_single_safe_file_name_is_accepted() {
    let project = project_with_notebook_files();
    let target = tempfile::tempdir().unwrap();
    let root = project.open();

    for bad in [
        "",
        "../x.nbk",
        "a/b.nbk",
        "a\\b.nbk",
        "CON.nbk",
        "nul",
        "x.nbk.",
        "x.nbk ",
        "a:b.nbk",
        "a?.nbk",
        ".hidden.tmp",
    ] {
        let result = root.write_new_outside(target.path(), bad, |_| Ok::<_, std::io::Error>(()));
        assert!(matches!(result, Err(ExportError::UnsafeName)), "{bad:?}");
    }
    assert_eq!(fs::read_dir(target.path()).unwrap().count(), 0);
}
