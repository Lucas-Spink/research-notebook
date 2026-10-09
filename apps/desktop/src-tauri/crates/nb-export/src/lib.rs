//! Spike for S1-T06: embeds Typst as a Rust library to render one
//! experiment's data to PDF/A-2b (spec 7.12, FR-ARC-06, ADR-0007).
//!
//! The only Typst markup source involved is the fixed, committed template
//! in `template.typ`. Every value that comes from the user (title, notes,
//! the captured figure) is served to Typst as *data* through [`World::file`]
//! — never formatted or concatenated into `.typ` source text — so however a
//! researcher's notes are worded, they cannot become Typst markup. This is
//! exactly ADR-0007's requirement and is exercised by `tests/injection.rs`.
//!
//! This is spike evidence, not the production exporter. In particular, the
//! caller is expected to already hold the experiment as JSON text (produced
//! by `packages/format`, the single parser per AGENTS.md section 2); this
//! crate never parses notebook Markdown or YAML itself.
//!
//! Spike finding: `typst-pdf` 0.15.1 refuses to embed a raw PDF image when
//! a PDF/A standard is requested (`ValidationError::EmbeddedPDF`, hinting
//! "try converting the PDF to an SVG before embedding it"), even though the
//! same embed succeeds for a plain, non-archival PDF. So the figure served
//! to the template here is SVG, not the PDF format named in the task's
//! definition of done; a production exporter would need to rasterise or
//! vectorise a PDF figure before this step. Worth carrying into the
//! ADR-0007 update (S1-T11).

use typst::diag::{SourceDiagnostic, Warned};
use typst::foundations::Datetime;
use typst_layout::PagedDocument;
use typst_pdf::{PdfOptions, PdfStandard, PdfStandards, Timestamp};

mod project;
mod world;

pub use project::{compile_project, export_project_pdf, to_pdf_a_3b, ProjectPdf};
use world::FixedWorld;

/// The fixed export template. Committed source, reviewed like any other
/// code; never built from runtime strings.
const TEMPLATE: &str = include_str!("template.typ");

#[derive(Debug, thiserror::Error)]
pub enum ExportError {
    #[error("could not build an internal virtual path: {0:?}")]
    InvalidVirtualPath(typst::syntax::PathError),
    #[error("failed to compile the export template: {0:?}")]
    Compile(typst::ecow::EcoVec<SourceDiagnostic>),
    #[error("requested PDF/A standard is not usable: {0:?}")]
    Standards(typst::diag::HintedString),
    #[error("failed to export the compiled document to PDF: {0:?}")]
    Pdf(typst::ecow::EcoVec<SourceDiagnostic>),
    #[error("the input has no valid `generated` time (UTC, YYYY-MM-DDTHH:MM:SSZ)")]
    BadGenerated,
}

/// Compiles `experiment_json` and `figure_svg` through the fixed template
/// into a laid-out document, ready for export to any Typst output format.
///
/// `experiment_json` is arbitrary user-controlled JSON text; it is read back
/// inside the template via `json("/data.json")` and never touches Typst
/// markup source. `figure_svg` is the bytes of one captured figure image
/// (SVG — see the module-level PDF-embedding finding), embedded via
/// `image("/figure.svg")`.
pub fn compile(experiment_json: &str, figure_svg: &[u8]) -> Result<PagedDocument, ExportError> {
    let world = FixedWorld::new(
        TEMPLATE,
        &[
            ("/data.json", experiment_json.as_bytes()),
            ("/figure.svg", figure_svg),
        ],
    )?;
    let Warned { output, .. } = typst::compile::<PagedDocument>(&world);
    output.map_err(ExportError::Compile)
}

/// Exports a compiled document to PDF/A-2b bytes.
///
/// `timestamp` is injected rather than read from the system clock so output
/// is reproducible (spec testing guide: pure functions receive their clock).
pub fn to_pdf_a_2b(document: &PagedDocument, timestamp: Datetime) -> Result<Vec<u8>, ExportError> {
    let standards = PdfStandards::new(&[PdfStandard::A_2b]).map_err(ExportError::Standards)?;
    let options = PdfOptions {
        timestamp: Some(Timestamp::new_utc(timestamp)),
        standards,
        ..Default::default()
    };
    typst_pdf::pdf(document, &options).map_err(ExportError::Pdf)
}
