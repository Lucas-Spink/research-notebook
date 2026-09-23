//! Recording and checking linked evidence (spec 7.4, FR-EVD-02, FR-EVD-07,
//! FR-EVD-08, ADR-0003, ADR-0031). A link never copies bytes into
//! `_notebook/`: this module only ever reads the linked file, to record its
//! identity or to check whether it is still where it was recorded.

use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use sha2::{Digest, Sha256};

use crate::error::LinkError;
use crate::lock::Timestamp;

const HASH_CHUNK: usize = 64 * 1024;

/// What was observed of a linked file: recorded when it is first linked and
/// again on a confirmed relink (spec 5.8 `link`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkObservation {
    pub sha256: String,
    pub size: u64,
    pub observed_mtime: Timestamp,
}

/// The cheap check used on open (FR-EVD-07): whether a linked file exists
/// and, if so, its size and modification time, without reading its bytes.
/// A missing file is an outcome, not an error: nothing about it is written
/// (FR-EVD-08), so callers only need to tell the two apart.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkStatus {
    Missing,
    Present { size: u64, modified: Timestamp },
}

/// One file found while looking for a missing link's new location, with
/// which of the last known name, size and hash it matches (FR-EVD-08).
/// Nothing is applied from here; a caller confirms a candidate separately.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelinkCandidate {
    pub path: PathBuf,
    pub observation: LinkObservation,
    pub name_matches: bool,
    pub size_matches: bool,
    pub hash_matches: bool,
}

/// What a relink is looking for: the missing file's last known name, size
/// and hash.
#[derive(Debug, Clone, Copy)]
pub struct RelinkExpectation<'a> {
    pub file_name: &'a str,
    pub size: u64,
    pub sha256: &'a str,
}

/// Hashes and stats `source` in full: the "on demand" check (FR-EVD-07), and
/// what records a link's identity when it is first linked or relinked.
pub fn observe_link(source: &Path) -> Result<LinkObservation, LinkError> {
    let mut file = open(source)?;
    let is_file = file
        .metadata()
        .map_err(|source_err| io_error(source, source_err))?
        .is_file();
    if !is_file {
        return Err(LinkError::NotAFile {
            path: source.to_path_buf(),
        });
    }
    let modified = file
        .metadata()
        .and_then(|meta| meta.modified())
        .map_err(|source_err| io_error(source, source_err))?;

    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; HASH_CHUNK];
    let mut size = 0u64;
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|source_err| io_error(source, source_err))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        size += read as u64;
    }
    Ok(LinkObservation {
        sha256: format!("{:x}", hasher.finalize()),
        size,
        observed_mtime: to_timestamp(modified),
    })
}

/// The cheap check used on open (FR-EVD-07): whether `source` exists as a
/// file, and if so its size and modification time, without reading its
/// bytes. A folder where a file is expected counts as missing.
pub fn stat_link(source: &Path) -> Result<LinkStatus, LinkError> {
    match fs::metadata(source) {
        Ok(meta) if meta.is_file() => {
            let modified = meta
                .modified()
                .map_err(|source_err| io_error(source, source_err))?;
            Ok(LinkStatus::Present {
                size: meta.len(),
                modified: to_timestamp(modified),
            })
        }
        Ok(_) => Ok(LinkStatus::Missing),
        Err(source_err) if source_err.kind() == io::ErrorKind::NotFound => Ok(LinkStatus::Missing),
        Err(source_err) => Err(io_error(source, source_err)),
    }
}

/// Looks among the direct entries of `folder` (the location a person points
/// at for one missing file, not a recursive scan of the disk — see
/// [`crate`] docs and ADR-0031) for files that might be it, ranking each by
/// how many of the last known name, size and hash it matches (FR-EVD-08). A
/// file matching none of the three is not a candidate at all and is left
/// out, so an unrelated folder yields an empty list rather than everything
/// in it. An entry that cannot be read is also left out rather than failing
/// the whole search. Highest confidence (hash, then size, then name) sorts
/// first; ties break by path so the order is deterministic.
pub fn find_relink_candidates(
    folder: &Path,
    expected: &RelinkExpectation<'_>,
) -> Result<Vec<RelinkCandidate>, LinkError> {
    let entries = fs::read_dir(folder).map_err(|source_err| io_error(folder, source_err))?;
    let mut candidates = Vec::new();
    for entry in entries {
        let Ok(entry) = entry else { continue };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_file() {
            continue;
        }
        let path = entry.path();
        let Ok(observation) = observe_link(&path) else {
            continue;
        };
        let name_matches = entry
            .file_name()
            .to_str()
            .is_some_and(|name| name.eq_ignore_ascii_case(expected.file_name));
        let size_matches = observation.size == expected.size;
        let hash_matches = observation.sha256.eq_ignore_ascii_case(expected.sha256);
        if !(name_matches || size_matches || hash_matches) {
            continue;
        }
        candidates.push(RelinkCandidate {
            path,
            observation,
            name_matches,
            size_matches,
            hash_matches,
        });
    }
    candidates.sort_by(|a, b| rank(b).cmp(&rank(a)).then_with(|| a.path.cmp(&b.path)));
    Ok(candidates)
}

fn rank(candidate: &RelinkCandidate) -> (u8, u8, u8) {
    (
        u8::from(candidate.hash_matches),
        u8::from(candidate.size_matches),
        u8::from(candidate.name_matches),
    )
}

fn open(path: &Path) -> Result<File, LinkError> {
    File::open(path).map_err(|source_err| io_error(path, source_err))
}

fn io_error(path: &Path, source: io::Error) -> LinkError {
    LinkError::Io {
        path: path.to_path_buf(),
        source,
    }
}

pub(crate) fn to_timestamp(time: SystemTime) -> Timestamp {
    let seconds = time
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_or(0, |duration| {
            i64::try_from(duration.as_secs()).unwrap_or(i64::MAX)
        });
    Timestamp::from_unix(seconds)
}
