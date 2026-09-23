//! S3-T07: discovery (FR-EVD-09, spec 9.4). A read-only, cancellable scan of
//! a chosen folder with include and exclude globs that proposes files to
//! capture and marks the ones already captured.
// disallowed_methods: the tests build throwaway folders in a temporary
// directory; the std::fs write calls are fixture setup.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use common::make_dir_link;
use nb_fs::discovery::{discover, Discovery, DiscoveryOptions, DEFAULT_EXCLUDES};
use nb_fs::DiscoveryError;
use proptest::prelude::*;
use tempfile::TempDir;

fn tree(files: &[&str]) -> TempDir {
    let dir = tempfile::Builder::new()
        .prefix("nb-discovery-")
        .tempdir()
        .unwrap();
    for file in files {
        let path = dir.path().join(file);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, file.as_bytes()).unwrap();
    }
    dir
}

fn run(folder: &Path, options: &DiscoveryOptions, captured: &[String]) -> Discovery {
    let cancel = AtomicBool::new(false);
    discover(folder, options, captured, &cancel, &mut |_| {}).unwrap()
}

fn paths(discovery: &Discovery) -> Vec<&str> {
    discovery
        .files
        .iter()
        .map(|f| f.rel_path.as_str())
        .collect()
}

fn options(include: &[&str], exclude: &[&str]) -> DiscoveryOptions {
    DiscoveryOptions {
        include: include.iter().map(|s| (*s).to_owned()).collect(),
        exclude: exclude.iter().map(|s| (*s).to_owned()).collect(),
    }
}

#[test]
fn lists_every_file_recursively_sorted_with_forward_slashes() {
    let dir = tree(&["b.txt", "results/pca/pca.csv", "results/a.png"]);
    let found = run(dir.path(), &options(&[], &[]), &[]);
    assert_eq!(
        paths(&found),
        ["b.txt", "results/a.png", "results/pca/pca.csv"]
    );
    assert!(!found.cancelled);
    let pca = &found.files[2];
    assert_eq!(pca.size, "results/pca/pca.csv".len() as u64);
    assert!(!pca.captured);
}

#[test]
fn default_options_exclude_the_spec_clutter_at_any_depth() {
    let clutter = [
        ".git/HEAD",
        ".snakemake/log/run.log",
        ".nextflow/history",
        "work/ab/cd/task.sh",
        "node_modules/pkg/index.js",
        "src/__pycache__/m.pyc",
        "results/._plot.png",
        "results/.DS_Store",
        "results/Thumbs.db",
        "results/deep/desktop.ini",
        "results/deep/.git/config",
    ];
    let mut files = clutter.to_vec();
    files.extend(["results/plot.png", "src/m.py"]);
    let dir = tree(&files);

    let found = run(dir.path(), &DiscoveryOptions::default(), &[]);

    assert_eq!(paths(&found), ["results/plot.png", "src/m.py"]);
    assert_eq!(
        DiscoveryOptions::default().exclude,
        DEFAULT_EXCLUDES
            .iter()
            .map(|s| (*s).to_owned())
            .collect::<Vec<_>>()
    );
    assert!(DiscoveryOptions::default().include.is_empty());
}

#[test]
fn clutter_names_are_matched_without_regard_to_case() {
    let dir = tree(&["results/THUMBS.DB", "Node_Modules/x.js", "keep.txt"]);
    let found = run(dir.path(), &DiscoveryOptions::default(), &[]);
    assert_eq!(paths(&found), ["keep.txt"]);
}

#[test]
fn include_globs_without_a_slash_match_file_names_at_any_depth() {
    let dir = tree(&["a.csv", "results/b.CSV", "results/c.png", "notes.md"]);
    let found = run(dir.path(), &options(&["*.csv", "*.md"], &[]), &[]);
    assert_eq!(paths(&found), ["a.csv", "notes.md", "results/b.CSV"]);
}

#[test]
fn globs_with_a_slash_match_the_whole_relative_path() {
    let dir = tree(&[
        "results/a.csv",
        "results/pca/b.csv",
        "other/results/c.csv",
        "d.csv",
    ]);
    let found = run(dir.path(), &options(&["results/*.csv"], &[]), &[]);
    assert_eq!(paths(&found), ["results/a.csv"]);

    let found = run(dir.path(), &options(&["results/**/*.csv"], &[]), &[]);
    assert_eq!(paths(&found), ["results/a.csv", "results/pca/b.csv"]);

    let found = run(dir.path(), &options(&[], &["results/pca"]), &[]);
    assert_eq!(
        paths(&found),
        ["d.csv", "other/results/c.csv", "results/a.csv"]
    );
}

#[test]
fn an_excluded_file_is_left_out_even_when_included() {
    let dir = tree(&["a.csv", "a.tmp.csv"]);
    let found = run(dir.path(), &options(&["*.csv"], &["*.tmp.csv"]), &[]);
    assert_eq!(paths(&found), ["a.csv"]);
}

#[test]
fn an_excluded_folder_is_never_entered() {
    let dir = tree(&[
        "node_modules/a/b/c/1.js",
        "node_modules/a/b/2.js",
        "node_modules/d/3.js",
        "src/main.py",
    ]);
    let found = run(dir.path(), &DiscoveryOptions::default(), &[]);
    assert_eq!(paths(&found), ["src/main.py"]);
    // The chosen folder and src/ only; none of node_modules' four folders.
    assert_eq!(found.folders_visited, 2);
}

#[test]
fn notebook_folders_are_always_skipped_even_with_no_excludes() {
    // Chosen folder above the project root: its notebook is skipped too.
    let dir = tree(&[
        "_notebook/experiments/EXP-1/evidence/pca.csv",
        "project/_Notebook/experiments/EXP-2/evidence/umap.png",
        "project/results/pca.csv",
    ]);
    let found = run(dir.path(), &options(&[], &[]), &[]);
    assert_eq!(paths(&found), ["project/results/pca.csv"]);
}

#[test]
fn links_to_folders_are_not_followed() {
    let dir = tree(&["results/pca.csv", "elsewhere/secret.csv"]);
    make_dir_link(
        &dir.path().join("results/linked"),
        &dir.path().join("elsewhere"),
    );
    let found = run(&dir.path().join("results"), &options(&[], &[]), &[]);
    assert_eq!(paths(&found), ["pca.csv"]);
}

#[test]
fn marks_captured_sources_by_path_ignoring_case_separators_and_normalisation() {
    // "Café" composed in the file name, decomposed in the captured list.
    let dir = tree(&[
        "results/Caf\u{e9}.png",
        "results/PCA.csv",
        "results/new.csv",
    ]);
    let captured = vec![
        "results\\pca.csv".to_owned(),
        "results/Cafe\u{301}.png".to_owned(),
        "results/gone.csv".to_owned(),
    ];
    let found = run(dir.path(), &options(&[], &[]), &captured);
    let marks: Vec<(&str, bool)> = found
        .files
        .iter()
        .map(|f| (f.rel_path.as_str(), f.captured))
        .collect();
    assert_eq!(
        marks,
        [
            ("results/Caf\u{e9}.png", true),
            ("results/PCA.csv", true),
            ("results/new.csv", false),
        ]
    );
}

#[test]
fn progress_is_reported_before_any_file_is_returned_and_counts_up() {
    let names: Vec<String> = (0..1000).map(|i| format!("d{}/f{i}.txt", i % 7)).collect();
    let refs: Vec<&str> = names.iter().map(String::as_str).collect();
    let dir = tree(&refs);
    let cancel = AtomicBool::new(false);
    let mut reports = Vec::new();
    let found = discover(dir.path(), &options(&[], &[]), &[], &cancel, &mut |p| {
        reports.push(*p)
    })
    .unwrap();

    assert_eq!(found.files.len(), 1000);
    assert!(reports.len() >= 3, "expected several reports: {reports:?}");
    assert_eq!(reports[0].files_seen, 0, "the first report comes at once");
    assert!(reports
        .windows(2)
        .all(|w| w[0].files_seen <= w[1].files_seen));
    let last = reports.last().unwrap();
    assert_eq!(last.files_seen, 1000, "a final report closes the scan");
    assert_eq!(last.folders_seen, found.folders_visited);
}

#[test]
fn cancelling_stops_the_scan_and_returns_what_was_found() {
    let names: Vec<String> = (0..2000).map(|i| format!("d{}/f{i}.txt", i % 5)).collect();
    let refs: Vec<&str> = names.iter().map(String::as_str).collect();
    let dir = tree(&refs);
    let cancel = AtomicBool::new(false);
    let found = discover(dir.path(), &options(&[], &[]), &[], &cancel, &mut |p| {
        if p.files_seen >= 300 {
            cancel.store(true, Ordering::Relaxed);
        }
    })
    .unwrap();

    assert!(found.cancelled);
    assert!(found.files.len() >= 300 && found.files.len() < 2000);
}

#[test]
fn a_scan_cancelled_before_it_starts_finds_nothing() {
    let dir = tree(&["a.txt"]);
    let cancel = AtomicBool::new(true);
    let found = discover(dir.path(), &options(&[], &[]), &[], &cancel, &mut |_| {}).unwrap();
    assert!(found.cancelled);
    assert!(found.files.is_empty());
}

#[test]
fn an_invalid_pattern_is_refused_before_scanning() {
    let dir = tree(&["a.txt"]);
    let cancel = AtomicBool::new(false);
    for bad in [&options(&["[a-"], &[]), &options(&[], &["a**"])] {
        let err = discover(dir.path(), bad, &[], &cancel, &mut |_| {}).unwrap_err();
        assert!(
            matches!(err, DiscoveryError::InvalidPattern { .. }),
            "{err:?}"
        );
    }
}

#[test]
fn a_missing_or_file_shaped_folder_is_an_error() {
    let dir = tree(&["a.txt"]);
    let cancel = AtomicBool::new(false);
    let missing = dir.path().join("nope");
    assert!(matches!(
        discover(&missing, &options(&[], &[]), &[], &cancel, &mut |_| {}),
        Err(DiscoveryError::Io { .. })
    ));
    let file = dir.path().join("a.txt");
    assert!(matches!(
        discover(&file, &options(&[], &[]), &[], &cancel, &mut |_| {}),
        Err(DiscoveryError::NotAFolder { .. })
    ));
}

#[cfg(unix)]
#[test]
fn an_unreadable_subfolder_is_skipped_not_fatal() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tree(&["open/a.txt", "locked/b.txt"]);
    let locked = dir.path().join("locked");
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
    let found = run(dir.path(), &options(&[], &[]), &[]);
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(paths(&found), ["open/a.txt"]);
    assert_eq!(found.skipped, [locked]);
}

proptest! {
    /// Wherever a default-excluded folder sits, nothing beneath it is
    /// reported, and every file outside it is.
    #[test]
    fn nothing_under_an_excluded_folder_is_reported(
        prefix in prop::collection::vec("[a-z]{1,6}", 0..3),
        excluded in prop::sample::select(vec![
            ".git", ".snakemake", ".nextflow", "work", "node_modules", "__pycache__",
        ]),
        suffix in prop::collection::vec("[a-z]{1,6}", 0..3),
    ) {
        prop_assume!(!prefix.iter().any(|c| c == "work"));
        let mut hidden = prefix.clone();
        hidden.push(excluded.to_owned());
        hidden.extend(suffix);
        hidden.push("hidden.txt".to_owned());
        let mut visible = prefix;
        visible.push("visible.txt".to_owned());
        let hidden = hidden.join("/");
        let visible = visible.join("/");
        let dir = tree(&[&hidden, &visible]);

        let found = run(dir.path(), &DiscoveryOptions::default(), &[]);

        prop_assert_eq!(paths(&found), [visible.as_str()]);
    }
}
