//! S1-G07: proves that whatever a researcher's notes contain, it reaches
//! the rendered page as literal text rather than being evaluated as Typst
//! markup or code (ADR-0007, spec line "Typst templates receive user text
//! only as data values").
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod support;

use serde_json::json;

/// Strings that would do something if they were ever spliced into `.typ`
/// markup and evaluated: a function call, a math-mode expression, a raw
/// code block, and an attempted file read. If our design is right, none of
/// this is markup at all — it is a JSON string value read back through
/// `json()`, so Typst never parses it as source.
const MALICIOUS_NOTES: &[&str] = &[
    r#"#read("/etc/passwd")"#,
    "$1 + 1$ should not become math",
    "#{ 1 + 1 }",
    "#import \"@preview/definitely-not-a-real-package\": *",
    "// a comment that should stay literal, not vanish",
    "back\\slash and #hash and $dollar together: #$\\#",
];

fn render_with_notes(notes: &str) -> (typst_layout::PagedDocument, String) {
    let figure = support::sample_figure_svg();
    let data = json!({
        "title": "Injection probe",
        "notes": notes,
        "figure-caption": "n/a",
    })
    .to_string();

    let document = nb_export::compile(&data, &figure)
        .unwrap_or_else(|err| panic!("notes {notes:?} must compile literally, got {err:?}"));
    let text = support::extract_text(&document);
    (document, text)
}

#[test]
fn injection_typst_syntax_in_notes_renders_literally_for_each_case() {
    for notes in MALICIOUS_NOTES {
        let (_document, text) = render_with_notes(notes);
        assert!(
            text.contains(notes),
            "expected the literal string {notes:?} in the rendered text, got: {text:?}"
        );
    }
}

#[test]
fn injection_attempt_does_not_change_the_fixed_page_count() {
    // The template always lays out exactly one page. If user text could
    // reach Typst as markup, a crafted `#pagebreak()`-like payload could
    // change that; it cannot, because it is only ever read as a JSON value.
    let (document, _) = render_with_notes("#pagebreak() #pagebreak() #pagebreak()");
    assert_eq!(document.pages().len(), 1);
}
