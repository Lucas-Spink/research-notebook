//! Zotero connectivity status, for the onboarding indicator (FR-CIT-01).
//! Every Zotero call goes through `nb-zotero`; this command only translates
//! its result into a webview-safe shape and keeps the blocking HTTP request
//! off the async runtime thread.

use nb_zotero::{ZoteroClient, ZoteroItem, ZoteroSearchError, ZoteroStatus};
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

/// One Zotero search result, as the citation picker shows it (FR-CIT-03).
/// `citekey` is spec 5.7's grammar for the user library: this client only
/// searches the signed-in user's own library, so the library segment is
/// always `u`.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroSearchRow {
    pub citekey: String,
    pub title: String,
    pub creator_summary: Option<String>,
    pub item_type: String,
}

impl From<ZoteroItem> for ZoteroSearchRow {
    fn from(item: ZoteroItem) -> Self {
        Self {
            citekey: format!("z:u:{}", item.key),
            title: item.data.title.unwrap_or_default(),
            creator_summary: item.meta.creator_summary,
            item_type: item.data.item_type,
        }
    }
}

/// Why a search could not be completed. `Disabled` and `NotRunning` are the
/// same offline states the status indicator shows (FR-CIT-01); the picker
/// uses them to explain why search is unavailable rather than showing a
/// generic error.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ZoteroSearchCommandError {
    Disabled,
    NotRunning,
    RequestFailed,
}

impl From<ZoteroSearchError> for ZoteroSearchCommandError {
    fn from(error: ZoteroSearchError) -> Self {
        match error {
            ZoteroSearchError::Disabled => Self::Disabled,
            ZoteroSearchError::NotRunning => Self::NotRunning,
            ZoteroSearchError::Other(_) => Self::RequestFailed,
        }
    }
}

/// Searches the connected Zotero library for the citation picker
/// (FR-CIT-03). Runs in `spawn_blocking`, as `zotero_status` does, because
/// it is a blocking HTTP call to 127.0.0.1:23119 (FR-CIT-02).
#[tauri::command]
#[specta::specta]
pub async fn zotero_search_items(
    query: String,
) -> Result<Vec<ZoteroSearchRow>, ZoteroSearchCommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        ZoteroClient::default()
            .search_items(&query)
            .map(|items| items.into_iter().map(ZoteroSearchRow::from).collect())
            .map_err(ZoteroSearchCommandError::from)
    })
    .await
    .map_err(|_| ZoteroSearchCommandError::RequestFailed)?
}
