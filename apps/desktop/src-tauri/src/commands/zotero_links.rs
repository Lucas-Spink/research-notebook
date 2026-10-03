//! Open in Zotero, Open PDF and the DOI link for the source details panel
//! (FR-CIT-04). The webview names a target by its parts; Rust builds the
//! URI with `nb_zotero::links` and launches it through `nb_opener`, so the
//! webview never supplies a URI and nothing but these three forms opens.

use nb_opener::RealLauncher;
use nb_zotero::{links, ZoteroClient};
use serde::Deserialize;
use serde::Serialize;
use specta::Type;

use super::zotero::ZoteroSourceError;

/// What the person asked to open.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SourceLink {
    /// Show the item in Zotero.
    ZoteroItem { library: String, key: String },
    /// Open a PDF attachment in Zotero's reader.
    ZoteroPdf {
        library: String,
        attachment_key: String,
    },
    /// Open the DOI in the system browser.
    Doi { doi: String },
}

/// Why a link did not open.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum OpenSourceLinkError {
    /// The parts were not a valid library, key or DOI; nothing was launched.
    Invalid,
    /// The operating system could not launch the handler.
    LaunchFailed,
}

/// The URI for a link, or `None` when its parts are not valid.
fn uri_for(link: &SourceLink) -> Option<String> {
    match link {
        SourceLink::ZoteroItem { library, key } => links::item_uri(library, key),
        SourceLink::ZoteroPdf {
            library,
            attachment_key,
        } => links::pdf_uri(library, attachment_key),
        SourceLink::Doi { doi } => links::doi_uri(doi),
    }
}

/// Opens one of the three source links. Launches a process, so it runs in
/// `spawn_blocking`.
#[tauri::command]
#[specta::specta]
pub async fn open_source_link(link: SourceLink) -> Result<(), OpenSourceLinkError> {
    let uri = uri_for(&link).ok_or(OpenSourceLinkError::Invalid)?;
    tauri::async_runtime::spawn_blocking(move || {
        nb_opener::open_uri(&mut RealLauncher, &uri).map_err(|_| OpenSourceLinkError::LaunchFailed)
    })
    .await
    .map_err(|_| OpenSourceLinkError::LaunchFailed)?
}

/// The key of a source's PDF attachment, when Zotero has one. Blocking HTTP
/// to 127.0.0.1:23119 (FR-CIT-02), so it runs in `spawn_blocking`. Writes
/// nothing.
#[tauri::command]
#[specta::specta]
pub async fn zotero_pdf_attachment(
    library: String,
    item_key: String,
) -> Result<Option<String>, ZoteroSourceError> {
    tauri::async_runtime::spawn_blocking(move || {
        ZoteroClient::default()
            .find_pdf_attachment(&library, &item_key)
            .map_err(ZoteroSourceError::from)
    })
    .await
    .map_err(|_| ZoteroSourceError::RequestFailed)?
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn each_link_kind_becomes_its_uri() {
        let item = SourceLink::ZoteroItem {
            library: "u".into(),
            key: "ABCD2345".into(),
        };
        let pdf = SourceLink::ZoteroPdf {
            library: "g9".into(),
            attachment_key: "WXYZ6789".into(),
        };
        let doi = SourceLink::Doi {
            doi: "10.1000/abc".into(),
        };
        assert_eq!(
            uri_for(&item).as_deref(),
            Some("zotero://select/library/items/ABCD2345")
        );
        assert_eq!(
            uri_for(&pdf).as_deref(),
            Some("zotero://open-pdf/groups/9/items/WXYZ6789")
        );
        assert_eq!(
            uri_for(&doi).as_deref(),
            Some("https://doi.org/10.1000/abc")
        );
    }

    #[test]
    fn an_invalid_part_gives_no_uri() {
        let doi = SourceLink::Doi {
            doi: "10.1000/a&calc".into(),
        };
        assert_eq!(uri_for(&doi), None);
    }
}
