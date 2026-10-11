//! The figures the project PDF shows (FR-ARC-06, ADR-0056 update, issue #102).
//! Reads captured version files through `nb-fs` and hands back the bytes to
//! embed. It never writes anything: the PDF is the only output, and it is
//! stored elsewhere. The captured files are never changed.
//!
//! A raster figure is embedded as it was captured, so its resolution is kept;
//! only one too large to embed whole is reduced (to the largest edge
//! `nb-preview` allows). A vector figure is passed through. A PDF is not
//! embeddable under PDF/A (ADR-0015) and is reported, not dropped.

use std::io::{BufReader, Read};

use nb_fs::{ProjectRelPath, ProjectRoot, ReadError};
use nb_preview::cache::{ThumbnailSize, MAX_THUMBNAIL_SIZE};
use nb_preview::raster::raster_thumbnail;

/// Largest raster file embedded as captured.
const EMBED_MAX_BYTES: u64 = 8 * 1024 * 1024;
/// Largest SVG read; it is text and is parsed by the PDF compiler.
const SVG_MAX_BYTES: u64 = 5 * 1024 * 1024;

/// What a figure's bytes are, by the file name's extension.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FigureFormat {
    Png,
    Jpeg,
    Gif,
    Webp,
    Svg,
}

/// One figure to prepare: the id the PDF input names it by, and the
/// project-relative path of a captured version file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FigureRequest {
    pub id: String,
    pub file: String,
}

/// What became of one request. Carries no system text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FigureVerdict {
    /// The bytes to embed, in this format.
    Image {
        format: FigureFormat,
        bytes: Vec<u8>,
    },
    /// A kind of file the PDF cannot show, such as a PDF.
    Unsupported,
    /// The captured file is not there.
    Missing,
    /// Too large, not readable or not decodable.
    Unavailable,
    /// The path is not one a request may name.
    Refused,
}

/// How a file is turned into a figure, from its extension.
enum Plan {
    Embed(FigureFormat),
    /// Always decoded and re-encoded as PNG (formats Typst does not read).
    Convert,
    Unsupported,
}

fn plan(file: &str) -> Plan {
    let name = file.rsplit('/').next().unwrap_or(file);
    let Some((_, extension)) = name.rsplit_once('.') else {
        return Plan::Unsupported;
    };
    match extension.to_ascii_lowercase().as_str() {
        "png" => Plan::Embed(FigureFormat::Png),
        "jpg" | "jpeg" => Plan::Embed(FigureFormat::Jpeg),
        "gif" => Plan::Embed(FigureFormat::Gif),
        "webp" => Plan::Embed(FigureFormat::Webp),
        "svg" => Plan::Embed(FigureFormat::Svg),
        "tif" | "tiff" | "bmp" => Plan::Convert,
        _ => Plan::Unsupported,
    }
}

/// Prepares each request, in order, and says what became of each. One that
/// cannot be prepared never stops the others.
pub fn prepare_pdf_figures(root: &ProjectRoot, requests: &[FigureRequest]) -> Vec<FigureVerdict> {
    requests.iter().map(|r| prepare_one(root, r)).collect()
}

fn prepare_one(root: &ProjectRoot, request: &FigureRequest) -> FigureVerdict {
    let Ok(file) = ProjectRelPath::parse(&request.file) else {
        return FigureVerdict::Refused;
    };
    let plan = plan(file.as_str());
    if matches!(plan, Plan::Unsupported) {
        // Still checked below for existence, so a missing file is not called unsupported.
        return match root.open_version_file(&file) {
            Ok(_) => FigureVerdict::Unsupported,
            Err(error) => failed(&error),
        };
    }
    let opened = match root.open_version_file(&file) {
        Ok(opened) => opened,
        Err(error) => return failed(&error),
    };
    match plan {
        Plan::Embed(FigureFormat::Svg) => read_whole(opened, SVG_MAX_BYTES, FigureFormat::Svg),
        Plan::Embed(format) if opened.len <= EMBED_MAX_BYTES => {
            read_whole(opened, EMBED_MAX_BYTES, format)
        }
        Plan::Embed(_) | Plan::Convert => reduce(opened),
        Plan::Unsupported => FigureVerdict::Unsupported,
    }
}

fn failed(error: &ReadError) -> FigureVerdict {
    match error {
        ReadError::Missing { .. } => FigureVerdict::Missing,
        ReadError::NotVersionFile { .. } | ReadError::EscapesNotebook { .. } => {
            FigureVerdict::Refused
        }
        _ => FigureVerdict::Unavailable,
    }
}

fn read_whole(opened: nb_fs::VersionFile, limit: u64, format: FigureFormat) -> FigureVerdict {
    if opened.len > limit {
        return FigureVerdict::Unavailable;
    }
    let mut bytes = Vec::new();
    // One byte more than the limit, so a file that grew since it was opened is caught.
    if opened.file.take(limit + 1).read_to_end(&mut bytes).is_err() || bytes.len() as u64 > limit {
        return FigureVerdict::Unavailable;
    }
    FigureVerdict::Image { format, bytes }
}

/// Decodes and re-encodes as a PNG no larger than `nb-preview` allows.
fn reduce(opened: nb_fs::VersionFile) -> FigureVerdict {
    let Ok(edge) = ThumbnailSize::new(MAX_THUMBNAIL_SIZE) else {
        return FigureVerdict::Unavailable;
    };
    match raster_thumbnail(BufReader::new(opened.file), opened.len, edge) {
        Ok(bytes) => FigureVerdict::Image {
            format: FigureFormat::Png,
            bytes,
        },
        Err(_) => FigureVerdict::Unavailable,
    }
}
