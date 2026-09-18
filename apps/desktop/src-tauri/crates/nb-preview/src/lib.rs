//! Spike for S1-T05: Rust-generated thumbnails for raster images (spec
//! section 8). Scoped to PNG and JPEG input, as the task's definition of
//! done names; the full raster type list (gif, webp, tif, tiff, bmp) and
//! the 200 MB / 100 megapixel bound belong to the production preview work
//! in Stage 3 (S3-T09, S3-T10).

use image::{DynamicImage, ImageFormat};

/// Longest edge of a generated thumbnail, in pixels (spec section 8).
const MAX_EDGE: u32 = 256;

#[derive(Debug, thiserror::Error)]
pub enum PreviewError {
    #[error("could not decode the image: {0}")]
    Decode(#[from] image::ImageError),
}

/// Generates a thumbnail PNG for a PNG or JPEG image, scaled to fit within
/// [`MAX_EDGE`] on its longest side. Smaller images are returned unscaled —
/// a thumbnail never upscales the original.
pub fn thumbnail_png(bytes: &[u8]) -> Result<Vec<u8>, PreviewError> {
    let image = image::load_from_memory(bytes)?;
    let scaled = fit_within_max_edge(image);

    let mut out = Vec::new();
    scaled.write_to(&mut std::io::Cursor::new(&mut out), ImageFormat::Png)?;
    Ok(out)
}

fn fit_within_max_edge(image: DynamicImage) -> DynamicImage {
    if image.width() <= MAX_EDGE && image.height() <= MAX_EDGE {
        image
    } else {
        image.thumbnail(MAX_EDGE, MAX_EDGE)
    }
}
