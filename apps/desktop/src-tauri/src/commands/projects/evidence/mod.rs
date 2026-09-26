//! Adding files to an experiment (ADR-0044): choosing them, capturing a copy,
//! and observing one that is linked instead. Files are chosen in Rust and
//! handed to the webview only as locations (a root and a relative path), so
//! it never holds an absolute path (AGENTS.md rule 8). Every command that
//! takes a location resolves it again and checks it with [`locate::locate`],
//! so a location can only ever name a file the person could have chosen.

mod capture;
mod locate;
mod types;

use std::path::PathBuf;

use nb_fs::settings::SettingsStore;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use super::folders::{FolderHandle, PickedFolders};
use super::ids::Ulid;
use super::open::{resolve_root, RootProblem, SourcePath, SourceRoot};
pub use types::{
    CaptureNaming, CaptureOutcomeDto, ChosenFile, Destination, EvidenceFailure, ExperimentFolder,
    KnownVersionInput, LinkObservationDto,
};

/// Runs blocking work off the async runtime's threads, as the other
/// project commands do, with this module's own error type.
async fn blocking<T, F>(work: F) -> Result<T, EvidenceFailure>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, EvidenceFailure> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| EvidenceFailure::Internal)?
}

fn project_root(folders: &PickedFolders, folder: FolderHandle) -> Result<PathBuf, EvidenceFailure> {
    folders
        .get(folder)
        .ok_or(EvidenceFailure::ProjectUnavailable)
}

/// The folders `roots` name on this machine, for the project `project_id`.
/// A root with no folder set here is left out: nothing can be under it.
fn external_folders(
    settings: &SettingsStore,
    project_id: &Ulid,
    roots: &[Ulid],
) -> Result<Vec<(String, PathBuf)>, EvidenceFailure> {
    let loaded = settings
        .load()
        .map_err(|_| EvidenceFailure::SettingsUnavailable)?;
    Ok(roots
        .iter()
        .filter_map(|root| {
            let folder = loaded.external_root(project_id.as_str(), root.as_str())?;
            Some((root.as_str().to_owned(), PathBuf::from(folder)))
        })
        .collect())
}

/// What `path` is to the person: the chosen file's own name.
fn display_name(path: &std::path::Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Resolves `root`/`path` and checks it the way a chosen file is checked:
/// a regular file under that root, outside `_notebook/`, even through links.
fn checked_source(
    settings: &SettingsStore,
    project: &std::path::Path,
    project_id: &Ulid,
    root: &SourceRoot,
    path: &SourcePath,
) -> Result<PathBuf, EvidenceFailure> {
    let folder =
        resolve_root(settings, project, project_id.as_str(), root).map_err(
            |problem| match problem {
                RootProblem::SettingsUnavailable => EvidenceFailure::SettingsUnavailable,
                RootProblem::Unresolved | RootProblem::FolderMissing => {
                    EvidenceFailure::RootUnavailable
                }
            },
        )?;
    let resolved = folder.join(path.as_str());
    let externals = match root.external_id() {
        None => Vec::new(),
        Some(id) => vec![(id.to_owned(), folder)],
    };
    locate::locate(&resolved, project, &externals)
        .map_err(|_| EvidenceFailure::SourceUnavailable)?;
    Ok(resolved)
}

/// Asks the person for files to add (FR-EVD-01), starting in the project
/// folder. Each is returned as a location under the project or one of
/// `external_roots`, or refused with the reason (ADR-0044 point 1). Empty
/// when the person cancels.
#[tauri::command]
#[specta::specta]
pub async fn pick_evidence_files(
    app: AppHandle,
    folders: State<'_, PickedFolders>,
    settings: State<'_, SettingsStore>,
    folder: FolderHandle,
    project_id: Ulid,
    external_roots: Vec<Ulid>,
) -> Result<Vec<ChosenFile>, EvidenceFailure> {
    let project = project_root(&folders, folder)?;
    let settings = settings.inner().clone();
    blocking(move || {
        let picked = app
            .dialog()
            .file()
            .set_title("Add files to this experiment")
            .set_directory(&project)
            .blocking_pick_files();
        let Some(picked) = picked else {
            return Ok(Vec::new());
        };
        let externals = external_folders(&settings, &project_id, &external_roots)?;
        Ok(picked
            .into_iter()
            .filter_map(|chosen| chosen.simplified().into_path().ok())
            .map(|path| {
                let name = display_name(&path);
                match locate::locate(&path, &project, &externals) {
                    Ok(located) => ChosenFile::Located {
                        name,
                        size: capture::bytes(located.size),
                        location: located.location,
                    },
                    Err(reason) => ChosenFile::Refused { name, reason },
                }
            })
            .collect())
    })
    .await
}

/// Copies the file at `root`/`path` into the experiment as a new version
/// (FR-EVD-03 to FR-EVD-05, FR-EVD-12). The source is only read.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
#[specta::specta]
pub async fn capture_evidence(
    folders: State<'_, PickedFolders>,
    settings: State<'_, SettingsStore>,
    folder: FolderHandle,
    project_id: Ulid,
    root: SourceRoot,
    path: SourcePath,
    experiment: ExperimentFolder,
    destination: Destination,
    naming: CaptureNaming,
    known: Vec<KnownVersionInput>,
) -> Result<CaptureOutcomeDto, EvidenceFailure> {
    let project = project_root(&folders, folder)?;
    let settings = settings.inner().clone();
    blocking(move || {
        let source = checked_source(&settings, &project, &project_id, &root, &path)?;
        capture::capture(&project, &source, &experiment, destination, &naming, &known)
    })
    .await
}

/// The hash, size and modification time of the file at `root`/`path`, to
/// record it as linked rather than copied (FR-EVD-02, FR-EVD-07).
#[tauri::command]
#[specta::specta]
pub async fn observe_evidence(
    folders: State<'_, PickedFolders>,
    settings: State<'_, SettingsStore>,
    folder: FolderHandle,
    project_id: Ulid,
    root: SourceRoot,
    path: SourcePath,
) -> Result<LinkObservationDto, EvidenceFailure> {
    let project = project_root(&folders, folder)?;
    let settings = settings.inner().clone();
    blocking(move || {
        let source = checked_source(&settings, &project, &project_id, &root, &path)?;
        capture::observe(&source)
    })
    .await
}
