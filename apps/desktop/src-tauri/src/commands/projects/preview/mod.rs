//! Previews of captured versions (spec 8, FR-PRV-03, ADR-0038). Rust makes
//! thumbnails and bounded samples; the webview renders images, PDF and SVG
//! itself from one file at a time that these commands allow in the asset
//! protocol's scope. HTML and other files are never read at all.
//!
//! Only files in an experiment's `evidence/` or `methods/` folder can be
//! named, and `nb-fs` checks again where they resolve. Nothing in a project
//! is written.

mod read;
mod types;

use std::path::PathBuf;
use std::sync::Arc;

use nb_fs::cache::CacheDir;
use nb_fs::ProjectRoot;
use nb_preview::cache::{ThumbnailCache, DEFAULT_CACHE_LIMIT, THUMBNAIL_FOLDER};
use tauri::{AppHandle, Manager, State};

use super::folders::{FolderHandle, PickedFolders};
pub use types::{
    AssetFile, AssetKind, NotebookPreview, PreviewFailure, Sha256Hex, TablePreview, TextPreview,
    VersionPath,
};

/// The thumbnail cache of this run, or `None` if its folder could not be
/// opened; thumbnails then fail with `cacheUnavailable` and every other
/// preview still works.
pub struct PreviewCache(Option<Arc<ThumbnailCache>>);

impl PreviewCache {
    /// Opens the thumbnail cache in the application cache folder (spec 9.4)
    /// and lets the webview load thumbnails from it. Nothing else in the
    /// cache folder is placed in the asset protocol's scope (spec 6.7).
    pub fn open(app: &AppHandle) -> Self {
        let opened = cache_folder(app).and_then(|folder| {
            let cache = ThumbnailCache::open(&CacheDir::new(&folder), DEFAULT_CACHE_LIMIT)
                .map_err(|e| e.to_string())?;
            app.asset_protocol_scope()
                .allow_directory(folder.join(THUMBNAIL_FOLDER), false)
                .map_err(|e| e.to_string())?;
            Ok(cache)
        });
        match opened {
            Ok(cache) => Self(Some(Arc::new(cache))),
            Err(error) => {
                eprintln!("thumbnail cache unavailable: {error}");
                Self(None)
            }
        }
    }
}

/// `%LOCALAPPDATA%\<app id>\cache` on Windows and `~/Library/Caches/<app id>`
/// on macOS (spec 9.4). Tauri's cache folder on Windows is the application's
/// local data folder itself, hence the extra `cache`.
fn cache_folder(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    if cfg!(windows) {
        Ok(dir.join("cache"))
    } else {
        Ok(dir)
    }
}

/// Opens the project `folder` stands for and runs `work` on it, off the
/// async runtime's threads, because previews read files.
async fn in_project<T, F>(
    folders: &PickedFolders,
    folder: FolderHandle,
    work: F,
) -> Result<T, PreviewFailure>
where
    T: Send + 'static,
    F: FnOnce(ProjectRoot) -> Result<T, PreviewFailure> + Send + 'static,
{
    let path = folders
        .get(folder)
        .ok_or(PreviewFailure::ProjectUnavailable)?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = ProjectRoot::open(&path).map_err(|_| PreviewFailure::ProjectUnavailable)?;
        work(root)
    })
    .await
    .map_err(|_| PreviewFailure::Internal)?
}

/// The 256 px thumbnail of a raster image version, from the cache or made
/// now (spec 8, FR-PRV-04). `sha256` is the version's recorded hash.
#[tauri::command]
#[specta::specta]
pub async fn preview_thumbnail(
    folders: State<'_, PickedFolders>,
    cache: State<'_, PreviewCache>,
    folder: FolderHandle,
    file: VersionPath,
    sha256: Sha256Hex,
) -> Result<AssetFile, PreviewFailure> {
    let cache = cache.0.clone().ok_or(PreviewFailure::CacheUnavailable)?;
    in_project(&folders, folder, move |root| {
        read::thumbnail(&root, &cache, &file, &sha256)
    })
    .await
}

/// Lets the webview load one version's file as an image, PDF or SVG, if it
/// is within its spec 8 bound, and returns the path to load it by.
#[tauri::command]
#[specta::specta]
pub async fn preview_asset(
    app: AppHandle,
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    file: VersionPath,
    kind: AssetKind,
) -> Result<AssetFile, PreviewFailure> {
    let asset = in_project(&folders, folder, move |root| {
        read::asset(&root, &file, kind)
    })
    .await?;
    app.asset_protocol_scope()
        .allow_file(&asset.path)
        .map_err(|_| PreviewFailure::Internal)?;
    Ok(asset)
}

/// The header and first rows of a delimited table version (spec 8):
/// 200 rows from 256 KiB, or 2,000 rows from 8 MiB when `expanded`.
#[tauri::command]
#[specta::specta]
pub async fn preview_table(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    file: VersionPath,
    expanded: bool,
) -> Result<TablePreview, PreviewFailure> {
    in_project(&folders, folder, move |root| {
        read::table(&root, &file, expanded)
    })
    .await
}

/// The first 500 lines of a script or text version, from at most 1 MiB.
#[tauri::command]
#[specta::specta]
pub async fn preview_text(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    file: VersionPath,
) -> Result<TextPreview, PreviewFailure> {
    in_project(&folders, folder, move |root| read::text(&root, &file)).await
}

/// The language and kernel of a notebook version, from at most 1 MiB.
#[tauri::command]
#[specta::specta]
pub async fn preview_notebook(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    file: VersionPath,
) -> Result<NotebookPreview, PreviewFailure> {
    in_project(&folders, folder, move |root| read::notebook(&root, &file)).await
}
