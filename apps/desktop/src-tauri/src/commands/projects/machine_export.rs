//! The machine-readable export (FR-ARC-07, ADR-0055). `packages/format` builds
//! `notebook.json`, the schemas and the Markdown renderings; this command only
//! stores them under `_notebook/exports/machine/`, so Rust never parses or
//! builds notebook text.

use nb_archive::FileVerdict;
use nb_fs::lock::LockRegistry;
use nb_fs::ProjectRoot;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use super::folders::{FolderHandle, PickedFolders};
use super::history::writable;
use super::lock::with_root;
use super::types::ProjectError;

/// One file of the export, named relative to `_notebook/exports/machine/`.
#[derive(Debug, Clone, Deserialize, Type)]
pub struct MachineFileInput {
    pub name: String,
    pub text: String,
}

/// What became of one file, answered by position.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum MachineFileOutcome {
    Written,
    Refused,
    WriteFailed,
}

impl From<FileVerdict> for MachineFileOutcome {
    fn from(verdict: FileVerdict) -> Self {
        match verdict {
            FileVerdict::Written => Self::Written,
            FileVerdict::Refused => Self::Refused,
            FileVerdict::WriteFailed => Self::WriteFailed,
        }
    }
}

pub(super) fn store(root: &ProjectRoot, files: &[MachineFileInput]) -> Vec<MachineFileOutcome> {
    let files: Vec<(String, String)> = files
        .iter()
        .map(|f| (f.name.clone(), f.text.clone()))
        .collect();
    nb_archive::write_machine_files(root, &files)
        .into_iter()
        .map(MachineFileOutcome::from)
        .collect()
}

/// Writes the machine-readable export into `_notebook/exports/machine/`
/// (FR-ARC-07), replacing the files of an earlier run. Refused, with nothing
/// written, unless this application holds the project's lock.
#[tauri::command]
#[specta::specta]
pub async fn write_machine_export(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
    files: Vec<MachineFileInput>,
) -> Result<Vec<MachineFileOutcome>, ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        writable(locks.health(&root))?;
        Ok(store(&root, &files))
    })
    .await
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these write fixture files.
#[allow(clippy::unwrap_used, clippy::disallowed_methods)]
mod tests {
    use super::*;

    #[test]
    fn files_are_answered_by_position_and_a_bad_name_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("_notebook")).unwrap();
        let root = ProjectRoot::open(dir.path()).unwrap();
        let files = [
            MachineFileInput {
                name: "notebook.json".to_owned(),
                text: "{}".to_owned(),
            },
            MachineFileInput {
                name: "../x.md".to_owned(),
                text: "x".to_owned(),
            },
        ];

        let outcomes = store(&root, &files);

        assert_eq!(
            outcomes,
            [MachineFileOutcome::Written, MachineFileOutcome::Refused]
        );
        assert!(dir
            .path()
            .join("_notebook/exports/machine/notebook.json")
            .is_file());
    }
}
