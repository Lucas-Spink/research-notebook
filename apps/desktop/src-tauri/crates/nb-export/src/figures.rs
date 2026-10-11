//! The captured figures the project PDF shows (issue #102, ADR-0056 update).
//!
//! Figures reach the fixed template the way everything else does, as data: each
//! is served as the virtual file `/figures/<id>`, and a generated
//! `/figures.json` tells the template which ones it can show and why it
//! cannot show the rest. The template never learns a path from the researcher;
//! the ids are checked here, and the format of each image is named by this
//! crate from a short list, never taken from a file name.
//!
//! An image that cannot be decoded must not cost the researcher the whole PDF,
//! so each is test-compiled alone first, and one that fails is reported in the
//! document instead.

use typst::diag::Warned;
use typst_layout::PagedDocument;

use crate::world::FixedWorld;
use crate::ExportError;

/// The image formats the PDF can show.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageKind {
    Png,
    Jpeg,
    Gif,
    Webp,
    Svg,
}

impl ImageKind {
    /// The name Typst's `image(format: ...)` takes.
    fn name(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Gif => "gif",
            Self::Webp => "webp",
            Self::Svg => "svg",
        }
    }

    /// A one-image document, written out in full per format: the check never
    /// builds Typst source from a value.
    fn check_template(self) -> &'static str {
        match self {
            Self::Png => r#"#image(read("/figure", encoding: none), format: "png")"#,
            Self::Jpeg => r#"#image(read("/figure", encoding: none), format: "jpg")"#,
            Self::Gif => r#"#image(read("/figure", encoding: none), format: "gif")"#,
            Self::Webp => r#"#image(read("/figure", encoding: none), format: "webp")"#,
            Self::Svg => r#"#image(read("/figure", encoding: none), format: "svg")"#,
        }
    }
}

/// Why a figure is not in the PDF. The template words each in fixed text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Omission {
    /// The captured file is not there.
    Missing,
    /// A kind of file the PDF cannot show, such as a PDF (PDF/A refuses to
    /// embed one, ADR-0015).
    Unsupported,
    /// Too large, not decodable or not readable.
    Unavailable,
}

impl Omission {
    fn status(self) -> &'static str {
        match self {
            Self::Missing => "missing",
            Self::Unsupported => "unsupported",
            Self::Unavailable => "unavailable",
        }
    }
}

/// What the PDF has for one figure.
#[derive(Debug, Clone, Copy)]
pub enum FigureContent<'a> {
    Image { kind: ImageKind, bytes: &'a [u8] },
    Omitted(Omission),
}

/// One figure the project input names by `id`.
#[derive(Debug, Clone, Copy)]
pub struct PdfFigure<'a> {
    /// Letters and digits only; the same id the input's artefact carries.
    pub id: &'a str,
    pub content: FigureContent<'a>,
}

/// The longest id accepted.
const MAX_ID: usize = 16;

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= MAX_ID && id.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// Whether Typst can lay `bytes` out as an image of this kind.
fn decodes(kind: ImageKind, bytes: &[u8]) -> bool {
    let Ok(world) = FixedWorld::new(kind.check_template(), &[("/figure", bytes)]) else {
        return false;
    };
    let Warned { output, .. } = typst::compile::<PagedDocument>(&world);
    output.is_ok()
}

/// The virtual files to serve, and the `/figures.json` that says what each is.
pub(crate) struct Served {
    pub files: Vec<(String, Vec<u8>)>,
    pub manifest: String,
    /// How many figures the document will say it could not show.
    pub omitted: u32,
}

/// Checks the ids, test-compiles every image and builds what the template reads.
pub(crate) fn serve(figures: &[PdfFigure<'_>]) -> Result<Served, ExportError> {
    let mut files = Vec::new();
    let mut manifest = serde_json::Map::new();
    let mut omitted = 0u32;
    for figure in figures {
        if !valid_id(figure.id) {
            return Err(ExportError::InvalidFigureId);
        }
        let entry = match figure.content {
            FigureContent::Omitted(why) => {
                omitted += 1;
                serde_json::json!({ "status": why.status() })
            }
            FigureContent::Image { kind, bytes } if decodes(kind, bytes) => {
                files.push((format!("/figures/{}", figure.id), bytes.to_vec()));
                serde_json::json!({ "status": "ok", "format": kind.name() })
            }
            FigureContent::Image { .. } => {
                omitted += 1;
                serde_json::json!({ "status": Omission::Unavailable.status() })
            }
        };
        manifest.insert(figure.id.to_owned(), entry);
    }
    Ok(Served {
        files,
        manifest: serde_json::Value::Object(manifest).to_string(),
        omitted,
    })
}
