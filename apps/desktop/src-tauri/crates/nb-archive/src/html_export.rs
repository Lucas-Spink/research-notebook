//! The files side of the static HTML export (FR-ARC-05, ADR-0054): reduced
//! copies of figures, samples of tables, and the pages themselves. Which
//! pages exist and what they say comes from `packages/format`; this module
//! only reads captured version files through `nb-fs`, hands them to
//! `nb-preview`, and writes under `_notebook/exports/html/` through `nb-fs`.
//! The captured files are never changed.

use std::io::BufReader;

use nb_fs::{ProjectRelPath, ProjectRoot, ReadError};
use nb_preview::cache::{ContentHash, ThumbnailSize};
use nb_preview::raster::raster_thumbnail;
use nb_preview::table::{sample_table_file, TableExtent, TableFormat};

/// The folder the export is written to, inside `_notebook/`.
const HTML_DIR: &str = "_notebook/exports/html";
/// Longest edge of a reduced figure, in pixels.
const FIGURE_EDGE: u32 = 800;
/// Bytes before the width and height in a PNG: signature, length, `IHDR`.
const PNG_SIZE_OFFSET: usize = 16;

/// What to prepare for one captured file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssetKind {
    /// A raster image, reduced to fit [`FIGURE_EDGE`] pixels.
    Image,
    /// A delimited table, sampled.
    Table,
}

/// One figure or table to prepare.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssetRequest {
    /// Project-relative path of a captured version file.
    pub file: String,
    /// SHA-256 `artefacts.yaml` records for it; only names the reduced copy.
    pub sha256: String,
    pub kind: AssetKind,
}

/// The first rows of a table, as the pages show them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SampledTable {
    pub header: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub more_rows: bool,
    pub more_columns: bool,
    /// Rows below the header, known only when the whole file was read.
    pub total_rows: Option<u64>,
}

/// What became of one request. Carries no system text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AssetVerdict {
    /// A reduced PNG was written. `file` is project-relative.
    Image {
        file: String,
        width: u32,
        height: u32,
    },
    Table(SampledTable),
    /// The file is not of a kind that can be prepared (for example a
    /// spreadsheet); the page links it only.
    Unsupported,
    /// The captured file is not there.
    Missing,
    /// Too large, not decodable or not readable.
    Unavailable,
    /// The reduced copy could not be placed in the notebook.
    WriteFailed,
    /// The path or hash is not one a request may name.
    Refused,
}

/// Prepares each request, in order, and says what became of each. One that
/// cannot be prepared never stops the others.
pub fn prepare_html_assets(root: &ProjectRoot, requests: &[AssetRequest]) -> Vec<AssetVerdict> {
    requests.iter().map(|r| prepare_one(root, r)).collect()
}

fn prepare_one(root: &ProjectRoot, request: &AssetRequest) -> AssetVerdict {
    let Ok(hash) = ContentHash::parse(&request.sha256) else {
        return AssetVerdict::Refused;
    };
    let Ok(file) = ProjectRelPath::parse(&request.file) else {
        return AssetVerdict::Refused;
    };
    let opened = match root.open_version_file(&file) {
        Ok(opened) => opened,
        Err(ReadError::Missing { .. }) => return AssetVerdict::Missing,
        Err(ReadError::NotVersionFile { .. } | ReadError::EscapesNotebook { .. }) => {
            return AssetVerdict::Refused
        }
        Err(_) => return AssetVerdict::Unavailable,
    };
    match request.kind {
        AssetKind::Image => reduce_image(root, opened, &hash),
        AssetKind::Table => sample(&file, opened),
    }
}

fn reduce_image(
    root: &ProjectRoot,
    opened: nb_fs::VersionFile,
    hash: &ContentHash,
) -> AssetVerdict {
    let Ok(edge) = ThumbnailSize::new(FIGURE_EDGE) else {
        return AssetVerdict::Unavailable;
    };
    let Ok(png) = raster_thumbnail(BufReader::new(opened.file), opened.len, edge) else {
        return AssetVerdict::Unavailable;
    };
    let Some((width, height)) = png_size(&png) else {
        return AssetVerdict::Unavailable;
    };
    let file = format!("{HTML_DIR}/assets/{}-{FIGURE_EDGE}.png", hash.as_str());
    let Ok(destination) = ProjectRelPath::parse(&file) else {
        return AssetVerdict::WriteFailed;
    };
    match root.write_atomic(&destination, &png) {
        Ok(()) => AssetVerdict::Image {
            file,
            width,
            height,
        },
        Err(_) => AssetVerdict::WriteFailed,
    }
}

/// Width and height from a PNG's `IHDR` chunk, which an encoder always puts first.
fn png_size(png: &[u8]) -> Option<(u32, u32)> {
    let field = |at: usize| -> Option<u32> {
        let bytes = png.get(at..at + 4)?;
        Some(u32::from_be_bytes(bytes.try_into().ok()?))
    };
    Some((field(PNG_SIZE_OFFSET)?, field(PNG_SIZE_OFFSET + 4)?))
}

fn sample(file: &ProjectRelPath, opened: nb_fs::VersionFile) -> AssetVerdict {
    let name = file.segments().last().unwrap_or_default();
    let Some(format) = TableFormat::from_file_name(name) else {
        return AssetVerdict::Unsupported;
    };
    match sample_table_file(opened.file, opened.len, format, TableExtent::Initial) {
        Ok(sample) => AssetVerdict::Table(SampledTable {
            header: sample.header,
            rows: sample.rows,
            more_rows: sample.more_rows,
            more_columns: sample.more_columns,
            total_rows: sample.dimensions.map(|d| d.rows),
        }),
        Err(_) => AssetVerdict::Unavailable,
    }
}

/// What became of one page.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageVerdict {
    Written,
    /// The name is not a plain `.html` file name.
    Refused,
    WriteFailed,
}

/// A name the export may write: letters, digits, `-` and `_`, then `.html`.
/// No separator, drive letter or dot-dot can be in it.
fn valid_page_name(name: &str) -> bool {
    name.strip_suffix(".html").is_some_and(|stem| {
        !stem.is_empty()
            && stem
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    })
}

/// Writes each `(name, html)` page into `_notebook/exports/html/`, in order,
/// replacing a page of the same name. Pages of an earlier run that are no
/// longer exported are left, because the application never deletes.
pub fn write_html_pages(root: &ProjectRoot, pages: &[(String, String)]) -> Vec<PageVerdict> {
    pages
        .iter()
        .map(|(name, html)| {
            if !valid_page_name(name) {
                return PageVerdict::Refused;
            }
            let Ok(path) = ProjectRelPath::parse(&format!("{HTML_DIR}/{name}")) else {
                return PageVerdict::Refused;
            };
            match root.write_atomic(&path, html.as_bytes()) {
                Ok(()) => PageVerdict::Written,
                Err(_) => PageVerdict::WriteFailed,
            }
        })
        .collect()
}
