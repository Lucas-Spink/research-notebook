//! Zotero connectivity status, for the onboarding indicator (FR-CIT-01).
//! Every Zotero call goes through `nb-zotero`; this command only translates
//! its result into a webview-safe shape and keeps the blocking HTTP request
//! off the async runtime thread.

use nb_zotero::{ZoteroClient, ZoteroStatus};
use serde::Serialize;
use specta::Type;

/// Zotero's local API connectivity, as reported to the webview (FR-CIT-01).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ZoteroConnection {
    Connected {
        /// Present when Zotero's response carried a `Zotero-Server-ID`
        /// header (FR-CIT-02); used to detect a different library later.
        server_id: Option<String>,
    },
    /// Zotero is running but its local API is off in preferences.
    Disabled,
    NotRunning,
}

impl From<ZoteroStatus> for ZoteroConnection {
    fn from(status: ZoteroStatus) -> Self {
        match status {
            ZoteroStatus::Connected { server_id } => Self::Connected { server_id },
            ZoteroStatus::Disabled => Self::Disabled,
            ZoteroStatus::NotRunning => Self::NotRunning,
        }
    }
}

/// Why a status check failed. Not-running and disabled are ordinary
/// statuses, not errors; this covers only a request that could not be
/// completed at all.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ZoteroStatusError {
    RequestFailed,
}

/// Reports whether Zotero's local API is connected, disabled or not running
/// (FR-CIT-01). The request runs in `spawn_blocking`, because it is a
/// blocking HTTP call to 127.0.0.1:23119 (FR-CIT-02).
#[tauri::command]
#[specta::specta]
pub async fn zotero_status() -> Result<ZoteroConnection, ZoteroStatusError> {
    tauri::async_runtime::spawn_blocking(|| {
        ZoteroClient::default()
            .check_status()
            .map(ZoteroConnection::from)
            .map_err(|_| ZoteroStatusError::RequestFailed)
    })
    .await
    .map_err(|_| ZoteroStatusError::RequestFailed)?
}
