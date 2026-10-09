//! The files side of the machine-readable export (FR-ARC-07, ADR-0055).
//! `packages/format` decides which files exist and what they say; this module
//! only checks each name and writes it under `_notebook/exports/machine/`
//! through `nb-fs`. Nothing else in the project is touched.

use nb_fs::{ProjectRelPath, ProjectRoot};

/// The folder the export is written to, inside `_notebook/`.
const MACHINE_DIR: &str = "_notebook/exports/machine";

/// What became of one file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileVerdict {
    Written,
    /// The name is not one the export makes.
    Refused,
    WriteFailed,
}

/// A name part: letters, digits, `-` and `_`, and at least one.
fn plain(stem: &str) -> bool {
    !stem.is_empty()
        && stem
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
}

/// The three names the export makes: `notebook.json`,
/// `schemas/<name>.schema.json` and `markdown/<name>.md`. No separator, drive
/// letter or dot-dot can be in a name part.
fn valid_name(name: &str) -> bool {
    if name == "notebook.json" {
        return true;
    }
    if let Some(stem) = name
        .strip_prefix("schemas/")
        .and_then(|rest| rest.strip_suffix(".schema.json"))
    {
        return plain(stem);
    }
    name.strip_prefix("markdown/")
        .and_then(|rest| rest.strip_suffix(".md"))
        .is_some_and(plain)
}

/// Writes each `(name, text)` file into `_notebook/exports/machine/`, in
/// order, replacing a file of the same name. Files of an earlier run that are
/// no longer exported are left, because the application never deletes.
pub fn write_machine_files(root: &ProjectRoot, files: &[(String, String)]) -> Vec<FileVerdict> {
    files
        .iter()
        .map(|(name, text)| {
            if !valid_name(name) {
                return FileVerdict::Refused;
            }
            let Ok(path) = ProjectRelPath::parse(&format!("{MACHINE_DIR}/{name}")) else {
                return FileVerdict::Refused;
            };
            match root.write_atomic(&path, text.as_bytes()) {
                Ok(()) => FileVerdict::Written,
                Err(_) => FileVerdict::WriteFailed,
            }
        })
        .collect()
}
