//! FR-ARC-04 (ADR-0053): a git bundle of each repository referenced by
//! provenance, written only under `_notebook/exports/git/`.
#![allow(clippy::unwrap_used, clippy::disallowed_methods)]

use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use nb_archive::{write_git_bundles, write_git_bundles_with, BundleVerdict};
use nb_fs::ProjectRoot;
use tempfile::TempDir;

const BUNDLES: &str = "_notebook/exports/git";

fn git(dir: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("GIT_AUTHOR_NAME", "Test")
        .env("GIT_AUTHOR_EMAIL", "test@example.com")
        .env("GIT_COMMITTER_NAME", "Test")
        .env("GIT_COMMITTER_EMAIL", "test@example.com")
        .output()
        .unwrap();
    assert!(output.status.success(), "git {args:?} failed");
    String::from_utf8(output.stdout).unwrap().trim().to_owned()
}

/// A project folder with `_notebook/` and an analysis file, nothing else yet.
fn project() -> (TempDir, ProjectRoot) {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("_notebook")).unwrap();
    fs::write(dir.path().join("analysis.R"), "print(1)\n").unwrap();
    let root = ProjectRoot::open(dir.path()).unwrap();
    (dir, root)
}

/// Makes `folder` (project-relative) a repository with one commit.
fn repository(dir: &TempDir, folder: &str) -> PathBuf {
    let path = if folder == "." {
        dir.path().to_path_buf()
    } else {
        dir.path().join(folder)
    };
    fs::create_dir_all(&path).unwrap();
    git(&path, &["init", "-q"]);
    fs::write(path.join("a.R"), "one\n").unwrap();
    git(&path, &["add", "a.R"]);
    git(&path, &["commit", "-q", "-m", "one"]);
    path
}

fn names(dir: &TempDir) -> Vec<String> {
    let mut found: Vec<String> = fs::read_dir(dir.path().join(BUNDLES))
        .map(|entries| {
            entries
                .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    found.sort();
    found
}

fn written(verdict: &BundleVerdict) -> &str {
    match verdict {
        BundleVerdict::Written { file, .. } => file,
        other => panic!("expected a bundle, got {other:?}"),
    }
}

fn args(repos: &[&str]) -> Vec<String> {
    repos.iter().map(|r| (*r).to_owned()).collect()
}

#[test]
fn each_repository_gets_its_own_bundle_that_clones_to_its_head() {
    let (dir, root) = project();
    let top = repository(&dir, ".");
    let inner = repository(&dir, "vendor/stats");

    let verdicts = write_git_bundles(&root, &args(&[".", "vendor/stats"]));

    assert_eq!(verdicts.len(), 2);
    assert_eq!(written(&verdicts[0]), "_notebook/exports/git/root.bundle");
    assert_eq!(
        written(&verdicts[1]),
        "_notebook/exports/git/vendor-stats.bundle"
    );
    for (verdict, repo) in verdicts.iter().zip([&top, &inner]) {
        let clone = dir.path().join(format!(
            "clone-{}",
            repo.file_name().unwrap().to_string_lossy()
        ));
        let bundle = dir.path().join(written(verdict));
        git(
            dir.path(),
            &[
                "clone",
                "-q",
                bundle.to_str().unwrap(),
                clone.to_str().unwrap(),
            ],
        );
        assert_eq!(
            git(&clone, &["rev-parse", "HEAD"]),
            git(repo, &["rev-parse", "HEAD"])
        );
    }
}

#[test]
fn a_bundle_reports_its_size() {
    let (dir, root) = project();
    repository(&dir, "code");

    let verdicts = write_git_bundles(&root, &args(&["code"]));

    let BundleVerdict::Written { file, bytes } = &verdicts[0] else {
        panic!("{verdicts:?}");
    };
    assert_eq!(*bytes, fs::metadata(dir.path().join(file)).unwrap().len());
    assert!(*bytes > 0);
}

#[test]
fn a_repository_that_cannot_be_bundled_does_not_stop_the_others() {
    let (dir, root) = project();
    fs::create_dir_all(dir.path().join("plain")).unwrap();
    fs::create_dir_all(dir.path().join("empty")).unwrap();
    git(&dir.path().join("empty"), &["init", "-q"]);
    repository(&dir, "code");

    let verdicts = write_git_bundles(&root, &args(&["plain", "empty", "missing", "code"]));

    assert_eq!(verdicts[0], BundleVerdict::NotARepository);
    assert_eq!(verdicts[1], BundleVerdict::NoCommits);
    assert_eq!(verdicts[2], BundleVerdict::NotARepository);
    assert_eq!(written(&verdicts[3]), "_notebook/exports/git/code.bundle");
    assert_eq!(names(&dir), ["code.bundle"]);
}

#[test]
fn a_path_that_leaves_the_project_is_refused() {
    let (dir, root) = project();
    let outside = tempfile::tempdir().unwrap();
    git(outside.path(), &["init", "-q"]);

    let verdicts = write_git_bundles(
        &root,
        &args(&["../elsewhere", "..", "C:/Users", "/etc", ""]),
    );

    assert!(
        verdicts.iter().all(|v| *v == BundleVerdict::Refused),
        "{verdicts:?}"
    );
    assert!(names(&dir).is_empty());
}

#[test]
fn repositories_whose_names_would_collide_get_different_files() {
    let (dir, root) = project();
    repository(&dir, "a/b");
    repository(&dir, "a-b");

    let verdicts = write_git_bundles(&root, &args(&["a-b", "a/b"]));

    assert_ne!(written(&verdicts[0]), written(&verdicts[1]));
    assert_eq!(names(&dir).len(), 2);
}

#[test]
fn running_again_replaces_the_bundle_and_leaves_no_temporary_file() {
    let (dir, root) = project();
    let repo = repository(&dir, "code");
    write_git_bundles(&root, &args(&["code"]));
    fs::write(repo.join("a.R"), "two\n").unwrap();
    git(&repo, &["commit", "-q", "-am", "two"]);

    let verdicts = write_git_bundles(&root, &args(&["code"]));

    assert_eq!(names(&dir), ["code.bundle"]);
    let bundle = dir.path().join(written(&verdicts[0]));
    let heads = git(
        dir.path(),
        &["bundle", "list-heads", bundle.to_str().unwrap()],
    );
    assert!(
        heads.contains(&git(&repo, &["rev-parse", "HEAD"])),
        "{heads}"
    );
}

#[test]
fn nothing_outside_the_exports_folder_changes() {
    let (dir, root) = project();
    repository(&dir, "code");
    let before = snapshot(dir.path());

    write_git_bundles(&root, &args(&["code", "missing"]));

    let after = snapshot(dir.path());
    let changed: Vec<_> = after
        .iter()
        .filter(|(path, bytes)| before.get(*path) != Some(*bytes))
        .map(|(path, _)| path.as_str())
        .collect();
    assert_eq!(changed, ["_notebook/exports/git/code.bundle"]);
    assert!(before.keys().all(|path| after.contains_key(path)));
}

#[test]
fn without_git_nothing_is_written() {
    let (dir, root) = project();
    repository(&dir, "code");

    let verdicts = write_git_bundles_with(
        OsStr::new("git-that-is-not-installed"),
        &root,
        &args(&["code"]),
    );

    assert_eq!(verdicts, [BundleVerdict::GitMissing]);
    assert!(names(&dir).is_empty());
}

/// Every file under the project, outside any `.git` folder (git rewrites its
/// own bookkeeping), with its bytes.
fn snapshot(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(dir: &Path, root: &Path, into: &mut BTreeMap<String, Vec<u8>>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.file_name() == Some(OsStr::new(".git")) {
                continue;
            }
            if path.is_dir() {
                walk(&path, root, into);
            } else {
                let rel = path
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                into.insert(rel, fs::read(&path).unwrap());
            }
        }
    }
    let mut files = BTreeMap::new();
    walk(root, root, &mut files);
    files
}
