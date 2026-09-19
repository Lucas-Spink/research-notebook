//! Locking a project for writing (FR-PRJ-05, ADR-0022). The lock, its
//! heartbeat and the decision about a stale one are in `nb-fs`; these
//! commands pass the person's choices in and the outcome back.

use nb_fs::lock::{LockAttempt, LockHealth, LockInfo, LockRegistry};
use nb_fs::ProjectRoot;
use serde::Serialize;
use specta::Type;
use tauri::State;

use super::folders::{FolderHandle, PickedFolders};
use super::types::ProjectError;

/// Who holds a lock and since when, for the banner. Times are RFC 3339 UTC.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LockHolder {
    pub host: String,
    pub pid: u32,
    pub app_version: String,
    pub opened: String,
    pub heartbeat: String,
}

impl From<LockInfo> for LockHolder {
    fn from(info: LockInfo) -> Self {
        Self {
            host: info.host,
            pid: info.pid,
            app_version: info.app_version,
            opened: info.opened.to_rfc3339(),
            heartbeat: info.heartbeat.to_rfc3339(),
        }
    }
}

/// The result of asking to lock a project. Only `acquired` allows writing;
/// each other kind is a read-only reason with its own banner.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LockOutcome {
    Acquired,
    /// Held by another instance whose heartbeat is recent.
    Live {
        holder: LockHolder,
    },
    /// The heartbeat is five minutes old or more; taking over needs the
    /// person's confirmation.
    Stale {
        holder: LockHolder,
    },
    /// `.lock` is not a valid lock. When `replaceable`, taking over needs
    /// confirmation; otherwise it is a folder, link or read-only file.
    Unreadable {
        replaceable: bool,
    },
    /// The project's medium or folder does not allow writing.
    ReadOnlyMedia,
}

impl From<LockAttempt> for LockOutcome {
    fn from(attempt: LockAttempt) -> Self {
        match attempt {
            LockAttempt::Held => Self::Acquired,
            LockAttempt::Live(info) => Self::Live {
                holder: info.into(),
            },
            LockAttempt::Stale(info) => Self::Stale {
                holder: info.into(),
            },
            LockAttempt::Unreadable { replaceable } => Self::Unreadable { replaceable },
            LockAttempt::ReadOnlyMedia => Self::ReadOnlyMedia,
        }
    }
}

/// Whether this application still holds a project's lock.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum LockState {
    Held,
    /// Taken over by another instance, or the heartbeat failed.
    Lost,
    NotHeld,
}

impl From<LockHealth> for LockState {
    fn from(health: LockHealth) -> Self {
        match health {
            LockHealth::Held => Self::Held,
            LockHealth::Lost => Self::Lost,
            LockHealth::NotHeld => Self::NotHeld,
        }
    }
}

/// Opens the folder `folder` stands for and runs `work` on it, off the async
/// runtime's threads, because opening and locking touch the disk.
pub(super) async fn with_root<T, F>(
    folders: &PickedFolders,
    folder: FolderHandle,
    work: F,
) -> Result<T, ProjectError>
where
    T: Send + 'static,
    F: FnOnce(ProjectRoot) -> Result<T, ProjectError> + Send + 'static,
{
    let path = folders.get(folder).ok_or(ProjectError::FolderUnavailable)?;
    tauri::async_runtime::spawn_blocking(move || work(ProjectRoot::open(&path)?))
        .await
        .map_err(|_| ProjectError::Internal)?
}

/// Locks the project for writing and starts its heartbeat. Call it only for a
/// project that would otherwise be writable: a project that is read-only for
/// another reason gets no lock and no write of any kind. `confirm_takeover` is
/// true only after the person has agreed to take over a stale or unreadable lock.
#[tauri::command]
#[specta::specta]
pub async fn acquire_project_lock(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
    confirm_takeover: bool,
) -> Result<LockOutcome, ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        locks
            .acquire(&root, confirm_takeover)
            .map(LockOutcome::from)
            .map_err(|_| ProjectError::LockFailed)
    })
    .await
}

/// Whether the lock is still held. The webview asks now and then, so a lock
/// taken over while the project is open turns it read-only.
#[tauri::command]
#[specta::specta]
pub async fn project_lock_state(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
) -> Result<LockState, ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        Ok(LockState::from(locks.health(&root)))
    })
    .await
}

/// Stops the heartbeat and removes the lock if it is still ours.
#[tauri::command]
#[specta::specta]
pub async fn release_project_lock(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
) -> Result<(), ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        locks
            .release(&root)
            .map(|_| ())
            .map_err(|_| ProjectError::LockFailed)
    })
    .await
}
