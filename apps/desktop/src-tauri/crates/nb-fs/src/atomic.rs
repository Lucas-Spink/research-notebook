use std::fs::{self, File, OpenOptions, Permissions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use crate::error::WriteError;

/// How long a write keeps retrying while another process holds the file (spec 9.3).
pub const LOCK_RETRY_BUDGET: Duration = Duration::from_secs(5);

const FIRST_RETRY_PAUSE: Duration = Duration::from_millis(10);
const LONGEST_RETRY_PAUSE: Duration = Duration::from_millis(500);
const TEMP_NAME_ATTEMPTS: usize = 32;
/// Long file names are shortened in the temporary name so it stays legal.
const TEMP_NAME_STEM_CHARS: usize = 100;

/// The primitive steps of an atomic write, separated so tests can fail or
/// stop between any two of them. Every method has the real behaviour as its
/// default, so [`RealIo`] is empty and a test wrapper overrides only the
/// step it wants to break.
pub trait AtomicIo {
    /// Bytes written between two calls to [`AtomicIo::write_chunk`].
    fn chunk_size(&self) -> usize {
        64 * 1024
    }

    /// Creates the temporary file, failing if it already exists.
    fn create_temp(&mut self, path: &Path) -> io::Result<File> {
        OpenOptions::new().write(true).create_new(true).open(path)
    }

    fn write_chunk(&mut self, file: &mut File, chunk: &[u8]) -> io::Result<()> {
        file.write_all(chunk)
    }

    /// Flushes the file's data and metadata to stable storage.
    fn sync_file(&mut self, file: &File) -> io::Result<()> {
        file.sync_all()
    }

    /// Renames over the destination, replacing it.
    fn rename(&mut self, from: &Path, to: &Path) -> io::Result<()> {
        fs::rename(from, to)
    }

    /// Flushes the directory entry so the rename survives a power cut.
    /// Windows cannot open a directory this way, and the rename there is
    /// already journalled by the filesystem.
    fn sync_dir(&mut self, dir: &Path) -> io::Result<()> {
        #[cfg(unix)]
        {
            File::open(dir)?.sync_all()
        }
        #[cfg(not(unix))]
        {
            let _ = dir;
            Ok(())
        }
    }

    /// Removes the temporary file after a failed write.
    fn remove_temp(&mut self, path: &Path) -> io::Result<()> {
        fs::remove_file(path)
    }

    /// Waits between retries.
    fn pause(&mut self, duration: Duration) {
        std::thread::sleep(duration);
    }
}

/// The real filesystem.
#[derive(Debug, Default)]
pub struct RealIo;

impl AtomicIo for RealIo {}

/// Where a write goes. `dir` is already resolved and confined by the caller.
pub(crate) struct Destination<'a> {
    pub dir: &'a Path,
    pub name: &'a str,
    /// Project-relative path, for error messages.
    pub display: &'a str,
    /// Permissions of the file being replaced, carried over to the new one.
    pub permissions: Option<Permissions>,
}

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

fn io_error(operation: &'static str, dest: &Destination<'_>, source: io::Error) -> WriteError {
    WriteError::Io {
        operation,
        path: dest.display.to_owned(),
        source,
    }
}

/// Whether the error means another process holds the file, which is worth
/// retrying: a sharing or lock violation, or the access-denied Windows gives
/// while an indexer, editor or scanner has the file open.
fn is_lock_error(error: &io::Error) -> bool {
    if error.kind() == io::ErrorKind::ResourceBusy {
        return true;
    }
    #[cfg(windows)]
    {
        // ERROR_ACCESS_DENIED, ERROR_SHARING_VIOLATION, ERROR_LOCK_VIOLATION.
        matches!(error.raw_os_error(), Some(5 | 32 | 33))
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Creates the temporary file beside the destination, so the final rename
/// stays on one volume. The name starts with a dot and ends with `.tmp`
/// (spec 5.10); the process id and a counter keep concurrent writers apart.
fn create_temp<I: AtomicIo>(
    io: &mut I,
    dest: &Destination<'_>,
) -> Result<(PathBuf, File), WriteError> {
    let stem: String = dest.name.chars().take(TEMP_NAME_STEM_CHARS).collect();
    let pid = std::process::id();
    let mut last = None;
    for _ in 0..TEMP_NAME_ATTEMPTS {
        let n = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = dest.dir.join(format!(".{stem}.{pid}.{n}.tmp"));
        match io.create_temp(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => last = Some(error),
            Err(error) => return Err(io_error("create", dest, error)),
        }
    }
    Err(io_error(
        "create",
        dest,
        last.unwrap_or_else(|| io::Error::other("no free temporary name")),
    ))
}

/// Writes all of `contents` to the temporary file and flushes it. Consumes
/// the file so it is closed before the rename, which Windows requires.
fn fill_temp<I: AtomicIo>(
    io: &mut I,
    mut file: File,
    contents: &[u8],
    dest: &Destination<'_>,
) -> Result<(), WriteError> {
    for chunk in contents.chunks(io.chunk_size().max(1)) {
        io.write_chunk(&mut file, chunk)
            .map_err(|e| io_error("write", dest, e))?;
    }
    if let Some(permissions) = &dest.permissions {
        file.set_permissions(permissions.clone())
            .map_err(|e| io_error("set permissions of", dest, e))?;
    }
    io.sync_file(&file).map_err(|e| io_error("sync", dest, e))
}

/// Renames the temporary file over the destination, retrying with backoff
/// while another process holds it, for up to [`LOCK_RETRY_BUDGET`].
fn replace<I: AtomicIo>(
    io: &mut I,
    temp: &Path,
    target: &Path,
    dest: &Destination<'_>,
) -> Result<(), WriteError> {
    let mut waited = Duration::ZERO;
    let mut pause = FIRST_RETRY_PAUSE;
    loop {
        match io.rename(temp, target) {
            Ok(()) => return Ok(()),
            Err(error) if is_lock_error(&error) => {
                if waited >= LOCK_RETRY_BUDGET {
                    return Err(WriteError::Locked {
                        path: dest.display.to_owned(),
                    });
                }
                let this_pause = pause.min(LOCK_RETRY_BUDGET - waited);
                io.pause(this_pause);
                waited += this_pause;
                pause = (pause * 2).min(LONGEST_RETRY_PAUSE);
            }
            Err(error) => return Err(io_error("replace", dest, error)),
        }
    }
}

/// Writes `contents` so that a reader sees the old file or the complete new
/// one: temporary file, write, flush, rename with retry, directory flush.
///
/// A failure before the rename removes the temporary file and leaves the old
/// file alone. If the process dies, a stray temporary file may remain, never
/// a partial destination.
pub(crate) fn write<I: AtomicIo>(
    io: &mut I,
    dest: &Destination<'_>,
    contents: &[u8],
) -> Result<(), WriteError> {
    let target = dest.dir.join(dest.name);
    let (temp, file) = create_temp(io, dest)?;
    let swapped =
        fill_temp(io, file, contents, dest).and_then(|()| replace(io, &temp, &target, dest));
    if let Err(error) = swapped {
        // Only the file this call created is removed, never anything else.
        let _ = io.remove_temp(&temp);
        return Err(error);
    }
    // The new file is already in place. A failed directory flush only leaves
    // its durability uncertain, so it does not turn a completed write into
    // an error.
    let _ = io.sync_dir(dest.dir);
    Ok(())
}
