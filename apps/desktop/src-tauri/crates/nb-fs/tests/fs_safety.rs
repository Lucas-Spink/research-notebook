//! Gate S2-G06: nothing outside `_notebook/` changes (`pnpm test:fs-safety`,
//! P2). A synthetic project holds analysis files; every backend operation
//! and every refused attempt runs; the snapshot outside `_notebook/` must be
//! identical afterwards.
//!
//! Any new backend operation must be added to `scenario` in the same pull
//! request (docs/testing-guide.md, "Filesystem safety").
// disallowed_methods: the scenario builds a throwaway project and a link in a
// temporary directory; the std::fs write calls are fixture setup.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

use common::{make_dir_link, snapshot_outside_notebook, TestProject};
use nb_fs::{ProjectRelPath, ProjectRoot, WriteError};

/// Every operation nb-fs offers, with valid and invalid arguments.
fn scenario(project: &TestProject, root: &ProjectRoot) {
    let write = |path: &str, contents: &[u8]| -> Result<(), WriteError> {
        root.write_atomic(&ProjectRelPath::parse(path)?, contents)
    };

    // Valid writes: new files, nested folders, overwrite, empty, large.
    write("_notebook/project.yaml", b"format_version: 1\n").unwrap();
    write("_notebook/questions/Q-001.md", b"---\nid: x\n---\n").unwrap();
    write("_notebook/experiments/EXP-001/experiment.md", b"first").unwrap();
    write("_notebook/experiments/EXP-001/experiment.md", b"second").unwrap();
    write("_notebook/experiments/EXP-001/artefacts.yaml", b"").unwrap();
    write(
        "_notebook/experiments/EXP-001/evidence/big.bin",
        &vec![7u8; 300_000],
    )
    .unwrap();
    write(
        "_notebook\\backslashes\\normalised.md",
        b"stored with forward slashes",
    )
    .unwrap();
    write("_notebook/e\u{301}cole.md", b"normalised to NFC").unwrap();

    // Refused: every one of these aims at a file or folder the app must not touch.
    let outside_link = "_notebook/linked/pca.csv";
    for path in [
        "scripts/run.R",
        "results/pca/pca.csv",
        "README.md",
        "data/counts.bin",
        "data/new-file.bin",
        "new-top-level-file",
        "_notebook/../scripts/run.R",
        "_notebook/../README.md",
        "_notebook\\..\\data\\counts.bin",
        "../outside.txt",
        "/tmp/absolute.txt",
        "C:/Windows/absolute.txt",
        "//server/share/x",
        "_Notebook/case-variant.md",
        "_notebook2/sibling.md",
        outside_link,
        "_notebook/linked/new/deeper/file.md",
        "_notebook/CON",
        "_notebook/x:stream",
    ] {
        assert!(write(path, b"evil").is_err(), "{path} should be refused");
    }

    // The project's own files inside `_notebook/` are untouched by refusals.
    assert_eq!(
        project.read("_notebook/project.yaml"),
        b"format_version: 1\n"
    );
    assert!(project.temp_files().is_empty());
}

#[test]
fn nothing_outside_the_notebook_folder_changes() {
    let project = TestProject::new();
    // A link inside the notebook that leads to analysis results.
    make_dir_link(
        &project.on_disk("_notebook/linked"),
        &project.on_disk("results/pca"),
    );

    let before = snapshot_outside_notebook(project.root());
    assert!(
        before.len() >= 8,
        "the snapshot should cover the analysis files: {before:?}"
    );

    let root = project.open();
    scenario(&project, &root);

    assert_eq!(snapshot_outside_notebook(project.root()), before);
}
