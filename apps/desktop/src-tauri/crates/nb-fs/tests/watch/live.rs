//! The watcher against the real filesystem. These wait on the watcher with a
//! timeout rather than sleeping a fixed time, so they finish as soon as the
//! operating system reports the change; the negative tests wait out a short
//! quiet period, which is the one place time matters.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::time::Duration;

use nb_fs::watch::{Change, FileState, ProjectWatcher};
use nb_fs::ProjectRoot;
use sha2::{Digest, Sha256};

use crate::common::{rel, TestProject};

/// Long enough for a busy machine to deliver and settle an event.
const REPORT_WITHIN: Duration = Duration::from_secs(15);
/// Long enough for a wrongly reported file to show up.
const QUIET_FOR: Duration = Duration::from_millis(1500);

fn sha256(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

fn present(text: &str) -> FileState {
    FileState::Present {
        sha256: sha256(text),
    }
}

fn project() -> (TestProject, ProjectRoot) {
    let project = TestProject::new();
    let root = project.open();
    (project, root)
}

fn write(project: &TestProject, notebook_path: &str, text: &str) {
    let path = project.on_disk(&format!("_notebook/{notebook_path}"));
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

fn next(watcher: &ProjectWatcher) -> Vec<Change> {
    let batch = watcher.wait(REPORT_WITHIN);
    assert!(!batch.needs_rescan, "unexpected rescan request");
    batch.changes
}

#[test]
fn an_external_edit_is_reported_with_the_hash_of_the_new_content() {
    let (project, root) = project();
    write(&project, "questions/Q-01.md", "old\n");
    let watcher = root.watch().unwrap();

    write(&project, "questions/Q-01.md", "new text\n");

    assert_eq!(
        next(&watcher),
        [Change {
            path: rel("_notebook/questions/Q-01.md"),
            state: present("new text\n"),
        }]
    );
}

#[test]
fn a_file_at_the_top_of_the_notebook_is_watched_too() {
    let (project, root) = project();
    let watcher = root.watch().unwrap();
    write(&project, "project.yaml", "format_version: 1\n");
    let changes = next(&watcher);
    assert_eq!(changes.len(), 1);
    assert_eq!(changes[0].path, rel("_notebook/project.yaml"));
}

#[test]
fn a_new_file_and_then_its_deletion_are_reported() {
    let (project, root) = project();
    let watcher = root.watch().unwrap();

    write(
        &project,
        "experiments/EXP-001/artefacts.yaml",
        "artefacts: []\n",
    );
    assert_eq!(
        next(&watcher),
        [Change {
            path: rel("_notebook/experiments/EXP-001/artefacts.yaml"),
            state: present("artefacts: []\n"),
        }]
    );

    fs::remove_file(project.on_disk("_notebook/experiments/EXP-001/artefacts.yaml")).unwrap();
    assert_eq!(
        next(&watcher),
        [Change {
            path: rel("_notebook/experiments/EXP-001/artefacts.yaml"),
            state: FileState::Missing,
        }]
    );
}

#[test]
fn an_atomic_write_by_the_application_is_reported_once() {
    let (project, root) = project();
    let watcher = root.watch().unwrap();
    let path = rel("_notebook/experiments/EXP-002/experiment.md");

    root.write_atomic(&path, b"written by the application\n")
        .unwrap();

    assert_eq!(
        next(&watcher),
        [Change {
            path,
            state: present("written by the application\n"),
        }]
    );
    assert!(
        watcher.wait(QUIET_FOR).is_empty(),
        "the temporary file and the rename must not be reported again"
    );
    assert!(project.temp_files().is_empty());
}

#[test]
fn a_burst_of_edits_is_one_change_holding_the_last_content() {
    let (project, root) = project();
    let watcher = root.watch().unwrap();
    for n in 0..8 {
        write(&project, "questions/Q-01.md", &format!("draft {n}\n"));
    }
    assert_eq!(
        next(&watcher),
        [Change {
            path: rel("_notebook/questions/Q-01.md"),
            state: present("draft 7\n"),
        }]
    );
    assert!(watcher.wait(QUIET_FOR).is_empty());
}

#[test]
fn a_save_with_a_snapshot_a_trash_and_a_backup_report_only_the_data_files() {
    use nb_fs::{Expected, SystemClock};

    let (project, root) = project();
    write(
        &project,
        "project.yaml",
        "format_version: 1
",
    );
    write(
        &project,
        "questions/Q-01.md",
        "one
",
    );
    write(
        &project,
        "questions/Q-02.md",
        "two
",
    );
    let watcher = root.watch().unwrap();
    let _ = watcher.wait(QUIET_FOR);
    let clock = SystemClock;

    // The snapshot goes to `.history`, which is not reported; the file is.
    let path = rel("_notebook/questions/Q-01.md");
    root.write_data_file(
        &path,
        b"edited
",
        &Expected::Sha256(sha256(
            "one
",
        )),
        &clock,
    )
    .unwrap();
    assert_eq!(
        next(&watcher),
        [Change {
            path,
            state: present(
                "edited
"
            ),
        }]
    );
    assert!(watcher.wait(QUIET_FOR).is_empty());

    // A backup copies files into `backups/`, which is not reported.
    root.backup_before_version("0.2.0", &clock).unwrap();
    assert!(watcher.wait(QUIET_FOR).is_empty());

    // Moving a file to the trash is the file going missing, and nothing more.
    root.move_to_trash(&rel("_notebook/questions/Q-02.md"), &clock)
        .unwrap();
    assert_eq!(
        next(&watcher),
        [Change {
            path: rel("_notebook/questions/Q-02.md"),
            state: FileState::Missing,
        }]
    );
    assert!(watcher.wait(QUIET_FOR).is_empty());
}

#[test]
fn files_that_are_not_notebook_data_are_not_reported() {
    let (project, root) = project();
    let watcher = root.watch().unwrap();
    write(&project, "experiments/EXP-001/evidence/plot.pdf", "pdf");
    write(&project, "experiments/EXP-001/methods/run.R", "print(1)");
    write(&project, ".history/questions/Q-01.md", "old");
    write(&project, ".trash/note.md", "gone");
    write(&project, "inbox/01JAX/request.json", "{}");
    write(&project, ".lock", "{}");
    write(&project, "README.md", "guide");
    assert!(watcher.wait(QUIET_FOR).is_empty());
}

#[test]
fn watching_writes_nothing() {
    let (project, root) = project();
    write(&project, "project.yaml", "format_version: 1\n");
    write(&project, "questions/Q-01.md", "one\n");
    let before = listing(&project.on_disk("_notebook"));
    let outside_before = project.on_disk("scripts/run.R");
    let outside = fs::read(&outside_before).unwrap();

    let watcher = root.watch().unwrap();
    assert!(watcher.wait(QUIET_FOR).is_empty());
    drop(watcher);

    assert_eq!(listing(&project.on_disk("_notebook")), before);
    assert_eq!(fs::read(&outside_before).unwrap(), outside);
}

#[test]
fn a_dropped_watcher_stops_and_can_be_started_again() {
    let (project, root) = project();
    drop(root.watch().unwrap());
    let watcher = root.watch().unwrap();
    write(&project, "questions/Q-01.md", "again\n");
    assert_eq!(next(&watcher).len(), 1);
}

/// Path, size and modification time of everything under `dir`.
fn listing(dir: &Path) -> BTreeMap<String, (u64, std::time::SystemTime)> {
    let mut out = BTreeMap::new();
    collect(dir, dir, &mut out);
    out
}

fn collect(root: &Path, dir: &Path, out: &mut BTreeMap<String, (u64, std::time::SystemTime)>) {
    for entry in fs::read_dir(dir).unwrap() {
        let entry = entry.unwrap();
        // Not `entry.metadata()`: on NTFS that returns a lazily updated
        // directory time, which can lag behind the real one.
        let meta = fs::metadata(entry.path()).unwrap();
        let name = entry
            .path()
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        out.insert(name, (meta.len(), meta.modified().unwrap()));
        if meta.is_dir() {
            collect(root, &entry.path(), out);
        }
    }
}

#[test]
fn moving_a_folder_of_data_files_away_is_not_missed() {
    let (project, root) = project();
    write(&project, "experiments/EXP-001/experiment.md", "one\n");
    write(
        &project,
        "experiments/EXP-001/artefacts.yaml",
        "artefacts: []\n",
    );
    let watcher = root.watch().unwrap();

    let elsewhere = project.on_disk("moved-away");
    fs::rename(project.on_disk("_notebook/experiments/EXP-001"), &elsewhere).unwrap();

    // Some platforms report each file, others only the folder; either way
    // the caller must learn that those files are gone or must re-check.
    let batch = watcher.wait(REPORT_WITHIN);
    let missing = batch
        .changes
        .iter()
        .filter(|c| c.state == FileState::Missing)
        .count();
    assert!(
        batch.needs_rescan || missing == 2,
        "the move went unreported: {batch:?}"
    );
}

#[test]
fn creating_a_folder_for_a_new_experiment_does_not_ask_for_a_rescan() {
    let (project, root) = project();
    let watcher = root.watch().unwrap();
    write(&project, "experiments/EXP-005/experiment.md", "new\n");
    let batch = watcher.wait(REPORT_WITHIN);
    assert!(!batch.needs_rescan, "{batch:?}");
    assert_eq!(batch.changes.len(), 1);
    assert!(watcher.wait(QUIET_FOR).is_empty());
}
