use std::fs;
use std::io;
use std::path::Path;

use crate::error::LockError;

/// No real lock is anywhere near this large; a bigger file is not read.
const MAX_LOCK_BYTES: u64 = 64 * 1024;

/// What is at the lock's path now.
pub(super) enum Current {
    Absent,
    /// A folder or a link. Never followed and never replaced.
    Blocked,
    /// A file, whose bytes are empty when it was too large to read.
    File {
        bytes: Vec<u8>,
    },
}

/// Looks at `.lock` without following links.
pub(super) fn read_current(path: &Path) -> Result<Current, LockError> {
    let io_error = |operation, source| LockError::Io { operation, source };
    let meta = match fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Current::Absent),
        Err(e) => return Err(io_error("inspect", e)),
    };
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Ok(Current::Blocked);
    }
    if meta.len() > MAX_LOCK_BYTES {
        return Ok(Current::File { bytes: Vec::new() });
    }
    match fs::read(path) {
        Ok(bytes) => Ok(Current::File { bytes }),
        // Removed between looking and reading.
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Current::Absent),
        Err(e) => Err(io_error("read", e)),
    }
}
