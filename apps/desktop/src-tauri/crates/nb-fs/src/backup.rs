//! The backup made before the first write by a different application version
//! (spec 5.11, FR-HIS-04, ADR-0025).

use std::fs;
use std::io;
use std::path::Path;

use crate::clock::Clock;
use crate::error::WriteError;
use crate::history::{is_snapshot_scope, Snapshot};
use crate::path::ProjectRelPath;
use crate::project::{ProjectRoot, NOTEBOOK_DIR};

/// Where backups go, inside `_notebook/` (spec 5.11).
const BACKUPS_DIR: &str = "backups";
/// How many backups may share a second before giving up.
const MAX_SAME_SECOND: u32 = 10_000;
/// Longest version text put in a folder name.
const VERSION_CHARS: usize = 64;

/// A backup that was made.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Backup {
    /// The project-relative path of the backup folder.
    pub folder: String,
    /// How many files were copied.
    pub copied: usize,
    /// Files and folders in scope that were not copied because they are links
    /// or not usable names, and so could not be read safely.
    pub skipped: usize,
}

/// The version as one legal folder-name segment: letters, digits, `.`, `+`
/// and `-` are kept, anything else becomes `_`, and a trailing dot (which
/// Windows drops) becomes `_` too.
fn folder_version(version: &str) -> String {
    let mut text: String = version
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '+' | '-') {
                c
            } else {
                '_'
            }
        })
        .take(VERSION_CHARS)
        .collect();
    if text.is_empty() {
        return "unknown".to_owned();
    }
    if text.ends_with('.') {
        text.pop();
        text.push('_');
    }
    text
}

/// The notebook text files found, as paths relative to `_notebook/`, and how
/// many things in scope could not be listed safely.
#[derive(Default)]
struct Found {
    files: Vec<String>,
    skipped: usize,
}

impl Found {
    /// Lists `dir` (relative to `_notebook/`), adding each regular file for
    /// which `wanted` says yes. A link, or a name that is not text, counts as
    /// skipped; nothing is followed.
    fn scan(&mut self, notebook: &Path, dir: &str, wanted: impl Fn(&str) -> bool) {
        let path = if dir.is_empty() {
            notebook.to_path_buf()
        } else {
            notebook.join(dir)
        };
        let Ok(entries) = fs::read_dir(&path) else {
            return;
        };
        let mut names: Vec<(String, fs::FileType)> = Vec::new();
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            match entry.file_name().into_string() {
                Ok(name) => names.push((name, kind)),
                Err(_) => self.skipped += 1,
            }
        }
        names.sort_by(|a, b| a.0.cmp(&b.0));
        for (name, kind) in names {
            let relative = if dir.is_empty() {
                name.clone()
            } else {
                format!("{dir}/{name}")
            };
            if !wanted(&relative) {
                continue;
            }
            if kind.is_file() {
                self.files.push(relative);
            } else {
                self.skipped += 1;
            }
        }
    }

    /// The names of the real folders in `dir`, counting a link as skipped.
    fn folders(&mut self, notebook: &Path, dir: &str) -> Vec<String> {
        let Ok(entries) = fs::read_dir(notebook.join(dir)) else {
            return Vec::new();
        };
        let mut folders = Vec::new();
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            let Ok(name) = entry.file_name().into_string() else {
                self.skipped += 1;
                continue;
            };
            if name.starts_with('.') {
                continue;
            }
            if kind.is_symlink() {
                self.skipped += 1;
            } else if kind.is_dir() {
                folders.push(format!("{dir}/{name}"));
            }
        }
        folders.sort();
        folders
    }
}

impl ProjectRoot {
    /// Copies every notebook text file into
    /// `_notebook/backups/<timestamp>-before-<app version>/`. Call it before
    /// the first write by a version other than `last_written_by`; the caller
    /// reads that from `project.yaml`, which only `packages/format` parses.
    ///
    /// Only files that [`is_snapshot_scope`] names are copied, and links are
    /// neither followed nor copied. A backup that already has the name is
    /// never replaced: the next free `<timestamp>-N` is used.
    pub fn backup_before_version(
        &self,
        app_version: &str,
        clock: &impl Clock,
    ) -> Result<Backup, WriteError> {
        let display = format!("{NOTEBOOK_DIR}/{BACKUPS_DIR}");
        let found = self.notebook_text_files();
        let now = clock.now();
        let version = folder_version(app_version);
        let leaf = (1..=MAX_SAME_SECOND)
            .map(|seq| format!("{}-before-{version}", Snapshot { at: now, seq }.file_stem()))
            .find(|leaf| fs::symlink_metadata(self.notebook.join(BACKUPS_DIR).join(leaf)).is_err())
            .ok_or_else(|| WriteError::Io {
                operation: "name a backup in",
                path: display.clone(),
                source: io::Error::other("too many backups in one second"),
            })?;
        // Confines `backups/` before anything is copied into it.
        self.confined_folder(&[BACKUPS_DIR, &leaf], &display)?;

        let folder = format!("{display}/{leaf}");
        for relative in &found.files {
            let bytes = self.read_backup_source(relative)?;
            let to = ProjectRelPath::parse(&format!("{folder}/{relative}"))?;
            self.write_atomic(&to, &bytes)?;
        }
        Ok(Backup {
            folder,
            copied: found.files.len(),
            skipped: found.skipped,
        })
    }

    /// The notebook text files that a backup holds, found without following
    /// any link. The layout is fixed (format-v1.md section 1), so nothing is
    /// walked: the top of `_notebook/`, `questions/`, `styles/` and one level
    /// of `experiments/`.
    fn notebook_text_files(&self) -> Found {
        let mut found = Found::default();
        found.scan(&self.notebook, "", is_snapshot_scope);
        for folder in ["questions", "styles"] {
            if self.is_real_folder(folder) {
                found.scan(&self.notebook, folder, is_snapshot_scope);
            } else if self.notebook.join(folder).exists() {
                found.skipped += 1;
            }
        }
        if self.is_real_folder("experiments") {
            for experiment in found.folders(&self.notebook, "experiments") {
                found.scan(&self.notebook, &experiment, is_snapshot_scope);
            }
        } else if self.notebook.join("experiments").exists() {
            found.skipped += 1;
        }
        found
    }

    /// Whether `relative` (to `_notebook/`) is a folder and not a link.
    fn is_real_folder(&self, relative: &str) -> bool {
        fs::symlink_metadata(self.notebook.join(relative))
            .is_ok_and(|meta| meta.is_dir() && !meta.file_type().is_symlink())
    }

    /// The bytes of a file found by [`ProjectRoot::notebook_text_files`].
    fn read_backup_source(&self, relative: &str) -> Result<Vec<u8>, WriteError> {
        fs::read(self.notebook.join(relative)).map_err(|source| WriteError::Io {
            operation: "read",
            path: format!("{NOTEBOOK_DIR}/{relative}"),
            source,
        })
    }
}
