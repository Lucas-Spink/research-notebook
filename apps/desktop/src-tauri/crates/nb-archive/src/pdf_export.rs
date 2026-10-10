//! The files side of the project PDF export (FR-ARC-06, ADR-0056). The PDF is
//! compiled elsewhere from inputs `packages/format` built; this module only
//! stores the bytes as `_notebook/exports/pdf/project.pdf` through `nb-fs`.

use nb_fs::{ProjectRelPath, ProjectRoot};

use crate::FileVerdict;

/// The one file the PDF export makes, inside `_notebook/`.
const PDF_PATH: &str = "_notebook/exports/pdf/project.pdf";

/// Writes the project PDF, replacing the one of an earlier run.
pub fn write_project_pdf(root: &ProjectRoot, pdf: &[u8]) -> FileVerdict {
    let Ok(path) = ProjectRelPath::parse(PDF_PATH) else {
        return FileVerdict::Refused;
    };
    match root.write_atomic(&path, pdf) {
        Ok(()) => FileVerdict::Written,
        Err(_) => FileVerdict::WriteFailed,
    }
}
