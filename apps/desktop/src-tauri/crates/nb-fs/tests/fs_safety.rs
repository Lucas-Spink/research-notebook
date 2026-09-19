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

use std::fs;

use common::{
    make_dir_link, snapshot_outside_notebook, snapshot_outside_notebook_except, TestProject,
};
use nb_fs::lock::{
    AcquireOutcome, LockEnv, LockInfo, RefreshOutcome, ReleaseOutcome, SystemEnv, Timestamp,
};
use nb_fs::settings::SettingsStore;
use nb_fs::{NewProject, ProjectRelPath, ProjectRoot, WriteError};

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

    lock_scenario(project, root);
}

/// S2-T06. Locking writes and deletes only `_notebook/.lock`: acquiring,
/// being refused by a live lock, taking over a stale one, refreshing,
/// releasing, and meeting a `.lock` that is a link to an analysis folder.
fn lock_scenario(project: &TestProject, root: &ProjectRoot) {
    let env = SystemEnv::new("0.1.0");
    let mut held = match root.acquire_lock(&env, false).unwrap() {
        AcquireOutcome::Acquired(held) => held,
        other => panic!("expected the lock, got {other:?}"),
    };
    assert!(matches!(
        root.acquire_lock(&env, true).unwrap(),
        AcquireOutcome::Live(_)
    ));
    assert_eq!(
        root.refresh_lock(&env, &mut held).unwrap(),
        RefreshOutcome::Refreshed
    );
    assert_eq!(root.release_lock(held).unwrap(), ReleaseOutcome::Released);

    let long_ago = Timestamp::from_unix(env.now().unix() - 3_600);
    let stale = LockInfo {
        host: "elsewhere".to_owned(),
        pid: 1,
        app_version: "0.1.0".to_owned(),
        opened: long_ago,
        heartbeat: long_ago,
    };
    fs::write(project.on_disk("_notebook/.lock"), stale.to_file_text()).unwrap();
    assert!(matches!(
        root.acquire_lock(&env, false).unwrap(),
        AcquireOutcome::Stale(_)
    ));
    let taken = match root.acquire_lock(&env, true).unwrap() {
        AcquireOutcome::Acquired(held) => held,
        other => panic!("expected the takeover, got {other:?}"),
    };
    assert_eq!(root.release_lock(taken).unwrap(), ReleaseOutcome::Released);

    let link = project.on_disk("_notebook/.lock");
    make_dir_link(&link, &project.on_disk("results/pca"));
    for confirm in [false, true] {
        assert!(matches!(
            root.acquire_lock(&env, confirm).unwrap(),
            AcquireOutcome::Unreadable { replaceable: false }
        ));
    }
    // A junction is removed as a folder, a symlink as a file; either way
    // only the link goes.
    fs::remove_dir(&link)
        .or_else(|_| fs::remove_file(&link))
        .unwrap();
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

/// S2-T05. The only writes outside `_notebook/` are the two repository
/// hygiene files (spec 5.12, FR-PRJ-01). Everything else at the project root
/// must be unchanged by creating, opening and locating a project, and those
/// two files may only gain lines.
#[test]
fn creating_and_opening_a_project_changes_only_the_two_hygiene_files() {
    const HYGIENE: [&str; 2] = [".gitignore", ".gitattributes"];
    let project = TestProject::without_notebook();
    let existing = b"target/
*.log
";
    fs::write(project.on_disk(".gitignore"), existing).unwrap();

    let before = snapshot_outside_notebook_except(project.root(), &HYGIENE);
    assert!(
        before.len() >= 8,
        "the snapshot should cover the analysis files: {before:?}"
    );

    let new = NewProject {
        project_yaml: "format_version: 1
",
        bibliography_json: "[]
",
        evidence_in_git: false,
    };
    let created = ProjectRoot::create(project.root(), &new).unwrap();
    created.project.read_project_yaml().unwrap();
    assert!(ProjectRoot::is_project_folder(project.root()));
    ProjectRoot::open(project.root())
        .unwrap()
        .read_project_yaml()
        .unwrap();

    // Refused attempts change nothing either: a second create, and one
    // aimed at an analysis folder.
    assert!(ProjectRoot::create(project.root(), &new).is_err());
    assert!(ProjectRoot::create(&project.on_disk("scripts/run.R"), &new).is_err());
    assert!(!project.exists("scripts/_notebook"));

    // Recent projects and external roots live in the settings folder, which
    // is not part of any project.
    let settings_dir = tempfile::Builder::new()
        .prefix("nb-settings-")
        .tempdir()
        .unwrap();
    let store = SettingsStore::new(settings_dir.path());
    store
        .update(|s| {
            s.remember("01JAX9Q2B7N4M8T6V3W5Y1Z0KC", "Batch", "/somewhere/else");
            s.set_external_root(
                "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
                "01JAXA1C5D8E2F4G6H7J9K0M1N",
                "/raw",
            );
        })
        .unwrap();

    assert_eq!(
        snapshot_outside_notebook_except(project.root(), &HYGIENE),
        before
    );
    assert!(project.read(".gitignore").starts_with(existing));
    assert!(project.temp_files().is_empty());
}
