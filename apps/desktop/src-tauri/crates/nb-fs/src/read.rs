//! Reading notebook files as text (FR-PRJ-02, FR-HIS-05). The text is
//! parsed by `packages/format`, the only parser (AGENTS.md rule 2).

use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

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

impl ProjectRoot {
    /// Opens a captured version's file for reading, for previews (spec 8).
    /// The path must name a file under
    /// `_notebook/experiments/<experiment>/evidence/` or `methods/`, and must
    /// resolve to a regular file under such a folder, so a link can reach
    /// neither a notebook data file nor anything outside `_notebook/`. Never
    /// writes; the caller decides how much of the file to read.
    pub fn open_version_file(&self, path: &ProjectRelPath) -> Result<VersionFile, ReadError> {
        let display = path.to_string();
        let not_version = || ReadError::NotVersionFile {
            path: display.clone(),
        };
        let relative = path
            .as_str()
            .strip_prefix(NOTEBOOK_PREFIX)
            .filter(|relative| is_version_file_path(Path::new(relative)))
            .ok_or_else(not_version)?;
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
        let Ok(inside) = resolved.strip_prefix(&self.notebook) else {
            return Err(ReadError::EscapesNotebook { path: display });
        };
        if !is_version_file_path(inside) {
            return Err(not_version());
        }
        // Checked before opening: Windows refuses to open a folder as a file.
        if !fs::metadata(&resolved).map_err(io_error)?.is_file() {
            return Err(ReadError::NotAFile { path: display });
        }
        let file = File::open(&resolved).map_err(io_error)?;
        let len = file.metadata().map_err(io_error)?.len();
        Ok(VersionFile {
            path: resolved,
            file,
            len,
        })
    }
}

impl ProjectRoot {
    /// What a captured version's file is on disk now: its size, modification
    /// time and SHA-256, for the manifest (FR-ARC-02). Opens the file as
    /// [`ProjectRoot::open_version_file`] does, so the same files are refused,
    /// and reads it once, never writing. The size is the number of bytes
    /// hashed, so it always describes the same bytes as the hash.
    pub fn observe_version_file(
        &self,
        path: &ProjectRelPath,
    ) -> Result<VersionObservation, ReadError> {
        let mut opened = self.open_version_file(path)?;
        let io_error = |source| ReadError::Io {
            path: path.to_string(),
            source,
        };
        let modified = opened
            .file
            .metadata()
            .and_then(|metadata| metadata.modified())
            .map_err(io_error)?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; HASH_BUFFER];
        let mut size: u64 = 0;
        loop {
            let read = match opened.file.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => read,
                Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                Err(e) => return Err(io_error(e)),
            };
            let chunk = buffer.get(..read).unwrap_or_default();
            hasher.update(chunk);
            size += u64::try_from(read).unwrap_or(0);
        }
        Ok(VersionObservation {
            size,
            // A time before 1970 has no place in the manifest; it reads as the epoch.
            modified_ms: modified.duration_since(UNIX_EPOCH).map_or(0, |since| {
                u64::try_from(since.as_millis()).unwrap_or(u64::MAX)
            }),
            sha256: format!("{:x}", hasher.finalize()),
        })
    }
}

/// How many bytes are hashed at a time: small enough to bound memory for a
/// multi-gigabyte file, large enough that reading is not the bottleneck.
const HASH_BUFFER: usize = 64 * 1024;

/// A captured version's file as it is on disk (FR-ARC-02).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VersionObservation {
    /// Bytes read, which are the bytes hashed.
    pub size: u64,
    /// Modification time, milliseconds since the Unix epoch.
    pub modified_ms: u64,
    /// Lower-case hexadecimal SHA-256.
    pub sha256: String,
}

/// Whether `relative` (to `_notebook/`) has the form
/// `experiments/<experiment>/{evidence,methods}/<at least one name>`.
fn is_version_file_path(relative: &Path) -> bool {
    let names: Option<Vec<&str>> = relative
        .components()
        .map(|c| match c {
            Component::Normal(name) => name.to_str(),
            _ => None,
        })
        .collect();
    matches!(
        names.as_deref(),
        Some(["experiments", _, "evidence" | "methods", _, ..])
    )
}

/// A captured version's file, open for reading.
#[derive(Debug)]
pub struct VersionFile {
    /// Where the file resolved to, absolute and free of links.
    pub path: PathBuf,
    pub file: File,
    /// Its length when opened.
    pub len: u64,
}

/// A notebook data file read as text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DataFile {
    /// The file exactly as on disk, byte-order mark and line endings included.
    pub text: String,
    /// Lower-case hexadecimal SHA-256 of the bytes read.
    pub sha256: String,
}
