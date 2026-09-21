use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use super::retention::plan_retention;
use super::scope::is_snapshot_scope;
use super::stamp::Snapshot;
use crate::atomic::AtomicIo;
use crate::clock::Clock;
use crate::error::WriteError;
use crate::lock::Timestamp;
use crate::path::ProjectRelPath;
use crate::project::{ProjectRoot, NOTEBOOK_DIR};
use crate::RealIo;

/// Where snapshots live, inside `_notebook/` (spec 5.11).
pub(crate) const HISTORY_DIR: &str = ".history";
/// How many snapshots of one file may share a second before giving up.
const MAX_SAME_SECOND: u32 = 10_000;

/// What the caller believes is on disk, so a save never overwrites a change
/// made by something else since the file was read (ADR-0024).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expected {
    /// The file does not exist.
    Absent,
    /// The file's bytes have this lower-case hexadecimal SHA-256.
    Sha256(String),
}

/// What a save did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SaveOutcome {
    /// Written. `snapshot` is the project-relative path of the copy of the
    /// previous content, or `None` when the file was new.
    Saved { snapshot: Option<String> },
    /// The file is not what the caller expected. Nothing was written.
    /// `current` is the SHA-256 of what is there now, or `None` when the file
    /// is missing.
    Changed { current: Option<String> },
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

impl Expected {
    fn matches(&self, current: Option<&[u8]>) -> bool {
        match (self, current) {
            (Self::Absent, None) => true,
            (Self::Sha256(expected), Some(bytes)) => {
                expected.eq_ignore_ascii_case(&sha256_hex(bytes))
            }
            _ => false,
        }
    }
}

impl ProjectRoot {
    /// Overwrites a notebook text file, first keeping a copy of what it held
    /// (FR-HIS-01). The write is refused, untouched, if the file is not what
    /// `expected` says. Blocks while a locked file is retried.
    pub fn write_data_file(
        &self,
        path: &ProjectRelPath,
        contents: &[u8],
        expected: &Expected,
        clock: &impl Clock,
    ) -> Result<SaveOutcome, WriteError> {
        self.write_data_file_with(&mut RealIo, path, contents, expected, clock)
    }

    /// As [`ProjectRoot::write_data_file`], with the filesystem steps
    /// supplied by `io` so tests can inject failures.
    ///
    /// The order is what keeps history safe: the target is checked, the
    /// previous content is copied to `.history` (atomically), and only then
    /// is the file replaced. A failure at any step leaves the file as it was;
    /// pruning old snapshots comes last and its failure is not an error.
    pub fn write_data_file_with<I: AtomicIo>(
        &self,
        io: &mut I,
        path: &ProjectRelPath,
        contents: &[u8],
        expected: &Expected,
        clock: &impl Clock,
    ) -> Result<SaveOutcome, WriteError> {
        let relative = history_relative(path)?;
        let resolved = self.resolve(path)?;
        let target = resolved.dir.join(&resolved.name);
        let current = read_current(&target, path)?;
        if !expected.matches(current.as_deref()) {
            return Ok(SaveOutcome::Changed {
                current: current.as_deref().map(sha256_hex),
            });
        }
        let now = clock.now();
        let snapshot = match &current {
            Some(previous) => Some(self.keep_snapshot(io, relative, previous, now)?),
            None => None,
        };
        self.write_atomic_with(io, path, contents)?;
        if current.is_some() {
            self.prune_history(relative, now);
        }
        Ok(SaveOutcome::Saved { snapshot })
    }

    /// Writes `previous` to `.history/<relative>/<stamp>.<ext>`, under a name
    /// nothing else has, and returns its project-relative path.
    fn keep_snapshot<I: AtomicIo>(
        &self,
        io: &mut I,
        relative: &str,
        previous: &[u8],
        now: Timestamp,
    ) -> Result<String, WriteError> {
        let folder = format!("{NOTEBOOK_DIR}/{HISTORY_DIR}/{relative}");
        let extension = extension_of(relative);
        let free = (1..=MAX_SAME_SECOND)
            .map(|seq| snapshot_path(&folder, Snapshot { at: now, seq }, extension))
            .find(|candidate| !exists_in(&self.notebook, candidate))
            .ok_or_else(|| WriteError::Io {
                operation: "name a snapshot of",
                path: relative.to_owned(),
                source: io::Error::other("too many snapshots in one second"),
            })?;
        let path = ProjectRelPath::parse(&free)?;
        self.write_atomic_with(io, &path, previous)?;
        Ok(free)
    }

    /// Deletes the snapshots of `relative` that retention no longer keeps.
    /// Only regular files named exactly as this code names them, inside
    /// `.history/<relative>/` once links are resolved, are ever deleted, and
    /// a failure leaves them for the next save (spec 6.3).
    fn prune_history(&self, relative: &str, now: Timestamp) {
        let folder = self.notebook.join(HISTORY_DIR).join(relative);
        let Ok(resolved) = fs::canonicalize(&folder) else {
            return;
        };
        if !self.is_inside(&resolved) {
            return;
        }
        let extension = extension_of(relative);
        let Ok(entries) = fs::read_dir(&resolved) else {
            return;
        };
        let mut found: Vec<(Snapshot, PathBuf)> = Vec::new();
        for entry in entries.flatten() {
            let is_file = entry.file_type().is_ok_and(|kind| kind.is_file());
            let name = entry.file_name();
            let Some(snapshot) = is_file
                .then(|| name.to_str())
                .flatten()
                .and_then(|name| parse_snapshot_name(name, extension))
            else {
                continue;
            };
            found.push((snapshot, entry.path()));
        }
        let all: Vec<Snapshot> = found.iter().map(|(snapshot, _)| *snapshot).collect();
        for doomed in plan_retention(now, &all) {
            if let Some((_, path)) = found.iter().find(|(snapshot, _)| *snapshot == doomed) {
                let _ = fs::remove_file(path);
            }
        }
    }
}

/// The path of `path` relative to `_notebook/`, if it is a file that keeps
/// history.
fn history_relative(path: &ProjectRelPath) -> Result<&str, WriteError> {
    let relative = path
        .as_str()
        .strip_prefix(NOTEBOOK_DIR)
        .and_then(|rest| rest.strip_prefix('/'))
        .ok_or_else(|| WriteError::OutsideNotebook {
            path: path.to_string(),
        })?;
    if is_snapshot_scope(relative) {
        Ok(relative)
    } else {
        Err(WriteError::NotHistoryScope {
            path: path.to_string(),
        })
    }
}

/// The bytes of the file at `target`, or `None` if there is no file. The
/// caller has already checked it is a regular file.
fn read_current(target: &Path, path: &ProjectRelPath) -> Result<Option<Vec<u8>>, WriteError> {
    match fs::read(target) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(WriteError::Io {
            operation: "read",
            path: path.to_string(),
            source,
        }),
    }
}

/// The extension of the last segment of `relative`, without the dot.
fn extension_of(relative: &str) -> Option<&str> {
    let name = relative.rsplit('/').next().unwrap_or(relative);
    Path::new(name).extension().and_then(|e| e.to_str())
}

fn snapshot_path(folder: &str, snapshot: Snapshot, extension: Option<&str>) -> String {
    let stem = snapshot.file_stem();
    match extension {
        Some(extension) => format!("{folder}/{stem}.{extension}"),
        None => format!("{folder}/{stem}"),
    }
}

/// Reads a snapshot's name back: its stem, and the extension of the file it
/// is a snapshot of. Any other name is not ours to touch.
fn parse_snapshot_name(name: &str, extension: Option<&str>) -> Option<Snapshot> {
    let stem = match extension {
        Some(extension) => name.strip_suffix(extension)?.strip_suffix('.')?,
        None => name,
    };
    Snapshot::parse_stem(stem)
}

/// Whether the project-relative path `path` exists (a link counts).
fn exists_in(notebook: &Path, path: &str) -> bool {
    let inside = path
        .strip_prefix(NOTEBOOK_DIR)
        .and_then(|rest| rest.strip_prefix('/'))
        .unwrap_or(path);
    fs::symlink_metadata(notebook.join(inside)).is_ok()
}
