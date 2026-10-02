//! Spike for S1-T04: a Rust client for Zotero's local HTTP API on
//! 127.0.0.1:23119 (spec 7.8, FR-CIT-01/02). Detects connectivity state,
//! searches items and fetches CSL-JSON, recording the `Zotero-Server-ID`
//! header when present.
//!
//! Endpoint shapes and headers follow Zotero's Local API guide: base
//! `/api/`, unauthenticated reads, a `Zotero-Server-ID` header on every
//! response, and 403 when the local API is disabled in Zotero's
//! preferences. The `format=csljson` query parameter for CSL-JSON export
//! is not covered by that guide directly; it is a long-standing Zotero Web
//! API format option carried over by the local API's "most endpoints work
//! identically" behaviour, and is worth a spot check in the manual half of
//! S1-G04 against a real Zotero instance.
//!
//! This is spike evidence, not the production client — that is built once
//! S1-G04's manual verification confirms these endpoint details.

use std::io::ErrorKind;

use serde::Deserialize;

const DEFAULT_BASE_URL: &str = "http://127.0.0.1:23119/api";
const API_VERSION: &str = "3";

/// Zotero's local API connectivity, per FR-CIT-01.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ZoteroStatus {
    Connected { server_id: Option<String> },
    Disabled,
    NotRunning,
}

#[derive(Debug, thiserror::Error)]
pub enum ZoteroError {
    #[error("zotero request failed: {0}")]
    Request(#[from] ureq::Error),
    #[error("zotero response body was not valid JSON: {0}")]
    InvalidJson(#[from] serde_json::Error),
}

/// A search request that could not reach Zotero at all, classified the same
/// way as [`ZoteroStatus`] so the citation picker (FR-CIT-03) can show a
/// not-running or disabled state instead of a generic error.
#[derive(Debug, thiserror::Error)]
pub enum ZoteroSearchError {
    #[error("zotero's local API is disabled")]
    Disabled,
    #[error("zotero is not running")]
    NotRunning,
    #[error("zotero search request failed: {0}")]
    Other(#[from] ZoteroError),
}

/// Whether a failed request means Zotero is disabled or not running, versus
/// some other failure that should be reported as an ordinary error.
enum ConnectionFailure {
    Disabled,
    NotRunning,
}

/// Shared by [`ZoteroClient::check_status`] and [`ZoteroClient::search_items`]:
/// a 403 means the local API is switched off, a refused connection means
/// Zotero is not running, and anything else is an ordinary request error.
fn classify_connection_error(error: ureq::Error) -> Result<ConnectionFailure, ZoteroError> {
    match error {
        ureq::Error::StatusCode(403) => Ok(ConnectionFailure::Disabled),
        ureq::Error::Io(io_error) if io_error.kind() == ErrorKind::ConnectionRefused => {
            Ok(ConnectionFailure::NotRunning)
        }
        other => Err(ZoteroError::Request(other)),
    }
}

/// A search result item, in Zotero's native (non-CSL) item envelope shape.
/// Models only the fields needed to display a search result; the full
/// schema is Stage 5 territory.
#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct ZoteroItem {
    pub key: String,
    pub data: ZoteroItemData,
    #[serde(default)]
    pub meta: ZoteroItemMeta,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct ZoteroItemData {
    #[serde(rename = "itemType")]
    pub item_type: String,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Default)]
pub struct ZoteroItemMeta {
    #[serde(rename = "creatorSummary", default)]
    pub creator_summary: Option<String>,
}

/// One source as Zotero holds it now, ready to merge into `bibliography.json`
/// (FR-CIT-05).
#[derive(Debug, Clone, PartialEq)]
pub struct SourceSnapshot {
    /// The item as a single CSL-JSON object.
    pub csl_json: serde_json::Value,
    /// The `Zotero-Server-ID` header, when Zotero sent one (FR-CIT-02).
    pub server_id: Option<String>,
    /// Whether the item is in Zotero's trash.
    pub trashed: bool,
}

/// What asking Zotero for one item found (FR-CIT-07).
#[derive(Debug, Clone, PartialEq)]
pub enum SourceFetch {
    Found(SourceSnapshot),
    /// Zotero answered 404: the item no longer exists.
    Missing,
}

/// Why one item could not be fetched. `PreconditionFailed` (412) is kept
/// apart from other failures so the caller treats the stored data as
/// unconfirmed and asks before overwriting it (FR-CIT-07).
#[derive(Debug, thiserror::Error)]
pub enum ZoteroFetchError {
    #[error("zotero's local API is disabled")]
    Disabled,
    #[error("zotero is not running")]
    NotRunning,
    #[error("zotero reported a failed precondition (412)")]
    PreconditionFailed,
    #[error("not a zotero item key: {0:?}")]
    InvalidItemKey(String),
    #[error("zotero source request failed: {0}")]
    Other(#[from] ZoteroError),
}

fn classify_fetch_error(error: ureq::Error) -> Result<SourceFetch, ZoteroFetchError> {
    match error {
        ureq::Error::StatusCode(404) => Ok(SourceFetch::Missing),
        ureq::Error::StatusCode(412) => Err(ZoteroFetchError::PreconditionFailed),
        other => Err(match classify_connection_error(other) {
            Ok(ConnectionFailure::Disabled) => ZoteroFetchError::Disabled,
            Ok(ConnectionFailure::NotRunning) => ZoteroFetchError::NotRunning,
            Err(zotero_error) => ZoteroFetchError::Other(zotero_error),
        }),
    }
}

/// Spec 5.7: an item key is 8 characters from `2-9` and `A-Z`. Checked
/// before the key goes into a URL path.
fn is_item_key(key: &str) -> bool {
    key.len() == 8 && key.bytes().all(|b| matches!(b, b'2'..=b'9' | b'A'..=b'Z'))
}

/// Zotero's CSL-JSON export wraps items as `{"items": [...]}`; accept that,
/// a bare array, or a bare object, and return the one item.
fn single_csl_item(body: serde_json::Value) -> Option<serde_json::Value> {
    let list = match body {
        serde_json::Value::Object(mut map) if map.contains_key("items") => map.remove("items")?,
        other => other,
    };
    match list {
        serde_json::Value::Array(mut items) if !items.is_empty() => Some(items.swap_remove(0)),
        object @ serde_json::Value::Object(_) => Some(object),
        _ => None,
    }
}

/// Zotero marks a trashed item with `data.deleted` set to 1 (or true).
fn is_trashed(item: &serde_json::Value) -> bool {
    match item.pointer("/data/deleted") {
        Some(serde_json::Value::Bool(flag)) => *flag,
        Some(serde_json::Value::Number(number)) => number.as_i64().is_some_and(|n| n != 0),
        _ => false,
    }
}

pub struct ZoteroClient {
    base_url: String,
    agent: ureq::Agent,
}

impl Default for ZoteroClient {
    fn default() -> Self {
        Self::new(DEFAULT_BASE_URL)
    }
}

impl ZoteroClient {
    /// A client against a given base URL (e.g. a mock server in tests).
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            agent: ureq::Agent::new_with_defaults(),
        }
    }

    /// FR-CIT-01: not running, disabled (403) or connected, capturing the
    /// `Zotero-Server-ID` header (FR-CIT-02) when connected.
    pub fn check_status(&self) -> Result<ZoteroStatus, ZoteroError> {
        let url = format!("{}/", self.base_url);
        match self
            .agent
            .get(&url)
            .header("Zotero-API-Version", API_VERSION)
            .call()
        {
            Ok(response) => Ok(ZoteroStatus::Connected {
                server_id: server_id_header(&response),
            }),
            Err(error) => match classify_connection_error(error) {
                Ok(ConnectionFailure::Disabled) => Ok(ZoteroStatus::Disabled),
                Ok(ConnectionFailure::NotRunning) => Ok(ZoteroStatus::NotRunning),
                Err(zotero_error) => Err(zotero_error),
            },
        }
    }

    /// Searches the local user library (library id `0`) for the citation
    /// picker (FR-CIT-03), reporting a not-running or disabled Zotero the
    /// same way [`check_status`](Self::check_status) does rather than as a
    /// generic error.
    pub fn search_items(&self, query: &str) -> Result<Vec<ZoteroItem>, ZoteroSearchError> {
        let url = format!("{}/users/0/items", self.base_url);
        let mut response = self
            .agent
            .get(&url)
            .header("Zotero-API-Version", API_VERSION)
            .query("q", query)
            .call()
            .map_err(|error| match classify_connection_error(error) {
                Ok(ConnectionFailure::Disabled) => ZoteroSearchError::Disabled,
                Ok(ConnectionFailure::NotRunning) => ZoteroSearchError::NotRunning,
                Err(zotero_error) => ZoteroSearchError::Other(zotero_error),
            })?;
        let body = response
            .body_mut()
            .read_to_string()
            .map_err(|error| ZoteroSearchError::Other(ZoteroError::Request(error)))?;
        let items = serde_json::from_str(&body).map_err(ZoteroError::from)?;
        Ok(items)
    }

    /// Fetches one source for `bibliography.json` (FR-CIT-05, FR-CIT-07):
    /// the item's trashed state and server id from its JSON, then its
    /// CSL-JSON. A 404 is `Missing`, not an error; a 412 is reported as
    /// `PreconditionFailed` so nothing is overwritten on its strength.
    pub fn fetch_source(&self, item_key: &str) -> Result<SourceFetch, ZoteroFetchError> {
        if !is_item_key(item_key) {
            return Err(ZoteroFetchError::InvalidItemKey(item_key.to_string()));
        }
        let url = format!("{}/users/0/items/{item_key}", self.base_url);
        let mut item_response = match self
            .agent
            .get(&url)
            .header("Zotero-API-Version", API_VERSION)
            .call()
        {
            Ok(response) => response,
            Err(error) => return classify_fetch_error(error),
        };
        let server_id = server_id_header(&item_response);
        let item: serde_json::Value = serde_json::from_str(
            &item_response
                .body_mut()
                .read_to_string()
                .map_err(ZoteroError::from)?,
        )
        .map_err(ZoteroError::from)?;
        let mut csl_response = match self
            .agent
            .get(&url)
            .header("Zotero-API-Version", API_VERSION)
            .query("format", "csljson")
            .call()
        {
            Ok(response) => response,
            Err(error) => return classify_fetch_error(error),
        };
        let body: serde_json::Value = serde_json::from_str(
            &csl_response
                .body_mut()
                .read_to_string()
                .map_err(ZoteroError::from)?,
        )
        .map_err(ZoteroError::from)?;
        let csl_json = single_csl_item(body).ok_or_else(|| {
            ZoteroError::InvalidJson(serde::de::Error::custom("no CSL-JSON item in response"))
        })?;
        Ok(SourceFetch::Found(SourceSnapshot {
            csl_json,
            server_id,
            trashed: is_trashed(&item),
        }))
    }

    /// Fetches one item as CSL-JSON.
    pub fn fetch_csl_json(&self, item_key: &str) -> Result<serde_json::Value, ZoteroError> {
        let url = format!("{}/users/0/items/{item_key}", self.base_url);
        let mut response = self
            .agent
            .get(&url)
            .header("Zotero-API-Version", API_VERSION)
            .query("format", "csljson")
            .call()?;
        let body = response.body_mut().read_to_string()?;
        Ok(serde_json::from_str(&body)?)
    }
}

fn server_id_header(response: &ureq::http::Response<ureq::Body>) -> Option<String> {
    response
        .headers()
        .get("Zotero-Server-ID")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
}
