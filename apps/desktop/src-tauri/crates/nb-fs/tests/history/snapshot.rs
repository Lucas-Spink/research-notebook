//! FR-HIS-01: the previous content of a notebook text file is kept before it
//! is overwritten, and a save never overwrites what it did not expect.

use std::fs;
use std::io;
use std::path::Path;

use nb_fs::{AtomicIo, Expected, ProjectRoot, SaveOutcome, WriteError};

use super::{files_under, plant, sha256, FakeClock};
use crate::common::{make_dir_link, rel, snapshot_outside_notebook, TestProject};

const EXPERIMENT: &str = "_notebook/experiments/EXP-001/experiment.md";
const HISTORY: &str = "_notebook/.history/experiments/EXP-001/experiment.md";

fn save(
    root: &ProjectRoot,
    path: &str,
    contents: &[u8],
    expected: &Expected,
    clock: &FakeClock,
) -> Result<SaveOutcome, WriteError> {
    root.write_data_file(&rel(path), contents, expected, clock)
}

fn expect(bytes: &[u8]) -> Expected {
    Expected::Sha256(sha256(bytes))
}

/// A project whose experiment file holds `before`.
fn project_with(before: &[u8]) -> (TestProject, ProjectRoot) {
    let project = TestProject::new();
    plant(&project, EXPERIMENT, before);
    let root = project.open();
    (project, root)
}

/// Fails the `n`th rename, as a file another program holds open would.
struct FailRename {
    calls: usize,
    fail_on: usize,
}

impl AtomicIo for FailRename {
    fn rename(&mut self, from: &Path, to: &Path) -> io::Result<()> {
        self.calls += 1;
        if self.calls == self.fail_on {
            Err(io::Error::other("injected"))
        } else {
            fs::rename(from, to)
        }
    }
}

#[test]
fn a_new_file_is_written_and_has_nothing_to_snapshot() {
    let project = TestProject::new();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let outcome = save(&root, EXPERIMENT, b"first", &Expected::Absent, &clock).unwrap();
    assert_eq!(outcome, SaveOutcome::Saved { snapshot: None });
    assert_eq!(project.read(EXPERIMENT), b"first");
    assert!(!project.exists("_notebook/.history"));
}

#[test]
fn overwriting_keeps_the_previous_content_under_history() {
    let (project, root) = project_with(b"first draft");
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let outcome = save(
        &root,
        EXPERIMENT,
        b"second",
        &expect(b"first draft"),
        &clock,
    )
    .unwrap();
    let snapshot = format!("{HISTORY}/2026-09-21T10-15-00Z.md");
    assert_eq!(
        outcome,
        SaveOutcome::Saved {
            snapshot: Some(snapshot.clone())
        }
    );
    assert_eq!(project.read(&snapshot), b"first draft");
    assert_eq!(project.read(EXPERIMENT), b"second");
    assert!(project.temp_files().is_empty());
}

#[test]
fn the_snapshot_has_the_files_extension() {
    let project = TestProject::new();
    plant(&project, "_notebook/project.yaml", b"a: 1\n");
    plant(&project, "_notebook/bibliography.json", b"[]");
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    save(
        &root,
        "_notebook/project.yaml",
        b"a: 2\n",
        &expect(b"a: 1\n"),
        &clock,
    )
    .unwrap();
    save(
        &root,
        "_notebook/bibliography.json",
        b"[1]",
        &expect(b"[]"),
        &clock,
    )
    .unwrap();
    assert_eq!(
        project.read("_notebook/.history/project.yaml/2026-09-21T10-15-00Z.yaml"),
        b"a: 1\n"
    );
    assert_eq!(
        project.read("_notebook/.history/bibliography.json/2026-09-21T10-15-00Z.json"),
        b"[]"
    );
}

#[test]
fn bytes_are_kept_exactly_including_bom_crlf_and_invalid_utf8() {
    let before: &[u8] = b"\xEF\xBB\xBFtitle\r\nline \xFF\xFE end\r\n";
    let (project, root) = project_with(before);
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    save(&root, EXPERIMENT, b"new", &expect(before), &clock).unwrap();
    assert_eq!(
        project.read(&format!("{HISTORY}/2026-09-21T10-15-00Z.md")),
        before
    );
}

#[test]
fn several_saves_in_one_second_each_keep_their_own_previous_content() {
    let (project, root) = project_with(b"v1");
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    save(&root, EXPERIMENT, b"v2", &expect(b"v1"), &clock).unwrap();
    save(&root, EXPERIMENT, b"v3", &expect(b"v2"), &clock).unwrap();
    save(&root, EXPERIMENT, b"v4", &expect(b"v3"), &clock).unwrap();
    let kept = files_under(&project, HISTORY);
    let contents: Vec<(&str, &[u8])> = kept
        .iter()
        .map(|(name, bytes)| (name.rsplit('/').next().unwrap(), bytes.as_slice()))
        .collect();
    assert_eq!(
        contents,
        [
            ("2026-09-21T10-15-00Z-2.md", b"v2".as_slice()),
            ("2026-09-21T10-15-00Z-3.md", b"v3".as_slice()),
            ("2026-09-21T10-15-00Z.md", b"v1".as_slice()),
        ]
    );
}

#[test]
fn a_save_a_second_later_gets_its_own_name() {
    let (project, root) = project_with(b"v1");
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    save(&root, EXPERIMENT, b"v2", &expect(b"v1"), &clock).unwrap();
    clock.advance(1);
    save(&root, EXPERIMENT, b"v3", &expect(b"v2"), &clock).unwrap();
    assert_eq!(files_under(&project, HISTORY).len(), 2);
    assert_eq!(
        project.read(&format!("{HISTORY}/2026-09-21T10-15-01Z.md")),
        b"v2"
    );
}

#[test]
fn a_file_changed_by_someone_else_is_not_overwritten() {
    let (project, root) = project_with(b"theirs");
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let outcome = save(&root, EXPERIMENT, b"mine", &expect(b"what I read"), &clock).unwrap();
    assert_eq!(
        outcome,
        SaveOutcome::Changed {
            current: Some(sha256(b"theirs"))
        }
    );
    assert_eq!(project.read(EXPERIMENT), b"theirs");
    assert!(!project.exists("_notebook/.history"));
}

#[test]
fn a_file_that_appeared_or_vanished_is_not_overwritten_either() {
    let (project, root) = project_with(b"theirs");
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    // The caller believed there was no file.
    assert_eq!(
        save(&root, EXPERIMENT, b"mine", &Expected::Absent, &clock).unwrap(),
        SaveOutcome::Changed {
            current: Some(sha256(b"theirs"))
        }
    );
    assert_eq!(project.read(EXPERIMENT), b"theirs");
    // The caller believed there was a file, and it has gone.
    let gone = "_notebook/questions/Q-001.md";
    assert_eq!(
        save(&root, gone, b"mine", &expect(b"was here"), &clock).unwrap(),
        SaveOutcome::Changed { current: None }
    );
    assert!(!project.exists(gone));
}

#[test]
fn files_outside_the_scope_are_refused_and_nothing_is_written() {
    let project = TestProject::new();
    plant(&project, "_notebook/inbox/r/request.json", b"{}");
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    for path in [
        "_notebook/.lock",
        "_notebook/inbox/r/request.json",
        "_notebook/experiments/EXP-001/evidence/plot.csv",
        "_notebook/.history/project.yaml/2026-09-21T10-15-00Z.yaml",
        "_notebook/notes.txt",
        "scripts/run.R",
        "README.md",
    ] {
        let result = save(&root, path, b"x", &Expected::Absent, &clock);
        assert!(
            matches!(
                result,
                Err(WriteError::NotHistoryScope { .. } | WriteError::OutsideNotebook { .. })
            ),
            "{path}: {result:?}"
        );
    }
    assert_eq!(project.read("scripts/run.R"), b"print('hello')\n");
    assert_eq!(project.read("README.md"), b"Analysis of organoids\n");
    assert!(!project.exists("_notebook/notes.txt"));
    assert_eq!(project.read("_notebook/inbox/r/request.json"), b"{}");
}

#[test]
fn writing_the_lock_the_ordinary_way_makes_no_history() {
    let project = TestProject::new();
    let root = project.open();
    root.write_atomic(&rel("_notebook/.lock"), b"{\"a\":1}")
        .unwrap();
    root.write_atomic(&rel("_notebook/.lock"), b"{\"a\":2}")
        .unwrap();
    assert!(!project.exists("_notebook/.history"));
}

// permissions_set_readonly_false: on Windows this only clears the read-only
// attribute so the temporary folder can be deleted; the file is not shared.
#[allow(clippy::permissions_set_readonly_false)]
#[test]
fn a_read_only_file_is_refused_before_anything_is_kept() {
    let (project, root) = project_with(b"protected");
    let path = project.on_disk(EXPERIMENT);
    let mut permissions = fs::metadata(&path).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&path, permissions.clone()).unwrap();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let result = save(&root, EXPERIMENT, b"new", &expect(b"protected"), &clock);
    permissions.set_readonly(false);
    fs::set_permissions(&path, permissions).unwrap();
    assert!(
        matches!(result, Err(WriteError::ReadOnly { .. })),
        "{result:?}"
    );
    assert_eq!(project.read(EXPERIMENT), b"protected");
    assert!(!project.exists("_notebook/.history"));
}

#[test]
fn if_the_snapshot_cannot_be_made_the_file_is_not_overwritten() {
    let (project, root) = project_with(b"precious");
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let mut io = FailRename {
        calls: 0,
        fail_on: 1,
    };
    let result = root.write_data_file_with(
        &mut io,
        &rel(EXPERIMENT),
        b"new",
        &expect(b"precious"),
        &clock,
    );
    assert!(result.is_err());
    assert_eq!(project.read(EXPERIMENT), b"precious");
    assert!(files_under(&project, "_notebook/.history").is_empty());
    assert!(project.temp_files().is_empty());
}

#[test]
fn if_the_write_fails_after_the_snapshot_the_old_file_is_intact() {
    let (project, root) = project_with(b"precious");
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let mut io = FailRename {
        calls: 0,
        fail_on: 2,
    };
    let result = root.write_data_file_with(
        &mut io,
        &rel(EXPERIMENT),
        b"new",
        &expect(b"precious"),
        &clock,
    );
    assert!(result.is_err());
    assert_eq!(project.read(EXPERIMENT), b"precious");
    assert_eq!(
        project.read(&format!("{HISTORY}/2026-09-21T10-15-00Z.md")),
        b"precious"
    );
    assert!(project.temp_files().is_empty());
}

#[test]
fn a_history_folder_that_is_a_link_out_of_the_notebook_is_refused() {
    let (project, root) = project_with(b"precious");
    make_dir_link(
        &project.on_disk("_notebook/.history"),
        &project.on_disk("results/pca"),
    );
    let before = snapshot_outside_notebook(project.root());
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let result = save(&root, EXPERIMENT, b"new", &expect(b"precious"), &clock);
    assert!(result.is_err(), "{result:?}");
    assert_eq!(project.read(EXPERIMENT), b"precious");
    assert_eq!(snapshot_outside_notebook(project.root()), before);
}

#[test]
fn saving_prunes_that_files_old_snapshots_and_nothing_else() {
    let (project, root) = project_with(b"v1");
    let history = |name: &str| format!("{HISTORY}/{name}");
    // Three snapshots on one day 40 days ago, an unrelated file in the
    // folder, and the history of another file with the same kind of clutter.
    for name in [
        "2026-08-12T08-00-00Z.md",
        "2026-08-12T09-00-00Z.md",
        "2026-08-12T17-00-00Z.md",
    ] {
        plant(&project, &history(name), b"old");
    }
    plant(&project, &history("notes.txt"), b"mine");
    plant(&project, &history("2026-08-12T10-00-00Z-1.md"), b"odd name");
    let other = "_notebook/.history/questions/Q-001.md/2026-08-12T08-00-00Z.md";
    let other2 = "_notebook/.history/questions/Q-001.md/2026-08-12T09-00-00Z.md";
    plant(&project, other, b"other");
    plant(&project, other2, b"other");

    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    save(&root, EXPERIMENT, b"v2", &expect(b"v1"), &clock).unwrap();

    let left = files_under(&project, HISTORY);
    let names: Vec<&str> = left.keys().map(|k| k.rsplit('/').next().unwrap()).collect();
    assert_eq!(
        names,
        [
            "2026-08-12T10-00-00Z-1.md",
            "2026-08-12T17-00-00Z.md",
            "2026-09-21T10-15-00Z.md",
            "notes.txt",
        ]
    );
    assert!(project.exists(other) && project.exists(other2));
}

/// S2-T10: what creating and then deleting an experiment does to nb-fs, file by
/// file, in the order the application writes them.
#[test]
fn a_new_experiment_folder_is_made_file_by_file_and_can_be_trashed_whole() {
    let project = TestProject::new();
    plant(&project, "_notebook/project.yaml", b"before");
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let artefacts = "_notebook/experiments/EXP-001/artefacts.yaml";

    for path in [EXPERIMENT, artefacts] {
        let outcome = save(&root, path, b"new", &Expected::Absent, &clock).unwrap();
        assert_eq!(outcome, SaveOutcome::Saved { snapshot: None }, "{path}");
    }
    let outcome = save(
        &root,
        "_notebook/project.yaml",
        b"after",
        &expect(b"before"),
        &clock,
    )
    .unwrap();
    assert!(matches!(outcome, SaveOutcome::Saved { snapshot: Some(_) }));
    assert_eq!(project.read(EXPERIMENT), b"new");
    assert_eq!(project.read(artefacts), b"new");
    // A second create of the same file finds it there and writes nothing.
    assert!(matches!(
        save(&root, EXPERIMENT, b"other", &Expected::Absent, &clock).unwrap(),
        SaveOutcome::Changed { current: Some(_) }
    ));
    assert_eq!(project.read(EXPERIMENT), b"new");

    root.move_to_trash(&rel("_notebook/experiments/EXP-001"), &clock)
        .unwrap();
    assert!(!project.exists("_notebook/experiments/EXP-001"));
    assert_eq!(
        project.read("_notebook/.trash/2026-09-21T10-15-00Z/experiments/EXP-001/experiment.md"),
        b"new"
    );
}
