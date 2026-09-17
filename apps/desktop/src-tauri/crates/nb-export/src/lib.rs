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

use typst::diag::{FileError, FileResult, SourceDiagnostic, Warned};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use typst_kit::fonts::FontStore;
use typst_layout::PagedDocument;
use typst_pdf::{PdfOptions, PdfStandard, PdfStandards, Timestamp};

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
    let world = TemplateWorld::new(experiment_json, figure_svg)?;
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

/// Serves exactly three virtual files to the Typst compiler: the fixed
/// template, one experiment's JSON data, and one figure image. Nothing else
/// resolves, so the template cannot reach outside what this call was given.
struct TemplateWorld {
    library: LazyHash<Library>,
    fonts: FontStore,
    main_id: FileId,
    main_source: Source,
    data_id: FileId,
    data_bytes: Bytes,
    figure_id: FileId,
    figure_bytes: Bytes,
}

impl TemplateWorld {
    fn new(experiment_json: &str, figure_svg: &[u8]) -> Result<Self, ExportError> {
        let main_id = virtual_file_id("/main.typ")?;
        let data_id = virtual_file_id("/data.json")?;
        let figure_id = virtual_file_id("/figure.svg")?;

        let mut fonts = FontStore::new();
        fonts.extend(typst_kit::fonts::embedded());

        Ok(Self {
            library: LazyHash::new(Library::builder().build()),
            fonts,
            main_id,
            main_source: Source::new(main_id, TEMPLATE.to_string()),
            data_id,
            data_bytes: Bytes::new(experiment_json.as_bytes().to_vec()),
            figure_id,
            figure_bytes: Bytes::new(figure_svg.to_vec()),
        })
    }
}

impl World for TemplateWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        self.fonts.book()
    }

    fn main(&self) -> FileId {
        self.main_id
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.main_id {
            Ok(self.main_source.clone())
        } else {
            Err(FileError::NotSource)
        }
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if id == self.data_id {
            Ok(self.data_bytes.clone())
        } else if id == self.figure_id {
            Ok(self.figure_bytes.clone())
        } else {
            Err(FileError::NotFound(id.vpath().get_without_slash().into()))
        }
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.font(index)
    }

    // The template never calls Typst's `datetime()` function, so a fixed
    // `None` is correct here; the PDF's own creation-date metadata is set
    // explicitly and deterministically via `to_pdf_a_2b`'s `timestamp`.
    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        None
    }
}

fn virtual_file_id(path: &str) -> Result<FileId, ExportError> {
    let vpath = VirtualPath::new(path).map_err(ExportError::InvalidVirtualPath)?;
    Ok(FileId::new(RootedPath::new(VirtualRoot::Project, vpath)))
}
