//! S1-T06 spike evidence: one experiment's JSON, plus a PDF figure, renders
//! through the fixed Typst template to a PDF/A-2b document (spec 7.12).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod support;

use typst::foundations::Datetime;

const EXPERIMENT_JSON: &str = r#"{
  "title": "Yeast growth at 30C",
  "notes": "OD600 measured every hour; see attached growth curve.",
  "figure-caption": "Growth curve, replicate 1"
}"#;

#[test]
fn renders_experiment_json_and_figure_to_pdf_a_2b() {
    let figure = support::sample_figure_svg();

    let document = nb_export::compile(EXPERIMENT_JSON, &figure)
        .expect("template must compile with valid experiment data");
    assert_eq!(document.pages().len(), 1);

    let text = support::extract_text(&document);
    assert!(text.contains("Yeast growth at 30C"));
    assert!(text.contains("OD600 measured every hour"));
    assert!(text.contains("Growth curve, replicate 1"));

    let timestamp = Datetime::from_ymd_hms(2026, 9, 17, 12, 0, 0)
        .expect("2026-09-17 12:00:00 is a valid datetime");
    let pdf = nb_export::to_pdf_a_2b(&document, timestamp)
        .expect("a compiled document must export to PDF/A-2b");

    // A real conformance check runs in the nightly veraPDF step (S1-G06);
    // here we only prove typst-pdf accepted the PDF/A-2b standard and
    // produced a well-formed PDF file.
    assert!(pdf.starts_with(b"%PDF-1.7") || pdf.starts_with(b"%PDF-2.0"));
    assert!(pdf.len() > 1_000, "PDF/A output looks too small to be real");
}

#[test]
fn rejects_malformed_experiment_json_without_writing_markup() {
    let figure = support::sample_figure_svg();

    let result = nb_export::compile("{ not valid json", &figure);

    assert!(
        result.is_err(),
        "malformed data must fail to compile, not be papered over"
    );
}
