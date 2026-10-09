//! The project PDF (FR-ARC-06, ADR-0056). `packages/format` builds what the
//! fixed Typst template reads and the `notebook.json` to embed; this command
//! compiles them with `nb-export` and stores `project.pdf` under
//! `_notebook/exports/pdf/`, so Rust never parses or builds notebook text.

use nb_archive::FileVerdict;
use nb_export::{export_project_pdf, ProjectPdf};
use nb_fs::lock::LockRegistry;
use nb_fs::ProjectRoot;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use super::folders::{FolderHandle, PickedFolders};
use super::history::writable;
use super::lock::with_root;
use super::types::ProjectError;

/// The three texts the PDF is made from, all built by `packages/format` except
/// `bibliography_json`, which is the project's own file.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportInput {
    pub input_json: String,
    pub notebook_json: String,
    pub bibliography_json: String,
}

/// How the export ended. Carries no system text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PdfExportOutcome {
    Written,
    /// The inputs did not make a valid PDF/A document; nothing was written.
    NotBuilt,
    WriteFailed,
}

pub(super) fn build_and_store(root: &ProjectRoot, input: &PdfExportInput) -> PdfExportOutcome {
    let pdf = export_project_pdf(&ProjectPdf {
        input_json: &input.input_json,
        notebook_json: input.notebook_json.as_bytes(),
        bibliography_json: input.bibliography_json.as_bytes(),
    });
    let Ok(pdf) = pdf else {
        return PdfExportOutcome::NotBuilt;
    };
    match nb_archive::write_project_pdf(root, &pdf) {
        FileVerdict::Written => PdfExportOutcome::Written,
        FileVerdict::Refused | FileVerdict::WriteFailed => PdfExportOutcome::WriteFailed,
    }
}

/// Writes the project PDF/A-3b into `_notebook/exports/pdf/` (FR-ARC-06),
/// replacing the one of an earlier run. Refused, with nothing written, unless
/// this application holds the project's lock.
#[tauri::command]
#[specta::specta]
pub async fn write_pdf_export(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
    input: PdfExportInput,
) -> Result<PdfExportOutcome, ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        writable(locks.health(&root))?;
        Ok(build_and_store(&root, &input))
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
        }
    }

    #[test]
    fn a_valid_input_is_written_as_a_pdf() {
        let (dir, root) = project();

        assert_eq!(
            build_and_store(&root, &input(INPUT)),
            PdfExportOutcome::Written
        );

        let pdf = std::fs::read(dir.path().join("_notebook/exports/pdf/project.pdf")).unwrap();
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn an_input_that_cannot_be_built_writes_nothing() {
        let (dir, root) = project();

        assert_eq!(
            build_and_store(&root, &input("{ nope")),
            PdfExportOutcome::NotBuilt
        );

        assert!(!dir.path().join("_notebook/exports").exists());
    }
}
