use std::io;
use std::path::PathBuf;

/// Why a string is not a valid project-relative path (format-v1.md `path`).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PathError {
    #[error("the path is empty")]
    Empty,
    #[error("the path is absolute or starts with a drive letter")]
    Absolute,
    #[error("the path has an empty segment")]
    EmptySegment,
    #[error("the path has a `.` or `..` segment")]
    Traversal,
    #[error("the path contains a control character")]
    ControlCharacter,
}

/// Why a project folder could not be opened for writing.
#[derive(Debug, thiserror::Error)]
pub enum OpenError {
    #[error("cannot open the project folder `{path}`: {source}")]
    Root { path: PathBuf, source: io::Error },
    /// `_notebook` is absent, is not a folder, or is a link or differs in
    /// case from `_notebook`, so writes could not be confined to it.
    #[error("`_notebook` in `{path}` is missing, is not a folder, or is a link")]
    NotebookInvalid { path: PathBuf },
}

/// Why a write was refused or failed. Paths are project-relative so the
/// message can be shown without leaking the location of the project.
#[derive(Debug, thiserror::Error)]
pub enum WriteError {
    #[error("invalid path: {0}")]
    Path(#[from] PathError),
    #[error("`{path}` is not inside _notebook/")]
    OutsideNotebook { path: String },
    /// A segment that Windows would treat as a device, stream or different
    /// name (spec 9.2), refused on every platform so projects move between them.
    #[error("`{path}` contains a name that is not safe on Windows")]
    UnsafeName { path: String },
    #[error("`{path}` resolves outside _notebook/")]
    EscapesNotebook { path: String },
    #[error("`{path}` is a link and will not be replaced")]
    TargetIsLink { path: String },
    #[error("`{path}` is a folder")]
    TargetIsDirectory { path: String },
    #[error("`{path}` is read-only")]
    ReadOnly { path: String },
    /// Another process held the file for the whole retry budget (spec 9.3).
    #[error("`{path}` is held by another process")]
    Locked { path: String },
    /// Not one of the notebook text files that keep history (spec 5.11).
    #[error("`{path}` is not a notebook file that keeps history")]
    NotHistoryScope { path: String },
    /// The notebook itself, its lock, project file or bibliography, or the
    /// history, trash and backups, which are never moved to the trash.
    #[error("`{path}` cannot be moved to the trash")]
    NotTrashable { path: String },
    #[error("`{path}` does not exist")]
    Missing { path: String },
    #[error("cannot {operation} `{path}`: {source}")]
    Io {
        operation: &'static str,
        path: String,
        source: io::Error,
    },
}

/// Why a project could not be created. Nothing is overwritten in any case.
#[derive(Debug, thiserror::Error)]
pub enum CreateError {
    #[error("cannot use the project folder `{path}`: {source}")]
    Root { path: PathBuf, source: io::Error },
    /// `_notebook` is a file or a link, or is spelt in another case, so
    /// writes could not be confined to it.
    #[error("`_notebook` in `{path}` is a file or a link, or is spelt differently")]
    NotebookInvalid { path: PathBuf },
    /// `_notebook` already holds something: an existing project, or files
    /// that must not be replaced.
    #[error("`_notebook` in `{path}` already holds files")]
    NotEmpty { path: PathBuf },
    #[error("cannot {operation} in `{path}`: {source}")]
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    #[error(transparent)]
    Open(#[from] OpenError),
    #[error(transparent)]
    Write(#[from] WriteError),
}

/// Why a notebook file could not be read. Paths are project-relative.
#[derive(Debug, thiserror::Error)]
pub enum ReadError {
    #[error("`{path}` does not exist")]
    Missing { path: String },
    #[error("`{path}` is not a file")]
    NotAFile { path: String },
    /// The file is a link that leads outside `_notebook/` (spec 6.5).
    #[error("`{path}` resolves outside _notebook/")]
    EscapesNotebook { path: String },
    #[error("`{path}` is not valid UTF-8")]
    NotUtf8 { path: String },
    /// Not one of the notebook data files that may be read this way.
    #[error("`{path}` is not a notebook data file")]
    NotDataFile { path: String },
    #[error("cannot read `{path}`: {source}")]
    Io { path: String, source: io::Error },
}

/// Why a capture into `evidence/` or `methods/` could not be completed
/// (spec 7.4, FR-EVD-03 to FR-EVD-05). None of these outcomes ever modify,
/// move or remove the source file.
#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
    #[error("cannot read the source file: {source}")]
    Source { source: io::Error },
    #[error("the source is not a file")]
    SourceNotAFile,
    #[error(transparent)]
    Write(#[from] WriteError),
    /// What was read back does not match what was copied (FR-EVD-03): the
    /// copy is discarded rather than trusted.
    #[error(
        "the copy did not verify: expected {expected_size} bytes ({expected_sha256}), found {actual_size} bytes ({actual_sha256})"
    )]
    VerificationFailed {
        expected_size: u64,
        expected_sha256: String,
        actual_size: u64,
        actual_sha256: String,
    },
    /// A version's file name is already taken. Versions are immutable, so
    /// nothing already there is ever replaced.
    #[error("`{path}` already exists")]
    VersionExists { path: String },
}

/// Why a linked file could not be read (spec 7.4, FR-EVD-07, FR-EVD-08). A
/// link is only ever observed, never copied, moved or removed, so every
/// variant here comes from reading the file at `path`.
#[derive(Debug, thiserror::Error)]
pub enum LinkError {
    #[error("cannot read `{path}`: {source}")]
    Io { path: PathBuf, source: io::Error },
    #[error("`{path}` is not a file")]
    NotAFile { path: PathBuf },
}

/// Why an inbox request could not be imported or removed (spec 5.10). None
/// of these outcomes ever alter the request folder or its payload; a request
/// that fails stays exactly as it was, for the caller to list with the error.
#[derive(Debug, thiserror::Error)]
pub enum InboxError {
    /// `request_id` or a payload name is empty, contains a path separator, or
    /// is otherwise not a single safe segment.
    #[error("`{request_id}` is not a valid inbox request folder name")]
    InvalidRequestId { request_id: String },
    /// The payload's actual bytes do not match what the request declared
    /// (spec 5.10 `sha256`, `size`): the payload is discarded rather than
    /// trusted, and nothing is moved.
    #[error(
        "the payload does not match the request: expected {expected_size} bytes ({expected_sha256}), found {actual_size} bytes ({actual_sha256})"
    )]
    PayloadMismatch {
        expected_size: u64,
        expected_sha256: String,
        actual_size: u64,
        actual_sha256: String,
    },
    #[error(transparent)]
    Read(#[from] ReadError),
    #[error(transparent)]
    Link(#[from] LinkError),
    #[error(transparent)]
    Capture(#[from] CaptureError),
    #[error(transparent)]
    Write(#[from] WriteError),
}

/// Why the project lock could not be acquired, refreshed or released. A lock
/// that is held by someone else, or that cannot be written because the medium
/// is read-only, is an outcome, not an error.
#[derive(Debug, thiserror::Error)]
pub enum LockError {
    #[error("cannot {operation} the project lock: {source}")]
    Io {
        operation: &'static str,
        source: io::Error,
    },
    #[error(transparent)]
    Write(#[from] WriteError),
}
