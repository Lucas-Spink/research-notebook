//! Importing capture requests from `_notebook/inbox/` (spec 5.10, ADR-0033).
//! Mechanical only: listing, reading raw `request.json` text, moving a
//! copy-mode payload into place and removing a processed request folder.
//! Parsing `request.json` and deciding what to do with it is
//! `packages/format`'s job (AGENTS.md rule 2); every function here takes
//! that decision already made, the same way [`crate::capture`] takes a
//! [`CaptureName`] and a list of known versions rather than deciding them.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::atomic::{AtomicIo, RealIo};
use crate::capture::{CaptureName, CaptureOutcome, KnownVersion};
use crate::error::{InboxError, ReadError};
use crate::link::observe_link;
use crate::names::is_windows_safe_segment;
use crate::path::ProjectRelPath;
use crate::project::{ProjectRoot, NOTEBOOK_DIR};
use crate::read::DataFile;

/// Where inbox requests live, inside `_notebook/` (spec 5.10).
const INBOX_DIR: &str = "inbox";
const REQUEST_FILE: &str = "request.json";

/// The checksum and size a request declares for its payload (spec 5.10
/// `sha256`, `size`), checked against what is actually on disk before
/// anything is moved.
#[derive(Debug, Clone, Copy)]
pub struct PayloadExpectation<'a> {
    pub sha256: &'a str,
    pub size: u64,
}

/// Whether `name` is a single safe path segment: not empty, not `.` or
/// `..`, no path separator, and not a name Windows would treat as something
/// else (spec 9.2). Request folder names are ULIDs and payload names are
/// already sanitised by the writer, so this only ever rejects a caller
/// error or a tampered value, never an ordinary request.
fn safe_segment(name: &str) -> bool {
    !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains('/')
        && !name.contains('\\')
        && is_windows_safe_segment(name)
}

fn checked_segment(name: &str) -> Result<(), InboxError> {
    if safe_segment(name) {
        Ok(())
    } else {
        Err(InboxError::InvalidRequestId {
            request_id: name.to_owned(),
        })
    }
}

impl ProjectRoot {
    /// Names of the processed-request folders directly under
    /// `_notebook/inbox/`, sorted. A name ending `.tmp` is still being
    /// written by its writer and is skipped (spec 5.10: "readers ignore
    /// `.tmp` folders"), as is anything hidden. A missing `inbox/` folder
    /// has none, not an error: most projects never receive a request.
    pub fn list_inbox_requests(&self) -> Result<Vec<String>, ReadError> {
        let dir = self.notebook.join(INBOX_DIR);
        let io_error = |source| ReadError::Io {
            path: format!("{NOTEBOOK_DIR}/{INBOX_DIR}"),
            source,
        };
        match fs::symlink_metadata(&dir) {
            Ok(meta) if meta.is_dir() => {}
            Ok(_) => return Ok(Vec::new()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(io_error(e)),
        }
        let mut names = Vec::new();
        for entry in fs::read_dir(&dir).map_err(io_error)? {
            let entry = entry.map_err(io_error)?;
            let Ok(name) = entry.file_name().into_string() else {
                continue;
            };
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !file_type.is_dir() || name.starts_with('.') || name.ends_with(".tmp") {
                continue;
            }
            names.push(name);
        }
        names.sort();
        Ok(names)
    }

    /// The raw text and hash of `_notebook/inbox/<request_id>/request.json`,
    /// for `packages/format` to parse. `request_id` is normally one of the
    /// names [`ProjectRoot::list_inbox_requests`] returned.
    pub fn read_inbox_request(&self, request_id: &str) -> Result<DataFile, ReadError> {
        if !safe_segment(request_id) {
            return Err(ReadError::EscapesNotebook {
                path: format!("{NOTEBOOK_DIR}/{INBOX_DIR}/{request_id}"),
            });
        }
        let (text, sha256) =
            self.read_confined(&format!("{INBOX_DIR}/{request_id}/{REQUEST_FILE}"))?;
        Ok(DataFile { text, sha256 })
    }

    /// Moves a copy-mode request's payload into `folder` as a new artefact
    /// version, exactly as [`ProjectRoot::capture_copy`] places an ordinary
    /// capture (FR-EVD-03, FR-EVD-04): same naming, collision and dedupe
    /// rules, driven by the same caller-supplied `name` and `known`.
    ///
    /// Before anything is copied, the payload is hashed and statted in place
    /// with [`observe_link`] and checked against `expected`, the sha256 and
    /// size the request declared. A mismatch (a corrupted or tampered
    /// payload) fails with [`InboxError::PayloadMismatch`] and leaves the
    /// inbox folder untouched, so the caller can list the request as invalid
    /// (spec 5.10) rather than importing bad bytes.
    pub fn import_inbox_payload(
        &self,
        request_id: &str,
        payload: &str,
        expected: PayloadExpectation<'_>,
        folder: &ProjectRelPath,
        name: CaptureName<'_>,
        known: &[KnownVersion],
    ) -> Result<CaptureOutcome, InboxError> {
        self.import_inbox_payload_with(
            &mut RealIo,
            request_id,
            payload,
            expected,
            folder,
            name,
            known,
        )
    }

    /// As [`ProjectRoot::import_inbox_payload`], with the filesystem steps of
    /// the copy supplied by `io`, so tests can inject failures.
    #[allow(clippy::too_many_arguments)]
    pub fn import_inbox_payload_with<I: AtomicIo>(
        &self,
        io: &mut I,
        request_id: &str,
        payload: &str,
        expected: PayloadExpectation<'_>,
        folder: &ProjectRelPath,
        name: CaptureName<'_>,
        known: &[KnownVersion],
    ) -> Result<CaptureOutcome, InboxError> {
        checked_segment(request_id)?;
        checked_segment(payload)?;
        let payload_path = self.notebook.join(INBOX_DIR).join(request_id).join(payload);

        let observed = observe_link(&payload_path)?;
        if observed.size != expected.size || !observed.sha256.eq_ignore_ascii_case(expected.sha256)
        {
            return Err(InboxError::PayloadMismatch {
                expected_size: expected.size,
                expected_sha256: expected.sha256.to_owned(),
                actual_size: observed.size,
                actual_sha256: observed.sha256,
            });
        }

        let outcome = self.capture_copy_with(io, &payload_path, folder, name, known)?;
        Ok(outcome)
    }

    /// Removes a processed request folder entirely (spec 5.10: "removes the
    /// request folder"). A real delete, not `.trash/`: the inbox is
    /// ephemeral system state (spec 5.12), like a stray `.tmp` write
    /// remnant, not a document a person made.
    pub fn remove_inbox_request(&self, request_id: &str) -> Result<(), InboxError> {
        checked_segment(request_id)?;
        let dir = self.notebook.join(INBOX_DIR).join(request_id);
        let resolved = confined_inbox_folder(&self.notebook, &dir, request_id)?;
        fs::remove_dir_all(&resolved).map_err(|source| {
            InboxError::Read(ReadError::Io {
                path: format!("{NOTEBOOK_DIR}/{INBOX_DIR}/{request_id}"),
                source,
            })
        })
    }
}

/// Resolves `dir` (`_notebook/inbox/<request_id>`) and checks it is really
/// there and really inside `_notebook/inbox/`, so a link cannot make removal
/// reach outside it.
fn confined_inbox_folder(
    notebook: &Path,
    dir: &Path,
    request_id: &str,
) -> Result<PathBuf, InboxError> {
    let display = format!("{NOTEBOOK_DIR}/{INBOX_DIR}/{request_id}");
    let resolved = match fs::canonicalize(dir) {
        Ok(resolved) => resolved,
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            return Err(InboxError::Read(ReadError::Missing { path: display }))
        }
        Err(source) => {
            return Err(InboxError::Read(ReadError::Io {
                path: display,
                source,
            }))
        }
    };
    if !resolved.starts_with(notebook.join(INBOX_DIR)) {
        return Err(InboxError::Read(ReadError::EscapesNotebook {
            path: display,
        }));
    }
    Ok(resolved)
}
