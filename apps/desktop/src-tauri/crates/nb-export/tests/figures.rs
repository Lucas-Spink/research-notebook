//! Issue #102 (ADR-0056 update): the project PDF shows the captured figures
//! of the experiments it lists, embedded in the document, each beside its
//! caption, and says so, visibly, for one it cannot show.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod support;

use nb_export::{FigureContent, ImageKind, Omission, PdfFigure, ProjectPdf};
use typst::foundations::Datetime;
use typst::layout::{Frame, FrameItem};
use typst_layout::PagedDocument;

fn timestamp() -> Datetime {
    Datetime::from_ymd_hms(2026, 10, 11, 12, 0, 0).unwrap()
}

fn compile(input: &serde_json::Value, figures: &[PdfFigure<'_>]) -> PagedDocument {
    let text = input.to_string();
    nb_export::compile_project(&ProjectPdf {
        input_json: &text,
        notebook_json: b"{}",
        bibliography_json: b"[]",
        figures,
    })
    .unwrap()
}

fn image<'a>(id: &'a str, bytes: &'a [u8], kind: ImageKind) -> PdfFigure<'a> {
    PdfFigure {
        id,
        content: FigureContent::Image { kind, bytes },
    }
}

/// The size, in points, of every image the laid-out pages hold.
fn images(document: &PagedDocument) -> Vec<(f64, f64)> {
    fn walk(frame: &Frame, found: &mut Vec<(f64, f64)>) {
        for (_, item) in frame.items() {
            match item {
                FrameItem::Image(_, size, _) => found.push((size.x.to_pt(), size.y.to_pt())),
                FrameItem::Group(group) => walk(&group.frame, found),
                _ => {}
            }
        }
    }
    let mut found = Vec::new();
    for page in document.pages() {
        walk(&page.frame, &mut found);
    }
    found
}

/// A valid grey PNG of the given size, written by hand (stored, not
/// compressed) so the tests need no image library.
fn png(width: u32, height: u32) -> Vec<u8> {
    fn crc(bytes: &[u8]) -> u32 {
        let mut c = 0xFFFF_FFFFu32;
        for &b in bytes {
            c ^= u32::from(b);
            for _ in 0..8 {
                c = if c & 1 == 1 {
                    0xEDB8_8320 ^ (c >> 1)
                } else {
                    c >> 1
                };
            }
        }
        !c
    }
    fn adler(bytes: &[u8]) -> u32 {
        let (mut a, mut b) = (1u32, 0u32);
        for &x in bytes {
            a = (a + u32::from(x)) % 65521;
            b = (b + a) % 65521;
        }
        (b << 16) | a
    }
    fn chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
        let mut out = u32::try_from(data.len()).unwrap().to_be_bytes().to_vec();
        let mut body = kind.to_vec();
        body.extend_from_slice(data);
        out.extend_from_slice(&body);
        out.extend_from_slice(&crc(&body).to_be_bytes());
        out
    }
    let mut raw = Vec::new();
    for _ in 0..height {
        raw.push(0);
        raw.extend(std::iter::repeat_n(0x80, width as usize));
    }
    let mut zlib = vec![0x78, 0x01];
    let mut rest = raw.as_slice();
    while !rest.is_empty() {
        let n = rest.len().min(65535);
        zlib.push(u8::from(n == rest.len()));
        let n16 = u16::try_from(n).unwrap();
        zlib.extend_from_slice(&n16.to_le_bytes());
        zlib.extend_from_slice(&(!n16).to_le_bytes());
        zlib.extend_from_slice(&rest[..n]);
        rest = &rest[n..];
    }
    zlib.extend_from_slice(&adler(&raw).to_be_bytes());
    let mut header = width.to_be_bytes().to_vec();
    header.extend_from_slice(&height.to_be_bytes());
    header.extend_from_slice(&[8, 0, 0, 0, 0]);
    let mut out = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    out.extend(chunk(b"IHDR", &header));
    out.extend(chunk(b"IDAT", &zlib));
    out.extend(chunk(b"IEND", &[]));
    out
}

/// The sample project with one artefact per id, each naming a figure.
fn input_with_figures(ids: &[&str]) -> serde_json::Value {
    let mut input = support::sample_project_input();
    input["schemaVersion"] = serde_json::json!(2);
    input["experiments"][0]["artefacts"] = serde_json::json!(ids
        .iter()
        .map(|id| serde_json::json!({
            "name": format!("Plot {id}"),
            "lines": ["Version 1: evidence/plot.png"],
            "figure": {
                "id": id,
                "caption": format!("Plot {id} (evidence/plot.png, version 1)"),
            }
        }))
        .collect::<Vec<_>>());
    input
}

#[test]
fn a_figure_is_embedded_with_its_caption_and_keeps_its_proportions() {
    let png = png(400, 200);
    let document = compile(
        &input_with_figures(&["f1"]),
        &[image("f1", &png, ImageKind::Png)],
    );

    let shown = images(&document);
    assert_eq!(shown.len(), 1);
    let (width, height) = shown[0];
    assert!((width / height - 2.0).abs() < 0.01, "{width} x {height}");
    assert!(support::extract_text(&document).contains("Plot f1 (evidence/plot.png, version 1)"));
}

#[test]
fn a_figure_wider_than_the_page_is_scaled_down_not_cropped() {
    let png = png(3000, 1500);
    let document = compile(
        &input_with_figures(&["f1"]),
        &[image("f1", &png, ImageKind::Png)],
    );

    let (width, height) = images(&document)[0];
    // A4 with 2 cm margins leaves about 481 pt.
    assert!(width <= 482.0, "{width}");
    assert!((width / height - 2.0).abs() < 0.01);
}

#[test]
fn a_very_tall_figure_fits_on_a_page() {
    let png = png(300, 3000);
    let document = compile(
        &input_with_figures(&["f1"]),
        &[image("f1", &png, ImageKind::Png)],
    );

    let (width, height) = images(&document)[0];
    assert!(height <= 570.0, "{height}");
    assert!((width / height - 0.1).abs() < 0.005);
}

#[test]
fn a_small_figure_is_not_enlarged() {
    let png = png(60, 40);
    let document = compile(
        &input_with_figures(&["f1"]),
        &[image("f1", &png, ImageKind::Png)],
    );

    let (width, _) = images(&document)[0];
    assert!(width <= 61.0, "{width}");
}

#[test]
fn an_svg_figure_is_embedded() {
    let svg = support::sample_figure_svg();
    let document = compile(
        &input_with_figures(&["f1"]),
        &[image("f1", &svg, ImageKind::Svg)],
    );

    assert_eq!(images(&document).len(), 1);
}

#[test]
fn several_figures_each_appear_once_in_order() {
    let a = png(100, 100);
    let b = png(200, 100);
    let document = compile(
        &input_with_figures(&["f1", "f2"]),
        &[
            image("f1", &a, ImageKind::Png),
            image("f2", &b, ImageKind::Png),
        ],
    );

    let sizes = images(&document);
    assert_eq!(sizes.len(), 2);
    assert!(sizes[0].0 < sizes[1].0);
}

#[test]
fn a_figure_that_cannot_be_shown_says_so_where_it_would_have_been() {
    for (omission, wording) in [
        (Omission::Missing, "file is missing"),
        (Omission::Unsupported, "format cannot be shown"),
        (Omission::Unavailable, "could not be read"),
    ] {
        let document = compile(
            &input_with_figures(&["f1"]),
            &[PdfFigure {
                id: "f1",
                content: FigureContent::Omitted(omission),
            }],
        );

        assert!(images(&document).is_empty());
        let text = support::extract_text(&document);
        assert!(text.contains("Figure not included"), "{text}");
        assert!(text.contains(wording), "{wording}: {text}");
        assert!(text.contains("Plot f1"), "the caption still names it");
    }
}

#[test]
fn bytes_that_are_not_the_image_they_claim_are_reported_not_fatal() {
    let document = compile(
        &input_with_figures(&["f1", "f2"]),
        &[
            image("f1", b"not a png", ImageKind::Png),
            image("f2", b"<svg this is broken", ImageKind::Svg),
        ],
    );

    assert!(images(&document).is_empty());
    assert_eq!(
        support::extract_text(&document)
            .matches("Figure not included")
            .count(),
        2
    );
}

#[test]
fn a_figure_the_input_names_but_the_exporter_was_not_given_is_reported() {
    let document = compile(&input_with_figures(&["f9"]), &[]);

    assert!(support::extract_text(&document).contains("Figure not included"));
}

#[test]
fn a_figure_id_that_could_name_another_path_is_refused() {
    let png = png(10, 10);
    let text = input_with_figures(&["f1"]).to_string();
    for bad in ["../f1", "a/b", "", "f 1", "f1.svg"] {
        let result = nb_export::compile_project(&ProjectPdf {
            input_json: &text,
            notebook_json: b"{}",
            bibliography_json: b"[]",
            figures: &[image(bad, &png, ImageKind::Png)],
        });
        assert!(result.is_err(), "{bad:?} was accepted");
    }
}

#[test]
fn a_pdf_with_figures_is_still_pdf_a_3b() {
    let png = png(100, 100);
    let document = compile(
        &input_with_figures(&["f1"]),
        &[image("f1", &png, ImageKind::Png)],
    );

    let pdf = nb_export::to_pdf_a_3b(&document, timestamp()).unwrap();

    assert!(pdf.starts_with(b"%PDF-"));
    let marker = b"<pdfaid:part>3</pdfaid:part>";
    assert!(pdf.windows(marker.len()).any(|w| w == marker));
}

#[test]
fn the_export_counts_the_figures_it_could_not_show() {
    let png = png(100, 100);
    let input = input_with_figures(&["f1", "f2", "f3"]).to_string();

    let exported = nb_export::export_project_pdf_reporting(&ProjectPdf {
        input_json: &input,
        notebook_json: b"{}",
        bibliography_json: b"[]",
        figures: &[
            image("f1", &png, ImageKind::Png),
            image("f2", b"not a png", ImageKind::Png),
            PdfFigure {
                id: "f3",
                content: FigureContent::Omitted(Omission::Missing),
            },
        ],
    })
    .unwrap();

    assert_eq!(exported.figures_omitted, 2);
    assert!(exported.pdf.starts_with(b"%PDF-"));
}

#[test]
fn caption_text_that_looks_like_typst_is_printed_literally() {
    let png = png(10, 10);
    let mut input = input_with_figures(&["f1"]);
    input["experiments"][0]["artefacts"][0]["figure"]["caption"] =
        serde_json::json!("#read(\"/etc/passwd\") $1+1$ #{1+1}");

    let document = compile(&input, &[image("f1", &png, ImageKind::Png)]);

    let text = support::extract_text(&document);
    assert!(text.contains("#read(\"/etc/passwd\")"), "{text}");
}
