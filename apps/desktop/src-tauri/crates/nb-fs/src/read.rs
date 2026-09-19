//! Reading a project's `project.yaml` as text (FR-PRJ-02). The text is
//! parsed by `packages/format`, the only parser (AGENTS.md rule 2).

use std::fs;
use std::io;
use std::path::Path;

use crate::error::ReadError;
use crate::project::{ProjectRoot, NOTEBOOK_DIR};

const PROJECT_FILE: &str = "project.yaml";

impl ProjectRoot {
    /// Whether `root` holds a project: a file `_notebook/project.yaml`. It
    /// only looks; a folder that passes may still fail to open or parse.
    pub fn is_project_folder(root: &Path) -> bool {
        root.join(NOTEBOOK_DIR).join(PROJECT_FILE).is_file()
    }

    /// Reads `_notebook/project.yaml` as it is on disk, keeping any byte-order
    /// mark and CRLF for the parser to normalise. Never writes.
    ///
    /// The file must resolve to a regular file inside `_notebook/`, so a link
    /// cannot make the application read something elsewhere (spec 6.5).
    pub fn read_project_yaml(&self) -> Result<String, ReadError> {
        let display = format!("{NOTEBOOK_DIR}/{PROJECT_FILE}");
        let io_error = |source| ReadError::Io {
            path: display.clone(),
            source,
        };
        let resolved = match fs::canonicalize(self.notebook.join(PROJECT_FILE)) {
            Ok(resolved) => resolved,
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                return Err(ReadError::Missing { path: display })
            }
            Err(e) => return Err(io_error(e)),
        };
        if !resolved.starts_with(&self.notebook) {
            return Err(ReadError::EscapesNotebook { path: display });
        }
        if !fs::metadata(&resolved).map_err(io_error)?.is_file() {
            return Err(ReadError::NotAFile { path: display });
        }
        let bytes = fs::read(&resolved).map_err(io_error)?;
        String::from_utf8(bytes).map_err(|_| ReadError::NotUtf8 { path: display })
    }
}
