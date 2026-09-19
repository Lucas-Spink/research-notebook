//! S2-T07, spec 6.6: the index has every table and an FTS5 table, records
//! its schema version, and starts empty when that version differs or the
//! database cannot be read.
// disallowed_methods: tests build and inspect throwaway folders in temporary
// directories; the std::fs write calls are fixture setup.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

use std::fs;

use common::{TestProject, PROJECT_ID};
use nb_index::{Index, IndexError, OpenOutcome, ResetReason, ScanMode, SCHEMA_VERSION};

const TABLES: [&str; 11] = [
    "files",
    "questions",
    "experiments",
    "artefacts",
    "versions",
    "groups",
    "memberships",
    "refs",
    "citations",
    "sources",
    "fts",
];

fn db_path(project: &TestProject) -> std::path::PathBuf {
    project
        .cache
        .path_of(&Index::file_name(PROJECT_ID))
        .unwrap()
}

#[test]
fn a_new_index_has_every_table_and_the_current_schema_version() {
    let project = TestProject::new();
    let (index, outcome) = project.open_index();
    assert_eq!(outcome, OpenOutcome::Created);
    let dump = index.dump().unwrap();
    for table in TABLES {
        assert!(dump.contains(&format!("[{table}]")), "no table {table}");
    }
    drop(index);
    let raw = rusqlite::Connection::open(db_path(&project)).unwrap();
    let version: i64 = raw
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap();
    assert_eq!(version, SCHEMA_VERSION);
    let fts_sql: String = raw
        .query_row(
            "SELECT sql FROM sqlite_master WHERE name = 'fts'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(fts_sql.to_lowercase().contains("using fts5"), "{fts_sql}");
}

#[test]
fn reopening_keeps_the_index() {
    let project = TestProject::new();
    project.write("questions/q1.md", "Why do batches differ?\n");
    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    let before = index.dump().unwrap();
    drop(index);
    let (index, outcome) = project.open_index();
    assert_eq!(outcome, OpenOutcome::Reused);
    assert_eq!(index.dump().unwrap(), before);
    assert!(before.contains("Why do batches differ?"));
}

#[test]
fn another_schema_version_starts_the_index_empty() {
    let project = TestProject::new();
    project.write("questions/q1.md", "Why do batches differ?\n");
    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    drop(index);
    let raw = rusqlite::Connection::open(db_path(&project)).unwrap();
    raw.execute_batch(&format!(
        "PRAGMA user_version = {}; CREATE TABLE stale_table (x);",
        SCHEMA_VERSION + 1
    ))
    .unwrap();
    drop(raw);

    let (index, outcome) = project.open_index();
    assert_eq!(
        outcome,
        OpenOutcome::Reset(ResetReason::SchemaMismatch {
            found: SCHEMA_VERSION + 1
        })
    );
    assert!(!index.dump().unwrap().contains("Why do batches differ?"));
    drop(index);
    let raw = rusqlite::Connection::open(db_path(&project)).unwrap();
    let stale: i64 = raw
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE name = 'stale_table'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(stale, 0);
}

#[test]
fn a_database_that_is_not_sqlite_is_replaced() {
    let project = TestProject::new();
    project.cache.ensure().unwrap();
    fs::write(db_path(&project), b"this is not a database at all").unwrap();
    let (index, outcome) = project.open_index();
    assert_eq!(outcome, OpenOutcome::Reset(ResetReason::Unreadable));
    assert!(index.dump().unwrap().contains("[files]"));
}

#[test]
fn a_truncated_database_is_replaced() {
    let project = TestProject::new();
    project.write("questions/q1.md", "Why do batches differ?\n");
    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    drop(index);
    let bytes = fs::read(db_path(&project)).unwrap();
    fs::write(db_path(&project), &bytes[..bytes.len() / 2]).unwrap();
    let (mut index, outcome) = project.open_index();
    assert_eq!(outcome, OpenOutcome::Reset(ResetReason::Unreadable));
    // The reset index is empty, so the next scan finds the file again.
    let scan = project.sync(&mut index, ScanMode::Quick);
    assert_eq!(scan.changed.len(), 1);
}

#[test]
fn each_project_has_its_own_database() {
    let project = TestProject::new();
    let (a, _) = Index::open(&project.cache, "01JAXAAAAAAAAAAAAAAAAAAAAA").unwrap();
    let (b, outcome) = Index::open(&project.cache, "01JAXBBBBBBBBBBBBBBBBBBBBB").unwrap();
    assert_eq!(outcome, OpenOutcome::Created);
    drop((a, b));
}

#[test]
fn project_ids_that_are_not_safe_file_names_are_refused() {
    let project = TestProject::new();
    let long = "X".repeat(65);
    for id in ["", "../evil", "a/b", "a\\b", "..", "id with space", &long] {
        assert!(
            matches!(
                Index::open(&project.cache, id),
                Err(IndexError::InvalidProjectId { .. })
            ),
            "expected `{id}` to be refused"
        );
    }
}
