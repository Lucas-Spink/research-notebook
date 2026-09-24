//! Raster image thumbnails (spec 8): a PNG no larger than the thumbnail size
//! on its longest edge, for png, jpg, jpeg, gif, webp, tif, tiff and bmp. A
//! multi-page TIFF gives its first page, since the decoder reads only that.
//! Files above 200 MB or 100 megapixels get none, and the webview shows the
//! fallback icon instead.

use std::io::{BufRead, Seek};
use std::path::PathBuf;

use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader, Limits};

use crate::cache::{ThumbnailCache, ThumbnailKey, ThumbnailSize};
use crate::PreviewError;

/// Largest file given a thumbnail (200 MB).
pub const RASTER_MAX_FILE_BYTES: u64 = 200 * 1000 * 1000;
/// Largest image given a thumbnail, in pixels (100 megapixels).
pub const RASTER_MAX_PIXELS: u64 = 100 * 1000 * 1000;

/// Makes a PNG thumbnail of the image in `reader`, which is `len` bytes.
///
/// The size and the declared dimensions are checked before any pixel is
/// decoded, so a small file declaring a huge image costs nothing.
pub fn raster_thumbnail<R: BufRead + Seek>(
    reader: R,
    len: u64,
    size: ThumbnailSize,
) -> Result<Vec<u8>, PreviewError> {
    if len > RASTER_MAX_FILE_BYTES {
        return Err(PreviewError::FileTooLarge {
            bytes: len,
            limit: RASTER_MAX_FILE_BYTES,
        });
    }
    let mut reader = ImageReader::new(reader).with_guessed_format()?;
    // The decoder's own allocation limit (512 MiB by default) stays as a
    // second guard behind the pixel count.
    reader.limits(Limits::default());
    let decoder = reader.into_decoder()?;
    let (width, height) = decoder.dimensions();
    if u64::from(width) * u64::from(height) > RASTER_MAX_PIXELS {
        return Err(PreviewError::TooManyPixels { width, height });
    }
    let image = DynamicImage::from_decoder(decoder)?;
    encode_png(fit_within(image, size.pixels()))
}

/// The cached thumbnail for `key`, made from the file `open` returns (a
/// reader and its length) only when the cache has none.
pub fn cached_raster_thumbnail<R, F>(
    cache: &ThumbnailCache,
    key: &ThumbnailKey,
    open: F,
) -> Result<PathBuf, PreviewError>
where
    R: BufRead + Seek,
    F: FnOnce() -> Result<(R, u64), PreviewError>,
{
    cache.get_or_insert_with(key, || {
        let (reader, len) = open()?;
        raster_thumbnail(reader, len, key.size())
    })
}

/// Scales `image` down to fit `edge` on its longest side; never up.
pub(crate) fn fit_within(image: DynamicImage, edge: u32) -> DynamicImage {
    if image.width() <= edge && image.height() <= edge {
        image
    } else {
        image.thumbnail(edge, edge)
    }
}

pub(crate) fn encode_png(image: DynamicImage) -> Result<Vec<u8>, PreviewError> {
    let mut out = Vec::new();
    image.write_to(&mut std::io::Cursor::new(&mut out), ImageFormat::Png)?;
    Ok(out)
}
