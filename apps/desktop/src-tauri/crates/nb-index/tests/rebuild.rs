//! S2-G07 (spec 6.6, NFR-PERF-02, risk "index corruption"): a rebuilt index
//! and an incrementally maintained one hold the same rows, so the index can
//! be deleted and rebuilt at any time (AC-08).
// disallowed_methods: tests build and inspect throwaway folders in temporary
// directories; the std::fs write calls are fixture setup.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

use common::TestProject;
use nb_fs::cache::CacheDir;
use nb_index::{Index, ScanMode};
use proptest::prelude::*;

/// The files the property test edits, chosen to exercise every kind of
/// notebook data file.
const PATHS: [&str; 7] = [
    "project.yaml",
    "bibliography.json",
    "questions/q1.md",
    "questions/q2.md",
    "experiments/e1/experiment.md",
    "experiments/e1/artefacts.yaml",
    "experiments/e2/artefacts.yaml",
];

const LINES: [&str; 6] = [
    "alpha",
    "beta|one.pdf",
    "gamma delta",
    "café|two.png",
    "z:u:AAAA2222|A title",
    "",
];

#[derive(Debug, Clone)]
enum Op {
    Write(usize, Vec<usize>),
    Remove(usize),
    Sync(bool),
    Reopen,
}

fn op() -> impl Strategy<Value = Op> {
    prop_oneof![
        3 => (0..PATHS.len(), prop::collection::vec(0..LINES.len(), 0..4))
            .prop_map(|(path, lines)| Op::Write(path, lines)),
        1 => (0..PATHS.len()).prop_map(Op::Remove),
        2 => any::<bool>().prop_map(Op::Sync),
        1 => Just(Op::Reopen),
    ]
}

fn content(lines: &[usize]) -> String {
    lines.iter().map(|&i| format!("{}\n", LINES[i])).collect()
}

/// The dump of a fresh index rebuilt from the project's files as they are.
fn rebuilt_dump(project: &TestProject) -> String {
    let home = tempfile::Builder::new()
        .prefix("nb-index-fresh-")
        .tempdir()
        .unwrap();
    let cache = CacheDir::new(home.path().join("cache"));
    let (mut fresh, _) = Index::open(&cache, common::PROJECT_ID).unwrap();
    project.rebuild(&mut fresh);
    fresh.dump().unwrap()
}

fn cases() -> u32 {
    std::env::var("PROPTEST_CASES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(64)
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(cases()))]

    #[test]
    fn rebuilt_index_equals_incrementally_maintained_index(
        ops in prop::collection::vec(op(), 1..14),
    ) {
        let project = TestProject::new();
        let (mut index, _) = project.open_index();
        for op in &ops {
            match op {
                Op::Write(path, lines) => project.write(PATHS[*path], &content(lines)),
                Op::Remove(path) => {
                    if project.file(PATHS[*path]).exists() {
                        project.remove(PATHS[*path]);
                    }
                }
                Op::Sync(full) => {
                    let mode = if *full { ScanMode::Full } else { ScanMode::Quick };
                    project.sync(&mut index, mode);
                }
                Op::Reopen => {
                    drop(index);
                    index = project.open_index().0;
                }
            }
        }
        // A last sync brings the incremental index level with the disk.
        project.sync(&mut index, ScanMode::Full);
        let incremental = index.dump().unwrap();
        // Guards against two empty dumps agreeing: every file on disk is
        // indexed and no file that is gone is.
        for path in PATHS {
            let key = format!("_notebook/{path}");
            prop_assert_eq!(
                incremental.contains(&key),
                project.file(path).exists(),
                "{} in the index", key
            );
        }
        prop_assert_eq!(incremental, rebuilt_dump(&project));
    }
}

#[test]
fn rebuilt_index_equals_incrementally_maintained_index_for_a_fixed_history() {
    let project = TestProject::new();
    let (mut index, _) = project.open_index();
    project.write("project.yaml", "format_version: 1\n");
    project.write("questions/q1.md", "Why do batches differ?\n");
    project.write("experiments/e1/experiment.md", "PCA\nTreatment separates\n");
    project.write(
        "experiments/e1/artefacts.yaml",
        "PCA plot|pca.pdf\nQC|qc.png\n",
    );
    project.write("bibliography.json", "z:u:AAAA2222|A paper\n");
    project.sync(&mut index, ScanMode::Quick);
    project.write(
        "experiments/e1/experiment.md",
        "PCA of batches\nNo separation\n",
    );
    project.remove("questions/q1.md");
    project.write("questions/q2.md", "A different question\n");
    project.write("experiments/e1/artefacts.yaml", "PCA plot|pca.v2.pdf\n");
    project.sync(&mut index, ScanMode::Quick);
    project.remove("bibliography.json");
    project.sync(&mut index, ScanMode::Quick);

    let incremental = index.dump().unwrap();
    assert!(incremental.contains("PCA of batches"), "{incremental}");
    assert_eq!(incremental, rebuilt_dump(&project));
}

#[test]
fn a_rebuild_in_place_replaces_stale_rows() {
    let project = TestProject::new();
    let (mut index, _) = project.open_index();
    project.write("questions/q1.md", "Old title\n");
    project.sync(&mut index, ScanMode::Quick);
    project.write("questions/q1.md", "New title\n");

    let scan = project.rebuild(&mut index);
    assert_eq!(scan.changed.len(), 1, "a rebuild reports every file");
    let dump = index.dump().unwrap();
    assert!(
        dump.contains("New title") && !dump.contains("Old title"),
        "{dump}"
    );
    assert_eq!(dump, rebuilt_dump(&project));
}

#[test]
fn a_rebuild_reports_files_that_were_already_indexed() {
    let project = TestProject::new();
    let (mut index, _) = project.open_index();
    project.write("questions/q1.md", "Title\n");
    project.write("questions/q2.md", "Title two\n");
    project.sync(&mut index, ScanMode::Quick);
    let scan = project.rebuild(&mut index);
    assert_eq!(scan.changed.len(), 2);
    assert_eq!(scan.unchanged, 0);
}

#[test]
fn unchanged_files_are_not_handed_back_for_parsing() {
    let project = TestProject::new();
    let (mut index, _) = project.open_index();
    project.write("questions/q1.md", "Title\n");
    project.write("questions/q2.md", "Title two\n");
    assert_eq!(project.sync(&mut index, ScanMode::Quick).changed.len(), 2);
    assert_eq!(project.sync(&mut index, ScanMode::Quick).changed.len(), 0);
    project.write("questions/q2.md", "Title 2\n");
    assert_eq!(project.sync(&mut index, ScanMode::Quick).changed.len(), 1);
}

#[test]
fn an_index_reset_by_a_bad_file_rebuilds_to_the_same_rows() {
    let project = TestProject::new();
    project.write("questions/q1.md", "Title\n");
    project.write("experiments/e1/experiment.md", "PCA\nSection text\n");
    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    let before = index.dump().unwrap();
    assert!(before.contains("Section text"), "{before}");
    drop(index);
    let path = project
        .cache
        .path_of(&Index::file_name(common::PROJECT_ID))
        .unwrap();
    std::fs::write(path, b"garbage").unwrap();

    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    assert_eq!(index.dump().unwrap(), before);
}
