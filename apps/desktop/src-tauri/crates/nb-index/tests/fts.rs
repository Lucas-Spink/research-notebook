//! S2-T07, spec 6.6: the FTS5 table covers titles, sections, display names,
//! filenames and source titles, and stays in step with the files.
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
use nb_index::{FtsKind, Index, ScanMode};

fn indexed() -> (TestProject, Index) {
    let project = TestProject::new();
    project.write("questions/q1.md", "Why do batches differ?\n");
    project.write(
        "experiments/e1/experiment.md",
        "PCA of treatment\nTreatment groups separate along PC1\n",
    );
    project.write(
        "experiments/e1/artefacts.yaml",
        "Volcano plot|evidence/volcano_v2.pdf\n",
    );
    project.write(
        "bibliography.json",
        "z:u:AAAA2222|Moderated estimation of fold change\n",
    );
    let (mut index, _) = project.open_index();
    project.sync(&mut index, ScanMode::Quick);
    (project, index)
}

fn kinds(index: &Index, query: &str) -> Vec<(FtsKind, String)> {
    index
        .search(query, 20)
        .unwrap()
        .into_iter()
        .map(|hit| (hit.kind, hit.owner))
        .collect()
}

#[test]
fn finds_a_title() {
    let (_project, index) = indexed();
    assert_eq!(
        kinds(&index, "batches"),
        [(FtsKind::Title, "q1".to_owned())]
    );
}

#[test]
fn finds_a_section() {
    let (_project, index) = indexed();
    assert_eq!(
        kinds(&index, "separate"),
        [(FtsKind::Section, "e1".to_owned())]
    );
}

#[test]
fn finds_an_artefact_display_name() {
    let (_project, index) = indexed();
    assert_eq!(kinds(&index, "plot"), [(FtsKind::Name, "e1-a0".to_owned())]);
}

#[test]
fn finds_a_filename() {
    let (_project, index) = indexed();
    assert_eq!(
        kinds(&index, "volcano_v2"),
        [(FtsKind::Filename, "e1-a0".to_owned())]
    );
}

#[test]
fn finds_a_source_title() {
    let (_project, index) = indexed();
    assert_eq!(
        kinds(&index, "fold"),
        [(FtsKind::SourceTitle, "z:u:AAAA2222".to_owned())]
    );
}

#[test]
fn a_hit_names_the_file_and_the_text_it_came_from() {
    let (_project, index) = indexed();
    let hits = index.search("batches", 20).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].file, "_notebook/questions/q1.md");
    assert_eq!(hits[0].text, "Why do batches differ?");
}

#[test]
fn matches_word_starts_and_ignores_case_and_accents() {
    let (project, mut index) = indexed();
    assert_eq!(index.search("BATCH", 20).unwrap().len(), 1);
    project.write("questions/q2.md", "Café au lait\n");
    project.sync(&mut index, ScanMode::Quick);
    assert_eq!(index.search("cafe", 20).unwrap().len(), 1);
}

#[test]
fn every_word_of_the_query_must_match() {
    let (_project, index) = indexed();
    assert_eq!(index.search("treatment separate", 20).unwrap().len(), 1);
    assert!(index.search("treatment banana", 20).unwrap().is_empty());
}

#[test]
fn text_that_is_not_search_syntax_is_searched_as_text() {
    let (_project, index) = indexed();
    for query in [
        "\"",
        "a\"b",
        "(",
        "batches AND",
        "NEAR(",
        "col:umn",
        "*",
        "-",
        "",
        "   ",
    ] {
        index.search(query, 20).unwrap();
    }
}

#[test]
fn the_limit_caps_the_hits() {
    let (project, mut index) = indexed();
    for n in 0..5 {
        project.write(&format!("questions/extra{n}.md"), "common word\n");
    }
    project.sync(&mut index, ScanMode::Quick);
    assert_eq!(index.search("common", 3).unwrap().len(), 3);
}

#[test]
fn an_edit_replaces_the_searchable_text_and_a_deletion_removes_it() {
    let (project, mut index) = indexed();
    project.write("questions/q1.md", "Why do replicates differ?\n");
    project.sync(&mut index, ScanMode::Quick);
    assert!(index.search("batches", 20).unwrap().is_empty());
    assert_eq!(index.search("replicates", 20).unwrap().len(), 1);

    project.remove("questions/q1.md");
    project.sync(&mut index, ScanMode::Quick);
    assert!(index.search("replicates", 20).unwrap().is_empty());
}
