//! Discovery (FR-EVD-09, spec 9.4, NFR-PERF-05, ADR-0035): a read-only scan
//! of a folder a person chooses, proposing files to capture. Include and
//! exclude globs decide what is proposed; an excluded folder is never
//! entered, so clutter such as `node_modules` costs nothing to skip. Files
//! already captured are marked, by source path, not by content: hashing every
//! file would make a scan as slow as reading the whole folder.
//!
//! The scan never writes, never follows a link out of the chosen folder, and
//! always skips `_notebook/` folders, whose evidence copies are captures
//! already rather than sources.

use std::collections::HashSet;
use std::fs::{self, DirEntry};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use glob::{MatchOptions, Pattern};
use unicode_normalization::UnicodeNormalization;

use crate::error::DiscoveryError;
use crate::link::to_timestamp;
use crate::lock::Timestamp;
use crate::project::NOTEBOOK_DIR;

/// The exclusions a scan starts with: FR-EVD-09's list plus spec 9.4's
/// `desktop.ini`. Both platforms' clutter is excluded on both, since a
/// folder made on a Mac is often scanned on Windows and the other way round.
pub const DEFAULT_EXCLUDES: &[&str] = &[
    ".git",
    ".snakemake",
    ".nextflow",
    "work",
    "node_modules",
    "__pycache__",
    "._*",
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
];

/// Entries examined between progress reports. Counting entries rather than
/// time keeps the scan free of clocks; at this spacing a report arrives many
/// times a second on any disk fast enough to meet NFR-PERF-05 at all.
const PROGRESS_EVERY: u64 = 256;

/// Both platforms' default filesystems are case-insensitive (spec 9.4), so
/// patterns are too; `*` never crosses a `/`.
const MATCH_OPTIONS: MatchOptions = MatchOptions {
    case_sensitive: false,
    require_literal_separator: true,
    require_literal_leading_dot: false,
};

/// Which files a scan proposes. A pattern without `/` matches a file or
/// folder name at any depth; one with `/` matches the whole path relative to
/// the chosen folder. An empty `include` proposes every file not excluded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveryOptions {
    pub include: Vec<String>,
    pub exclude: Vec<String>,
}

impl Default for DiscoveryOptions {
    fn default() -> Self {
        Self {
            include: Vec::new(),
            exclude: DEFAULT_EXCLUDES.iter().map(|s| (*s).to_owned()).collect(),
        }
    }
}

/// A file a scan proposes for capture.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveredFile {
    /// Relative to the chosen folder, `/`-separated.
    pub rel_path: String,
    pub size: u64,
    pub modified: Timestamp,
    /// Whether the path matches one the caller listed as already captured.
    pub captured: bool,
}

/// How far a scan has got: files examined, whether proposed or not, and
/// folders entered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct DiscoveryProgress {
    pub files_seen: u64,
    pub folders_seen: u64,
}

/// What a scan found, sorted by path. A cancelled scan returns what it had
/// found so far with `cancelled` set.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Discovery {
    pub files: Vec<DiscoveredFile>,
    pub folders_visited: u64,
    /// Folders that could not be read and entries whose names are not valid
    /// Unicode; the scan carries on without them.
    pub skipped: Vec<PathBuf>,
    pub cancelled: bool,
}

/// Scans `folder` recursively. `captured` lists source paths already
/// captured, relative to `folder`; they are compared without regard to case,
/// separator style or Unicode normalisation. `cancel` is checked before every
/// entry, and `progress` is called once at the start, every few hundred
/// entries and once at the end.
pub fn discover(
    folder: &Path,
    options: &DiscoveryOptions,
    captured: &[String],
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(&DiscoveryProgress),
) -> Result<Discovery, DiscoveryError> {
    let include = Globs::compile(&options.include)?;
    let exclude = Globs::compile(&options.exclude)?;
    let meta = fs::metadata(folder).map_err(|source| DiscoveryError::Io {
        path: folder.to_path_buf(),
        source,
    })?;
    if !meta.is_dir() {
        return Err(DiscoveryError::NotAFolder {
            path: folder.to_path_buf(),
        });
    }
    let mut scan = Scan {
        root: folder,
        include,
        exclude,
        captured: captured.iter().map(|p| path_key(p)).collect(),
        cancel,
        progress,
        state: DiscoveryProgress::default(),
        entries: 0,
        found: Discovery::default(),
    };
    scan.run()?;
    let mut found = scan.found;
    found.files.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(found)
}

/// A compiled pattern list; each pattern remembers whether it matches a name
/// or a whole relative path.
struct Globs(Vec<(Pattern, bool)>);

impl Globs {
    fn compile(patterns: &[String]) -> Result<Self, DiscoveryError> {
        patterns
            .iter()
            .map(|p| {
                Pattern::new(p)
                    .map(|pattern| (pattern, p.contains('/')))
                    .map_err(|err| DiscoveryError::InvalidPattern {
                        pattern: p.clone(),
                        message: err.msg,
                    })
            })
            .collect::<Result<_, _>>()
            .map(Self)
    }

    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    fn matches(&self, rel_path: &str, name: &str) -> bool {
        self.0.iter().any(|(pattern, whole_path)| {
            let subject = if *whole_path { rel_path } else { name };
            pattern.matches_with(subject, MATCH_OPTIONS)
        })
    }
}

/// The comparison key for a relative path: `/`-separated, NFC, lower case.
fn path_key(path: &str) -> String {
    let unified = path.replace('\\', "/");
    unified
        .trim_matches('/')
        .nfc()
        .collect::<String>()
        .to_lowercase()
}

struct Scan<'a> {
    root: &'a Path,
    include: Globs,
    exclude: Globs,
    captured: HashSet<String>,
    cancel: &'a AtomicBool,
    progress: &'a mut dyn FnMut(&DiscoveryProgress),
    state: DiscoveryProgress,
    entries: u64,
    found: Discovery,
}

impl Scan<'_> {
    fn run(&mut self) -> Result<(), DiscoveryError> {
        (self.progress)(&self.state);
        // Folders still to read, relative to the root ("" is the root).
        let mut pending = vec![String::new()];
        while let Some(rel_dir) = pending.pop() {
            if self.cancelled() {
                return Ok(());
            }
            let dir = self.root.join(&rel_dir);
            let entries = match fs::read_dir(&dir) {
                Ok(entries) => entries,
                // The chosen folder was readable a moment ago; losing it now
                // is an error, but losing a subfolder only skips it.
                Err(source) if rel_dir.is_empty() => {
                    return Err(DiscoveryError::Io { path: dir, source })
                }
                Err(_) => {
                    self.found.skipped.push(dir);
                    continue;
                }
            };
            self.state.folders_seen += 1;
            self.found.folders_visited += 1;
            for entry in entries {
                if self.cancelled() {
                    return Ok(());
                }
                let Ok(entry) = entry else { continue };
                if let Some(sub) = self.visit(&rel_dir, &entry) {
                    pending.push(sub);
                }
                self.tick();
            }
        }
        (self.progress)(&self.state);
        Ok(())
    }

    /// Looks at one entry: records a proposed file, or returns a folder to
    /// enter. Links are neither followed nor proposed.
    fn visit(&mut self, rel_dir: &str, entry: &DirEntry) -> Option<String> {
        let Ok(kind) = entry.file_type() else {
            return None;
        };
        if kind.is_symlink() {
            return None;
        }
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            self.found.skipped.push(entry.path());
            return None;
        };
        let rel_path = if rel_dir.is_empty() {
            name.clone()
        } else {
            format!("{rel_dir}/{name}")
        };
        if kind.is_dir() {
            let wanted =
                !name.eq_ignore_ascii_case(NOTEBOOK_DIR) && !self.exclude.matches(&rel_path, &name);
            return wanted.then_some(rel_path);
        }
        if kind.is_file() {
            self.state.files_seen += 1;
            self.propose(entry, rel_path, &name);
        }
        None
    }

    fn propose(&mut self, entry: &DirEntry, rel_path: String, name: &str) {
        if self.exclude.matches(&rel_path, name)
            || (!self.include.is_empty() && !self.include.matches(&rel_path, name))
        {
            return;
        }
        let Ok(meta) = entry.metadata() else {
            self.found.skipped.push(entry.path());
            return;
        };
        let modified = meta
            .modified()
            .map_or(Timestamp::from_unix(0), to_timestamp);
        let captured = self.captured.contains(&path_key(&rel_path));
        self.found.files.push(DiscoveredFile {
            rel_path,
            size: meta.len(),
            modified,
            captured,
        });
    }

    fn tick(&mut self) {
        self.entries += 1;
        if self.entries.is_multiple_of(PROGRESS_EVERY) {
            (self.progress)(&self.state);
        }
    }

    fn cancelled(&mut self) -> bool {
        let cancelled = self.cancel.load(Ordering::Relaxed);
        self.found.cancelled |= cancelled;
        cancelled
    }
}
