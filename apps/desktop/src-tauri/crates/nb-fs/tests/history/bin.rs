//! The bin: removing an artefact's files to `.trash/`, listing what is there
//! and restoring it (ADR-0062). Nothing is ever deleted, and a restore never
//! replaces anything.

use nb_fs::{BinKind, WriteError};

use super::{files_under, plant, FakeClock};
use crate::common::{rel, TestProject};

const STAMP: &str = "2026-09-21T10-15-00Z";
const EXP: &str = "_notebook/experiments/EXP-001";

fn project() -> TestProject {
    let project = TestProject::new();
    plant(&project, "_notebook/project.yaml", b"format_version: 1\n");
    plant(&project, "_notebook/bibliography.json", b"[]");
    plant(&project, "_notebook/questions/Q-001.md", b"question one");
    plant(&project, &format!("{EXP}/experiment.md"), b"exp");
    plant(
        &project,
        &format!("{EXP}/artefacts.yaml"),
        b"all: records\n",
    );
    plant(&project, &format!("{EXP}/evidence/plot.png"), &[1, 2, 3]);
    plant(&project, &format!("{EXP}/evidence/plot.v2.png"), &[4, 5]);
    plant(&project, &format!("{EXP}/evidence/other.png"), &[9]);
    plant(&project, &format!("{EXP}/methods/fit.py"), b"print(1)\n");
    project
}

fn paths(names: &[&str]) -> Vec<nb_fs::ProjectRelPath> {
    names.iter().map(|n| rel(&format!("{EXP}/{n}"))).collect()
}

#[test]
fn an_artefacts_files_move_together_and_its_record_is_kept_beside_them() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");

    let binned = root
        .bin_artefact_files(
            "EXP-001",
            &paths(&["evidence/plot.png", "evidence/plot.v2.png"]),
            b"the: record\n",
            &clock,
        )
        .unwrap();

    assert_eq!(binned.moved, 2);
    assert_eq!(binned.missing, 0);
    let bin = format!("_notebook/.trash/{STAMP}/experiments/EXP-001");
    assert_eq!(project.read(&format!("{bin}/evidence/plot.png")), [1, 2, 3]);
    assert_eq!(project.read(&format!("{bin}/evidence/plot.v2.png")), [4, 5]);
    assert_eq!(
        project.read(&format!("{bin}/artefacts.yaml")),
        b"the: record\n"
    );
    assert!(!project.exists(&format!("{EXP}/evidence/plot.png")));
    // Another artefact's file and the live record are not touched.
    assert!(project.exists(&format!("{EXP}/evidence/other.png")));
    assert_eq!(
        project.read(&format!("{EXP}/artefacts.yaml")),
        b"all: records\n"
    );
}

#[test]
fn a_linked_artefact_has_only_its_record_binned() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");

    let binned = root
        .bin_artefact_files("EXP-001", &[], b"linked: record\n", &clock)
        .unwrap();

    assert_eq!(binned.moved, 0);
    let record = format!("_notebook/.trash/{STAMP}/experiments/EXP-001/artefacts.yaml");
    assert_eq!(project.read(&record), b"linked: record\n");
}

#[test]
fn a_file_that_is_already_gone_is_counted_and_does_not_stop_the_rest() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");

    let binned = root
        .bin_artefact_files(
            "EXP-001",
            &paths(&["evidence/gone.png", "evidence/plot.png"]),
            b"r\n",
            &clock,
        )
        .unwrap();

    assert_eq!((binned.moved, binned.missing), (1, 1));
}

#[test]
fn only_version_files_of_the_named_experiment_can_be_binned() {
    let project = project();
    plant(
        &project,
        "_notebook/experiments/EXP-002/evidence/x.png",
        &[7],
    );
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let before = files_under(&project, "_notebook");

    for bad in [
        rel(&format!("{EXP}/experiment.md")),
        rel(&format!("{EXP}/artefacts.yaml")),
        rel("_notebook/experiments/EXP-002/evidence/x.png"),
        rel("_notebook/project.yaml"),
        rel("analysis/outside.py"),
    ] {
        let error = root
            .bin_artefact_files("EXP-001", &[bad], b"r\n", &clock)
            .unwrap_err();
        assert!(
            matches!(
                error,
                WriteError::NotTrashable { .. } | WriteError::OutsideNotebook { .. }
            ),
            "{error:?}"
        );
    }
    assert_eq!(files_under(&project, "_notebook"), before);
}

#[test]
fn the_bin_lists_questions_experiments_and_removed_files() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    root.move_to_trash(&rel("_notebook/questions/Q-001.md"), &clock)
        .unwrap();
    clock.advance(60);
    root.bin_artefact_files("EXP-001", &paths(&["methods/fit.py"]), b"r\n", &clock)
        .unwrap();
    clock.advance(60);
    root.move_to_trash(&rel(EXP), &clock).unwrap();

    let entries = root.list_bin().unwrap();
    let summary: Vec<_> = entries
        .iter()
        .map(|e| (e.stamp.as_str(), e.kind, e.name.as_str()))
        .collect();
    assert_eq!(
        summary,
        [
            ("2026-09-21T10-15-00Z", BinKind::Question, "Q-001.md"),
            ("2026-09-21T10-16-00Z", BinKind::Files, "EXP-001"),
            ("2026-09-21T10-17-00Z", BinKind::Experiment, "EXP-001"),
        ]
    );
    assert_eq!(entries[0].original, "_notebook/questions/Q-001.md");
    assert_eq!(entries[1].original, EXP);
}

#[test]
fn an_empty_bin_lists_nothing() {
    let project = project();
    assert!(project.open().list_bin().unwrap().is_empty());
}

#[test]
fn a_question_is_restored_to_where_it_was() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    root.move_to_trash(&rel("_notebook/questions/Q-001.md"), &clock)
        .unwrap();

    root.restore_from_bin(STAMP, BinKind::Question, "Q-001.md")
        .unwrap();

    assert_eq!(
        project.read("_notebook/questions/Q-001.md"),
        b"question one"
    );
    assert!(root.list_bin().unwrap().is_empty());
}

#[test]
fn an_experiment_is_restored_whole() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    let before = files_under(&project, EXP);
    root.move_to_trash(&rel(EXP), &clock).unwrap();

    root.restore_from_bin(STAMP, BinKind::Experiment, "EXP-001")
        .unwrap();

    assert_eq!(files_under(&project, EXP), before);
}

#[test]
fn a_restore_never_replaces_what_is_in_the_way() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    root.move_to_trash(&rel("_notebook/questions/Q-001.md"), &clock)
        .unwrap();
    plant(&project, "_notebook/questions/Q-001.md", b"a newer one");

    let error = root
        .restore_from_bin(STAMP, BinKind::Question, "Q-001.md")
        .unwrap_err();

    assert!(matches!(error, WriteError::Exists { .. }), "{error:?}");
    assert_eq!(project.read("_notebook/questions/Q-001.md"), b"a newer one");
    assert_eq!(root.list_bin().unwrap().len(), 1);
}

#[test]
fn removed_files_come_back_and_the_record_is_read_first() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    root.bin_artefact_files(
        "EXP-001",
        &paths(&["evidence/plot.png", "evidence/plot.v2.png"]),
        b"the: record\n",
        &clock,
    )
    .unwrap();

    assert_eq!(
        root.read_binned_record(STAMP, "EXP-001").unwrap(),
        "the: record\n"
    );
    root.restore_from_bin(STAMP, BinKind::Files, "EXP-001")
        .unwrap();

    assert_eq!(project.read(&format!("{EXP}/evidence/plot.png")), [1, 2, 3]);
    assert_eq!(project.read(&format!("{EXP}/evidence/plot.v2.png")), [4, 5]);
    // The live record is for the application to change; the bin keeps its copy.
    assert_eq!(
        project.read(&format!("{EXP}/artefacts.yaml")),
        b"all: records\n"
    );
    assert!(root.list_bin().unwrap().is_empty());
    assert!(project.exists(&format!(
        "_notebook/.trash/{STAMP}/experiments/EXP-001/artefacts.restored.yaml"
    )));
}

#[test]
fn restoring_files_over_an_existing_file_changes_nothing() {
    let project = project();
    let root = project.open();
    let clock = FakeClock::at("2026-09-21T10:15:00Z");
    root.bin_artefact_files(
        "EXP-001",
        &paths(&["evidence/plot.png", "evidence/plot.v2.png"]),
        b"r\n",
        &clock,
    )
    .unwrap();
    plant(&project, &format!("{EXP}/evidence/plot.v2.png"), b"new");
    let before = files_under(&project, "_notebook");

    let error = root
        .restore_from_bin(STAMP, BinKind::Files, "EXP-001")
        .unwrap_err();

    assert!(matches!(error, WriteError::Exists { .. }), "{error:?}");
    assert_eq!(files_under(&project, "_notebook"), before);
}

#[test]
fn a_stamp_or_name_that_is_not_in_the_bin_is_refused() {
    let project = project();
    let root = project.open();
    for (stamp, name) in [
        ("..", "Q-001.md"),
        ("not-a-stamp", "Q-001.md"),
        (STAMP, "../project.yaml"),
        (STAMP, "Q-404.md"),
    ] {
        assert!(
            root.restore_from_bin(stamp, BinKind::Question, name)
                .is_err(),
            "{stamp} {name}"
        );
    }
    assert_eq!(
        project.read("_notebook/project.yaml"),
        b"format_version: 1\n"
    );
}
