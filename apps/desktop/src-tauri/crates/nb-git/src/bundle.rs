//! Writes a `git bundle` of a repository (FR-ARC-04, ADR-0053). `gix` cannot
//! make bundles, so this is the one place the `git` command is run (ADR-0018
//! kept it available for this). The repository is only read.

// disallowed_methods: `clippy.toml` reserves `std::process::Command::new`
// for the crates that wrap it. This module runs `git bundle create` and
// `git bundle verify` with fixed arguments and the paths its caller has
// already resolved.
#![allow(clippy::disallowed_methods)]

use std::ffi::OsStr;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// Why a bundle was not made. `Failed` and `VerifyFailed` carry git's own
/// message, for logs; callers must not show it, since it may name paths.
#[derive(Debug, thiserror::Error)]
pub enum BundleError {
    /// The `git` program could not be started.
    #[error("git is not installed or not on the PATH")]
    GitMissing,
    /// Not the root of a git repository.
    #[error("not the root of a git repository")]
    NotARepository,
    /// HEAD points at no commit, so there is nothing to bundle.
    #[error("the repository has no commits")]
    NoCommits,
    #[error("git could not make the bundle: {0}")]
    Failed(String),
    /// git made a file that it then refused to accept as a bundle.
    #[error("git did not accept the bundle it made: {0}")]
    VerifyFailed(String),
}

/// Writes every branch, tag and HEAD of the repository rooted at `repo_root`
/// to `out`, then asks git to verify the file. `out` is overwritten, so the
/// caller gives it a temporary path. `repo_root` must be the repository's own
/// working-tree root, not a folder inside it.
pub fn create_bundle(repo_root: &Path, out: &Path) -> Result<(), BundleError> {
    create_bundle_with(OsStr::new("git"), repo_root, out)
}

/// As [`create_bundle`], running `git` as the program `git`, so a test can
/// name one that is not installed.
pub fn create_bundle_with(git: &OsStr, repo_root: &Path, out: &Path) -> Result<(), BundleError> {
    match gix::open(repo_root) {
        Ok(repo) => {
            if repo.head_id().is_err() {
                return Err(BundleError::NoCommits);
            }
        }
        Err(gix::open::Error::NotARepository { .. }) => return Err(BundleError::NotARepository),
        Err(other) => return Err(BundleError::Failed(other.to_string())),
    }
    run(git, repo_root, &["bundle", "create"], out, &["--all"])
        .map_err(|e| e.into_error(BundleError::Failed))?;
    run(git, repo_root, &["bundle", "verify"], out, &[])
        .map_err(|e| e.into_error(BundleError::VerifyFailed))
}

enum RunError {
    Missing,
    Refused(String),
}

impl RunError {
    fn into_error(self, refused: fn(String) -> BundleError) -> BundleError {
        match self {
            Self::Missing => BundleError::GitMissing,
            Self::Refused(message) => refused(message),
        }
    }
}

fn run(
    git: &OsStr,
    repo_root: &Path,
    subcommand: &[&str],
    file: &Path,
    after: &[&str],
) -> Result<(), RunError> {
    let mut command = Command::new(git);
    command
        .arg("-C")
        .arg(without_verbatim_prefix(repo_root))
        .args(subcommand)
        .arg(without_verbatim_prefix(file))
        .args(after)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        // A credential or editor prompt would hang a background command.
        .env("GIT_TERMINAL_PROMPT", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: no console window flashes up over the app.
        command.creation_flags(0x0800_0000);
    }
    let output = command.output().map_err(|e| match e.kind() {
        io::ErrorKind::NotFound => RunError::Missing,
        _ => RunError::Refused(e.to_string()),
    })?;
    if output.status.success() {
        Ok(())
    } else {
        Err(RunError::Refused(
            String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        ))
    }
}

/// Git for Windows fails on the `\\?\C:\...` form that canonical paths take
/// there ("Invalid argument"), so the prefix is dropped when the rest is an
/// ordinary drive path. Any other path is returned as it is.
fn without_verbatim_prefix(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) if has_drive_prefix(rest) => PathBuf::from(rest),
        _ => path.to_path_buf(),
    }
}

fn has_drive_prefix(text: &str) -> bool {
    let mut chars = text.chars();
    matches!(
        (chars.next(), chars.next(), chars.next()),
        (Some(letter), Some(':'), Some('\\' | '/')) if letter.is_ascii_alphabetic()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_verbatim_drive_path_loses_its_prefix() {
        assert_eq!(
            without_verbatim_prefix(Path::new(r"\\?\C:\Users\a\.x.tmp")),
            PathBuf::from(r"C:\Users\a\.x.tmp")
        );
    }

    #[test]
    fn other_paths_are_left_alone() {
        for text in [r"\\?\UNC\server\share", r"C:\a", "/home/a", "relative/a"] {
            assert_eq!(
                without_verbatim_prefix(Path::new(text)),
                PathBuf::from(text)
            );
        }
    }
}
