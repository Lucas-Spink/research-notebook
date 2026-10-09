//! The static HTML export (FR-ARC-05, ADR-0054). `packages/format` decides
//! which figures and tables the pages need and writes the pages; these
//! commands only prepare those files and store those pages under
//! `_notebook/exports/html/`, so Rust never parses notebook text.

use nb_archive::{AssetKind, AssetRequest, AssetVerdict, PageVerdict};
use nb_fs::lock::LockRegistry;
use nb_fs::ProjectRoot;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use super::folders::{FolderHandle, PickedFolders};
use super::history::writable;
use super::lock::with_root;
use super::preview::VersionPath;
use super::types::ProjectError;

/// What to prepare for a captured file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum HtmlAssetKind {
    Image,
    Table,
}

/// A figure or table the pages need. `sha256` only names the reduced copy;
/// `nb-archive` refuses anything that is not a SHA-256.
#[derive(Debug, Clone, Deserialize, Type)]
pub struct HtmlAssetRequest {
    pub file: VersionPath,
    pub sha256: String,
    pub kind: HtmlAssetKind,
}

/// What became of one request, answered by position and with no system text.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum HtmlAssetOutcome {
    /// A reduced PNG was written; `file` is project-relative.
    Image {
        file: String,
        width: u32,
        height: u32,
    },
    #[serde(rename_all = "camelCase")]
    Table {
        header: Vec<String>,
        rows: Vec<Vec<String>>,
        more_rows: bool,
        more_columns: bool,
        /// Known only when the whole file was read.
        total_rows: Option<f64>,
    },
    Unsupported,
    Missing,
    Unavailable,
    WriteFailed,
    Refused,
}

impl From<AssetVerdict> for HtmlAssetOutcome {
    fn from(verdict: AssetVerdict) -> Self {
        match verdict {
            AssetVerdict::Image {
                file,
                width,
                height,
            } => Self::Image {
                file,
                width,
                height,
            },
            AssetVerdict::Table(table) => Self::Table {
                header: table.header,
                rows: table.rows,
                more_rows: table.more_rows,
                more_columns: table.more_columns,
                // Row counts are far below 2^53, the webview's exact limit.
                total_rows: table.total_rows.map(|n| n as f64),
            },
            AssetVerdict::Unsupported => Self::Unsupported,
            AssetVerdict::Missing => Self::Missing,
            AssetVerdict::Unavailable => Self::Unavailable,
            AssetVerdict::WriteFailed => Self::WriteFailed,
            AssetVerdict::Refused => Self::Refused,
        }
    }
}

/// One page of the export, named relative to `_notebook/exports/html/`.
#[derive(Debug, Clone, Deserialize, Type)]
pub struct HtmlPageInput {
    pub name: String,
    pub html: String,
}

/// What became of one page, answered by position.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum HtmlPageOutcome {
    Written,
    Refused,
    WriteFailed,
}

impl From<PageVerdict> for HtmlPageOutcome {
    fn from(verdict: PageVerdict) -> Self {
        match verdict {
            PageVerdict::Written => Self::Written,
            PageVerdict::Refused => Self::Refused,
            PageVerdict::WriteFailed => Self::WriteFailed,
        }
    }
}

pub(super) fn prepare(root: &ProjectRoot, requests: &[HtmlAssetRequest]) -> Vec<HtmlAssetOutcome> {
    let requests: Vec<AssetRequest> = requests
        .iter()
        .map(|r| AssetRequest {
            file: r.file.as_str().to_owned(),
            sha256: r.sha256.clone(),
            kind: match r.kind {
                HtmlAssetKind::Image => AssetKind::Image,
                HtmlAssetKind::Table => AssetKind::Table,
            },
        })
        .collect();
    nb_archive::prepare_html_assets(root, &requests)
        .into_iter()
        .map(HtmlAssetOutcome::from)
        .collect()
}

pub(super) fn store(root: &ProjectRoot, pages: &[HtmlPageInput]) -> Vec<HtmlPageOutcome> {
    let pages: Vec<(String, String)> = pages
        .iter()
        .map(|p| (p.name.clone(), p.html.clone()))
        .collect();
    nb_archive::write_html_pages(root, &pages)
        .into_iter()
        .map(HtmlPageOutcome::from)
        .collect()
}

/// Reduces figures and samples tables for the HTML export, writing reduced
/// figures under `_notebook/exports/html/assets/` (FR-ARC-05). The captured
/// files are only read. Refused, with nothing written, unless this
/// application holds the project's lock.
#[tauri::command]
#[specta::specta]
pub async fn prepare_html_assets(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
    requests: Vec<HtmlAssetRequest>,
) -> Result<Vec<HtmlAssetOutcome>, ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        writable(locks.health(&root))?;
        Ok(prepare(&root, &requests))
    })
    .await
}

/// Writes the export's pages into `_notebook/exports/html/` (FR-ARC-05),
/// replacing those of an earlier run. Refused, with nothing written, unless
/// this application holds the project's lock.
#[tauri::command]
#[specta::specta]
pub async fn write_html_pages(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
    pages: Vec<HtmlPageInput>,
) -> Result<Vec<HtmlPageOutcome>, ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        writable(locks.health(&root))?;
        Ok(store(&root, &pages))
    })
    .await
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these write fixture files.
#[allow(clippy::unwrap_used, clippy::disallowed_methods)]
mod tests {
    use std::fs;

    use super::*;

    const EVIDENCE: &str = "_notebook/experiments/EXP-001/evidence";

    fn project() -> (tempfile::TempDir, ProjectRoot) {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join(EVIDENCE)).unwrap();
        let root = ProjectRoot::open(dir.path()).unwrap();
        (dir, root)
    }

    #[test]
    fn requests_are_answered_by_position_and_a_table_comes_back_as_data() {
        let (dir, root) = project();
        fs::write(dir.path().join(EVIDENCE).join("t.csv"), "a,b\n1,2\n").unwrap();
        let requests = [
            HtmlAssetRequest {
                file: VersionPath::try_from(format!("{EVIDENCE}/gone.png")).unwrap(),
                sha256: "a".repeat(64),
                kind: HtmlAssetKind::Image,
            },
            HtmlAssetRequest {
                file: VersionPath::try_from(format!("{EVIDENCE}/t.csv")).unwrap(),
                sha256: "b".repeat(64),
                kind: HtmlAssetKind::Table,
            },
        ];

        let outcomes = prepare(&root, &requests);

        assert_eq!(outcomes.len(), 2);
        assert_eq!(outcomes[0], HtmlAssetOutcome::Missing);
        assert_eq!(
            outcomes[1],
            HtmlAssetOutcome::Table {
                header: vec!["a".to_owned(), "b".to_owned()],
                rows: vec![vec!["1".to_owned(), "2".to_owned()]],
                more_rows: false,
                more_columns: false,
                total_rows: Some(1.0),
            }
        );
    }

    #[test]
    fn pages_are_stored_by_position_and_a_bad_name_is_refused() {
        let (dir, root) = project();
        let pages = [
            HtmlPageInput {
                name: "index.html".to_owned(),
                html: "<p>i</p>".to_owned(),
            },
            HtmlPageInput {
                name: "../x.html".to_owned(),
                html: "x".to_owned(),
            },
        ];

        let outcomes = store(&root, &pages);

        assert_eq!(
            outcomes,
            [HtmlPageOutcome::Written, HtmlPageOutcome::Refused]
        );
        assert!(dir
            .path()
            .join("_notebook/exports/html/index.html")
            .is_file());
        assert!(!dir.path().join("_notebook/exports/x.html").exists());
    }
}
