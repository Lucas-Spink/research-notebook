//! Shared helpers for `nb-export`'s integration tests. Not part of the
//! crate's public API: test scaffolding only.

use typst::layout::{Frame, FrameItem};
use typst_layout::PagedDocument;

/// A tiny valid SVG, standing in for a researcher's own captured figure
/// (see the PDF-embedding finding in `src/lib.rs`: PDF figures need
/// converting to SVG before a PDF/A export can embed them).
#[allow(dead_code)]
pub fn sample_figure_svg() -> Vec<u8> {
    br##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150">
  <rect width="200" height="150" fill="#4477aa"/>
</svg>"##
        .to_vec()
}

/// Concatenates every literal text run in the document's laid-out pages, in
/// order. Used to prove that data reached the page as plain text rather
/// than being interpreted as Typst markup (S1-G07).
pub fn extract_text(document: &PagedDocument) -> String {
    let mut out = String::new();
    for page in document.pages() {
        collect_frame_text(&page.frame, &mut out);
    }
    out
}

fn collect_frame_text(frame: &Frame, out: &mut String) {
    for (_, item) in frame.items() {
        match item {
            FrameItem::Text(text) => out.push_str(&text.text),
            FrameItem::Group(group) => collect_frame_text(&group.frame, out),
            _ => {}
        }
    }
}

/// A small project in the shape `packages/format` writes for the PDF export
/// (`pdf-input.json`): one question, one experiment with formatted text, an
/// artefact line and a combined bibliography.
#[allow(dead_code)]
pub fn sample_project_input() -> serde_json::Value {
    serde_json::json!({
        "schemaVersion": 1,
        "title": "Yeast study",
        "locale": "en-GB",
        "generated": "2026-10-09T12:00:00Z",
        "questions": [{
            "ref": "Q-001",
            "title": "Why does it grow?",
            "motivation": [{"t": "p", "c": [{"t": "text", "s": "Because "}, {"t": "strong", "c": [{"t": "text", "s": "yeast"}]}]}]
        }],
        "experiments": [{
            "ref": "EXP-001",
            "title": "PCA run",
            "status": "complete",
            "question": "Q-001",
            "started": "2026-09-02",
            "completed": null,
            "preamble": [],
            "sections": [{
                "heading": "Methods",
                "blocks": [
                    {"t": "p", "c": [{"t": "text", "s": "Grown overnight, see "}, {"t": "cite", "s": "[@z:u:7XK2PQ9M, p. 4]"}, {"t": "text", "s": "."}]},
                    {"t": "ul", "items": [[{"t": "p", "c": [{"t": "text", "s": "first item"}]}], [{"t": "p", "c": [{"t": "em", "c": [{"t": "text", "s": "second item"}]}]}]]},
                    {"t": "code", "text": "print(1)"}
                ]
            }],
            "artefacts": [{"name": "Volcano plot", "lines": ["Version 1: evidence/volcano.png (100 bytes)"]}],
            "literature": []
        }],
        "bibliography": [[{"t": "text", "s": "1. Smith J. "}, {"t": "em", "c": [{"t": "text", "s": "A study of yeast"}]}, {"t": "text", "s": ". 2020."}]],
        "notExported": []
    })
}
