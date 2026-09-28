//! Files dropped on the window (ADR-0044 point 2). The window's drag and
//! drop event carries absolute paths, so it is handled here, in Rust: each
//! dropped path becomes a location or a refusal, exactly as a picked file
//! does, and only that is sent on to the webview, with where the pointer
//! was. The webview never holds a path (AGENTS.md rule 8).

use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};

use nb_fs::settings::SettingsStore;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{DragDropEvent, Manager, Window};
use tauri_specta::Event;

use super::super::folders::{FolderHandle, PickedFolders};
use super::super::ids::Ulid;
use super::types::ChosenFile;
use super::{chosen_files, external_folders, project_root};

/// The project a drop is for: what the webview said was open when it began
/// to accept drops.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct DropTarget {
    pub(super) folder: FolderHandle,
    pub(super) project_id: Ulid,
    pub(super) external_roots: Vec<Ulid>,
}

/// Where drops go, if anywhere. Empty until the webview asks to receive them
/// and again when it stops, so a drop with nothing open is ignored.
#[derive(Debug, Default)]
pub struct DropTargets {
    inner: Mutex<Option<DropTarget>>,
}

impl DropTargets {
    pub(super) fn set(&self, target: Option<DropTarget>) {
        // Replacing the whole value cannot leave it half-updated, so a
        // poisoned lock is still safe to use.
        *self.inner.lock().unwrap_or_else(PoisonError::into_inner) = target;
    }

    fn get(&self) -> Option<DropTarget> {
        self.inner
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

/// The pointer is over the window with files (or has left it). Positions are
/// in physical pixels, as the window reports them.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceDragged {
    pub over: bool,
    pub x: f64,
    pub y: f64,
}

/// Files were dropped, resolved as a picked file is, and where the pointer
/// was in physical pixels.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceDropped {
    pub x: f64,
    pub y: f64,
    pub files: Vec<ChosenFile>,
}

/// Handles the window's drag and drop event: tells the webview where the
/// pointer is, and, for a drop, what was dropped. Called from the window
/// event handler, which runs on the main thread, so the file system work
/// is moved off it.
pub fn on_drag(window: &Window, event: &DragDropEvent) {
    let app = window.app_handle().clone();
    match event {
        DragDropEvent::Enter { position, .. } | DragDropEvent::Over { position } => {
            report(
                EvidenceDragged {
                    over: true,
                    x: position.x,
                    y: position.y,
                }
                .emit(&app),
            );
        }
        DragDropEvent::Drop { paths, position } => {
            let (x, y) = (position.x, position.y);
            report(EvidenceDragged { over: false, x, y }.emit(&app));
            let paths = paths.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let Some(target) = app.state::<DropTargets>().get() else {
                    return;
                };
                let Some(files) = resolve(&app, &target, &paths) else {
                    return;
                };
                report(EvidenceDropped { x, y, files }.emit(&app));
            });
        }
        DragDropEvent::Leave => {
            report(
                EvidenceDragged {
                    over: false,
                    x: 0.0,
                    y: 0.0,
                }
                .emit(&app),
            );
        }
        _ => {}
    }
}

/// `paths` as the open project's choices, or `None` when the project or the
/// settings cannot be reached.
fn resolve(
    app: &tauri::AppHandle,
    target: &DropTarget,
    paths: &[PathBuf],
) -> Option<Vec<ChosenFile>> {
    let project = project_root(&app.state::<PickedFolders>(), target.folder).ok()?;
    let settings = app.state::<SettingsStore>();
    let externals = external_folders(&settings, &target.project_id, &target.external_roots).ok()?;
    Some(chosen_files(paths, &project, &externals))
}

/// A failed emit means the webview is gone, so there is no one to tell.
fn report(result: tauri::Result<()>) {
    result.ok();
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests.
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    const PROJECT_ID: &str = "01JA0000000000000000000000";

    fn target(folder: FolderHandle) -> DropTarget {
        DropTarget {
            folder,
            project_id: Ulid::try_from(PROJECT_ID.to_owned()).unwrap(),
            external_roots: Vec::new(),
        }
    }

    #[test]
    fn nothing_receives_drops_until_asked_to_and_not_after_stopping() {
        let folders = PickedFolders::default();
        let handle = folders.insert(PathBuf::from("/p"));
        let targets = DropTargets::default();
        assert_eq!(targets.get(), None);

        targets.set(Some(target(handle)));
        assert_eq!(targets.get(), Some(target(handle)));

        targets.set(None);
        assert_eq!(targets.get(), None);
    }

    #[test]
    fn a_later_target_replaces_the_earlier_one() {
        let folders = PickedFolders::default();
        let first = folders.insert(PathBuf::from("/a"));
        let second = folders.insert(PathBuf::from("/b"));
        let targets = DropTargets::default();
        targets.set(Some(target(first)));
        targets.set(Some(target(second)));
        assert_eq!(targets.get(), Some(target(second)));
    }
}
