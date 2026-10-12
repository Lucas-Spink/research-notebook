//! The pop-out canvas window (ADR-0066). The canvas can be opened in a second
//! window, on another screen, beside the table in the main window. Both
//! windows are one process: they share the picked folders and the project
//! lock, so nothing is acquired twice. This module only creates, focuses and
//! closes the window and tells the main window when it comes and goes. It
//! holds no project data and writes nothing (AGENTS.md section 4).
//!
//! On Windows, creating a window from a synchronous command or from an event
//! handler deadlocks the main thread (Tauri documents this on
//! `WebviewWindowBuilder`): the new window stays blank and nothing in either
//! window responds. So every command here that touches a window is `async`,
//! and the window event handler hands its work to the async runtime.

use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, State, Window, WindowEvent};
use tauri_specta::Event;

use super::projects::{FolderHandle, PickedFolders};

/// The label of the window the application opens with.
pub const MAIN_LABEL: &str = "main";
/// The label of the pop-out canvas window.
pub const CANVAS_LABEL: &str = "canvas";

/// What the canvas window needs to open the project the main window has open.
/// The webview asks for it once it starts, so the folder travels as a handle
/// and never as a path (AGENTS.md rule 8).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CanvasWindowContext {
    pub folder: FolderHandle,
    /// Whether the main window holds the project lock. The canvas window
    /// never takes it, so when this is false it only reads.
    pub writable: bool,
}

/// The context of the canvas window while it is open, and none otherwise.
#[derive(Debug, Default)]
pub struct CanvasWindowState {
    inner: Mutex<Option<CanvasWindowContext>>,
}

impl CanvasWindowState {
    fn set(&self, context: Option<CanvasWindowContext>) {
        // Replacing the whole value cannot leave it half-updated, so a
        // poisoned lock is still safe to use.
        *self.inner.lock().unwrap_or_else(PoisonError::into_inner) = context;
    }

    fn get(&self) -> Option<CanvasWindowContext> {
        *self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Why the canvas window could not be opened.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CanvasWindowError {
    /// The folder handle was not issued in this run.
    FolderUnavailable,
    /// The operating system would not create the window.
    WindowFailed,
}

/// The canvas window opened or closed. Sent to the main window, so its canvas
/// view can hand over to the pop-out and take back on closing, however the
/// window was closed.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct CanvasWindowChanged {
    pub open: bool,
}

/// Project files changed on disk. The main window is the only one that polls
/// the watcher, which hands each batch out once, so it passes what it found
/// on to the canvas window with this. Paths are project-relative.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFilesChanged {
    pub paths: Vec<String>,
    /// Events may have been lost, so everything should be read again.
    pub needs_rescan: bool,
}

/// The canvas window asks the main window to open one result's original,
/// since the canvas window never edits or previews the table.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct OpenResultRequested {
    pub experiment_folder: String,
    pub artefact_id: String,
    pub version: Option<u32>,
}

/// Opens the canvas window for the project open in the calling window, or
/// brings it to the front if it is already open.
#[tauri::command]
#[specta::specta]
pub async fn open_canvas_window(
    app: AppHandle,
    folders: State<'_, PickedFolders>,
    state: State<'_, CanvasWindowState>,
    folder: FolderHandle,
    writable: bool,
) -> Result<(), CanvasWindowError> {
    if folders.get(folder).is_none() {
        return Err(CanvasWindowError::FolderUnavailable);
    }
    if let Some(existing) = app.get_webview_window(CANVAS_LABEL) {
        return existing
            .set_focus()
            .map_err(|_| CanvasWindowError::WindowFailed);
    }
    state.set(Some(CanvasWindowContext { folder, writable }));
    let built = tauri::WebviewWindowBuilder::new(
        &app,
        CANVAS_LABEL,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Strata \u{2013} Canvas")
    .inner_size(1100.0, 800.0)
    .min_inner_size(600.0, 400.0)
    .build();
    if built.is_err() {
        state.set(None);
        return Err(CanvasWindowError::WindowFailed);
    }
    report(CanvasWindowChanged { open: true }.emit_to(&app, MAIN_LABEL));
    Ok(())
}

/// What the canvas window opens, or `None` when it was not opened by
/// [`open_canvas_window`].
#[tauri::command]
#[specta::specta]
pub fn canvas_window_context(state: State<'_, CanvasWindowState>) -> Option<CanvasWindowContext> {
    state.get()
}

/// Closes the canvas window if it is open. The main window does this when its
/// project closes, since the canvas window belongs to that project.
#[tauri::command]
#[specta::specta]
pub async fn close_canvas_window(app: AppHandle) {
    destroy_canvas_window(&app);
}

/// Destroys the canvas window if it is open.
fn destroy_canvas_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(CANVAS_LABEL) {
        report(window.destroy());
    }
}

/// Brings the main window to the front, for a request made in the canvas
/// window to open a result.
#[tauri::command]
#[specta::specta]
pub async fn focus_main_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        report(window.unminimize());
        report(window.set_focus());
    }
}

/// Keeps the two windows consistent however a window ends: closing the main
/// window takes the canvas window with it, and the canvas window going away,
/// for any reason, tells the main window.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if !matches!(event, WindowEvent::Destroyed) {
        return;
    }
    let app = window.app_handle();
    match window.label() {
        MAIN_LABEL => {
            // Not from here: this runs inside the window event handler.
            let app = app.clone();
            tauri::async_runtime::spawn(async move { destroy_canvas_window(&app) });
        }
        CANVAS_LABEL => {
            app.state::<CanvasWindowState>().set(None);
            report(CanvasWindowChanged { open: false }.emit_to(app, MAIN_LABEL));
        }
        _ => {}
    }
}

/// A failed call means the window is already gone, so there is no one to tell.
fn report<T>(result: tauri::Result<T>) {
    result.ok();
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests.
#[allow(clippy::unwrap_used)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn context(folders: &PickedFolders, path: &str, writable: bool) -> CanvasWindowContext {
        CanvasWindowContext {
            folder: folders.insert(PathBuf::from(path)),
            writable,
        }
    }

    #[test]
    fn there_is_no_context_until_the_window_is_opened_and_none_after_it_closes() {
        let folders = PickedFolders::default();
        let state = CanvasWindowState::default();
        assert_eq!(state.get(), None);

        let opened = context(&folders, "/p", true);
        state.set(Some(opened));
        assert_eq!(state.get(), Some(opened));

        state.set(None);
        assert_eq!(state.get(), None);
    }

    #[test]
    fn the_context_keeps_whether_the_project_is_writable() {
        let folders = PickedFolders::default();
        let state = CanvasWindowState::default();
        state.set(Some(context(&folders, "/p", false)));
        assert_eq!(state.get().map(|c| c.writable), Some(false));
    }

    #[test]
    fn the_two_windows_have_different_labels() {
        // The capability file names both, and the drop targets are keyed by
        // them, so they must never be the same.
        assert_ne!(MAIN_LABEL, CANVAS_LABEL);
    }
}
