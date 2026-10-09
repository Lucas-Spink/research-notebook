//! Builds `project.pdf` for the nightly PDF/A check (S6-G01, FR-ARC-06).
//!
//! Usage: `export_fixture <folder>`. The folder must already hold the three
//! files `scripts/build-pdf-input.mjs` writes from a project: `pdf-input.json`,
//! `notebook.json` and `bibliography.json`. `project.pdf` is written beside
//! them, and the workflow then validates it with veraPDF (flavour 3b).
//!
//! Rust never reads the project here: `packages/format` builds every input
//! (AGENTS.md rule 2), and this program only compiles and exports them.
// A developer tool writing into a scratch folder the caller names, never into a
// project: the `nb-fs` confinement does not apply, and the clippy ban is for
// application code.
#![allow(clippy::disallowed_methods)]

use std::path::Path;
use std::process::ExitCode;
use std::{env, fs};

use nb_export::{export_project_pdf, ProjectPdf};

fn read(folder: &Path, name: &str) -> Result<Vec<u8>, String> {
    fs::read(folder.join(name)).map_err(|e| format!("cannot read {name}: {e}"))
}

fn run(folder: &Path) -> Result<(), String> {
    let input = String::from_utf8(read(folder, "pdf-input.json")?)
        .map_err(|_| "pdf-input.json is not UTF-8".to_owned())?;
    let notebook = read(folder, "notebook.json")?;
    let bibliography = read(folder, "bibliography.json")?;
    let pdf = export_project_pdf(&ProjectPdf {
        input_json: &input,
        notebook_json: &notebook,
        bibliography_json: &bibliography,
    })
    .map_err(|e| e.to_string())?;
    fs::write(folder.join("project.pdf"), pdf).map_err(|e| format!("cannot write project.pdf: {e}"))
}

fn main() -> ExitCode {
    let mut args = env::args().skip(1);
    let (Some(folder), None) = (args.next(), args.next()) else {
        eprintln!("usage: export_fixture <folder holding pdf-input.json, notebook.json, bibliography.json>");
        return ExitCode::from(2);
    };
    match run(Path::new(&folder)) {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("{message}");
            ExitCode::FAILURE
        }
    }
}
