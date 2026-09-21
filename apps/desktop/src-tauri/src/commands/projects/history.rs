//! Saving with history, deleting to the trash and the version-change backup
//! (FR-HIS-01, FR-HIS-04, FR-EXP-06, ADR-0025). The snapshots, the trash and
//! the backup are in `nb-fs`; these commands check the project is writable,
//! validate the paths and hand the person's text over. The text is made by
//! `packages/format`; nothing here parses it.

use nb_fs::lock::{LockHealth, LockRegistry};
use nb_fs::watch::{is_notebook_data_folder, is_notebook_data_path};
use nb_fs::{Backup, Expected, ProjectRelPath, SaveOutcome, SystemClock, Trashed};
use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;
use tauri::State;

use super::files::NotebookPath;
use super::folders::{FolderHandle, PickedFolders};
use super::lock::with_root;
use super::types::ProjectError;

/// A project-relative path the trash command accepts: a question file, or the
/// folder of an experiment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct TrashTarget(String);

impl TryFrom<String> for TrashTarget {
    type Error = String;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        let path = ProjectRelPath::parse(&text).map_err(|e| e.to_string())?;
        let allowed = match path.segments().collect::<Vec<_>>().as_slice() {
            ["_notebook", "questions", name] => is_notebook_data_path(&format!("questions/{name}")),
            ["_notebook", "experiments", folder] => {
                is_notebook_data_folder(&format!("experiments/{folder}"))
            }
            _ => false,
        };
        if allowed {
            Ok(Self(path.to_string()))
        } else {
            Err("expected a question file or an experiment folder".to_owned())
        }
    }
}

impl TrashTarget {
    fn to_rel(&self) -> Result<ProjectRelPath, ProjectError> {
        ProjectRelPath::parse(&self.0).map_err(|_| ProjectError::WriteFailed)
    }
}

// Written by hand for the same reason as `NotebookPath`: `#[serde(try_from)]`
// makes the generated bindings split the type in two.
impl<'de> Deserialize<'de> for TrashTarget {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::try_from(String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

/// What the caller believes is on disk.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ExpectedFile {
    Absent,
    Sha256 { sha256: String },
}

impl From<ExpectedFile> for Expected {
    fn from(expected: ExpectedFile) -> Self {
        match expected {
            ExpectedFile::Absent => Self::Absent,
            ExpectedFile::Sha256 { sha256 } => Self::Sha256(sha256),
        }
    }
}

/// What a save did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SaveResult {
    Saved { snapshot: Option<String> },
    Changed { current: Option<String> },
}

impl From<SaveOutcome> for SaveResult {
    fn from(outcome: SaveOutcome) -> Self {
        match outcome {
            SaveOutcome::Saved { snapshot } => Self::Saved { snapshot },
            SaveOutcome::Changed { current } => Self::Changed { current },
        }
    }
}

/// Where a trashed file or folder went.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TrashedItem {
    pub location: String,
}

impl From<Trashed> for TrashedItem {
    fn from(trashed: Trashed) -> Self {
        Self {
            location: trashed.location,
        }
    }
}

/// A backup that was made.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BackupMade {
    pub folder: String,
    pub copied: u32,
    pub skipped: u32,
}

impl From<Backup> for BackupMade {
    fn from(backup: Backup) -> Self {
        Self {
            folder: backup.folder,
            copied: u32::try_from(backup.copied).unwrap_or(u32::MAX),
            skipped: u32::try_from(backup.skipped).unwrap_or(u32::MAX),
        }
    }
}

/// Writing needs the project's lock: any other state is read-only.
fn writable(health: LockHealth) -> Result<(), ProjectError> {
    match health {
        LockHealth::Held => Ok(()),
        LockHealth::Lost | LockHealth::NotHeld => Err(ProjectError::NotWritable),
    }
}

/// Overwrites a notebook data file with `text`, first keeping what it held in
/// `.history`. Refused, with nothing written, if this application does not
/// hold the project's lock, or if the file is no longer what `expected` says
/// (`changed`), which is how a save never overwrites an outside edit.
#[tauri::command]
#[specta::specta]
pub async fn write_notebook_file(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
    path: NotebookPath,
    text: String,
    expected: ExpectedFile,
) -> Result<SaveResult, ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        writable(locks.health(&root))?;
        root.write_data_file(
            &path.to_rel()?,
            text.as_bytes(),
            &Expected::from(expected),
            &SystemClock,
        )
        .map(SaveResult::from)
        .map_err(|_| ProjectError::WriteFailed)
    })
    .await
}

/// Moves a question file or an experiment folder to `.trash/`. Nothing is
/// deleted; the person can move it back.
#[tauri::command]
#[specta::specta]
pub async fn move_to_trash(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
    path: TrashTarget,
) -> Result<TrashedItem, ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        writable(locks.health(&root))?;
        root.move_to_trash(&path.to_rel()?, &SystemClock)
            .map(TrashedItem::from)
            .map_err(|_| ProjectError::WriteFailed)
    })
    .await
}

/// Copies the notebook's text files to `backups/` before the first write by
/// this version of the application. The webview decides whether one is due by
/// comparing `last_written_by`, which it parsed, with this build's version;
/// the version named in the folder is this build's own, not one it supplies.
#[tauri::command]
#[specta::specta]
pub async fn backup_for_version_change(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
) -> Result<BackupMade, ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        writable(locks.health(&root))?;
        root.backup_before_version(env!("CARGO_PKG_VERSION"), &SystemClock)
            .map(BackupMade::from)
            .map_err(|_| ProjectError::WriteFailed)
    })
    .await
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests.
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    fn target(text: &str) -> Result<TrashTarget, String> {
        TrashTarget::try_from(text.to_owned())
    }

    #[test]
    fn a_question_file_and_an_experiment_folder_can_be_trashed() {
        assert_eq!(
            target("_notebook/questions/Q-001.md").unwrap().0,
            "_notebook/questions/Q-001.md"
        );
        assert_eq!(
            target("_notebook\\experiments\\EXP-001").unwrap().0,
            "_notebook/experiments/EXP-001"
        );
    }

    #[test]
    fn nothing_else_can_be_trashed() {
        for path in [
            "",
            "_notebook",
            "_notebook/project.yaml",
            "_notebook/bibliography.json",
            "_notebook/.lock",
            "_notebook/.history/questions/Q-001.md",
            "_notebook/.trash/2026-09-21T10-15-00Z",
            "_notebook/backups/x",
            "_notebook/questions",
            "_notebook/questions/Q-001.txt",
            "_notebook/questions/sub/Q-001.md",
            "_notebook/questions/.Q-001.md",
            "_notebook/experiments",
            "_notebook/experiments/.hidden",
            "_notebook/experiments/EXP-001/experiment.md",
            "_notebook/experiments/EXP-001/evidence",
            "README.md",
            "scripts/run.R",
            "../outside",
            "/etc/passwd",
            "C:\\Windows",
        ] {
            assert!(target(path).is_err(), "{path:?}");
        }
    }

    #[test]
    fn a_path_from_the_webview_is_checked_when_it_is_deserialised() {
        let ok: Result<TrashTarget, _> = serde_json::from_str("\"_notebook/questions/Q-001.md\"");
        assert!(ok.is_ok());
        let bad: Result<TrashTarget, _> = serde_json::from_str("\"_notebook/project.yaml\"");
        assert!(bad.is_err());
    }

    #[test]
    fn only_a_held_lock_allows_writing() {
        assert_eq!(writable(LockHealth::Held), Ok(()));
        assert_eq!(writable(LockHealth::Lost), Err(ProjectError::NotWritable));
        assert_eq!(
            writable(LockHealth::NotHeld),
            Err(ProjectError::NotWritable)
        );
    }

    #[test]
    fn the_expected_state_is_read_from_the_webview_as_tagged_json() {
        let absent: ExpectedFile = serde_json::from_str(r#"{"kind":"absent"}"#).unwrap();
        assert_eq!(Expected::from(absent), Expected::Absent);
        let hash: ExpectedFile =
            serde_json::from_str(r#"{"kind":"sha256","sha256":"ab12"}"#).unwrap();
        assert_eq!(Expected::from(hash), Expected::Sha256("ab12".to_owned()));
        assert!(serde_json::from_str::<ExpectedFile>(r#"{"kind":"any"}"#).is_err());
    }

    #[test]
    fn a_save_outcome_reaches_the_webview_with_its_snapshot_or_current_hash() {
        let saved = SaveResult::from(SaveOutcome::Saved {
            snapshot: Some("_notebook/.history/a/2026-09-21T10-15-00Z.md".to_owned()),
        });
        assert_eq!(
            serde_json::to_string(&saved).unwrap(),
            r#"{"kind":"saved","snapshot":"_notebook/.history/a/2026-09-21T10-15-00Z.md"}"#
        );
        let changed = SaveResult::from(SaveOutcome::Changed {
            current: Some("ab12".to_owned()),
        });
        assert_eq!(
            serde_json::to_string(&changed).unwrap(),
            r#"{"kind":"changed","current":"ab12"}"#
        );
        let gone = SaveResult::from(SaveOutcome::Changed { current: None });
        assert_eq!(
            serde_json::to_string(&gone).unwrap(),
            r#"{"kind":"changed","current":null}"#
        );
    }

    #[test]
    fn a_backup_reports_how_many_files_were_copied_and_skipped() {
        let made = BackupMade::from(Backup {
            folder: "_notebook/backups/x".to_owned(),
            copied: 7,
            skipped: 1,
        });
        assert_eq!(
            serde_json::to_string(&made).unwrap(),
            r#"{"folder":"_notebook/backups/x","copied":7,"skipped":1}"#
        );
    }
}
