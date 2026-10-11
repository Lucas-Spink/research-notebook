//! The project PDF (FR-ARC-06, ADR-0056). `packages/format` builds what the
//! fixed Typst template reads and the `notebook.json` to embed; this command
//! compiles them with `nb-export` and stores `project-<stamp>.pdf` under
//! `_notebook/exports/pdf/`, one file per run so an earlier PDF is kept
//! (issue #102), so Rust never parses or builds notebook text.

use nb_archive::{ExportStamp, FigureFormat, FigureRequest, FigureVerdict, FileVerdict};
use nb_export::{
    export_project_pdf_reporting, FigureContent, ImageKind, Omission, PdfFigure, ProjectPdf,
};
use nb_fs::lock::LockRegistry;
use nb_fs::ProjectRoot;
use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;
use tauri::State;

use super::export_run::ExportRun;
use super::folders::{FolderHandle, PickedFolders};
use super::history::writable;
use super::lock::with_root;
use super::preview::VersionPath;
use super::types::ProjectError;

/// The id of a figure in the PDF input, such as `f1`: letters and digits only,
/// so it can never name a path. It is the id `packages/format` gave the figure.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct FigureId(String);

impl FigureId {
    fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for FigureId {
    type Error = String;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        let plain =
            !text.is_empty() && text.len() <= 16 && text.bytes().all(|b| b.is_ascii_alphanumeric());
        if plain {
            Ok(Self(text))
        } else {
            Err("a figure id is letters and digits only (at most 16)".to_owned())
        }
    }
}

// Written by hand for the same reason as `VersionPath`: `#[serde(try_from)]`
// makes the generated bindings split the type in two.
impl<'de> Deserialize<'de> for FigureId {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::try_from(String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

/// A captured image the PDF should show: its id in the input and the
/// project-relative path of the captured version file.
#[derive(Debug, Clone, Deserialize, Type)]
pub struct PdfFigureRequest {
    pub id: FigureId,
    pub file: VersionPath,
}

/// The texts the PDF is made from, all built by `packages/format` except
/// `bibliography_json`, which is the project's own file, and the figures, which
/// are read from the captured files here.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportInput {
    pub input_json: String,
    pub notebook_json: String,
    pub bibliography_json: String,
    pub figures: Vec<PdfFigureRequest>,
}

/// How the export ended. Carries no system text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PdfExportOutcome {
    /// `figures_omitted` figures are named in the PDF as not included.
    #[serde(rename_all = "camelCase")]
    Written {
        figures_omitted: u32,
    },
    /// The inputs did not make a valid PDF/A document; nothing was written.
    NotBuilt,
    WriteFailed,
}

fn format_of(format: FigureFormat) -> ImageKind {
    match format {
        FigureFormat::Png => ImageKind::Png,
        FigureFormat::Jpeg => ImageKind::Jpeg,
        FigureFormat::Gif => ImageKind::Gif,
        FigureFormat::Webp => ImageKind::Webp,
        FigureFormat::Svg => ImageKind::Svg,
    }
}

fn content_of(verdict: &FigureVerdict) -> FigureContent<'_> {
    match verdict {
        FigureVerdict::Image { format, bytes } => FigureContent::Image {
            kind: format_of(*format),
            bytes,
        },
        FigureVerdict::Unsupported => FigureContent::Omitted(Omission::Unsupported),
        FigureVerdict::Missing => FigureContent::Omitted(Omission::Missing),
        FigureVerdict::Unavailable | FigureVerdict::Refused => {
            FigureContent::Omitted(Omission::Unavailable)
        }
    }
}

pub(super) fn build_and_store(
    root: &ProjectRoot,
    stamp: &ExportStamp,
    input: &PdfExportInput,
) -> PdfExportOutcome {
    let requests: Vec<FigureRequest> = input
        .figures
        .iter()
        .map(|f| FigureRequest {
            id: f.id.as_str().to_owned(),
            file: f.file.as_str().to_owned(),
        })
        .collect();
    let verdicts = nb_archive::prepare_pdf_figures(root, &requests);
    let figures: Vec<PdfFigure<'_>> = input
        .figures
        .iter()
        .zip(&verdicts)
        .map(|(request, verdict)| PdfFigure {
            id: request.id.as_str(),
            content: content_of(verdict),
        })
        .collect();
    let exported = export_project_pdf_reporting(&ProjectPdf {
        input_json: &input.input_json,
        notebook_json: input.notebook_json.as_bytes(),
        bibliography_json: input.bibliography_json.as_bytes(),
        figures: &figures,
    });
    let Ok(exported) = exported else {
        return PdfExportOutcome::NotBuilt;
    };
    match nb_archive::write_project_pdf(root, stamp, &exported.pdf) {
        FileVerdict::Written => PdfExportOutcome::Written {
            figures_omitted: exported.figures_omitted,
        },
        FileVerdict::Refused | FileVerdict::WriteFailed => PdfExportOutcome::WriteFailed,
    }
}

/// Writes the project PDF/A-3b into `_notebook/exports/pdf/` as
/// `project-<stamp>.pdf` (FR-ARC-06); the PDF of an earlier run is kept.
/// The captured figures it names are only read. Refused, with nothing
/// written, unless this application holds the project's lock.
#[tauri::command]
#[specta::specta]
pub async fn write_pdf_export(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
    run: ExportRun,
    input: PdfExportInput,
) -> Result<PdfExportOutcome, ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        writable(locks.health(&root))?;
        let stamp = run.stamp().map_err(|_| ProjectError::WriteFailed)?;
        Ok(build_and_store(&root, &stamp, &input))
    })
    .await
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these write fixture files.
#[allow(clippy::unwrap_used, clippy::disallowed_methods)]
mod tests {
    use super::*;

    const INPUT: &str = r#"{
      "schemaVersion": 1, "title": "Yeast", "locale": "en-GB",
      "generated": "2026-10-09T12:00:00Z",
      "questions": [], "experiments": [], "bibliography": [], "notExported": []
    }"#;

    fn stamp() -> ExportStamp {
        ExportStamp::parse("2026-10-11T14-30-05Z").unwrap()
    }

    fn project() -> (tempfile::TempDir, ProjectRoot) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("_notebook")).unwrap();
        let root = ProjectRoot::open(dir.path()).unwrap();
        (dir, root)
    }

    fn input(json: &str) -> PdfExportInput {
        PdfExportInput {
            input_json: json.to_owned(),
            notebook_json: "{}".to_owned(),
            bibliography_json: "[]".to_owned(),
            figures: Vec::new(),
        }
    }

    /// A valid 1 x 1 grey PNG.
    const PNG: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x3A,
        0x7E, 0x9B, 0x55, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x68,
        0x00, 0x00, 0x00, 0x82, 0x00, 0x81, 0x77, 0xCD, 0x72, 0xB6, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];

    const EVIDENCE: &str = "_notebook/experiments/EXP-001/evidence";

    fn with_figure(files: &[&str]) -> PdfExportInput {
        let artefacts: Vec<_> = files
            .iter()
            .enumerate()
            .map(|(i, _)| {
                serde_json::json!({
                    "name": format!("Plot {i}"),
                    "lines": [],
                    "figure": { "id": format!("f{i}"), "caption": format!("Plot {i}") },
                })
            })
            .collect();
        let json = serde_json::json!({
            "schemaVersion": 2, "title": "Yeast", "locale": "en-GB",
            "generated": "2026-10-09T12:00:00Z",
            "questions": [],
            "experiments": [{
                "ref": "EXP-001", "title": "Run", "status": "complete",
                "question": null, "started": null, "completed": null,
                "preamble": [], "sections": [], "artefacts": artefacts, "literature": [],
            }],
            "bibliography": [], "notExported": [],
        });
        PdfExportInput {
            figures: files
                .iter()
                .enumerate()
                .map(|(i, file)| PdfFigureRequest {
                    id: FigureId::try_from(format!("f{i}")).unwrap(),
                    file: VersionPath::try_from(format!("{EVIDENCE}/{file}")).unwrap(),
                })
                .collect(),
            ..input(&json.to_string())
        }
    }

    #[test]
    fn a_valid_input_is_written_as_a_pdf() {
        let (dir, root) = project();

        assert_eq!(
            build_and_store(&root, &stamp(), &input(INPUT)),
            PdfExportOutcome::Written { figures_omitted: 0 }
        );

        let pdf = std::fs::read(
            dir.path()
                .join("_notebook/exports/pdf/project-2026-10-11T14-30-05Z.pdf"),
        )
        .unwrap();
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn an_input_that_cannot_be_built_writes_nothing() {
        let (dir, root) = project();

        assert_eq!(
            build_and_store(&root, &stamp(), &input("{ nope")),
            PdfExportOutcome::NotBuilt
        );

        assert!(!dir.path().join("_notebook/exports").exists());
    }

    #[test]
    fn a_captured_figure_is_embedded_in_the_pdf_that_is_written() {
        let (dir, root) = project();
        std::fs::create_dir_all(dir.path().join(EVIDENCE)).unwrap();
        std::fs::write(dir.path().join(EVIDENCE).join("a.png"), PNG).unwrap();

        let outcome = build_and_store(&root, &stamp(), &with_figure(&["a.png"]));

        assert_eq!(outcome, PdfExportOutcome::Written { figures_omitted: 0 });
        let pdf = std::fs::read(
            dir.path()
                .join("_notebook/exports/pdf/project-2026-10-11T14-30-05Z.pdf"),
        )
        .unwrap();
        assert!(
            pdf.windows(6).any(|w| w == b"/Image"),
            "no image in the PDF"
        );
    }

    #[test]
    fn a_missing_and_an_unsupported_figure_are_counted_and_the_pdf_is_still_written() {
        let (dir, root) = project();
        std::fs::create_dir_all(dir.path().join(EVIDENCE)).unwrap();
        std::fs::write(dir.path().join(EVIDENCE).join("a.png"), PNG).unwrap();
        std::fs::write(dir.path().join(EVIDENCE).join("b.pdf"), b"%PDF-1.7").unwrap();

        let outcome = build_and_store(
            &root,
            &stamp(),
            &with_figure(&["a.png", "gone.png", "b.pdf"]),
        );

        assert_eq!(outcome, PdfExportOutcome::Written { figures_omitted: 2 });
    }

    #[test]
    fn captured_files_are_left_exactly_as_they_were() {
        let (dir, root) = project();
        std::fs::create_dir_all(dir.path().join(EVIDENCE)).unwrap();
        let file = dir.path().join(EVIDENCE).join("a.png");
        std::fs::write(&file, PNG).unwrap();

        build_and_store(&root, &stamp(), &with_figure(&["a.png"]));

        assert_eq!(std::fs::read(file).unwrap(), PNG);
    }

    #[test]
    fn a_figure_id_that_could_name_a_path_is_refused_when_it_arrives() {
        for bad in ["\"../x\"", "\"a/b\"", "\"\"", "\"f 1\""] {
            assert!(serde_json::from_str::<FigureId>(bad).is_err(), "{bad}");
        }
        assert!(serde_json::from_str::<FigureId>("\"f12\"").is_ok());
    }
}
