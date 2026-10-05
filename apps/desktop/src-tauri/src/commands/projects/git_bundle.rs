//! Git bundles of the repositories provenance references (FR-ARC-04,
//! ADR-0053). Which repositories those are comes from `packages/format`,
//! which reads `artefacts.yaml`; this command only bundles the ones it is
//! told, so Rust never parses notebook text.

use nb_archive::BundleVerdict;
use nb_fs::lock::LockRegistry;
use nb_fs::{ProjectRelPath, ProjectRoot};
use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;
use tauri::State;

use super::folders::{FolderHandle, PickedFolders};
use super::history::writable;
use super::lock::with_root;
use super::types::ProjectError;

/// A repository as provenance records it (spec 5.8): `.` for the project's
/// own folder, or a forward-only path below it. Backslashes are accepted and
/// stored as `/`. Where it resolves is checked again by `nb-archive`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct RepoPath(String);

impl RepoPath {
    fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for RepoPath {
    type Error = String;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        if text == "." {
            return Ok(Self(text));
        }
        ProjectRelPath::parse(&text)
            .map(|path| Self(path.to_string()))
            .map_err(|e| e.to_string())
    }
}

// Written by hand for the same reason as `VersionPath`: `#[serde(try_from)]`
// makes the generated bindings split the type in two.
impl<'de> Deserialize<'de> for RepoPath {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::try_from(String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

/// What happened to one repository. Answered by position, and with no text
/// from git, which may name paths the person did not ask about.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GitBundleOutcome {
    /// Bundled and accepted by `git bundle verify`. `file` is project-relative.
    #[serde(rename_all = "camelCase")]
    Written { file: String, bytes: f64 },
    /// The `git` program could not be started.
    GitMissing,
    /// Not the root of a git repository.
    NotARepository,
    /// The repository has no commits.
    NoCommits,
    /// The path is not a folder inside the project.
    Refused,
    /// Git failed, or did not accept what it made. Any earlier bundle is kept.
    Failed,
    /// The bundle could not be placed in the notebook.
    WriteFailed,
}

impl From<BundleVerdict> for GitBundleOutcome {
    fn from(verdict: BundleVerdict) -> Self {
        match verdict {
            // Sizes are far below 2^53, the webview's exact limit.
            BundleVerdict::Written { file, bytes } => Self::Written {
                file,
                bytes: bytes as f64,
            },
            BundleVerdict::GitMissing => Self::GitMissing,
            BundleVerdict::NotARepository => Self::NotARepository,
            BundleVerdict::NoCommits => Self::NoCommits,
            BundleVerdict::Refused => Self::Refused,
            BundleVerdict::Failed => Self::Failed,
            BundleVerdict::WriteFailed => Self::WriteFailed,
        }
    }
}

pub(super) fn bundle_repositories(root: &ProjectRoot, repos: &[RepoPath]) -> Vec<GitBundleOutcome> {
    let repos: Vec<String> = repos.iter().map(|r| r.as_str().to_owned()).collect();
    nb_archive::write_git_bundles(root, &repos)
        .into_iter()
        .map(GitBundleOutcome::from)
        .collect()
}

/// Writes a git bundle of each repository, into `_notebook/exports/git/`
/// (FR-ARC-04). The repositories are only read. Refused, with nothing
/// written, unless this application holds the project's lock. A repository
/// that cannot be bundled is reported and the others still are.
#[tauri::command]
#[specta::specta]
pub async fn write_git_bundles(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
    repos: Vec<RepoPath>,
) -> Result<Vec<GitBundleOutcome>, ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        writable(locks.health(&root))?;
        Ok(bundle_repositories(&root, &repos))
    })
    .await
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these write fixture files and
// run git to build repositories.
#[allow(clippy::unwrap_used, clippy::disallowed_methods)]
mod tests {
    use std::fs;
    use std::process::Command;

    use super::*;

    #[test]
    fn a_repository_path_is_dot_or_a_forward_path_inside_the_project() {
        for ok in [".", "code", "vendor/stats", "vendor\\stats"] {
            assert!(RepoPath::try_from(ok.to_owned()).is_ok(), "{ok}");
        }
        for bad in ["", "..", "../x", "a/../b", "/abs", "C:/x", "a//b"] {
            assert!(RepoPath::try_from(bad.to_owned()).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_backslash_path_is_stored_with_forward_slashes() {
        let path = RepoPath::try_from("vendor\\stats".to_owned()).unwrap();
        assert_eq!(path.as_str(), "vendor/stats");
    }

    #[test]
    fn each_verdict_has_an_outcome_without_system_text() {
        assert_eq!(
            GitBundleOutcome::from(BundleVerdict::Written {
                file: "_notebook/exports/git/code.bundle".to_owned(),
                bytes: 12,
            }),
            GitBundleOutcome::Written {
                file: "_notebook/exports/git/code.bundle".to_owned(),
                bytes: 12.0,
            }
        );
        assert_eq!(
            GitBundleOutcome::from(BundleVerdict::NoCommits),
            GitBundleOutcome::NoCommits
        );
        assert_eq!(
            GitBundleOutcome::from(BundleVerdict::Failed),
            GitBundleOutcome::Failed
        );
    }

    #[test]
    fn bundling_answers_by_position_and_writes_under_exports_git_only() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("_notebook")).unwrap();
        fs::create_dir_all(dir.path().join("code")).unwrap();
        let in_code = |args: &[&str]| {
            assert!(Command::new("git")
                .args(args)
                .current_dir(dir.path().join("code"))
                .status()
                .unwrap()
                .success());
        };
        in_code(&["init", "-q"]);
        in_code(&[
            "-c",
            "user.name=T",
            "-c",
            "user.email=t@example.com",
            "commit",
            "-q",
            "--allow-empty",
            "-m",
            "x",
        ]);
        let root = ProjectRoot::open(dir.path()).unwrap();
        let repos = ["nowhere", "code"].map(|r| RepoPath::try_from(r.to_owned()).unwrap());

        let outcomes = bundle_repositories(&root, &repos);

        assert_eq!(outcomes.len(), 2);
        assert_eq!(outcomes[0], GitBundleOutcome::NotARepository);
        assert!(matches!(
            &outcomes[1],
            GitBundleOutcome::Written { file, .. } if file == "_notebook/exports/git/code.bundle"
        ));
        assert!(dir
            .path()
            .join("_notebook/exports/git/code.bundle")
            .is_file());
        let mut written: Vec<_> = fs::read_dir(dir.path().join("_notebook/exports"))
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        written.sort();
        assert_eq!(written, ["git"]);
    }
}
