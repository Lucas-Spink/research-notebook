//! Finding the notebook data files on disk, read-only. Only the files
//! `packages/format` parses are listed (format-v1.md section 1); captured
//! evidence, history, trash, inbox and the lock are not indexed. Links are
//! never followed, so nothing outside `_notebook/` is read.

use std::fs::{self, File, Metadata};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use nb_fs::{ProjectRelPath, NOTEBOOK_DIR};
use sha2::{Digest, Sha256};

use crate::IndexError;

const HASH_CHUNK: usize = 64 * 1024;

/// A notebook data file found on disk.
pub(crate) struct DiskFile {
    pub key: ProjectRelPath,
    pub path: PathBuf,
    pub size: u64,
    pub mtime_ns: i64,
}

/// Lists `project.yaml`, `bibliography.json`, `questions/*.md` and, in each
/// folder of `experiments/`, `experiment.md` and `artefacts.yaml`.
pub(crate) fn list(notebook: &Path) -> Result<Vec<DiskFile>, IndexError> {
    let mut found = Vec::new();
    for name in ["project.yaml", "bibliography.json"] {
        add(&mut found, notebook, name);
    }
    for (name, _) in entries(&notebook.join("questions"), "questions")? {
        if name.ends_with(".md") {
            add(&mut found, notebook, &format!("questions/{name}"));
        }
    }
    for (name, _) in entries(&notebook.join("experiments"), "experiments")? {
        for file in ["experiment.md", "artefacts.yaml"] {
            add(&mut found, notebook, &format!("experiments/{name}/{file}"));
        }
    }
    Ok(found)
}

/// Adds `relative` (to `_notebook/`) if it is a regular file, not a link.
fn add(found: &mut Vec<DiskFile>, notebook: &Path, relative: &str) {
    let path = notebook.join(relative);
    let Ok(meta) = fs::symlink_metadata(&path) else {
        return;
    };
    if !meta.is_file() {
        return;
    }
    let Ok(key) = ProjectRelPath::parse(&format!("{NOTEBOOK_DIR}/{relative}")) else {
        return;
    };
    found.push(DiskFile {
        key,
        path,
        size: meta.len(),
        mtime_ns: mtime_ns(&meta),
    });
}

/// The visible entries of `dir` with UTF-8 names. A missing folder, or a
/// link or file in its place, has none. Hidden names (the dot-prefixed
/// temporary files of an atomic write) are skipped.
fn entries(dir: &Path, display: &str) -> Result<Vec<(String, PathBuf)>, IndexError> {
    match fs::symlink_metadata(dir) {
        Ok(meta) if meta.is_dir() => {}
        Ok(_) => return Ok(Vec::new()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(source) => {
            return Err(IndexError::Io {
                path: display.to_owned(),
                source,
            })
        }
    }
    let io_error = |source| IndexError::Io {
        path: display.to_owned(),
        source,
    };
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).map_err(io_error)? {
        let entry = entry.map_err(io_error)?;
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if !name.starts_with('.') {
            out.push((name, entry.path()));
        }
    }
    Ok(out)
}

fn mtime_ns(meta: &Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .and_then(|d| i64::try_from(d.as_nanos()).ok())
        .unwrap_or(0)
}

/// Lower-case hexadecimal SHA-256 of the file, read in chunks.
pub(crate) fn sha256_hex(path: &Path) -> io::Result<String> {
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
