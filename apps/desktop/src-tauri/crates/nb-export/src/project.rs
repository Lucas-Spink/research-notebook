//! The project PDF (FR-ARC-06, ADR-0056): a fixed template over the project
//! as data, exported as PDF/A-3b with `notebook.json` and `bibliography.json`
//! attached. `packages/format` builds every input; this crate never parses
//! notebook text (AGENTS.md rule 2).

use typst::diag::Warned;
use typst::foundations::Datetime;
use typst_layout::PagedDocument;
use typst_pdf::{PdfOptions, PdfStandard, PdfStandards, Timestamp};

use crate::world::FixedWorld;
use crate::ExportError;

/// The fixed project template. Committed source, never built from runtime strings.
const TEMPLATE: &str = include_str!("project.typ");

/// What the project PDF is made from.
pub struct ProjectPdf<'a> {
    /// `pdf-input.json`: the project as the template reads it. Arbitrary
    /// user-controlled JSON; it is read inside the template with `json()` and
    /// never becomes Typst markup.
    pub input_json: &'a str,
    /// `notebook.json` exactly as the machine-readable export writes it.
    pub notebook_json: &'a [u8],
    /// `bibliography.json` exactly as the project stores it.
    pub bibliography_json: &'a [u8],
}

/// Compiles the project through the fixed template.
pub fn compile_project(project: &ProjectPdf<'_>) -> Result<PagedDocument, ExportError> {
    let world = FixedWorld::new(
        TEMPLATE,
        &[
            ("/data.json", project.input_json.as_bytes()),
            ("/notebook.json", project.notebook_json),
            ("/bibliography.json", project.bibliography_json),
        ],
    )?;
    let Warned { output, .. } = typst::compile::<PagedDocument>(&world);
    output.map_err(ExportError::Compile)
}

/// Exports a compiled document as PDF/A-3b bytes. `timestamp` is injected so
/// output is reproducible; it is also the date PDF/A requires when files are
/// attached.
pub fn to_pdf_a_3b(document: &PagedDocument, timestamp: Datetime) -> Result<Vec<u8>, ExportError> {
    let standards = PdfStandards::new(&[PdfStandard::A_3b]).map_err(ExportError::Standards)?;
    let options = PdfOptions {
        timestamp: Some(Timestamp::new_utc(timestamp)),
        standards,
        ..Default::default()
    };
    typst_pdf::pdf(document, &options).map_err(ExportError::Pdf)
}

/// Compiles the project and exports it as PDF/A-3b, dated by the `generated`
/// time the input names (UTC, to the second), so the same input gives the
/// same bytes and no system clock is read.
pub fn export_project_pdf(project: &ProjectPdf<'_>) -> Result<Vec<u8>, ExportError> {
    let at = generated_at(project.input_json)?;
    let document = compile_project(project)?;
    to_pdf_a_3b(&document, at)
}

/// The `generated` field of the input, as `YYYY-MM-DDTHH:MM:SSZ`.
fn generated_at(input_json: &str) -> Result<Datetime, ExportError> {
    let value: serde_json::Value =
        serde_json::from_str(input_json).map_err(|_| ExportError::BadGenerated)?;
    let text = value
        .get("generated")
        .and_then(serde_json::Value::as_str)
        .ok_or(ExportError::BadGenerated)?;
    parse_utc(text).ok_or(ExportError::BadGenerated)
}

fn parse_utc(text: &str) -> Option<Datetime> {
    let digits = |from: usize, to: usize| -> Option<u32> {
        let part = text.get(from..to)?;
        part.bytes()
            .all(|b| b.is_ascii_digit())
            .then(|| part.parse().ok())?
    };
    let shaped = text.len() == 20
        && text.get(4..5) == Some("-")
        && text.get(7..8) == Some("-")
        && text.get(10..11) == Some("T")
        && text.get(13..14) == Some(":")
        && text.get(16..17) == Some(":")
        && text.get(19..20) == Some("Z");
    if !shaped {
        return None;
    }
    Datetime::from_ymd_hms(
        i32::try_from(digits(0, 4)?).ok()?,
        u8::try_from(digits(5, 7)?).ok()?,
        u8::try_from(digits(8, 10)?).ok()?,
        u8::try_from(digits(11, 13)?).ok()?,
        u8::try_from(digits(14, 16)?).ok()?,
        u8::try_from(digits(17, 19)?).ok()?,
    )
}
