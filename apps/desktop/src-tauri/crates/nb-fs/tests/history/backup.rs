//! FR-HIS-04: before the first write by a different application version, every
//! notebook text file is copied to `backups/<timestamp>-before-<version>/`.

use std::collections::BTreeMap;
use std::fs;

use super::{files_under, plant, FakeClock};
use crate::common::{make_dir_link, snapshot_outside_notebook, TestProject};

/// The files that belong in a backup, with distinctive bytes.
const IN_SCOPE: [(&str, &[u8]); 7] = [
    (
        "project.yaml",
        b"format_version: 1\r\nlast_written_by: \"0.1.0\"\r\n",
    ),
    ("bibliography.json", b"[]"),
    ("README.md", b"# Notebook\n"),
    ("questions/Q-001.md", b"\xEF\xBB\xBFquestion"),
    ("experiments/EXP-001/experiment.md", b"experiment one"),
    ("experiments/EXP-001/artefacts.yaml", b"artefacts: []\n"),
    ("styles/nature.csl", b"<style/>"),
];

/// A project with the in-scope files and a good deal that must not be copied.
fn project() -> TestProject {
    let project = TestProject::new();
    for (relative, bytes) in IN_SCOPE {
        plant(&project, &format!("_notebook/{relative}"), bytes);
    }
    for relative in [
        "experiments/EXP-001/evidence/plot/v1.csv",
        "experiments/EXP-001/methods/run.R",
        "experiments/EXP-001/notes.md",
        "inbox/req-1/request.json",
        ".lock",
        ".history/project.yaml/2026-01-01T00-00-00Z.yaml",
        ".trash/2026-01-01T00-00-00Z/questions/Q-000.md",
        "backups/2026-01-01T00-00-00Z-before-0.0.9/project.yaml",
        "exports/report.pdf",
    ] {
        plant(&project, &format!("_notebook/{relative}"), b"not copied");
    }
    project
}

fn backed_up(project: &TestProject, folder: &str) -> BTreeMap<String, Vec<u8>> {
    let prefix = format!("{folder}/");
    files_under(project, folder)
        .into_iter()
        .map(|(path, bytes)| (path.strip_prefix(&prefix).unwrap().to_owned(), bytes))
        .collect()
}

#[test]
fn every_notebook_text_file_is_copied_byte_for_byte_and_nothing_else() {
    let project = project();
    let root = project.open();
    let before = files_under(&project, "_notebook");
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let backup = root.backup_before_version("0.2.0", &clock).unwrap();

    let folder = "_notebook/backups/2026-09-21T10-15-00Z-before-0.2.0";
    assert_eq!(backup.folder, folder);
    assert_eq!(backup.copied, IN_SCOPE.len());
    assert_eq!(backup.skipped, 0);
    let expected: BTreeMap<String, Vec<u8>> = IN_SCOPE
        .iter()
        .map(|(relative, bytes)| ((*relative).to_owned(), bytes.to_vec()))
        .collect();
    assert_eq!(backed_up(&project, folder), expected);

    // The originals are as they were, and only the backup was added.
    let after = files_under(&project, "_notebook");
    let added: Vec<&String> = after.keys().filter(|k| !before.contains_key(*k)).collect();
    assert!(added.iter().all(|k| k.starts_with(folder)), "{added:?}");
    for (path, bytes) in &before {
        assert_eq!(after.get(path), Some(bytes), "{path}");
    }
    assert!(project.temp_files().is_empty());
}

#[test]
fn a_notebook_with_only_a_project_file_still_backs_up() {
    let project = TestProject::new();
    plant(&project, "_notebook/project.yaml", b"x: 1\n");
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let backup = root.backup_before_version("0.2.0", &clock).unwrap();
    assert_eq!(backup.copied, 1);
    assert_eq!(
        project.read(&format!("{}/project.yaml", backup.folder)),
        b"x: 1\n"
    );
}

#[test]
fn a_second_backup_in_the_same_second_never_replaces_the_first() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let first = root.backup_before_version("0.2.0", &clock).unwrap();
    plant(&project, "_notebook/questions/Q-001.md", b"changed since");
    let second = root.backup_before_version("0.2.0", &clock).unwrap();
    assert_eq!(
        second.folder,
        "_notebook/backups/2026-09-21T10-15-00Z-2-before-0.2.0"
    );
    assert_eq!(
        project.read(&format!("{}/questions/Q-001.md", first.folder)),
        b"\xEF\xBB\xBFquestion"
    );
    assert_eq!(
        project.read(&format!("{}/questions/Q-001.md", second.folder)),
        b"changed since"
    );
}

#[test]
fn the_version_becomes_one_safe_folder_name() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    for (version, name) in [
        ("1.0.0-beta.2+build.5", "1.0.0-beta.2+build.5"),
        ("1.0.0-rc:1/x\\y", "1.0.0-rc_1_x_y"),
        ("1.0.", "1.0_"),
        ("", "unknown"),
        ("../../evil", ".._.._evil"),
        // Long text is cut, so the name stays a legal length.
        (&"9".repeat(200), &"9".repeat(64)),
    ] {
        clock.advance(1);
        let backup = root.backup_before_version(version, &clock).unwrap();
        let leaf = backup.folder.rsplit('/').next().unwrap();
        assert!(
            leaf.ends_with(&format!("-before-{name}")),
            "{version:?} gave {leaf:?}"
        );
        assert_eq!(backup.folder.matches('/').count(), 2, "{}", backup.folder);
    }
    assert!(!project.exists("evil"));
}

#[test]
fn links_are_not_followed_and_are_counted_as_skipped() {
    let project = project();
    // An experiment folder that is really a folder of analysis results
    // holding a file with the name of an experiment file.
    plant(
        &project,
        "results/pca/experiment.md",
        b"analysis, not notebook",
    );
    make_dir_link(
        &project.on_disk("_notebook/experiments/EXP-002"),
        &project.on_disk("results/pca"),
    );
    let before = snapshot_outside_notebook(project.root());
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let backup = root.backup_before_version("0.2.0", &clock).unwrap();
    assert_eq!(backup.copied, IN_SCOPE.len());
    assert_eq!(backup.skipped, 1);
    assert!(!project.exists(&format!("{}/experiments/EXP-002", backup.folder)));
    assert_eq!(snapshot_outside_notebook(project.root()), before);
}

#[test]
fn a_backups_folder_that_is_a_link_out_of_the_notebook_is_refused() {
    let project = TestProject::new();
    plant(&project, "_notebook/project.yaml", b"x: 1\n");
    make_dir_link(
        &project.on_disk("_notebook/backups"),
        &project.on_disk("results/pca"),
    );
    let before = snapshot_outside_notebook(project.root());
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    assert!(root.backup_before_version("0.2.0", &clock).is_err());
    assert_eq!(snapshot_outside_notebook(project.root()), before);
    assert_eq!(
        fs::read_dir(project.on_disk("results/pca"))
            .unwrap()
            .count(),
        1
    );
}
