//! Placing a file that another program writes, such as a git bundle
//! (FR-ARC-04, ADR-0053). The program writes to a temporary file that
//! `nb-fs` created inside the destination's own folder, so confinement,
//! atomic replacement and clean-up stay here.

use std::path::Path;

use crate::atomic::{self, AtomicIo, Destination, RealIo};
use crate::error::WriteError;
use crate::path::ProjectRelPath;
use crate::project::ProjectRoot;

/// Why a staged write did not happen.
#[derive(Debug, thiserror::Error)]
pub enum StageError<E> {
    /// The destination was refused or the file could not be placed.
    #[error(transparent)]
    Write(WriteError),
    /// The producer failed; the destination was left as it was.
    #[error("the file could not be produced")]
    Produce(E),
}

impl ProjectRoot {
    /// Has `produce` fill a temporary file next to `path`, then replaces
    /// `path` with it atomically. `produce` is not run unless `path` is a
    /// permitted destination inside `_notebook/`. If it fails, the temporary
    /// file is removed and the old file, if any, is untouched.
    ///
    /// `produce` may check the file before returning `Ok`, so a file that
    /// fails the check is never put in place. It must not keep the path.
    ///
    /// Blocks while a locked destination is retried, for up to five seconds.
    pub fn write_via_temp<E, F>(
        &self,
        path: &ProjectRelPath,
        produce: F,
    ) -> Result<(), StageError<E>>
    where
        F: FnOnce(&Path) -> Result<(), E>,
    {
        let mut io = RealIo;
        let resolved = self.resolve(path).map_err(StageError::Write)?;
        let destination = Destination {
            dir: &resolved.dir,
            name: &resolved.name,
            display: path.as_str(),
            permissions: resolved.permissions,
        };
        let (temp, file) = atomic::create_temp(&mut io, &destination).map_err(StageError::Write)?;
        // Closed before the producer opens it, which Windows requires.
        drop(file);

        if let Err(error) = produce(&temp) {
            let _ = io.remove_temp(&temp);
            return Err(StageError::Produce(error));
        }
        let target = resolved.dir.join(&resolved.name);
        if let Err(error) = atomic::replace(&mut io, &temp, &target, &destination) {
            let _ = io.remove_temp(&temp);
            return Err(StageError::Write(error));
        }
        let _ = io.sync_dir(&resolved.dir);
        Ok(())
    }
}
