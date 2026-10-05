//! Verify (FR-ARC-03, ADR-0052). Both commands only read. The manifest's text
//! goes to `packages/format` to be parsed; the comparison itself is
//! `nb-archive`'s, so the files are only ever hashed through `nb-fs`.

use nb_archive::{Expected, Verdict};
use nb_fs::{ProjectRoot, ReadError};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use super::folders::{FolderHandle, PickedFolders};
use super::lock::with_root;
use super::preview::VersionPath;
use super::types::ProjectError;

/// The text of `exports/manifest.csv`, or why there is none to verify against.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ManifestText {
    Found {
        text: String,
    },
    /// No manifest has been generated.
    Missing,
    /// There is something at the manifest's place that cannot be read as text.
    Unreadable,
}

/// One line of the manifest, as `packages/format` parsed it.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEntry {
    pub path: VersionPath,
    /// Bytes; a whole number the webview can hold exactly.
    pub size: f64,
    /// Lower-case hexadecimal SHA-256.
    pub sha256: String,
}

/// How one listed file compares with the manifest. Answered by position.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileVerdict {
    Matches,
    Missing,
    Unreadable,
    #[serde(rename_all = "camelCase")]
    Differs {
        size_changed: bool,
        hash_changed: bool,
    },
}

impl From<Verdict> for FileVerdict {
    fn from(verdict: Verdict) -> Self {
        match verdict {
            Verdict::Matches => Self::Matches,
            Verdict::Missing => Self::Missing,
            Verdict::Unreadable => Self::Unreadable,
            Verdict::Differs {
                size_changed,
                hash_changed,
            } => Self::Differs {
                size_changed,
                hash_changed,
            },
        }
    }
}

pub(super) fn manifest_text(root: &ProjectRoot) -> ManifestText {
    match root.read_manifest() {
        Ok(text) => ManifestText::Found { text },
        Err(ReadError::Missing { .. }) => ManifestText::Missing,
        Err(_) => ManifestText::Unreadable,
    }
}

/// A size that is not a whole number of bytes can match no file, so it is
/// made one that cannot.
fn bytes(size: f64) -> u64 {
    if size.is_finite() && size >= 0.0 && size.fract() == 0.0 {
        size as u64
    } else {
        u64::MAX
    }
}

pub(super) fn verify_files(root: &ProjectRoot, files: &[ManifestEntry]) -> Vec<FileVerdict> {
    let expected: Vec<Expected> = files
        .iter()
        .map(|file| Expected {
            path: file.path.as_str().to_owned(),
            size: bytes(file.size),
            sha256: file.sha256.clone(),
        })
        .collect();
    nb_archive::verify(root, &expected)
        .into_iter()
        .map(FileVerdict::from)
        .collect()
}

/// The manifest's text, for `packages/format` to parse. Read-only.
#[tauri::command]
#[specta::specta]
pub async fn read_manifest(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
) -> Result<ManifestText, ProjectError> {
    with_root(&folders, folder, move |root| Ok(manifest_text(&root))).await
}

/// Re-hashes the listed files and compares them with the manifest (FR-ARC-03).
/// Read-only: needs no project lock, so a read-only project can be verified.
#[tauri::command]
#[specta::specta]
pub async fn verify_manifest_files(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    files: Vec<ManifestEntry>,
) -> Result<Vec<FileVerdict>, ProjectError> {
    with_root(&folders, folder, move |root| {
        Ok(verify_files(&root, &files))
    })
    .await
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these write fixture files.
#[allow(clippy::unwrap_used, clippy::disallowed_methods)]
mod tests {
    use std::fs;

    use super::*;

    const FILE: &str = "_notebook/experiments/EXP-001/evidence/a.txt";
    // SHA-256 of "abc".
    const ABC: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    fn project() -> (tempfile::TempDir, ProjectRoot) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(FILE);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"abc").unwrap();
        let root = ProjectRoot::open(dir.path()).unwrap();
        (dir, root)
    }

    fn expect(size: f64, sha256: &str) -> ManifestEntry {
        ManifestEntry {
            path: VersionPath::try_from(FILE.to_owned()).unwrap(),
            size,
            sha256: sha256.to_owned(),
        }
    }

    #[test]
    fn a_matching_file_and_a_changed_one_are_told_apart() {
        let (_dir, root) = project();
        let verdicts = verify_files(&root, &[expect(3.0, ABC), expect(3.0, &"0".repeat(64))]);
        assert_eq!(
            verdicts,
            [
                FileVerdict::Matches,
                FileVerdict::Differs {
                    size_changed: false,
                    hash_changed: true
                }
            ]
        );
    }

    #[test]
    fn a_size_that_is_not_whole_bytes_never_matches() {
        let (_dir, root) = project();
        for size in [2.5, -1.0, f64::NAN, f64::INFINITY] {
            assert!(matches!(
                verify_files(&root, &[expect(size, ABC)])[0],
                FileVerdict::Differs {
                    size_changed: true,
                    ..
                }
            ));
        }
    }

    #[test]
    fn the_manifest_is_missing_until_written_then_found() {
        let (dir, root) = project();
        assert_eq!(manifest_text(&root), ManifestText::Missing);
        let path = dir.path().join("_notebook/exports/manifest.csv");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "path\n").unwrap();
        assert_eq!(
            manifest_text(&root),
            ManifestText::Found {
                text: "path\n".to_owned()
            }
        );
    }
}
