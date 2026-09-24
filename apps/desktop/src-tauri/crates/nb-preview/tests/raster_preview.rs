//! S3-T10 (spec 8): raster images (png, jpg, jpeg, gif, webp, tif, tiff, bmp)
//! get a PNG thumbnail made in Rust, from the first page of a multi-page
//! TIFF, and none above 200 MB or 100 megapixels. Thumbnails are cached by
//! content hash and size (FR-PRV-04).
// disallowed_methods: tests build throwaway files in temporary directories.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

use std::cell::Cell;
use std::io::{Cursor, Write};

use image::{DynamicImage, ImageFormat, RgbImage};
use nb_fs::cache::CacheDir;
use nb_preview::cache::{ContentHash, ThumbnailCache, ThumbnailKey, DEFAULT_THUMBNAIL_SIZE};
use nb_preview::raster::{
    cached_raster_thumbnail, raster_thumbnail, RASTER_MAX_FILE_BYTES, RASTER_MAX_PIXELS,
};
use nb_preview::PreviewError;

fn solid(width: u32, height: u32) -> DynamicImage {
    DynamicImage::ImageRgb8(RgbImage::from_pixel(
        width,
        height,
        image::Rgb([10, 120, 200]),
    ))
}

fn encode(image: &DynamicImage, format: ImageFormat) -> Vec<u8> {
    let mut bytes = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut bytes), format)
        .unwrap();
    bytes
}

fn dimensions(png: &[u8]) -> (u32, u32) {
    assert_eq!(image::guess_format(png).unwrap(), ImageFormat::Png);
    let decoded = image::load_from_memory(png).unwrap();
    (decoded.width(), decoded.height())
}

fn thumbnail(bytes: Vec<u8>) -> Result<Vec<u8>, PreviewError> {
    let len = bytes.len() as u64;
    raster_thumbnail(Cursor::new(bytes), len, DEFAULT_THUMBNAIL_SIZE)
}

#[test]
fn every_raster_format_in_spec_8_gets_a_256_px_png() {
    let source = solid(600, 300);
    for format in [
        ImageFormat::Png,
        ImageFormat::Jpeg,
        ImageFormat::Gif,
        ImageFormat::WebP,
        ImageFormat::Tiff,
        ImageFormat::Bmp,
    ] {
        let png = thumbnail(encode(&source, format)).unwrap();
        assert_eq!(dimensions(&png), (256, 128), "{format:?}");
    }
}

#[test]
fn a_multi_page_tiff_uses_its_first_page() {
    let mut bytes = Cursor::new(Vec::new());
    {
        let mut tiff = tiff::encoder::TiffEncoder::new(&mut bytes).unwrap();
        tiff.write_image::<tiff::encoder::colortype::RGB8>(40, 20, &[200u8; 40 * 20 * 3])
            .unwrap();
        tiff.write_image::<tiff::encoder::colortype::RGB8>(400, 400, &[50u8; 400 * 400 * 3])
            .unwrap();
    }

    let png = thumbnail(bytes.into_inner()).unwrap();

    assert_eq!(dimensions(&png), (40, 20));
}

#[test]
fn a_file_above_200_mb_gets_no_thumbnail_and_is_not_read() {
    let bytes = encode(&solid(10, 10), ImageFormat::Png);

    let result = raster_thumbnail(
        Cursor::new(bytes),
        RASTER_MAX_FILE_BYTES + 1,
        DEFAULT_THUMBNAIL_SIZE,
    );

    assert!(matches!(result, Err(PreviewError::FileTooLarge { .. })));
}

/// A BMP header that declares `width` x `height` with no pixel data after it.
fn bmp_header(width: i32, height: i32) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.write_all(b"BM").unwrap();
    bytes.write_all(&54u32.to_le_bytes()).unwrap();
    bytes.write_all(&0u32.to_le_bytes()).unwrap();
    bytes.write_all(&54u32.to_le_bytes()).unwrap();
    bytes.write_all(&40u32.to_le_bytes()).unwrap();
    bytes.write_all(&width.to_le_bytes()).unwrap();
    bytes.write_all(&height.to_le_bytes()).unwrap();
    bytes.write_all(&1u16.to_le_bytes()).unwrap();
    bytes.write_all(&24u16.to_le_bytes()).unwrap();
    bytes.write_all(&[0u8; 24]).unwrap();
    bytes
}

#[test]
fn an_image_above_100_megapixels_is_refused_before_decoding() {
    // 20,000 x 20,000 is 400 megapixels; decoding would need over 1 GB.
    let result = thumbnail(bmp_header(20_000, 20_000));

    match result {
        Err(PreviewError::TooManyPixels { width, height }) => {
            assert_eq!((width, height), (20_000, 20_000));
            assert!(u64::from(width) * u64::from(height) > RASTER_MAX_PIXELS);
        }
        other => panic!("expected TooManyPixels, got {other:?}"),
    }
}

#[test]
fn a_file_that_is_not_an_image_is_an_error() {
    assert!(matches!(
        thumbnail(b"just text".to_vec()),
        Err(PreviewError::Decode(_))
    ));
}

#[test]
fn a_cached_thumbnail_is_made_once_per_hash_and_size() {
    let dir = tempfile::tempdir().unwrap();
    let cache =
        ThumbnailCache::open(&CacheDir::new(dir.path().join("cache")), 1024 * 1024).unwrap();
    let key = ThumbnailKey::new(
        ContentHash::parse(&"c".repeat(64)).unwrap(),
        DEFAULT_THUMBNAIL_SIZE,
    );
    let bytes = encode(&solid(600, 300), ImageFormat::Png);
    let opens = Cell::new(0);
    let open = || {
        opens.set(opens.get() + 1);
        Ok((Cursor::new(bytes.clone()), bytes.len() as u64))
    };

    let first = cached_raster_thumbnail(&cache, &key, open).unwrap();
    let second = cached_raster_thumbnail(&cache, &key, open).unwrap();

    assert_eq!(first, second);
    assert_eq!(opens.get(), 1);
    assert_eq!(dimensions(&std::fs::read(first).unwrap()), (256, 128));
}
