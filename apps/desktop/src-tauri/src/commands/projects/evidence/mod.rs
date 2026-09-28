//! Adding files to an experiment (ADR-0044): choosing them, capturing a copy,
//! and observing one that is linked instead. Files are chosen in Rust and
//! handed to the webview only as locations (a root and a relative path), so
//! it never holds an absolute path (AGENTS.md rule 8). Every command that
//! takes a location resolves it again and checks it with [`locate::locate`],
//! so a location can only ever name a file the person could have chosen.

mod capture;
mod discovery;
mod dropped;
mod inbox;
mod locate;
mod relink;
mod types;

use std::path::PathBuf;

use nb_fs::settings::SettingsStore;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use super::folders::{FolderHandle, PickedFolders};
use super::ids::Ulid;
use super::open::{resolve_root, RootProblem, SourcePath, SourceRoot};
pub use discovery::DiscoveryScans;
use dropped::DropTarget;
pub use dropped::{on_drag, DropTargets, EvidenceDragged, EvidenceDropped};
pub use types::{
    CaptureNaming, CaptureOutcomeDto, ChosenFile, ChosenFolder, Destination, DiscoveryFolder,
    DiscoveryOptionsDto, DiscoveryProgressDto, DiscoveryResultDto, EvidenceFailure,
    ExperimentFolder, InboxName, KnownVersionInput, LinkObservationDto, RelinkCandidateDto,
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

/// Each of `paths` as the person's choice: where it is recorded from, or
/// why it cannot be (ADR-0044 point 1). Shared by the picker and by drops.
fn chosen_files(
    paths: &[PathBuf],
    project: &std::path::Path,
    externals: &[(String, PathBuf)],
) -> Vec<ChosenFile> {
    paths
        .iter()
        .map(|path| {
            let name = display_name(path);
            match locate::locate(path, project, externals) {
                Ok(located) => ChosenFile::Located {
                    name,
                    size: capture::bytes(located.size),
                    location: located.location,
                },
                Err(reason) => ChosenFile::Refused { name, reason },
            }
        })
        .collect()
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
        let paths: Vec<PathBuf> = picked
            .into_iter()
            .filter_map(|chosen| chosen.simplified().into_path().ok())
            .collect();
        Ok(chosen_files(&paths, &project, &externals))
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

/// Starts receiving files dropped on the window for the open project
/// (ADR-0044 point 2). Replaces any earlier target.
#[tauri::command]
#[specta::specta]
pub fn watch_drops(
    targets: State<'_, DropTargets>,
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    project_id: Ulid,
    external_roots: Vec<Ulid>,
) -> Result<(), EvidenceFailure> {
    project_root(&folders, folder)?;
    targets.set(Some(DropTarget {
        folder,
        project_id,
        external_roots,
    }));
    Ok(())
}

/// Stops receiving drops, so a file dropped on the window does nothing.
#[tauri::command]
#[specta::specta]
pub fn unwatch_drops(targets: State<'_, DropTargets>) {
    targets.set(None);
}

/// The requests waiting in the project's inbox (spec 5.10), by folder name.
#[tauri::command]
#[specta::specta]
pub async fn list_inbox_requests(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
) -> Result<Vec<String>, EvidenceFailure> {
    let project = project_root(&folders, folder)?;
    blocking(move || inbox::list(&project)).await
}

/// The text of one waiting request's `request.json`, for the format package
/// to parse (AGENTS.md rule 2).
#[tauri::command]
#[specta::specta]
pub async fn read_inbox_request(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    request: InboxName,
) -> Result<String, EvidenceFailure> {
    let project = project_root(&folders, folder)?;
    blocking(move || inbox::read(&project, &request)).await
}

/// Places a request's copy-mode payload in the experiment as a new version
/// (FR-EVD-01), after checking it against the `sha256` and `size` the
/// request declared. The request stays until `remove_inbox_request`.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
#[specta::specta]
pub async fn import_inbox_payload(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    request: InboxName,
    payload: InboxName,
    sha256: String,
    size: f64,
    experiment: ExperimentFolder,
    destination: Destination,
    naming: CaptureNaming,
    known: Vec<KnownVersionInput>,
) -> Result<CaptureOutcomeDto, EvidenceFailure> {
    let project = project_root(&folders, folder)?;
    blocking(move || {
        inbox::import_payload(
            &project,
            &request,
            &payload,
            &sha256,
            size,
            &experiment,
            destination,
            &naming,
            &known,
        )
    })
    .await
}

/// Deletes a request's folder once what it asked for is recorded
/// (spec 5.10). A request that could not be imported is never removed.
#[tauri::command]
#[specta::specta]
pub async fn remove_inbox_request(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    request: InboxName,
) -> Result<(), EvidenceFailure> {
    let project = project_root(&folders, folder)?;
    blocking(move || inbox::remove(&project, &request)).await
}

/// The clutter a scan excludes unless told otherwise (ADR-0035 point 4), for
/// the discovery dialog to show and let the person edit.
#[tauri::command]
#[specta::specta]
pub fn default_discovery_excludes() -> Vec<String> {
    discovery::default_excludes()
}

/// Asks the person for a folder to scan (FR-EVD-09), starting in the project
/// folder. Resolved as a location under the project or one of
/// `external_roots`, or refused with the reason (ADR-0044 point 1). `None`
/// when the person cancels.
#[tauri::command]
#[specta::specta]
pub async fn pick_discovery_folder(
    app: AppHandle,
    folders: State<'_, PickedFolders>,
    settings: State<'_, SettingsStore>,
    folder: FolderHandle,
    project_id: Ulid,
    external_roots: Vec<Ulid>,
) -> Result<Option<ChosenFolder>, EvidenceFailure> {
    let project = project_root(&folders, folder)?;
    let settings = settings.inner().clone();
    blocking(move || {
        let picked = app
            .dialog()
            .file()
            .set_title("Choose a folder to scan")
            .set_directory(&project)
            .blocking_pick_folder();
        let Some(picked) = picked else {
            return Ok(None);
        };
        let Ok(path) = picked.simplified().into_path() else {
            return Ok(None);
        };
        let name = display_name(&path);
        let externals = external_folders(&settings, &project_id, &external_roots)?;
        Ok(Some(
            match locate::locate_folder(&path, &project, &externals) {
                Ok(folder) => ChosenFolder::Located { name, folder },
                Err(reason) => ChosenFolder::Refused { name, reason },
            },
        ))
    })
    .await
}

/// Scans `chosen` for files to capture (FR-EVD-09), reporting progress over
/// `progress` and stopping early if `cancel_discovery` is called before it
/// finishes. `captured` are the source paths already recorded, relative to
/// `chosen`, usually from `capturedSourcePaths`.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
#[specta::specta]
pub async fn start_discovery(
    folders: State<'_, PickedFolders>,
    settings: State<'_, SettingsStore>,
    scans: State<'_, DiscoveryScans>,
    folder: FolderHandle,
    project_id: Ulid,
    chosen: DiscoveryFolder,
    options: DiscoveryOptionsDto,
    captured: Vec<String>,
    progress: Channel<DiscoveryProgressDto>,
) -> Result<DiscoveryResultDto, EvidenceFailure> {
    let project = project_root(&folders, folder)?;
    let settings_store = settings.inner().clone();
    let absolute = discovery::checked_folder(&settings_store, &project, &project_id, &chosen)?;
    let cancel = scans.start();
    let result = blocking(move || {
        discovery::run_scan(&absolute, &chosen, options, &captured, &cancel, &mut |p| {
            let _ = progress.send(p);
        })
    })
    .await;
    scans.finish();
    result
}

/// Sets the running scan's cancel flag, if one is running. It returns what
/// it had found so far, with `cancelled` set (ADR-0035 point 8).
#[tauri::command]
#[specta::specta]
pub fn cancel_discovery(scans: State<'_, DiscoveryScans>) {
    scans.cancel();
}

/// Ranked candidates for a missing linked artefact's new location (FR-EVD-08,
/// ADR-0031 §3), among `chosen`'s direct entries. `chosen` is picked the same
/// way a discovery folder is, with `pick_discovery_folder`. Nothing is
/// applied; the caller confirms a candidate itself, through `editArtefacts`.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
#[specta::specta]
pub async fn list_relink_candidates(
    folders: State<'_, PickedFolders>,
    settings: State<'_, SettingsStore>,
    folder: FolderHandle,
    project_id: Ulid,
    chosen: DiscoveryFolder,
    file_name: String,
    size: f64,
    sha256: String,
) -> Result<Vec<RelinkCandidateDto>, EvidenceFailure> {
    let project = project_root(&folders, folder)?;
    let settings = settings.inner().clone();
    blocking(move || {
        relink::list_candidates(
            &settings,
            &project,
            &project_id,
            &chosen,
            &file_name,
            size,
            &sha256,
        )
    })
    .await
}
