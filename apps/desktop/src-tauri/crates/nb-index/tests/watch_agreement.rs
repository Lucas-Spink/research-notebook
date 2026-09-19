//! The watcher (`nb-fs`) and the index scan (`nb-index`) must agree on which
//! files under `_notebook/` are notebook data files, or a change the watcher
//! reports could be one the index never looks at, or the reverse (ADR-0024).
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
use nb_fs::watch::is_notebook_data_path;
use nb_index::ScanMode;

const FILES: [&str; 26] = [
    "project.yaml",
    "bibliography.json",
    "questions/Q-01.md",
    "questions/Q-02.md",
    "questions/readme.txt",
    "questions/sub/Q-03.md",
    "questions/.Q-04.md.1.1.tmp",
    "questions/.hidden.md",
    "experiments/EXP-001/experiment.md",
    "experiments/EXP-001/artefacts.yaml",
    "experiments/EXP-001/notes.md",
    "experiments/EXP-001/evidence/plot.pdf",
    "experiments/EXP-001/evidence/experiment.md",
    "experiments/EXP-001/methods/run.R",
    "experiments/EXP-001/.experiment.md.1.1.tmp",
    "experiments/.hidden/experiment.md",
    "experiments/EXP-002/experiment.md",
    "experiments/experiment.md",
    "experiments/EXP-003/deeper/experiment.md",
    ".history/questions/Q-01.md",
    ".trash/experiments/EXP-009/experiment.md",
    "inbox/01JAX/request.json",
    "backups/2026/project.yaml",
    ".lock",
    "README.md",
    "styles/nature.csl",
];

#[test]
fn the_index_scans_exactly_the_files_the_watcher_watches() {
    let project = TestProject::new();
    for file in FILES {
        project.write(file, "text\n");
    }
    let (mut index, _) = project.open_index();
    let scan = index.scan(&project.root(), ScanMode::Full).unwrap();

    let mut scanned: Vec<String> = scan
        .changed
        .iter()
        .map(|m| {
            m.path
                .as_str()
                .strip_prefix("_notebook/")
                .unwrap()
                .to_owned()
        })
        .collect();
    scanned.sort();
    let mut watched: Vec<String> = FILES
        .iter()
        .filter(|f| is_notebook_data_path(f))
        .map(|f| (*f).to_owned())
        .collect();
    watched.sort();
    assert_eq!(scanned, watched);
    assert!(!watched.is_empty());
}
