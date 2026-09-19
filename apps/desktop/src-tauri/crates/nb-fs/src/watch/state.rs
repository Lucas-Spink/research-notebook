//! Reading what is on disk for a changed file. Read-only.

use std::fs::{self, File};
use std::io::{self, Read};
use std::path::Path;
use std::thread;
use std::time::Duration;

use sha2::{Digest, Sha256};

use super::FileState;

const HASH_CHUNK: usize = 64 * 1024;
/// Windows may refuse to open a file for a moment while the program that
/// wrote it still holds it (spec 9.3), so a failed read is tried again.
const ATTEMPTS: u32 = 25;
const PAUSE: Duration = Duration::from_millis(40);

/// The state of the notebook data file at `path`, once it can be read. A
/// file that does not exist, or is a folder or a link instead of a file, is
/// `Missing`; one that stays unreadable for about a second is `Unreadable`.
pub(crate) fn read_state(path: &Path) -> FileState {
    for attempt in 0..ATTEMPTS {
        match try_read(path) {
            Ok(state) => return state,
            Err(_) if attempt + 1 < ATTEMPTS => thread::sleep(PAUSE),
            Err(_) => {}
        }
    }
    FileState::Unreadable
}

fn try_read(path: &Path) -> io::Result<FileState> {
    let meta = match fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(FileState::Missing),
        Err(e) => return Err(e),
    };
    if !meta.is_file() {
        return Ok(FileState::Missing);
    }
    match hash(path) {
        Ok(sha256) => Ok(FileState::Present { sha256 }),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(FileState::Missing),
        Err(e) => Err(e),
    }
}

/// Lower-case hexadecimal SHA-256 of the file, read in chunks.
fn hash(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; HASH_CHUNK];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}
