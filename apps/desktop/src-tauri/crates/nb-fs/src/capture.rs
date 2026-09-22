//! Copying evidence and methods files into the notebook as immutable
//! versions (spec 7.4, FR-EVD-03 to FR-EVD-05, ADR-0003). The source file is
//! only ever read here: nothing in this module writes, renames or removes it.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::atomic::{self, AtomicIo, Destination, RealIo};
use crate::error::{CaptureError, WriteError};
use crate::names::{sanitise, split_extension};
use crate::path::ProjectRelPath;
use crate::project::ProjectRoot;

const HASH_CHUNK: usize = 64 * 1024;
/// Far more than any real evidence folder will ever hold with one base name;
/// beyond this, something else is wrong.
const MAX_COLLISION_ATTEMPTS: u32 = 10_000;

/// How to name the file being captured (FR-EVD-04).
pub enum CaptureName<'a> {
    /// A brand-new artefact: the original file's name is sanitised, and
    /// given a `-2`, `-3`, ... suffix if that name is already taken in the
    /// destination folder.
    New { original_file_name: &'a str },
    /// A later version of an artefact whose first version already
    /// established `stem` and `extension`; named `<stem>.v<number><extension>`.
    /// The number itself is decided from `known`, not given here.
    Version { stem: &'a str, extension: &'a str },
}

/// What is already known of an artefact's versions, so a capture can detect
/// a duplicate (FR-EVD-05) without this crate parsing `artefacts.yaml`
/// itself (AGENTS.md rule 2, spec P2): the caller, which does parse it,
/// supplies the hashes it already has.
pub struct KnownVersion {
    pub sha256: String,
    pub number: u32,
    /// Whether this version belongs to the artefact being captured for, as
    /// opposed to a different artefact in the same experiment.
    pub same_artefact: bool,
}

/// A version placed in `evidence/` or `methods/`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapturedVersion {
    /// Project-relative, e.g. `_notebook/experiments/EXP-001/evidence/x.png`.
    pub path: ProjectRelPath,
    pub file_name: String,
    pub sha256: String,
    pub size: u64,
    pub number: u32,
}

/// What a capture did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CaptureResult {
    Created(CapturedVersion),
    /// Content matched an existing version of the same artefact; nothing
    /// was written (FR-EVD-05).
    Duplicate {
        version: u32,
    },
}

/// A finished capture attempt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaptureOutcome {
    pub result: CaptureResult,
    /// The content also matches a version of a *different* artefact
    /// (FR-EVD-05): true whether or not a new version was made for this one.
    pub matches_other_artefact: bool,
}

impl ProjectRoot {
    /// Copies `source` into `folder` (inside `_notebook/`) as a new
    /// immutable version (FR-EVD-03): hashes while copying to a temporary
    /// file, verifies the copy by reading it back, and only then places it
    /// under a Windows-safe, collision-free name. `source` is opened
    /// read-only and is never modified, moved or removed.
    pub fn capture_copy(
        &self,
        source: &Path,
        folder: &ProjectRelPath,
        name: CaptureName<'_>,
        known: &[KnownVersion],
    ) -> Result<CaptureOutcome, CaptureError> {
        self.capture_copy_with(&mut RealIo, source, folder, name, known)
    }

    /// As [`ProjectRoot::capture_copy`], with the filesystem steps of
    /// writing the temporary file supplied by `io`, so tests can inject
    /// failures (docs/testing-guide.md, "Property tests (Rust)").
    pub fn capture_copy_with<I: AtomicIo>(
        &self,
        io: &mut I,
        source: &Path,
        folder: &ProjectRelPath,
        name: CaptureName<'_>,
        known: &[KnownVersion],
    ) -> Result<CaptureOutcome, CaptureError> {
        let display = folder.as_str();
        let dir = self.resolve_folder(folder)?;
        let existing = list_names(&dir)?;

        let mut source_file =
            File::open(source).map_err(|source| CaptureError::Source { source })?;
        let is_file = source_file
            .metadata()
            .map_err(|source| CaptureError::Source { source })?
            .is_file();
        if !is_file {
            return Err(CaptureError::SourceNotAFile);
        }

        let temp_stem: &str = match &name {
            CaptureName::New { original_file_name } => original_file_name,
            CaptureName::Version { stem, .. } => stem,
        };
        let destination = Destination {
            dir: &dir,
            name: temp_stem,
            display,
            permissions: None,
        };
        let (temp_path, mut temp_file) =
            atomic::create_temp(io, &destination).map_err(CaptureError::Write)?;

        let mut hasher = Sha256::new();
        let mut size: u64 = 0;
        // Read in `io`'s chunk size, not a fixed one, so a test's `AtomicIo`
        // can control how many `write_chunk` calls a copy makes.
        let mut buffer = vec![0u8; io.chunk_size().max(1)];
        loop {
            let read = match source_file.read(&mut buffer) {
                Ok(n) => n,
                Err(source) => {
                    let _ = io.remove_temp(&temp_path);
                    return Err(CaptureError::Source { source });
                }
            };
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
            size += read as u64;
            if let Err(source) = io.write_chunk(&mut temp_file, &buffer[..read]) {
                let _ = io.remove_temp(&temp_path);
                return Err(CaptureError::Write(WriteError::Io {
                    operation: "write",
                    path: display.to_owned(),
                    source,
                }));
            }
        }
        if let Err(source) = io.sync_file(&temp_file) {
            let _ = io.remove_temp(&temp_path);
            return Err(CaptureError::Write(WriteError::Io {
                operation: "sync",
                path: display.to_owned(),
                source,
            }));
        }
        drop(temp_file);

        let sha256 = format!("{:x}", hasher.finalize());
        let (actual_size, actual_sha256) = match hash_file(&temp_path) {
            Ok(pair) => pair,
            Err(source) => {
                let _ = io.remove_temp(&temp_path);
                return Err(CaptureError::Write(WriteError::Io {
                    operation: "verify",
                    path: display.to_owned(),
                    source,
                }));
            }
        };
        if actual_size != size || actual_sha256 != sha256 {
            let _ = io.remove_temp(&temp_path);
            return Err(CaptureError::VerificationFailed {
                expected_size: size,
                expected_sha256: sha256,
                actual_size,
                actual_sha256,
            });
        }

        let matches_other_artefact = known
            .iter()
            .any(|k| !k.same_artefact && k.sha256.eq_ignore_ascii_case(&sha256));

        if let Some(duplicate) = known
            .iter()
            .find(|k| k.same_artefact && k.sha256.eq_ignore_ascii_case(&sha256))
        {
            let _ = io.remove_temp(&temp_path);
            return Ok(CaptureOutcome {
                result: CaptureResult::Duplicate {
                    version: duplicate.number,
                },
                matches_other_artefact,
            });
        }

        let number = known
            .iter()
            .filter(|k| k.same_artefact)
            .map(|k| k.number)
            .max()
            .map_or(1, |max| max + 1);

        let file_name = match name {
            CaptureName::New { original_file_name } => {
                place_new(io, &temp_path, &dir, &existing, original_file_name, display)?
            }
            CaptureName::Version { stem, extension } => place_version(
                io, &temp_path, &dir, &existing, stem, extension, number, display,
            )?,
        };

        let path = ProjectRelPath::parse(&format!("{display}/{file_name}"))
            .map_err(|e| CaptureError::Write(WriteError::Path(e)))?;
        Ok(CaptureOutcome {
            result: CaptureResult::Created(CapturedVersion {
                path,
                file_name,
                sha256,
                size,
                number,
            }),
            matches_other_artefact,
        })
    }
}

/// Case-folded names already in `dir`, so a collision is caught even
/// between filesystems that differ in case sensitivity (S3-G10).
fn list_names(dir: &Path) -> Result<HashSet<String>, CaptureError> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(source) => {
            return Err(CaptureError::Write(WriteError::Io {
                operation: "list",
                path: dir.display().to_string(),
                source,
            }))
        }
    };
    let mut names = HashSet::new();
    for entry in entries {
        let entry = entry.map_err(|source| {
            CaptureError::Write(WriteError::Io {
                operation: "list",
                path: dir.display().to_string(),
                source,
            })
        })?;
        names.insert(entry.file_name().to_string_lossy().to_ascii_lowercase());
    }
    Ok(names)
}

fn taken(existing: &HashSet<String>, candidate: &str) -> bool {
    existing.contains(&candidate.to_ascii_lowercase())
}

/// Renames `temp` to `dir.join(name)`, refusing if something is already
/// there: versions are immutable, so nothing already at that name is ever
/// replaced. `existing` narrows the common case; this recheck on disk
/// catches a file created since it was listed.
fn place_at<I: AtomicIo>(
    io: &mut I,
    temp: &Path,
    dir: &Path,
    name: &str,
    display: &str,
) -> Result<bool, WriteError> {
    let target = dir.join(name);
    if fs::symlink_metadata(&target).is_ok() {
        return Ok(false);
    }
    let dest = Destination {
        dir,
        name,
        display,
        permissions: None,
    };
    atomic::replace(io, temp, &target, &dest)?;
    Ok(true)
}

/// Sanitises `original_file_name` and resolves it to a free name in `dir`,
/// trying `-2`, `-3`, ... when it (or a later attempt) is already taken
/// (FR-EVD-04).
fn place_new<I: AtomicIo>(
    io: &mut I,
    temp: &Path,
    dir: &Path,
    existing: &HashSet<String>,
    original_file_name: &str,
    display: &str,
) -> Result<String, CaptureError> {
    let sanitised = sanitise(original_file_name);
    let (stem, ext) = split_extension(&sanitised);
    let mut existing = existing.clone();
    for attempt in 1..=MAX_COLLISION_ATTEMPTS {
        let candidate = if attempt == 1 {
            format!("{stem}{ext}")
        } else {
            format!("{stem}-{attempt}{ext}")
        };
        if taken(&existing, &candidate) {
            continue;
        }
        match place_at(io, temp, dir, &candidate, display) {
            Ok(true) => return Ok(candidate),
            // Lost a race with something else creating the same name:
            // remember it and try the next suffix.
            Ok(false) => {
                existing.insert(candidate.to_ascii_lowercase());
            }
            Err(error) => {
                let _ = io.remove_temp(temp);
                return Err(CaptureError::Write(error));
            }
        }
    }
    let _ = io.remove_temp(temp);
    Err(CaptureError::Write(WriteError::Io {
        operation: "name a captured file in",
        path: display.to_owned(),
        source: io::Error::other("too many collisions"),
    }))
}

/// Places a later version at the fixed name `<stem>.v<number><extension>`,
/// which must not already exist: version numbers are never reused, so a
/// file already there means something is wrong rather than a name to work
/// around.
#[allow(clippy::too_many_arguments)]
fn place_version<I: AtomicIo>(
    io: &mut I,
    temp: &Path,
    dir: &Path,
    existing: &HashSet<String>,
    stem: &str,
    extension: &str,
    number: u32,
    display: &str,
) -> Result<String, CaptureError> {
    let candidate = format!("{stem}.v{number}{extension}");
    if taken(existing, &candidate) {
        let _ = io.remove_temp(temp);
        return Err(CaptureError::VersionExists {
            path: format!("{display}/{candidate}"),
        });
    }
    match place_at(io, temp, dir, &candidate, display) {
        Ok(true) => Ok(candidate),
        Ok(false) => {
            let _ = io.remove_temp(temp);
            Err(CaptureError::VersionExists {
                path: format!("{display}/{candidate}"),
            })
        }
        Err(error) => {
            let _ = io.remove_temp(temp);
            Err(CaptureError::Write(error))
        }
    }
}

/// Lower-case hexadecimal SHA-256 and byte size of the file at `path`, read
/// in chunks (used to verify a copy, spec FR-EVD-03).
fn hash_file(path: &Path) -> io::Result<(u64, String)> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; HASH_CHUNK];
    let mut size = 0u64;
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
        size += n as u64;
    }
    Ok((size, format!("{:x}", hasher.finalize())))
}
