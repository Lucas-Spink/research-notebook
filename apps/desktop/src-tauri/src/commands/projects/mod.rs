//! Create, open and locate projects, recent projects and external roots
//! (FR-PRJ-01, 02, 03 and 07). Each command validates its input and delegates
//! to `nb-fs`; the logic lives there (AGENTS.md section 4).
//!
//! Folders are chosen in a native dialog opened from here, and the webview
//! gets an opaque [`FolderHandle`] for them, so it never supplies a path. The
//! text of `project.yaml` goes to the webview to be parsed by
//! `packages/format`; this crate never parses a notebook file.

pub mod files;
mod folders;
pub mod history;
mod ids;
pub mod lock;
pub mod preview;
mod types;
pub mod watch;

use std::path::PathBuf;

use nb_fs::settings::SettingsStore;
use nb_fs::{NewProject, ProjectRoot};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use folders::FolderHandle;
pub use folders::PickedFolders;
use ids::Ulid;
use types::{
    CreatedProject, ExternalRootStatus, HygieneReport, OpenedProject, ProjectError, RecentEntry,
};

/// Runs blocking filesystem work off the async runtime's threads.
async fn blocking<T, F>(work: F) -> Result<T, ProjectError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, ProjectError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| ProjectError::Internal)?
}

/// Asks the person for a folder. `None` when they cancel. It runs on a
/// blocking thread because the dialog must not be opened from the main one.
async fn pick_folder(
    app: &AppHandle,
    title: &'static str,
) -> Result<Option<PathBuf>, ProjectError> {
    let app = app.clone();
    let picked = blocking(move || {
        Ok(app
            .dialog()
            .file()
            .set_title(title)
            .set_can_create_directories(true)
            .blocking_pick_folder())
    })
    .await?;
    picked
        .map(|folder| {
            // Windows gives verbatim `\\?\` paths for some folders; the plain
            // form is what the person expects to see and later compare.
            folder
                .simplified()
                .into_path()
                .map_err(|_| ProjectError::FolderUnavailable)
        })
        .transpose()
}

/// Reads `project.yaml` from the project folder at `path`, and holds the
/// folder so later commands can refer to it.
async fn open_folder(
    folders: &PickedFolders,
    path: PathBuf,
) -> Result<OpenedProject, ProjectError> {
    let opened = path.clone();
    let project_yaml = blocking(move || {
        ProjectRoot::open(&opened)?
            .read_project_yaml()
            .map_err(ProjectError::from)
    })
    .await?;
    let display = path.to_string_lossy().into_owned();
    Ok(OpenedProject {
        folder: folders.insert(path),
        path: display,
        project_yaml,
    })
}

fn path_text(path: &std::path::Path) -> Result<&str, ProjectError> {
    path.to_str().ok_or(ProjectError::FolderUnavailable)
}

/// Asks for a folder and creates a project in it (FR-PRJ-01). The texts are
/// built by `packages/format`. `None` when the person cancels.
#[tauri::command]
#[specta::specta]
pub async fn create_project(
    app: AppHandle,
    folders: State<'_, PickedFolders>,
    project_yaml: String,
    bibliography_json: String,
    evidence_in_git: bool,
) -> Result<Option<CreatedProject>, ProjectError> {
    let Some(path) = pick_folder(&app, "Choose the folder for the new project").await? else {
        return Ok(None);
    };
    let target = path.clone();
    let hygiene = blocking(move || {
        let created = ProjectRoot::create(
            &target,
            &NewProject {
                project_yaml: &project_yaml,
                bibliography_json: &bibliography_json,
                evidence_in_git,
            },
        )?;
        Ok(created
            .hygiene
            .iter()
            .map(|(file, outcome)| HygieneReport::new(file.file_name(), outcome))
            .collect::<Vec<_>>())
    })
    .await?;
    let display = path.to_string_lossy().into_owned();
    Ok(Some(CreatedProject {
        folder: folders.insert(path),
        path: display,
        hygiene,
    }))
}

/// Asks for a project folder and reads its `project.yaml` (FR-PRJ-02).
/// `None` when the person cancels.
#[tauri::command]
#[specta::specta]
pub async fn open_project(
    app: AppHandle,
    folders: State<'_, PickedFolders>,
) -> Result<Option<OpenedProject>, ProjectError> {
    match pick_folder(&app, "Open a project folder").await? {
        Some(path) => open_folder(&folders, path).await.map(Some),
        None => Ok(None),
    }
}

/// Opens a project from the recent list without asking for its folder. A
/// folder that is gone, or no longer holds a project, is reported as
/// `folderUnavailable` or `notAProject`, and the person can then Locate it
/// (FR-PRJ-03).
#[tauri::command]
#[specta::specta]
pub async fn open_recent_project(
    folders: State<'_, PickedFolders>,
    settings: State<'_, SettingsStore>,
    project_id: Ulid,
) -> Result<OpenedProject, ProjectError> {
    let store = settings.inner().clone();
    let path = blocking(move || {
        let settings = store.load()?;
        settings
            .recent(project_id.as_str())
            .map(|entry| PathBuf::from(&entry.path))
            .ok_or(ProjectError::NotRemembered)
    })
    .await?;
    open_folder(&folders, path).await
}

/// Asks for the folder a moved project is now in and reads its
/// `project.yaml`. The frontend checks the `id` matches the project being
/// located before it calls `remember_project`. `None` when cancelled.
#[tauri::command]
#[specta::specta]
pub async fn locate_project(
    app: AppHandle,
    folders: State<'_, PickedFolders>,
) -> Result<Option<OpenedProject>, ProjectError> {
    match pick_folder(&app, "Locate the project folder").await? {
        Some(path) => open_folder(&folders, path).await.map(Some),
        None => Ok(None),
    }
}

/// Puts a project first in the recent list, or updates its path after it was
/// located. The identifier and name come from the parsed `project.yaml`.
#[tauri::command]
#[specta::specta]
pub async fn remember_project(
    folders: State<'_, PickedFolders>,
    settings: State<'_, SettingsStore>,
    folder: FolderHandle,
    project_id: Ulid,
    name: String,
) -> Result<(), ProjectError> {
    let path = folders.get(folder).ok_or(ProjectError::FolderUnavailable)?;
    let store = settings.inner().clone();
    blocking(move || {
        let path = path_text(&path)?;
        store.update(|s| s.remember(project_id.as_str(), &name, path))?;
        Ok(())
    })
    .await
}

/// The recent projects, most recent first, each marked available or not.
#[tauri::command]
#[specta::specta]
pub async fn list_recent_projects(
    settings: State<'_, SettingsStore>,
) -> Result<Vec<RecentEntry>, ProjectError> {
    let store = settings.inner().clone();
    blocking(move || {
        Ok(store
            .load()?
            .recent_projects
            .into_iter()
            .map(|entry| RecentEntry {
                available: ProjectRoot::is_project_folder(std::path::Path::new(&entry.path)),
                id: entry.id,
                name: entry.name,
                path: entry.path,
            })
            .collect())
    })
    .await
}

/// Asks for the folder an external root of a project has on this machine and
/// remembers it (FR-PRJ-07). Returns the folder, or `None` when cancelled.
#[tauri::command]
#[specta::specta]
pub async fn set_external_root(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
    project_id: Ulid,
    root_id: Ulid,
) -> Result<Option<String>, ProjectError> {
    let Some(path) = pick_folder(&app, "Choose the folder for this external root").await? else {
        return Ok(None);
    };
    let store = settings.inner().clone();
    blocking(move || {
        let text = path_text(&path)?.to_owned();
        store.update(|s| s.set_external_root(project_id.as_str(), root_id.as_str(), &text))?;
        Ok(Some(text))
    })
    .await
}

/// Where each of a project's external roots is on this machine. The roots
/// come from the parsed `project.yaml`; an unresolved one marks the artefacts
/// linked through it unavailable.
#[tauri::command]
#[specta::specta]
pub async fn external_root_status(
    settings: State<'_, SettingsStore>,
    project_id: Ulid,
    root_ids: Vec<Ulid>,
) -> Result<Vec<ExternalRootStatus>, ProjectError> {
    let store = settings.inner().clone();
    blocking(move || {
        let settings = store.load()?;
        Ok(root_ids
            .iter()
            .map(|root_id| {
                let path = settings
                    .external_root(project_id.as_str(), root_id.as_str())
                    .map(str::to_owned);
                ExternalRootStatus {
                    root_id: root_id.as_str().to_owned(),
                    available: path
                        .as_deref()
                        .is_some_and(|p| std::path::Path::new(p).is_dir()),
                    path,
                }
            })
            .collect())
    })
    .await
}
