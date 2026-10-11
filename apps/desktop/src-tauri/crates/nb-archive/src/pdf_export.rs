//! The files side of the project PDF export (FR-ARC-06, ADR-0056). The PDF is
//! compiled elsewhere from inputs `packages/format` built; this module only
//! stores the bytes as `_notebook/exports/pdf/project-<stamp>.pdf` through
//! `nb-fs`. Every run has its own stamp, so an earlier PDF is never replaced.

use nb_fs::{ProjectRelPath, ProjectRoot};

use crate::{ExportStamp, FileVerdict};

/// The one file a PDF export run makes, inside `_notebook/`.
fn pdf_path(stamp: &ExportStamp) -> String {
    format!("_notebook/exports/pdf/project-{}.pdf", stamp.as_str())
}

/// Writes the project PDF under this run's stamp. A PDF of an earlier run has
/// another name and is left alone; only a run with the same stamp is replaced.
pub fn write_project_pdf(root: &ProjectRoot, stamp: &ExportStamp, pdf: &[u8]) -> FileVerdict {
    let Ok(path) = ProjectRelPath::parse(&pdf_path(stamp)) else {
        return FileVerdict::Refused;
    };
    match root.write_atomic(&path, pdf) {
        Ok(()) => FileVerdict::Written,
        Err(_) => FileVerdict::WriteFailed,
    }
}
