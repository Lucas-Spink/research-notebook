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
    #[error("cannot {operation} `{path}`: {source}")]
    Io {
        operation: &'static str,
        path: String,
        source: io::Error,
    },
}
