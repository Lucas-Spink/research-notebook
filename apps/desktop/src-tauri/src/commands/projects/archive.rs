//! The manifest of captured files (FR-ARC-02, ADR-0051). Hashing is read-only
//! and goes through `nb-fs`; the CSV is made by `packages/format` and only
//! stored here, in the one file `exports/manifest.csv` inside `_notebook/`.

use nb_fs::lock::LockRegistry;
use nb_fs::{ProjectRelPath, ProjectRoot, ReadError, VersionObservation};
use serde::Serialize;
use specta::Type;
use tauri::State;

use super::folders::{FolderHandle, PickedFolders};
use super::history::writable;
use super::lock::with_root;
use super::preview::VersionPath;
use super::types::ProjectError;

/// Where the manifest goes: the one file this module writes.
const MANIFEST_PATH: &str = "_notebook/exports/manifest.csv";

/// What a captured version's file is on disk now (FR-ARC-02). Answered by
/// position, so no path or system text comes back. Sizes and times are
/// numbers of the webview's own kind, exact below 2^53.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum VersionObserved {
    #[serde(rename_all = "camelCase")]
    Observed {
        size: f64,
        modified_ms: f64,
        sha256: String,
    },
    /// Nothing is there.
    Missing,
    /// Something is there that could not be read as a captured file.
    Unreadable,
}

fn number(value: u64) -> f64 {
    // Sizes and milliseconds since 1970 are far below 2^53.
    value as f64
}

impl From<Result<VersionObservation, ReadError>> for VersionObserved {
    fn from(result: Result<VersionObservation, ReadError>) -> Self {
        match result {
            Ok(seen) => Self::Observed {
                size: number(seen.size),
                modified_ms: number(seen.modified_ms),
                sha256: seen.sha256,
            },
            Err(ReadError::Missing { .. }) => Self::Missing,
            Err(_) => Self::Unreadable,
        }
    }
}

/// Hashes each file through `nb-fs`, which only reads. One answer per file,
/// in the order asked.
pub(super) fn observe_files(root: &ProjectRoot, files: &[VersionPath]) -> Vec<VersionObserved> {
    files
        .iter()
        .map(|file| match file.to_rel() {
            Ok(rel) => root.observe_version_file(&rel).into(),
            Err(_) => VersionObserved::Unreadable,
        })
        .collect()
}

/// Stores `csv`, made by `packages/format`, as `_notebook/exports/manifest.csv`,
/// replacing the last one. It is a derived export, so it keeps no history.
pub(super) fn store_manifest(root: &ProjectRoot, csv: &str) -> Result<(), ProjectError> {
    let path = ProjectRelPath::parse(MANIFEST_PATH).map_err(|_| ProjectError::Internal)?;
    root.write_atomic(&path, csv.as_bytes())
        .map_err(|_| ProjectError::WriteFailed)
}

/// What each captured version file is on disk now, for the manifest
/// (FR-ARC-02). Read-only. Files that cannot be observed are reported as
/// such, never skipped.
#[tauri::command]
#[specta::specta]
pub async fn observe_version_files(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    files: Vec<VersionPath>,
) -> Result<Vec<VersionObserved>, ProjectError> {
    with_root(&folders, folder, move |root| {
        Ok(observe_files(&root, &files))
    })
    .await
}

/// Writes `exports/manifest.csv` (FR-ARC-02). Refused, with nothing written,
/// unless this application holds the project's lock.
#[tauri::command]
#[specta::specta]
pub async fn write_manifest(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
    csv: String,
) -> Result<(), ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        writable(locks.health(&root))?;
        store_manifest(&root, &csv)
    })
    .await
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests, and they write
// fixture files with std::fs.
#[allow(clippy::unwrap_used, clippy::disallowed_methods)]
mod tests {
    use std::fs;

    use nb_fs::ProjectRoot;
    use tempfile::TempDir;

    use super::*;
    use crate::commands::projects::preview::VersionPath;

    const EVIDENCE: &str = "_notebook/experiments/EXP-001/evidence";

    fn project(files: &[(&str, &[u8])]) -> (TempDir, ProjectRoot) {
        let dir = tempfile::tempdir().unwrap();
        for (rel, bytes) in files {
            let path = dir.path().join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, bytes).unwrap();
        }
        fs::create_dir_all(dir.path().join("_notebook")).unwrap();
        let root = ProjectRoot::open(dir.path()).unwrap();
        (dir, root)
    }

    fn path(text: &str) -> VersionPath {
        VersionPath::try_from(text.to_owned()).unwrap()
    }

    #[test]
    fn each_file_is_answered_by_position() {
        let (_dir, root) = project(&[
            (&format!("{EVIDENCE}/here.txt"), b"abc"),
            (&format!("{EVIDENCE}/dir/inner.txt"), b"x"),
        ]);
        let files = [
            path(&format!("{EVIDENCE}/gone.txt")),
            path(&format!("{EVIDENCE}/here.txt")),
            path(&format!("{EVIDENCE}/dir")),
        ];

        let seen = observe_files(&root, &files);

        assert_eq!(seen.len(), 3);
        assert_eq!(seen[0], VersionObserved::Missing);
        assert!(matches!(
            &seen[1],
            VersionObserved::Observed { size, sha256, .. }
                if (*size - 3.0).abs() < f64::EPSILON
                    && sha256 == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        ));
        assert_eq!(seen[2], VersionObserved::Unreadable);
    }

    #[test]
    fn observing_files_changes_nothing() {
        let (dir, root) = project(&[(&format!("{EVIDENCE}/here.txt"), b"x")]);

        observe_files(&root, &[path(&format!("{EVIDENCE}/here.txt"))]);

        assert_eq!(
            fs::read(dir.path().join(format!("{EVIDENCE}/here.txt"))).unwrap(),
            b"x"
        );
        assert!(!dir.path().join("_notebook/exports").exists());
    }

    #[test]
    fn the_manifest_is_written_to_exports_and_replaced_next_time() {
        let (dir, root) = project(&[]);

        store_manifest(&root, "path\nfirst\n").unwrap();
        let first = fs::read_to_string(dir.path().join("_notebook/exports/manifest.csv")).unwrap();
        store_manifest(&root, "path\nsecond\n").unwrap();
        let second = fs::read_to_string(dir.path().join("_notebook/exports/manifest.csv")).unwrap();

        assert_eq!(first, "path\nfirst\n");
        assert_eq!(second, "path\nsecond\n");
    }

    #[test]
    fn writing_the_manifest_touches_nothing_else() {
        let (dir, root) = project(&[
            ("results/pca.csv", b"a,b\n"),
            ("_notebook/project.yaml", b"format_version: 1\n"),
        ]);

        store_manifest(&root, "path\n").unwrap();

        assert_eq!(
            fs::read(dir.path().join("results/pca.csv")).unwrap(),
            b"a,b\n"
        );
        assert_eq!(
            fs::read(dir.path().join("_notebook/project.yaml")).unwrap(),
            b"format_version: 1\n"
        );
        let mut names: Vec<String> = fs::read_dir(dir.path().join("_notebook/exports"))
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, ["manifest.csv"]);
    }
}
