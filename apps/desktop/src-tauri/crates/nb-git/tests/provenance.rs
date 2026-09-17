//! Builds real temporary git repositories with the `git` CLI (fixture
//! setup only — nb-git itself never shells out) and asserts
//! `nb_git::provenance_for_path` against them.
// disallowed_methods: this file only builds and tears down throwaway test
// fixture repositories under the OS temp directory, entirely outside any
// project's _notebook/; nb_fs's write/trash helpers do not apply here, and
// shelling out to `git` is fixture setup, not the thing nb-git itself does.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use nb_git::provenance_for_path;

struct TempRepo {
    dir: PathBuf,
}

impl TempRepo {
    fn init() -> Self {
        let dir = std::env::temp_dir().join(format!(
            "nb-git-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("mkdir temp repo");
        run_git(&dir, &["init", "-q"]);
        Self { dir }
    }

    fn path(&self) -> &Path {
        &self.dir
    }

    fn write(&self, name: &str, contents: &str) -> PathBuf {
        let file = self.dir.join(name);
        fs::write(&file, contents).expect("write fixture file");
        file
    }

    fn commit_all(&self, message: &str) {
        run_git(&self.dir, &["add", "."]);
        run_git(&self.dir, &["commit", "-q", "-m", message]);
    }

    fn head_sha(&self) -> String {
        let output = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&self.dir)
            .output()
            .expect("run git rev-parse");
        assert!(output.status.success());
        String::from_utf8(output.stdout)
            .expect("utf8 output")
            .trim()
            .to_string()
    }
}

impl Drop for TempRepo {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.dir);
    }
}

fn run_git(dir: &Path, args: &[&str]) {
    let status = Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("GIT_AUTHOR_NAME", "Test")
        .env("GIT_AUTHOR_EMAIL", "test@example.com")
        .env("GIT_COMMITTER_NAME", "Test")
        .env("GIT_COMMITTER_EMAIL", "test@example.com")
        .status()
        .expect("run git");
    assert!(status.success(), "git {args:?} failed");
}

#[test]
fn commit_sha_matches_head() {
    let repo = TempRepo::init();
    repo.write("a.txt", "hello\n");
    repo.commit_all("initial");

    let file = repo.path().join("a.txt");
    let provenance = provenance_for_path(&file)
        .expect("provenance_for_path should not error")
        .expect("file should be inside a repository");

    assert_eq!(provenance.commit, repo.head_sha());
}

#[test]
fn clean_repo_reports_both_flags_false() {
    let repo = TempRepo::init();
    repo.write("a.txt", "hello\n");
    repo.commit_all("initial");

    let file = repo.path().join("a.txt");
    let provenance = provenance_for_path(&file).unwrap().unwrap();

    assert!(!provenance.file_dirty);
    assert!(!provenance.tree_dirty);
}

#[test]
fn modifying_the_file_sets_file_dirty_and_tree_dirty() {
    let repo = TempRepo::init();
    repo.write("a.txt", "hello\n");
    repo.write("b.txt", "world\n");
    repo.commit_all("initial");

    repo.write("a.txt", "hello again\n");

    let a = provenance_for_path(&repo.path().join("a.txt"))
        .unwrap()
        .unwrap();
    assert!(a.file_dirty);
    assert!(a.tree_dirty);
}

#[test]
fn modifying_an_unrelated_file_sets_tree_dirty_only() {
    let repo = TempRepo::init();
    repo.write("a.txt", "hello\n");
    repo.write("b.txt", "world\n");
    repo.commit_all("initial");

    repo.write("b.txt", "world again\n");

    let a = provenance_for_path(&repo.path().join("a.txt"))
        .unwrap()
        .unwrap();
    assert!(!a.file_dirty, "a.txt itself was not modified");
    assert!(
        a.tree_dirty,
        "the repository as a whole has an uncommitted change"
    );
}

#[test]
fn committing_all_changes_clears_both_flags() {
    let repo = TempRepo::init();
    let file = repo.write("a.txt", "hello\n");
    repo.commit_all("initial");

    repo.write("a.txt", "hello again\n");
    repo.commit_all("update");

    let provenance = provenance_for_path(&file).unwrap().unwrap();
    assert!(!provenance.file_dirty);
    assert!(!provenance.tree_dirty);
}

#[test]
fn path_outside_any_repository_returns_none() {
    let dir = std::env::temp_dir().join(format!(
        "nb-git-no-repo-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time")
            .as_nanos()
    ));
    fs::create_dir_all(&dir).expect("mkdir");
    let file = dir.join("loose.txt");
    fs::write(&file, "not in a repo\n").expect("write file");

    let provenance = provenance_for_path(&file).expect("provenance_for_path should not error");
    assert!(provenance.is_none());

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn path_in_repo_uses_forward_slashes() {
    let repo = TempRepo::init();
    fs::create_dir_all(repo.path().join("nested").join("dir")).expect("mkdir nested");
    repo.write("nested/dir/file.txt", "hello\n");
    repo.commit_all("initial");

    let file = repo.path().join("nested").join("dir").join("file.txt");
    let provenance = provenance_for_path(&file).unwrap().unwrap();

    assert_eq!(provenance.path_in_repo, "nested/dir/file.txt");
    assert!(!provenance.path_in_repo.contains('\\'));
}
