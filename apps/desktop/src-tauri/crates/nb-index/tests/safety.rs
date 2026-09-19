//! AGENTS.md rule 1 and spec 6.3: `nb-index` reads a project's files to
//! hash them but never writes, renames or removes anything in the project,
//! not even inside `_notebook/`. The index lives in the cache folder.
// disallowed_methods: tests build and inspect throwaway folders in temporary
// directories; the std::fs write calls are fixture setup.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

use common::{snapshot, TestProject, PROJECT_ID};
use nb_index::{Index, ScanMode};

#[test]
fn nothing_in_the_project_changes_whatever_the_index_does() {
    let project = TestProject::new();
    project.write("project.yaml", "format_version: 1\n");
    project.write("questions/q1.md", "Why do batches differ?\n");
    project.write("experiments/e1/experiment.md", "PCA\nSection\n");
    project.write("experiments/e1/artefacts.yaml", "Plot|evidence/plot.pdf\n");
    project.write("experiments/e1/evidence/plot.pdf", "pdf bytes");
    let before = snapshot(project.root_dir());

    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    project.sync(&mut index, ScanMode::Full);
    project.rebuild(&mut index);
    index.search("batches", 10).unwrap();
    index.dump().unwrap();
    drop(index);
    // A damaged database is replaced, in the cache folder only.
    let path = project
        .cache
        .path_of(&Index::file_name(PROJECT_ID))
        .unwrap();
    std::fs::write(path, b"garbage").unwrap();
    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    drop(index);

    assert_eq!(snapshot(project.root_dir()), before);
}

#[test]
fn the_database_is_in_the_cache_folder_not_the_project() {
    let project = TestProject::new();
    let (index, _) = project.open_index();
    drop(index);
    let name = Index::file_name(PROJECT_ID);
    assert!(project.cache.path_of(&name).unwrap().is_file());
    assert!(!project.root_dir().join(&name).exists());
    assert!(!project.root_dir().join("_notebook").join(&name).exists());
}
