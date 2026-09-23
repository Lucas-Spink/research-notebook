//! Reading notebook files as text (FR-PRJ-02, FR-HIS-05). The text is
//! parsed by `packages/format`, the only parser (AGENTS.md rule 2).

use std::fs;
use std::io;
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::error::ReadError;
use crate::path::ProjectRelPath;
use crate::project::{ProjectRoot, NOTEBOOK_DIR};
use crate::watch::is_notebook_data_path;

const PROJECT_FILE: &str = "project.yaml";
/// How the project-relative paths of files in `_notebook/` begin.
const NOTEBOOK_PREFIX: &str = "_notebook/";

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
        let (text, _) = self.read_confined(PROJECT_FILE)?;
        Ok(text)
    }

    /// Reads a notebook data file (`project.yaml`, `bibliography.json`,
    /// `questions/*.md`, `experiments/*/experiment.md` and `artefacts.yaml`)
    /// as it is on disk, with the SHA-256 of the bytes read. Any other path
    /// is refused, so this is not a generic read (spec 6.5). The text goes to
    /// `packages/format`, the only parser. Never writes.
    ///
    /// The hash is of the same bytes as the text, so a caller comparing it
    /// with what the watcher reported is comparing the version it holds.
    pub fn read_data_file(&self, path: &ProjectRelPath) -> Result<DataFile, ReadError> {
        let relative = path
            .as_str()
            .strip_prefix(NOTEBOOK_PREFIX)
            .filter(|relative| is_notebook_data_path(relative))
            .ok_or_else(|| ReadError::NotDataFile {
                path: path.to_string(),
            })?;
        let (text, sha256) = self.read_confined(relative)?;
        Ok(DataFile { text, sha256 })
    }

    /// The text and hash of `relative` (to `_notebook/`), which must resolve
    /// to a regular UTF-8 file inside `_notebook/`.
    ///
    /// `pub(crate)`: inbox requests (spec 5.10) read `request.json` the same
    /// confined way, but are not notebook data files ([`is_notebook_data_path`]
    /// deliberately excludes `inbox/`, since they are not watched or parsed
    /// by this crate — only read once, for `packages/format` to parse).
    pub(crate) fn read_confined(&self, relative: &str) -> Result<(String, String), ReadError> {
        let display = format!("{NOTEBOOK_PREFIX}{relative}");
        let io_error = |source| ReadError::Io {
            path: display.clone(),
            source,
        };
        let resolved = match fs::canonicalize(self.notebook.join(relative)) {
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
        let sha256 = format!("{:x}", Sha256::digest(&bytes));
        let text = String::from_utf8(bytes).map_err(|_| ReadError::NotUtf8 { path: display })?;
        Ok((text, sha256))
    }
}

/// A notebook data file read as text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DataFile {
    /// The file exactly as on disk, byte-order mark and line endings included.
    pub text: String,
    /// Lower-case hexadecimal SHA-256 of the bytes read.
    pub sha256: String,
}
