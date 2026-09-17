//! Shared helpers for `nb-export`'s integration tests. Not part of the
//! crate's public API: test scaffolding only.

use typst::layout::{Frame, FrameItem};
use typst_layout::PagedDocument;

/// A tiny valid SVG, standing in for a researcher's own captured figure
/// (see the PDF-embedding finding in `src/lib.rs`: PDF figures need
/// converting to SVG before a PDF/A export can embed them).
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
