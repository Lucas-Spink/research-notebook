//! Previews of artefact files (spec 8, FR-PRV-03): thumbnails and bounded
//! samples. Nothing here reads beyond the bounds spec 8 sets for each type,
//! and nothing writes except the thumbnail cache, through `nb-fs`.
//!
//! - [`raster`]: PNG thumbnails of raster images.
//! - [`table`]: header and first rows of delimited tables, gzip included.
//! - [`text`]: first lines of scripts and text.
//! - [`notebook`]: language and kernel of notebooks.
//! - [`webview`]: size bounds for files the webview renders itself.
//! - [`cache`]: the thumbnail cache (S3-T09, FR-PRV-04).
//!
//! PDF, SVG and HTML are handled in the webview (ADR-0014, ADR-0038).

pub mod cache;
pub mod encoding;
pub mod notebook;
pub mod raster;
pub mod table;
pub mod text;
pub mod webview;

use crate::cache::{ThumbnailCacheError, DEFAULT_THUMBNAIL_SIZE};

#[derive(Debug, thiserror::Error)]
pub enum PreviewError {
    #[error("could not decode the image: {0}")]
    Decode(#[from] image::ImageError),
    #[error("could not cache the thumbnail: {0}")]
    Cache(#[from] ThumbnailCacheError),
    #[error("could not read the file: {0}")]
    Io(#[from] std::io::Error),
    /// Spec 8 gives no thumbnail above this size.
    #[error("the file is {bytes} bytes, above the {limit}-byte preview limit")]
    FileTooLarge { bytes: u64, limit: u64 },
    /// Spec 8 gives no thumbnail above 100 megapixels.
    #[error("the image is {width} x {height} pixels, above the preview limit")]
    TooManyPixels { width: u32, height: u32 },
    #[error("could not read the table: {0}")]
    Table(String),
}

/// Generates a thumbnail PNG from image bytes held in memory, scaled to fit
/// 256 px on its longest side and never upscaled. Kept for the S1-T05 spike
/// command; previews of files use [`raster::raster_thumbnail`], which also
/// applies the spec 8 bounds.
pub fn thumbnail_png(bytes: &[u8]) -> Result<Vec<u8>, PreviewError> {
    let image = image::load_from_memory(bytes)?;
    raster::encode_png(raster::fit_within(image, DEFAULT_THUMBNAIL_SIZE.pixels()))
}
