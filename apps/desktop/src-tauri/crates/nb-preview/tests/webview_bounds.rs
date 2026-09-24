//! S3-T10 (spec 8): files the webview shows itself are checked against their
//! bounds first. SVG above 20 MB and raster images above 200 MB get the
//! fallback; PDF pages are rendered on demand, so a PDF has no size bound.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use nb_preview::raster::RASTER_MAX_FILE_BYTES;
use nb_preview::webview::{check_webview_file, WebviewKind, SVG_MAX_BYTES};
use nb_preview::PreviewError;

#[test]
fn bounds_svg_is_shown_up_to_20_mb() {
    assert!(check_webview_file(WebviewKind::Svg, SVG_MAX_BYTES).is_ok());
    assert!(matches!(
        check_webview_file(WebviewKind::Svg, SVG_MAX_BYTES + 1),
        Err(PreviewError::FileTooLarge { .. })
    ));
    assert_eq!(SVG_MAX_BYTES, 20 * 1000 * 1000);
}

#[test]
fn bounds_images_are_shown_up_to_200_mb() {
    assert!(check_webview_file(WebviewKind::Image, RASTER_MAX_FILE_BYTES).is_ok());
    assert!(matches!(
        check_webview_file(WebviewKind::Image, RASTER_MAX_FILE_BYTES + 1),
        Err(PreviewError::FileTooLarge { .. })
    ));
}

#[test]
fn bounds_pdf_has_no_size_bound_since_pages_load_on_demand() {
    assert!(check_webview_file(WebviewKind::Pdf, 50 * 1000 * 1000 * 1000).is_ok());
}
