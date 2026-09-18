//! S1-T05 spike evidence: Rust-generated thumbnails for PNG and JPEG,
//! bounded to fit within 256px on the longest edge without upscaling
//! smaller images (spec section 8).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use image::{DynamicImage, ImageFormat, RgbImage};

fn encode(image: &DynamicImage, format: ImageFormat) -> Vec<u8> {
    let mut bytes = Vec::new();
    image
        .write_to(&mut std::io::Cursor::new(&mut bytes), format)
        .expect("test fixture must encode");
    bytes
}

fn solid(width: u32, height: u32) -> DynamicImage {
    DynamicImage::ImageRgb8(RgbImage::from_pixel(
        width,
        height,
        image::Rgb([120, 40, 200]),
    ))
}

fn decoded_dimensions(png: &[u8]) -> (u32, u32) {
    let decoded = image::load_from_memory(png).expect("thumbnail output must decode as an image");
    (decoded.width(), decoded.height())
}

#[test]
fn large_png_is_scaled_down_to_fit_256px() {
    let source = encode(&solid(1200, 600), ImageFormat::Png);

    let thumbnail = nb_preview::thumbnail_png(&source).expect("a valid PNG must thumbnail");

    let (width, height) = decoded_dimensions(&thumbnail);
    assert!(width <= 256 && height <= 256, "got {width}x{height}");
    // Aspect ratio (2:1) preserved, longest edge (width) hits the bound.
    assert_eq!(width, 256);
    assert_eq!(height, 128);
}

#[test]
fn large_jpeg_is_scaled_down_to_fit_256px() {
    let source = encode(&solid(300, 900), ImageFormat::Jpeg);

    let thumbnail = nb_preview::thumbnail_png(&source).expect("a valid JPEG must thumbnail");

    let (width, height) = decoded_dimensions(&thumbnail);
    assert!(width <= 256 && height <= 256, "got {width}x{height}");
    assert_eq!(height, 256);
}

#[test]
fn small_image_is_never_upscaled() {
    let source = encode(&solid(64, 32), ImageFormat::Png);

    let thumbnail = nb_preview::thumbnail_png(&source).expect("a valid PNG must thumbnail");

    let (width, height) = decoded_dimensions(&thumbnail);
    assert_eq!((width, height), (64, 32));
}

#[test]
fn thumbnail_output_is_always_png() {
    let source = encode(&solid(500, 500), ImageFormat::Jpeg);

    let thumbnail = nb_preview::thumbnail_png(&source).expect("a valid JPEG must thumbnail");

    assert_eq!(
        image::guess_format(&thumbnail).expect("output must have a recognisable format"),
        ImageFormat::Png
    );
}

#[test]
fn corrupt_bytes_return_an_error_instead_of_panicking() {
    let result = nb_preview::thumbnail_png(b"this is not an image");

    assert!(result.is_err());
}
