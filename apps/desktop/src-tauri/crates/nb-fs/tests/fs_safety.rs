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
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use common::{
    make_dir_link, snapshot_outside_notebook, snapshot_outside_notebook_except, TestProject,
};
use nb_fs::discovery::{discover, DiscoveryOptions};
use nb_fs::lock::{
    AcquireOutcome, LockEnv, LockInfo, RefreshOutcome, ReleaseOutcome, SystemEnv, Timestamp,
};
use nb_fs::settings::SettingsStore;
use nb_fs::watch::WatchRegistry;
use nb_fs::{
    find_relink_candidates, observe_link, stat_link, CaptureName, CaptureResult, Expected,
    KnownVersion, LinkStatus, NewProject, PayloadExpectation, ProjectRelPath, ProjectRoot,
    RelinkExpectation, SaveOutcome, SystemClock, WriteError,
};

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

    // S2-T10. Listing the notebook only reads: it names what is in questions/
    // and experiments/ and never follows the link to an analysis folder.
    let listing = root.list_notebook().unwrap();
    assert_eq!(listing.question_files, ["Q-001.md"]);
    assert_eq!(listing.experiment_folders, ["EXP-001"]);

    lock_scenario(project, root);
    history_scenario(project, root);
    capture_scenario(project, root);
    link_scenario(project);
    discovery_scenario(project);
    inbox_scenario(project, root);
    watch_scenario(project, root);
}

/// S3-T05. Inbox import only ever touches `_notebook/inbox/` and the
/// experiment folder it copies into: nothing outside `_notebook/` is read
/// or written. A request whose declared hash does not match its payload is
/// refused, leaving the payload and the rest of the project untouched.
fn inbox_scenario(project: &TestProject, root: &ProjectRoot) {
    use sha2::{Digest, Sha256};

    let evidence = ProjectRelPath::parse("_notebook/experiments/EXP-001/evidence").unwrap();
    let request_id = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";
    let contents = b"from vscode";
    fs::create_dir_all(project.on_disk(&format!("_notebook/inbox/{request_id}"))).unwrap();
    fs::write(
        project.on_disk(&format!("_notebook/inbox/{request_id}/notes.txt")),
        contents,
    )
    .unwrap();

    assert_eq!(
        root.list_inbox_requests().unwrap(),
        vec![request_id.to_owned()]
    );

    // Refused: a declared hash that does not match the payload leaves it in
    // place and nothing is copied.
    let wrong_sha256 = format!("{:x}", Sha256::digest(b"not the payload"));
    assert!(root
        .import_inbox_payload(
            request_id,
            "notes.txt",
            PayloadExpectation {
                sha256: &wrong_sha256,
                size: contents.len() as u64,
            },
            &evidence,
            CaptureName::New {
                original_file_name: "notes.txt",
            },
            &[],
        )
        .is_err());
    assert_eq!(
        project.read(&format!("_notebook/inbox/{request_id}/notes.txt")),
        contents
    );
    assert!(!project.exists("_notebook/experiments/EXP-001/evidence/notes.txt"));

    let sha256 = format!("{:x}", Sha256::digest(contents));
    root.import_inbox_payload(
        request_id,
        "notes.txt",
        PayloadExpectation {
            sha256: &sha256,
            size: contents.len() as u64,
        },
        &evidence,
        CaptureName::New {
            original_file_name: "notes.txt",
        },
        &[],
    )
    .unwrap();
    root.remove_inbox_request(request_id).unwrap();
    assert!(root.list_inbox_requests().unwrap().is_empty());
}

/// S3-T01. Capturing copies an analysis file into `evidence/` only, hashing
/// and verifying before placing it; identical content afterwards is a
/// duplicate and creates no second version; every refused attempt (a folder
/// as the source, a destination outside `_notebook/`) leaves nothing behind.
/// The source itself, `results/pca/pca.csv`, is read here and is part of
/// what the snapshot proves is untouched.
fn capture_scenario(project: &TestProject, root: &ProjectRoot) {
    let folder = ProjectRelPath::parse("_notebook/experiments/EXP-001/evidence").unwrap();
    let source = project.on_disk("results/pca/pca.csv");

    let first = root
        .capture_copy(
            &source,
            &folder,
            CaptureName::New {
                original_file_name: "pca.csv",
            },
            &[],
        )
        .unwrap();
    let CaptureResult::Created(version) = first.result else {
        panic!("expected a new version");
    };
    assert_eq!(version.file_name, "pca.csv");
    assert_eq!(version.number, 1);

    // Capturing the same source again duplicates an existing version: no
    // second version is created.
    let known = [KnownVersion {
        sha256: version.sha256,
        number: version.number,
        same_artefact: true,
    }];
    let again = root
        .capture_copy(
            &source,
            &folder,
            CaptureName::Version {
                stem: "pca",
                extension: ".csv",
            },
            &known,
        )
        .unwrap();
    assert_eq!(again.result, CaptureResult::Duplicate { version: 1 });
    assert!(!project.exists("_notebook/experiments/EXP-001/evidence/pca.v2.csv"));

    // Refused: a folder as the source, and a destination outside _notebook/.
    assert!(root
        .capture_copy(
            &project.on_disk("scripts"),
            &folder,
            CaptureName::New {
                original_file_name: "run.R",
            },
            &[],
        )
        .is_err());
    let outside = ProjectRelPath::parse("results/pca").unwrap();
    assert!(root
        .capture_copy(
            &source,
            &outside,
            CaptureName::New {
                original_file_name: "pca.csv",
            },
            &[],
        )
        .is_err());

    assert!(project.temp_files().is_empty());
}

/// S3-T02. Linking only ever reads an analysis file: observing it, checking
/// its availability, and searching a folder for a relink candidate never
/// write to it, move it or remove it. `data/counts.bin` is read here and is
/// part of what the snapshot proves is untouched.
fn link_scenario(project: &TestProject) {
    let source = project.on_disk("data/counts.bin");
    let observed = observe_link(&source).unwrap();
    assert!(matches!(
        stat_link(&source).unwrap(),
        LinkStatus::Present { size, .. } if size == observed.size
    ));

    // A missing link is reported, not an error, and nothing is written for it.
    let missing = project.on_disk("data/moved-away.bin");
    assert_eq!(stat_link(&missing).unwrap(), LinkStatus::Missing);

    // Searching for where a missing file went only reads candidates; it
    // never applies one.
    let expected = RelinkExpectation {
        file_name: "counts.bin",
        size: observed.size,
        sha256: &observed.sha256,
    };
    let candidates = find_relink_candidates(&project.on_disk("data"), &expected).unwrap();
    assert!(candidates.iter().any(|c| c.hash_matches));

    // Refused: a folder that does not exist.
    assert!(find_relink_candidates(&project.on_disk("no-such-folder"), &expected).is_err());

    assert_eq!(
        project.read("data/counts.bin"),
        (0..=255u8).collect::<Vec<_>>()
    );
}

/// S3-T07. Discovery only reads: a full scan of the project root, with the
/// notebook's link to analysis results inside `_notebook/`, a scan cancelled
/// part-way, and a refused pattern leave every analysis file as it was.
fn discovery_scenario(project: &TestProject) {
    let captured = vec!["data/counts.bin".to_owned()];
    let cancel = AtomicBool::new(false);
    let found = discover(
        project.root(),
        &DiscoveryOptions::default(),
        &captured,
        &cancel,
        &mut |_| {},
    )
    .unwrap();
    assert!(found
        .files
        .iter()
        .any(|f| f.rel_path == "data/counts.bin" && f.captured));
    assert!(found
        .files
        .iter()
        .all(|f| !f.rel_path.starts_with("_notebook")));

    let cancelled = discover(
        project.root(),
        &DiscoveryOptions::default(),
        &captured,
        &cancel,
        &mut |_| cancel.store(true, Ordering::Relaxed),
    )
    .unwrap();
    assert!(cancelled.cancelled);

    // Refused: an invalid pattern and a folder that does not exist.
    let bad = DiscoveryOptions {
        include: vec!["[".to_owned()],
        exclude: Vec::new(),
    };
    assert!(discover(project.root(), &bad, &[], &cancel, &mut |_| {}).is_err());
    assert!(discover(
        &project.on_disk("no-such-folder"),
        &DiscoveryOptions::default(),
        &[],
        &cancel,
        &mut |_| {}
    )
    .is_err());
}

/// S2-T09. Snapshots, the trash and version-change backups move and copy
/// files only inside `_notebook/`: saves that keep history, saves refused for
/// a stale hash or a scope, trashing valid and refused paths, and backups made
/// while `_notebook/` holds links to analysis folders.
fn history_scenario(project: &TestProject, root: &ProjectRoot) {
    let clock = SystemClock;
    let path = |text: &str| ProjectRelPath::parse(text).unwrap();
    let sha = |bytes: &[u8]| {
        use sha2::{Digest, Sha256};
        Expected::Sha256(format!("{:x}", Sha256::digest(bytes)))
    };

    // Overwrites keep what was there, whatever its bytes.
    let file = path("_notebook/questions/Q-001.md");
    let saved = root
        .write_data_file(&file, b"third", &sha(&project.read(file.as_str())), &clock)
        .unwrap();
    assert!(matches!(saved, SaveOutcome::Saved { snapshot: Some(_) }));
    let fresh = path("_notebook/questions/Q-002.md");
    root.write_data_file(&fresh, b"new", &Expected::Absent, &clock)
        .unwrap();

    // Refused: a stale hash, and every file outside the scope or the notebook.
    assert!(matches!(
        root.write_data_file(&file, b"stale", &sha(b"not what is there"), &clock)
            .unwrap(),
        SaveOutcome::Changed { .. }
    ));
    // Files outside the notebook's history scope are refused a save; evidence
    // is not text and is never overwritten this way.
    for refused in [
        "_notebook/.lock",
        "_notebook/experiments/EXP-001/evidence/big.bin",
        "scripts/run.R",
        "data/counts.bin",
        "_notebook/../README.md",
        "_notebook/linked/pca.csv",
    ] {
        if let Ok(parsed) = ProjectRelPath::parse(refused) {
            assert!(
                root.write_data_file(&parsed, b"evil", &Expected::Absent, &clock)
                    .is_err(),
                "{refused}"
            );
        }
    }
    // Analysis files, the notebook's own state and links are never trashed.
    for refused in [
        "_notebook/.lock",
        "scripts/run.R",
        "data/counts.bin",
        "_notebook/../README.md",
        "_notebook/linked/pca.csv",
    ] {
        if let Ok(parsed) = ProjectRelPath::parse(refused) {
            assert!(root.move_to_trash(&parsed, &clock).is_err(), "{refused}");
        }
    }

    // The trash takes a file and a folder; the notebook's own files stay.
    root.move_to_trash(&fresh, &clock).unwrap();
    let folder = path("_notebook/experiments/EXP-009/experiment.md");
    root.write_atomic(&folder, b"to be deleted").unwrap();
    root.move_to_trash(&path("_notebook/experiments/EXP-009"), &clock)
        .unwrap();
    for kept in [
        "_notebook/project.yaml",
        "_notebook/.history",
        "_notebook/linked",
    ] {
        assert!(root.move_to_trash(&path(kept), &clock).is_err(), "{kept}");
    }

    // A backup with a link to analysis results inside the notebook.
    let backup = root.backup_before_version("0.2.0", &clock).unwrap();
    assert!(backup.copied >= 1);
    assert!(project.exists("results/pca/pca.csv"));
}

/// S2-T08. Watching only reads: it runs while files inside `_notebook/` are
/// changed from outside, replaced, removed and moved away, and reports them.
fn watch_scenario(project: &TestProject, root: &ProjectRoot) {
    let registry = WatchRegistry::new();
    registry.start(root).unwrap();
    fs::write(
        project.on_disk("_notebook/questions/Q-001.md"),
        b"edited elsewhere",
    )
    .unwrap();
    fs::remove_file(project.on_disk("_notebook/experiments/EXP-001/artefacts.yaml")).unwrap();
    let batch = registry.wait(root, Duration::from_secs(15)).unwrap();
    assert!(!batch.is_empty(), "the outside edits were not reported");
    // A folder of data files moved out of the notebook, reported as a
    // rescan or as its files going missing, never followed.
    fs::rename(
        project.on_disk("_notebook/experiments/EXP-001"),
        project.on_disk("_notebook/moved-experiment"),
    )
    .unwrap();
    registry.wait(root, Duration::from_secs(15)).unwrap();
    registry.stop(root);
    assert!(registry.poll(root).is_none());
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
