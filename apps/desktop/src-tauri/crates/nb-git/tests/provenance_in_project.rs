//! `provenance_in_project` (spec 5.8, FR-EVD-12, ADR-0018, ADR-0032): the
//! project-relative `repo` field ADR-0018 deferred to this task. Builds on
//! the same real-git-repository fixtures `provenance.rs` uses.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use nb_git::provenance_in_project;

struct TempRepo {
    dir: PathBuf,
}

impl TempRepo {
    fn init_at(dir: PathBuf) -> Self {
        fs::create_dir_all(&dir).expect("mkdir temp repo");
        run_git(&dir, &["init", "-q"]);
        Self { dir }
    }

    fn init() -> Self {
        let dir = std::env::temp_dir().join(format!(
            "nb-git-pip-test-{}-{}",
            std::process::id(),
            unique_suffix()
        ));
        Self::init_at(dir)
    }

    fn path(&self) -> &Path {
        &self.dir
    }

    fn write(&self, name: &str, contents: &str) -> PathBuf {
        let file = self.dir.join(name);
        if let Some(parent) = file.parent() {
            fs::create_dir_all(parent).expect("mkdir nested");
        }
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

fn unique_suffix() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system time")
        .as_nanos()
}

fn temp_dir(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "nb-git-pip-{name}-{}-{}",
        std::process::id(),
        unique_suffix()
    ))
}

#[test]
fn the_project_root_itself_is_reported_as_a_dot() {
    let repo = TempRepo::init();
    let file = repo.write("scripts/run.R", "print('hi')\n");
    repo.commit_all("initial");

    let provenance = provenance_in_project(&file, repo.path())
        .expect("should not error")
        .expect("file is inside a repository");

    assert_eq!(provenance.repo, ".");
    assert_eq!(provenance.commit, repo.head_sha());
    assert_eq!(provenance.path_in_repo, "scripts/run.R");
}

#[test]
fn a_repository_nested_inside_the_project_is_a_relative_path() {
    let outer_root = temp_dir("outer");
    fs::create_dir_all(&outer_root).expect("mkdir outer");
    let repo = TempRepo::init_at(outer_root.join("vendor").join("analysis-repo"));
    let file = repo.write("a.txt", "hello\n");
    repo.commit_all("initial");

    let provenance = provenance_in_project(&file, &outer_root)
        .expect("should not error")
        .expect("file is inside a repository");

    assert_eq!(provenance.repo, "vendor/analysis-repo");

    let _ = fs::remove_dir_all(&outer_root);
}

#[test]
fn a_repository_that_contains_the_project_reports_no_provenance() {
    let repo = TempRepo::init();
    let project_root = repo.path().join("my-project");
    let file = repo.write("my-project/scripts/run.R", "print('hi')\n");
    repo.commit_all("initial");

    let provenance = provenance_in_project(&file, &project_root).expect("should not error");

    assert!(
        provenance.is_none(),
        "a repo that contains the project root cannot be expressed as a `..`-free relative path"
    );
}

#[test]
fn an_unrelated_repository_reports_no_provenance() {
    let repo = TempRepo::init();
    let file = repo.write("a.txt", "hello\n");
    repo.commit_all("initial");

    let unrelated_project_root = temp_dir("unrelated-project");
    fs::create_dir_all(&unrelated_project_root).expect("mkdir unrelated project");

    let provenance =
        provenance_in_project(&file, &unrelated_project_root).expect("should not error");

    assert!(provenance.is_none());

    let _ = fs::remove_dir_all(&unrelated_project_root);
}

#[test]
fn a_path_outside_any_repository_reports_no_provenance() {
    let project_root = temp_dir("no-repo-project");
    fs::create_dir_all(&project_root).expect("mkdir project");
    let file = project_root.join("loose.txt");
    fs::write(&file, "not in a repo\n").expect("write file");

    let provenance = provenance_in_project(&file, &project_root).expect("should not error");

    assert!(provenance.is_none());

    let _ = fs::remove_dir_all(&project_root);
}
