//! `nb_git::create_bundle` against real temporary repositories (FR-ARC-04,
//! ADR-0053). Fixture repositories are built with the `git` CLI; the bundle
//! is read back with it too, so the test does not trust nb-git's own check.
// disallowed_methods: this file builds and tears down throwaway repositories
// under the OS temp directory, entirely outside any project's _notebook/.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use nb_git::{create_bundle, create_bundle_with, BundleError};

struct Scratch {
    dir: PathBuf,
}

impl Scratch {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!(
            "nb-git-bundle-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        Self { dir }
    }

    fn repo(&self, name: &str) -> PathBuf {
        let repo = self.dir.join(name);
        fs::create_dir_all(&repo).unwrap();
        git(&repo, &["init", "-q"]);
        repo
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.dir);
    }
}

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

fn commit(repo: &Path, file: &str, text: &str) {
    fs::write(repo.join(file), text).unwrap();
    git(repo, &["add", "."]);
    git(repo, &["commit", "-q", "-m", text]);
}

#[test]
fn a_bundle_clones_to_the_same_history() {
    let scratch = Scratch::new();
    let repo = scratch.repo("code");
    commit(&repo, "a.R", "one\n");
    commit(&repo, "a.R", "two\n");
    let bundle = scratch.dir.join("code.bundle");

    create_bundle(&repo, &bundle).unwrap();

    let clone = scratch.dir.join("clone");
    git(
        &scratch.dir,
        &[
            "clone",
            "-q",
            bundle.to_str().unwrap(),
            clone.to_str().unwrap(),
        ],
    );
    assert_eq!(
        git(&clone, &["rev-parse", "HEAD"]),
        git(&repo, &["rev-parse", "HEAD"])
    );
    assert_eq!(git(&clone, &["rev-list", "--count", "HEAD"]), "2");
}

#[test]
fn every_branch_is_in_the_bundle() {
    let scratch = Scratch::new();
    let repo = scratch.repo("code");
    commit(&repo, "a.R", "one\n");
    git(&repo, &["branch", "analysis-v2"]);
    let bundle = scratch.dir.join("code.bundle");

    create_bundle(&repo, &bundle).unwrap();

    let heads = git(
        &scratch.dir,
        &["bundle", "list-heads", bundle.to_str().unwrap()],
    );
    assert!(heads.contains("refs/heads/analysis-v2"), "{heads}");
}

#[test]
fn bundling_leaves_the_repository_as_it_was() {
    let scratch = Scratch::new();
    let repo = scratch.repo("code");
    commit(&repo, "a.R", "one\n");
    fs::write(repo.join("a.R"), "edited, not committed\n").unwrap();
    fs::write(repo.join("untracked.txt"), "x").unwrap();
    let status = git(&repo, &["status", "--porcelain"]);
    let head = git(&repo, &["rev-parse", "HEAD"]);

    create_bundle(&repo, &scratch.dir.join("code.bundle")).unwrap();

    assert_eq!(git(&repo, &["status", "--porcelain"]), status);
    assert_eq!(git(&repo, &["rev-parse", "HEAD"]), head);
    assert_eq!(
        fs::read(repo.join("a.R")).unwrap(),
        b"edited, not committed\n"
    );
}

#[test]
fn a_folder_that_is_not_a_repository_is_refused() {
    let scratch = Scratch::new();
    let plain = scratch.dir.join("plain");
    fs::create_dir_all(&plain).unwrap();

    let error = create_bundle(&plain, &scratch.dir.join("x.bundle")).unwrap_err();

    assert!(matches!(error, BundleError::NotARepository), "{error:?}");
    assert!(!scratch.dir.join("x.bundle").exists());
}

#[test]
fn a_folder_inside_a_repository_is_not_its_root() {
    let scratch = Scratch::new();
    let repo = scratch.repo("code");
    commit(&repo, "a.R", "one\n");
    fs::create_dir_all(repo.join("sub")).unwrap();

    let error = create_bundle(&repo.join("sub"), &scratch.dir.join("x.bundle")).unwrap_err();

    assert!(matches!(error, BundleError::NotARepository), "{error:?}");
}

#[test]
fn a_repository_with_no_commits_has_nothing_to_bundle() {
    let scratch = Scratch::new();
    let repo = scratch.repo("empty");

    let error = create_bundle(&repo, &scratch.dir.join("x.bundle")).unwrap_err();

    assert!(matches!(error, BundleError::NoCommits), "{error:?}");
    assert!(!scratch.dir.join("x.bundle").exists());
}

#[test]
fn a_missing_git_program_is_reported_as_such() {
    let scratch = Scratch::new();
    let repo = scratch.repo("code");
    commit(&repo, "a.R", "one\n");

    let error = create_bundle_with(
        OsStr::new("git-that-is-not-installed"),
        &repo,
        &scratch.dir.join("x.bundle"),
    )
    .unwrap_err();

    assert!(matches!(error, BundleError::GitMissing), "{error:?}");
}
