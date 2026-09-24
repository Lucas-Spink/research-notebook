//! Bounds for files the webview renders itself (spec 8, ADR-0038): SVG
//! through `<img>`, PDF through pdf.js, and raster images at full size. The
//! application checks a file here before letting the webview load it.

use crate::raster::RASTER_MAX_FILE_BYTES;
use crate::PreviewError;

/// Largest SVG shown (20 MB).
pub const SVG_MAX_BYTES: u64 = 20 * 1000 * 1000;

/// What the webview will render the file as.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WebviewKind {
    Image,
    Pdf,
    Svg,
}

/// Whether a file of `len` bytes may be shown as `kind`. PDF has no bound
/// because pdf.js renders its pages on demand (spec 8).
pub fn check_webview_file(kind: WebviewKind, len: u64) -> Result<(), PreviewError> {
    let limit = match kind {
        WebviewKind::Image => RASTER_MAX_FILE_BYTES,
        WebviewKind::Svg => SVG_MAX_BYTES,
        WebviewKind::Pdf => return Ok(()),
    };
    if len > limit {
        return Err(PreviewError::FileTooLarge { bytes: len, limit });
    }
    Ok(())
}
