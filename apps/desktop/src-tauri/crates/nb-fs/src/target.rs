use std::fs::{self, Permissions};
use std::io;
use std::path::Path;

use crate::error::WriteError;

/// Checks that the file `name` in `dir` may be replaced, and returns the
/// permissions it has now so the replacement can keep them; `None` when the
/// file does not exist yet.
///
/// A link, a folder or a read-only file is refused, never replaced or made
/// writable: each would change what the path means or override a choice the
/// user made on their own file. `display` names the file in errors.
pub(crate) fn check_target(
    dir: &Path,
    name: &str,
    display: &str,
) -> Result<Option<Permissions>, WriteError> {
    let path = || display.to_owned();
    match fs::symlink_metadata(dir.join(name)) {
        Ok(meta) if meta.file_type().is_symlink() => Err(WriteError::TargetIsLink { path: path() }),
        Ok(meta) if meta.is_dir() => Err(WriteError::TargetIsDirectory { path: path() }),
        Ok(meta) if meta.permissions().readonly() => Err(WriteError::ReadOnly { path: path() }),
        Ok(meta) => Ok(Some(meta.permissions())),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(WriteError::Io {
            operation: "inspect",
            path: path(),
            source,
        }),
    }
}
