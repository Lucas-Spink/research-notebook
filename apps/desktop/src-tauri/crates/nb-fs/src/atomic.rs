use std::fs::File;
use std::io;
use std::path::Path;
use std::time::Duration;

/// How long a write keeps retrying while another process holds the file (spec 9.3).
pub const LOCK_RETRY_BUDGET: Duration = Duration::from_secs(5);

fn not_implemented<T>() -> io::Result<T> {
    Err(io::Error::other("not implemented"))
}

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
    fn create_temp(&mut self, _path: &Path) -> io::Result<File> {
        not_implemented()
    }
    fn write_chunk(&mut self, _file: &mut File, _chunk: &[u8]) -> io::Result<()> {
        not_implemented()
    }
    /// Flushes the file's data and metadata to stable storage.
    fn sync_file(&mut self, _file: &File) -> io::Result<()> {
        not_implemented()
    }
    /// Renames over the destination, replacing it.
    fn rename(&mut self, _from: &Path, _to: &Path) -> io::Result<()> {
        not_implemented()
    }
    /// Flushes the directory entry; a no-op where a directory cannot be opened.
    fn sync_dir(&mut self, _dir: &Path) -> io::Result<()> {
        not_implemented()
    }
    /// Removes the temporary file after a failed write.
    fn remove_temp(&mut self, _path: &Path) -> io::Result<()> {
        not_implemented()
    }
    /// Waits between retries.
    fn pause(&mut self, _duration: Duration) {}
}

/// The real filesystem.
#[derive(Debug, Default)]
pub struct RealIo;

impl AtomicIo for RealIo {}
