//! S6-T06 (FR-ARC-06, ADR-0056): the project PDF is PDF/A-3b with
//! `notebook.json` and `bibliography.json` embedded, built from a fixed
//! template that reads the project as data.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod support;

use nb_export::ProjectPdf;
use serde_json::json;
use typst::foundations::Datetime;

const NOTEBOOK: &[u8] = br#"{"schemaVersion":1}"#;
const BIBLIOGRAPHY: &[u8] = br#"[{"id":"z:u:7XK2PQ9M"}]"#;

fn timestamp() -> Datetime {
    Datetime::from_ymd_hms(2026, 10, 9, 12, 0, 0).unwrap()
}

fn export(input: &serde_json::Value) -> Vec<u8> {
    let text = input.to_string();
    let project = ProjectPdf {
        input_json: &text,
        notebook_json: NOTEBOOK,
        bibliography_json: BIBLIOGRAPHY,
    };
    let document = nb_export::compile_project(&project).unwrap();
    nb_export::to_pdf_a_3b(&document, timestamp()).unwrap()
}

fn contains(haystack: &[u8], needle: &str) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle.as_bytes())
}

#[test]
fn the_pdf_declares_pdf_a_3b() {
    let pdf = export(&support::sample_project_input());

    assert!(pdf.starts_with(b"%PDF-"));
    assert!(contains(&pdf, "<pdfaid:part>3</pdfaid:part>"));
    assert!(contains(&pdf, "<pdfaid:conformance>B</pdfaid:conformance>"));
}

#[test]
fn both_json_files_are_embedded_with_a_type_a_description_and_a_relationship() {
    let pdf = export(&support::sample_project_input());

    for name in ["notebook.json", "bibliography.json"] {
        assert!(contains(&pdf, &format!("({name})")), "{name} is not named");
    }
    assert!(contains(&pdf, "/EmbeddedFile"));
    assert!(contains(&pdf, "/AFRelationship"));
    assert!(contains(&pdf, "application#2Fjson"));
}

#[test]
fn the_project_text_reaches_the_page_including_the_combined_bibliography() {
    let input = support::sample_project_input();
    let text = input.to_string();
    let project = ProjectPdf {
        input_json: &text,
        notebook_json: NOTEBOOK,
        bibliography_json: BIBLIOGRAPHY,
    };

    let document = nb_export::compile_project(&project).unwrap();
    let page_text = support::extract_text(&document);

    for expected in [
        "Yeast study",
        "Why does it grow?",
        "EXP-001",
        "first item",
        "second item",
        "print(1)",
        "[@z:u:7XK2PQ9M, p. 4]",
        "Volcano plot",
        "Bibliography",
        "A study of yeast",
    ] {
        assert!(page_text.contains(expected), "{expected:?} is missing");
    }
}

#[test]
fn wording_that_would_be_markup_stays_literal_text() {
    let mut input = support::sample_project_input();
    let hostile = "#read(\"/etc/passwd\") $1+1$ #{ 1 + 1 } // not a comment";
    input["title"] = json!(hostile);
    input["experiments"][0]["title"] = json!(hostile);
    input["experiments"][0]["sections"][0]["blocks"][0] =
        json!({"t": "p", "c": [{"t": "text", "s": hostile}]});
    let text = input.to_string();
    let project = ProjectPdf {
        input_json: &text,
        notebook_json: NOTEBOOK,
        bibliography_json: BIBLIOGRAPHY,
    };

    let document = nb_export::compile_project(&project).unwrap();

    assert!(support::extract_text(&document).contains("#read(\"/etc/passwd\")"));
}

#[test]
fn the_same_project_and_time_give_the_same_bytes() {
    let input = support::sample_project_input();
    assert_eq!(export(&input), export(&input));
}

#[test]
fn input_that_is_not_json_is_refused_not_papered_over() {
    let project = ProjectPdf {
        input_json: "{ not valid json",
        notebook_json: NOTEBOOK,
        bibliography_json: BIBLIOGRAPHY,
    };
    assert!(nb_export::compile_project(&project).is_err());
}

#[test]
fn the_pdf_is_dated_by_the_time_the_input_names() {
    let text = support::sample_project_input().to_string();
    let project = ProjectPdf {
        input_json: &text,
        notebook_json: NOTEBOOK,
        bibliography_json: BIBLIOGRAPHY,
    };

    let pdf = nb_export::export_project_pdf(&project).unwrap();

    assert!(contains(&pdf, "2026-10-09T12:00:00"));
    assert!(contains(&pdf, "<pdfaid:part>3</pdfaid:part>"));
}

#[test]
fn input_without_a_valid_generated_time_is_refused() {
    for bad in [
        json!(null),
        json!("yesterday"),
        json!("2026-13-40T99:00:00Z"),
    ] {
        let mut input = support::sample_project_input();
        input["generated"] = bad;
        let text = input.to_string();
        let project = ProjectPdf {
            input_json: &text,
            notebook_json: NOTEBOOK,
            bibliography_json: BIBLIOGRAPHY,
        };
        assert!(nb_export::export_project_pdf(&project).is_err());
    }
}
