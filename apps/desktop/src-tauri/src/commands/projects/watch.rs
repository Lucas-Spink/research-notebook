//! Watching a project for changes made outside the application (spec 6.4
//! step 5, FR-HIS-05, ADR-0024). The watcher and its debounce are in
//! `nb-fs`; these commands start and stop it and hand the webview what it
//! found. The webview asks now and then, as it does for the lock, so no
//! event channel and no change to `capabilities/` is needed.

use nb_fs::watch::{Change, ChangeBatch, FileState, WatchRegistry};
use serde::Serialize;
use specta::Type;
use tauri::State;

use super::folders::{FolderHandle, PickedFolders};
use super::lock::with_root;
use super::types::ProjectError;

/// What is on disk for a changed file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ChangedState {
    /// The file is there. `sha256` is of its content now, so the webview can
    /// tell its own save from someone else's edit.
    Present { sha256: String },
    /// The file is gone, or is a folder or link where a file should be.
    Missing,
    /// The file exists but could not be read for a while.
    Unreadable,
}

/// One notebook data file that changed. The path is project-relative.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub state: ChangedState,
}

/// The changes found since the last poll.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ChangeReport {
    /// False when the project is not being watched; there is then nothing to
    /// report.
    pub watching: bool,
    pub changes: Vec<ChangedFile>,
    /// Events may have been lost, or a folder was moved, so every file the
    /// webview holds should be checked again.
    pub needs_rescan: bool,
}

impl From<Change> for ChangedFile {
    fn from(change: Change) -> Self {
        Self {
            path: change.path.to_string(),
            state: match change.state {
                FileState::Present { sha256 } => ChangedState::Present { sha256 },
                FileState::Missing => ChangedState::Missing,
                FileState::Unreadable => ChangedState::Unreadable,
            },
        }
    }
}

impl ChangeReport {
    fn not_watching() -> Self {
        Self {
            watching: false,
            changes: Vec::new(),
            needs_rescan: false,
        }
    }
}

impl From<ChangeBatch> for ChangeReport {
    fn from(batch: ChangeBatch) -> Self {
        Self {
            watching: true,
            changes: batch.changes.into_iter().map(ChangedFile::from).collect(),
            needs_rescan: batch.needs_rescan,
        }
    }
}

/// Starts watching the project's notebook files. Safe to call again for a
/// project already watched. Read-only projects are watched too: they still
/// show what changed on disk. Nothing is written.
#[tauri::command]
#[specta::specta]
pub async fn start_project_watch(
    folders: State<'_, PickedFolders>,
    watchers: State<'_, WatchRegistry>,
    folder: FolderHandle,
) -> Result<(), ProjectError> {
    let watchers = watchers.inner().clone();
    with_root(&folders, folder, move |root| {
        watchers.start(&root).map_err(|_| ProjectError::WatchFailed)
    })
    .await
}

/// Takes the changes found since the last call.
#[tauri::command]
#[specta::specta]
pub async fn poll_project_changes(
    folders: State<'_, PickedFolders>,
    watchers: State<'_, WatchRegistry>,
    folder: FolderHandle,
) -> Result<ChangeReport, ProjectError> {
    let watchers = watchers.inner().clone();
    with_root(&folders, folder, move |root| {
        Ok(watchers
            .poll(&root)
            .map_or_else(ChangeReport::not_watching, ChangeReport::from))
    })
    .await
}

/// Stops watching the project.
#[tauri::command]
#[specta::specta]
pub async fn stop_project_watch(
    folders: State<'_, PickedFolders>,
    watchers: State<'_, WatchRegistry>,
    folder: FolderHandle,
) -> Result<(), ProjectError> {
    let watchers = watchers.inner().clone();
    with_root(&folders, folder, move |root| {
        watchers.stop(&root);
        Ok(())
    })
    .await
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use nb_fs::ProjectRelPath;

    use super::*;

    fn change(path: &str, state: FileState) -> Change {
        Change {
            path: ProjectRelPath::parse(path).unwrap(),
            state,
        }
    }

    #[test]
    fn a_batch_becomes_a_report_of_project_relative_paths() {
        let report = ChangeReport::from(ChangeBatch {
            changes: vec![
                change(
                    "_notebook/questions/Q-01.md",
                    FileState::Present {
                        sha256: "ab".repeat(32),
                    },
                ),
                change("_notebook/project.yaml", FileState::Missing),
                change("_notebook/bibliography.json", FileState::Unreadable),
            ],
            needs_rescan: true,
        });
        assert!(report.watching && report.needs_rescan);
        assert_eq!(
            report.changes,
            [
                ChangedFile {
                    path: "_notebook/questions/Q-01.md".to_owned(),
                    state: ChangedState::Present {
                        sha256: "ab".repeat(32)
                    },
                },
                ChangedFile {
                    path: "_notebook/project.yaml".to_owned(),
                    state: ChangedState::Missing,
                },
                ChangedFile {
                    path: "_notebook/bibliography.json".to_owned(),
                    state: ChangedState::Unreadable,
                },
            ]
        );
    }

    #[test]
    fn an_unwatched_project_reports_nothing_and_says_so() {
        let report = ChangeReport::not_watching();
        assert!(!report.watching && !report.needs_rescan);
        assert!(report.changes.is_empty());
    }
}
