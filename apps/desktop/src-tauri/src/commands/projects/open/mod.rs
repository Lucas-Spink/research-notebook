//! Open file, Reveal in Finder or Explorer, Open in VS Code, Copy path, and
//! Open project folder (FR-PRV-02), plus a linked artefact's live
//! availability (FR-EVD-07, FR-EVD-08). Each command resolves a path
//! through `nb-fs` or the settings file and hands it to `nb-opener`, which
//! contains the only process launching in this crate.

mod resolve;
mod types;

use std::path::{Path, PathBuf};

use nb_fs::settings::SettingsStore;
use nb_fs::ProjectRoot;
use nb_opener::RealLauncher;
use tauri::State;

use super::folders::{FolderHandle, PickedFolders};
use super::ids::Ulid;
use super::preview::VersionPath;
pub use types::{Availability, FileActionKind, OpenFailure, SourcePath, SourceRoot};

/// Runs blocking work off the async runtime's threads, as previews and
/// project commands already do; this module's own error type, since it is
/// neither `ProjectError` nor `PreviewFailure`.
async fn blocking<T, F>(work: F) -> Result<T, OpenFailure>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, OpenFailure> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| OpenFailure::ActionFailed)?
}

fn project_root(folders: &PickedFolders, folder: FolderHandle) -> Result<PathBuf, OpenFailure> {
    folders.get(folder).ok_or(OpenFailure::ProjectUnavailable)
}

/// Carries out `action` on the resolved `path` through `nb_opener`.
fn dispatch(path: &Path, action: FileActionKind) -> Result<(), OpenFailure> {
    let mut launcher = RealLauncher;
    let outcome = match action {
        FileActionKind::OpenFile => {
            nb_opener::perform(&mut launcher, path, nb_opener::FileAction::OpenFile)
        }
        FileActionKind::Reveal => {
            nb_opener::perform(&mut launcher, path, nb_opener::FileAction::Reveal)
        }
        FileActionKind::OpenInVsCode => {
            nb_opener::perform(&mut launcher, path, nb_opener::FileAction::OpenInVsCode)
        }
        FileActionKind::CopyPath => {
            nb_opener::copy_to_clipboard(&mut launcher, &path.to_string_lossy())
        }
    };
    outcome.map_err(|_| OpenFailure::ActionFailed)
}

/// Acts on a captured version's file, resolved and confined to
/// `evidence/` or `methods/` the same way a preview would be (spec 6.5).
#[tauri::command]
#[specta::specta]
pub async fn open_captured_file_action(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    file: VersionPath,
    action: FileActionKind,
) -> Result<(), OpenFailure> {
    let root = project_root(&folders, folder)?;
    blocking(move || {
        let project = ProjectRoot::open(&root).map_err(|_| OpenFailure::ProjectUnavailable)?;
        let rel = file.to_rel().map_err(|_| OpenFailure::FileUnavailable)?;
        let opened = project.open_version_file(&rel)?;
        dispatch(&opened.path, action)
    })
    .await
}

/// Acts on a linked artefact's source file, resolved from the project root
/// or a configured external root (FR-PRJ-07). Never confined the way a
/// version file is: a source may legitimately be anywhere under either.
#[tauri::command]
#[specta::specta]
pub async fn open_linked_file_action(
    folders: State<'_, PickedFolders>,
    settings: State<'_, SettingsStore>,
    folder: FolderHandle,
    project_id: Ulid,
    root: SourceRoot,
    path: SourcePath,
    action: FileActionKind,
) -> Result<(), OpenFailure> {
    let project_root_path = project_root(&folders, folder)?;
    let settings = settings.inner().clone();
    blocking(move || {
        let resolved = resolve::resolve_source(
            &settings,
            &project_root_path,
            project_id.as_str(),
            &root,
            &path,
        )
        .map_err(OpenFailure::from)?;
        dispatch(&resolved, action)
    })
    .await
}

/// Opens the project's own root folder in the file manager.
#[tauri::command]
#[specta::specta]
pub async fn open_project_folder(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
) -> Result<(), OpenFailure> {
    let root = project_root(&folders, folder)?;
    blocking(move || {
        let mut launcher = RealLauncher;
        nb_opener::open_folder(&mut launcher, &root).map_err(|_| OpenFailure::ActionFailed)
    })
    .await
}

/// A linked artefact's current availability (FR-EVD-07, FR-EVD-08): checked
/// now, never read from a stored flag (ADR-0031 §1), and nothing is
/// written by checking it.
#[tauri::command]
#[specta::specta]
pub async fn linked_artefact_availability(
    folders: State<'_, PickedFolders>,
    settings: State<'_, SettingsStore>,
    folder: FolderHandle,
    project_id: Ulid,
    root: SourceRoot,
    path: SourcePath,
) -> Result<Availability, OpenFailure> {
    let project_root_path = project_root(&folders, folder)?;
    let settings = settings.inner().clone();
    blocking(move || {
        resolve::linked_availability(
            &settings,
            &project_root_path,
            project_id.as_str(),
            &root,
            &path,
        )
    })
    .await
}
