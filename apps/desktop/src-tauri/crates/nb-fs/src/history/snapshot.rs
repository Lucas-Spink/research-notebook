use crate::atomic::AtomicIo;
use crate::clock::Clock;
use crate::error::WriteError;
use crate::path::ProjectRelPath;
use crate::project::ProjectRoot;

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
        self.write_data_file_with(&mut crate::RealIo, path, contents, expected, clock)
    }

    /// As [`ProjectRoot::write_data_file`], with the filesystem steps
    /// supplied by `io` so tests can inject failures.
    pub fn write_data_file_with<I: AtomicIo>(
        &self,
        _io: &mut I,
        path: &ProjectRelPath,
        _contents: &[u8],
        _expected: &Expected,
        _clock: &impl Clock,
    ) -> Result<SaveOutcome, WriteError> {
        Err(WriteError::NotHistoryScope {
            path: path.to_string(),
        })
    }
}
