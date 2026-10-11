//! Issue #102 (ADR-0056 update): the figures the project PDF shows are read
//! from captured version files, never written, and each request is answered on
//! its own so one bad file never hides the others.
#![allow(clippy::unwrap_used, clippy::panic, clippy::disallowed_methods)]

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use nb_archive::{prepare_pdf_figures, FigureFormat, FigureRequest, FigureVerdict};
use nb_fs::ProjectRoot;
use tempfile::TempDir;

const EVIDENCE: &str = "_notebook/experiments/EXP-001/evidence";

fn project() -> (TempDir, ProjectRoot) {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join(EVIDENCE)).unwrap();
    fs::write(dir.path().join("analysis.R"), "print(1)\n").unwrap();
    let root = ProjectRoot::open(dir.path()).unwrap();
    (dir, root)
}

fn put(dir: &TempDir, name: &str, bytes: &[u8]) -> String {
    let path = format!("{EVIDENCE}/{name}");
    fs::write(dir.path().join(&path), bytes).unwrap();
    path
}

fn request(id: &str, file: &str) -> FigureRequest {
    FigureRequest {
        id: id.to_owned(),
        file: file.to_owned(),
    }
}

fn png(width: u32, height: u32) -> Vec<u8> {
    let image = image::RgbImage::from_pixel(width, height, image::Rgb([200, 30, 30]));
    let mut out = std::io::Cursor::new(Vec::new());
    image.write_to(&mut out, image::ImageFormat::Png).unwrap();
    out.into_inner()
}

/// A PNG that does not compress, so it is large on disk.
fn noisy_png(width: u32, height: u32) -> Vec<u8> {
    let mut state = 0x2545_F491_4F6C_DD1Du64;
    let image = image::RgbImage::from_fn(width, height, |_, _| {
        state = state
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        let b = state.to_be_bytes();
        image::Rgb([b[0], b[1], b[2]])
    });
    let mut out = std::io::Cursor::new(Vec::new());
    image.write_to(&mut out, image::ImageFormat::Png).unwrap();
    out.into_inner()
}

fn snapshot(dir: &TempDir) -> BTreeMap<String, Vec<u8>> {
    fn walk(base: &Path, at: &Path, found: &mut BTreeMap<String, Vec<u8>>) {
        for entry in fs::read_dir(at).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(base, &path, found);
            } else {
                let name = path.strip_prefix(base).unwrap().to_string_lossy();
                found.insert(name.replace('\\', "/"), fs::read(&path).unwrap());
            }
        }
    }
    let mut found = BTreeMap::new();
    walk(dir.path(), dir.path(), &mut found);
    found
}

#[test]
fn a_raster_figure_is_embedded_as_captured_at_full_resolution() {
    let (dir, root) = project();
    let bytes = png(3000, 2000);
    let file = put(&dir, "plot.png", &bytes);

    let verdicts = prepare_pdf_figures(&root, &[request("f1", &file)]);

    assert_eq!(
        verdicts,
        [FigureVerdict::Image {
            format: FigureFormat::Png,
            bytes
        }]
    );
}

#[test]
fn the_format_comes_from_the_file_name_in_any_case() {
    let (dir, root) = project();
    let jpeg = put(&dir, "a.JPG", b"jpeg bytes");
    let svg = put(&dir, "b.svg", b"<svg/>");
    let gif = put(&dir, "c.gif", b"gif bytes");
    let webp = put(&dir, "d.webp", b"webp bytes");

    let formats: Vec<_> = prepare_pdf_figures(
        &root,
        &[
            request("f1", &jpeg),
            request("f2", &svg),
            request("f3", &gif),
            request("f4", &webp),
        ],
    )
    .into_iter()
    .map(|v| match v {
        FigureVerdict::Image { format, .. } => format,
        other => panic!("expected an image, got {other:?}"),
    })
    .collect();

    assert_eq!(
        formats,
        [
            FigureFormat::Jpeg,
            FigureFormat::Svg,
            FigureFormat::Gif,
            FigureFormat::Webp
        ]
    );
}

#[test]
fn a_very_large_raster_is_reduced_to_a_png_rather_than_embedded_whole() {
    let (dir, root) = project();
    let big = noisy_png(2400, 1200);
    assert!(big.len() > 8 * 1024 * 1024, "{} bytes", big.len());
    let file = put(&dir, "big.png", &big);

    let verdicts = prepare_pdf_figures(&root, &[request("f1", &file)]);

    let FigureVerdict::Image { format, bytes } = &verdicts[0] else {
        panic!("expected a reduced image, got {:?}", verdicts[0]);
    };
    assert_eq!(*format, FigureFormat::Png);
    assert!(bytes.len() < big.len());
    let (width, height) = image::load_from_memory(bytes)
        .map(|i| (i.width(), i.height()))
        .unwrap();
    assert_eq!((width, height), (1024, 512), "proportions are kept");
}

#[test]
fn a_pdf_and_other_unknown_kinds_are_unsupported_not_skipped() {
    let (dir, root) = project();
    let pdf = put(&dir, "plot.pdf", b"%PDF-1.7");
    let other = put(&dir, "plot.xyz", b"?");
    let bare = put(&dir, "plot", b"?");

    assert_eq!(
        prepare_pdf_figures(
            &root,
            &[
                request("f1", &pdf),
                request("f2", &other),
                request("f3", &bare)
            ]
        ),
        vec![FigureVerdict::Unsupported; 3]
    );
}

#[test]
fn a_missing_file_and_a_path_that_is_not_a_version_file_are_reported() {
    let (dir, root) = project();
    fs::write(dir.path().join("_notebook/project.yaml"), "name: x\n").unwrap();

    let verdicts = prepare_pdf_figures(
        &root,
        &[
            request("f1", &format!("{EVIDENCE}/gone.png")),
            request("f2", "_notebook/project.yaml"),
            request("f3", "analysis.R"),
            request("f4", "_notebook/../analysis.R"),
        ],
    );

    assert_eq!(
        verdicts,
        [
            FigureVerdict::Missing,
            FigureVerdict::Refused,
            FigureVerdict::Refused,
            FigureVerdict::Refused
        ]
    );
}

#[test]
fn one_bad_request_does_not_stop_the_others() {
    let (dir, root) = project();
    let good = put(&dir, "ok.png", &png(10, 10));

    let verdicts = prepare_pdf_figures(&root, &[request("f1", "analysis.R"), request("f2", &good)]);

    assert_eq!(verdicts[0], FigureVerdict::Refused);
    assert!(matches!(verdicts[1], FigureVerdict::Image { .. }));
}

#[test]
fn preparing_figures_writes_nothing_at_all() {
    let (dir, root) = project();
    let file = put(&dir, "plot.png", &png(50, 50));
    let big = put(&dir, "big.png", &noisy_png(2400, 1200));
    let before = snapshot(&dir);

    prepare_pdf_figures(&root, &[request("f1", &file), request("f2", &big)]);

    assert_eq!(snapshot(&dir), before);
}
