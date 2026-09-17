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
            Err(ureq::Error::StatusCode(403)) => Ok(ZoteroStatus::Disabled),
            Err(ureq::Error::Io(io_error)) if io_error.kind() == ErrorKind::ConnectionRefused => {
                Ok(ZoteroStatus::NotRunning)
            }
            Err(other) => Err(ZoteroError::Request(other)),
        }
    }

    /// Searches the local user library (library id `0`).
    pub fn search_items(&self, query: &str) -> Result<Vec<ZoteroItem>, ZoteroError> {
        let url = format!("{}/users/0/items", self.base_url);
        let mut response = self
            .agent
            .get(&url)
            .header("Zotero-API-Version", API_VERSION)
            .query("q", query)
            .call()?;
        let body = response.body_mut().read_to_string()?;
        Ok(serde_json::from_str(&body)?)
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
