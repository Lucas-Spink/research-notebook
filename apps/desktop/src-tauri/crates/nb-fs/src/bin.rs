//! The bin: what the application keeps in `.trash/` and how it comes back
//! (spec 5.11, FR-EXP-06, FR-EVD-10, ADR-0062). Removing an artefact's files
//! moves them under `.trash/<stamp>/experiments/<experiment>/`, beside a copy
//! of its record. Nothing is ever deleted here, and a restore never replaces
//! anything: a name already in use is refused.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::atomic::{replace, write, Destination};
use crate::clock::Clock;
use crate::error::{ReadError, WriteError};
use crate::history::Snapshot;
use crate::names::is_windows_safe_segment;
use crate::path::ProjectRelPath;
use crate::project::{ProjectRoot, NOTEBOOK_DIR};
use crate::trash::TRASH_DIR;
use crate::RealIo;

/// The record kept beside binned files: an ordinary `artefacts.yaml` that
/// holds the removed artefact.
const RECORD: &str = "artefacts.yaml";
/// What the record is renamed to once its files are back, so the bin no
/// longer lists it. It stays in the bin.
const RESTORED_RECORD: &str = "artefacts.restored.yaml";
/// The largest record read back (2 MiB); a real one is a few kilobytes.
const RECORD_LIMIT: u64 = 2 * 1024 * 1024;

/// What a bin entry is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinKind {
    /// A question file moved to the bin.
    Question,
    /// A whole experiment folder moved to the bin.
    Experiment,
    /// Files removed from an experiment, with the record of their artefact.
    Files,
}

/// One thing in the bin.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BinEntry {
    /// The `.trash/` folder it is in, which is when it was binned.
    pub stamp: String,
    pub kind: BinKind,
    /// A question's file name, or an experiment's folder name.
    pub name: String,
    /// Where it comes back to, relative to the project folder.
    pub original: String,
}

/// What removing an artefact's files did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BinnedFiles {
    /// The `.trash/` folder they went to.
    pub stamp: String,
    pub moved: usize,
    /// Files that were already gone; they do not stop the others.
    pub missing: usize,
}

fn is_single_name(name: &str) -> bool {
    !name.is_empty() && !name.contains(['/', '\\']) && is_windows_safe_segment(name)
}

fn valid_stamp(stamp: &str) -> bool {
    Snapshot::parse_stem(stamp).is_some()
}

fn io_error(operation: &'static str, path: &str, source: io::Error) -> WriteError {
    WriteError::Io {
        operation,
        path: path.to_owned(),
        source,
    }
}

/// `Some(true)` for a regular file or folder, `Some(false)` for a link or
/// anything else, `None` when nothing is there.
fn plain_entry(path: &Path) -> io::Result<Option<fs::Metadata>> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => Ok(None),
        Ok(meta) => Ok(Some(meta)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Every regular file under `dir`, as paths relative to it, in a fixed order.
/// A link anywhere stops the walk with an error: it is never followed.
fn files_below(dir: &Path, prefix: &str, out: &mut Vec<String>) -> io::Result<()> {
    let mut names: Vec<_> = fs::read_dir(dir)?.collect::<Result<_, _>>()?;
    names.sort_by_key(fs::DirEntry::file_name);
    for entry in names {
        let name = entry.file_name().to_string_lossy().into_owned();
        let relative = if prefix.is_empty() {
            name
        } else {
            format!("{prefix}/{name}")
        };
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            return Err(io::Error::other("a link in the bin"));
        } else if kind.is_dir() {
            files_below(&entry.path(), &relative, out)?;
        } else {
            out.push(relative);
        }
    }
    Ok(())
}

impl ProjectRoot {
    /// Removes an artefact's version files from `experiment` by moving them to
    /// `.trash/<stamp>/experiments/<experiment>/…`, and keeps `record` (the
    /// artefact's record as an `artefacts.yaml`) beside them so it can be put
    /// back. Only files under the experiment's `evidence/` or `methods/` are
    /// accepted. A linked artefact has no files: pass none, and only the
    /// record is kept; the linked file is never touched.
    ///
    /// The record is written first, so files are never in the bin without it.
    /// A file that is already gone is counted, not an error.
    pub fn bin_artefact_files(
        &self,
        experiment: &str,
        files: &[ProjectRelPath],
        record: &[u8],
        clock: &impl Clock,
    ) -> Result<BinnedFiles, WriteError> {
        let display = format!("{NOTEBOOK_DIR}/experiments/{experiment}");
        if !is_single_name(experiment) {
            return Err(WriteError::NotTrashable { path: display });
        }
        let mut inside: Vec<Vec<String>> = Vec::new();
        for file in files {
            let segments: Vec<&str> = file.segments().collect();
            match segments.as_slice() {
                [first, "experiments", exp, kind @ ("evidence" | "methods"), rest @ ..]
                    if *first == NOTEBOOK_DIR && *exp == experiment && !rest.is_empty() =>
                {
                    let mut path = vec!["experiments".to_owned(), (*exp).to_owned()];
                    path.push((*kind).to_owned());
                    path.extend(rest.iter().map(|s| (*s).to_owned()));
                    self.check_names(
                        &path.iter().map(String::as_str).collect::<Vec<_>>(),
                        file.as_str(),
                    )?;
                    inside.push(path);
                }
                [first, ..] if *first != NOTEBOOK_DIR => {
                    return Err(WriteError::OutsideNotebook {
                        path: file.as_str().to_owned(),
                    })
                }
                _ => {
                    return Err(WriteError::NotTrashable {
                        path: file.as_str().to_owned(),
                    })
                }
            }
        }

        let mut relatives: Vec<String> = inside.iter().map(|p| p.join("/")).collect();
        relatives.push(format!("experiments/{experiment}/{RECORD}"));
        let stamp = self.free_trash_folder(clock.now(), &relatives, &display)?;

        let dir =
            self.confined_folder(&[TRASH_DIR, &stamp, "experiments", experiment], &display)?;
        let destination = Destination {
            dir: &dir,
            name: RECORD,
            display: &display,
            permissions: None,
        };
        write(&mut RealIo, &destination, record)?;

        let (mut moved, mut missing) = (0, 0);
        for path in &inside {
            let segments: Vec<&str> = path.iter().map(String::as_str).collect();
            match self.trash_into(&segments, &path.join("/"), &stamp) {
                Ok(()) => moved += 1,
                Err(WriteError::Missing { .. }) => missing += 1,
                Err(other) => return Err(other),
            }
        }
        Ok(BinnedFiles {
            stamp,
            moved,
            missing,
        })
    }

    /// Everything in the bin, oldest first. Reads only; a link is not followed.
    pub fn list_bin(&self) -> Result<Vec<BinEntry>, ReadError> {
        let trash = self.notebook.join(TRASH_DIR);
        let read_error = |path: &Path, source| ReadError::Io {
            path: path.display().to_string(),
            source,
        };
        let mut stamps: Vec<String> = match fs::read_dir(&trash) {
            Ok(entries) => entries
                .filter_map(Result::ok)
                .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|name| valid_stamp(name))
                .collect(),
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(read_error(&trash, e)),
        };
        stamps.sort();

        let mut entries = Vec::new();
        for stamp in stamps {
            let base = trash.join(&stamp);
            for name in child_names(&base.join("questions"), false) {
                entries.push(BinEntry {
                    stamp: stamp.clone(),
                    kind: BinKind::Question,
                    original: format!("{NOTEBOOK_DIR}/questions/{name}"),
                    name,
                });
            }
            for name in child_names(&base.join("experiments"), true) {
                let folder = base.join("experiments").join(&name);
                let kind = if is_plain_file(&folder.join("experiment.md")) {
                    BinKind::Experiment
                } else if is_plain_file(&folder.join(RECORD)) {
                    BinKind::Files
                } else {
                    continue;
                };
                entries.push(BinEntry {
                    stamp: stamp.clone(),
                    kind,
                    original: format!("{NOTEBOOK_DIR}/experiments/{name}"),
                    name,
                });
            }
        }
        Ok(entries)
    }

    /// The record kept with files removed from `experiment` in `stamp`.
    pub fn read_binned_record(&self, stamp: &str, experiment: &str) -> Result<String, ReadError> {
        let display = format!("{NOTEBOOK_DIR}/{TRASH_DIR}/{stamp}/experiments/{experiment}");
        if !valid_stamp(stamp) || !is_single_name(experiment) {
            return Err(ReadError::NotAFile { path: display });
        }
        let path = self
            .notebook
            .join(TRASH_DIR)
            .join(stamp)
            .join("experiments")
            .join(experiment)
            .join(RECORD);
        let meta = match plain_entry(&path) {
            Ok(Some(meta)) if meta.is_file() => meta,
            Ok(_) => return Err(ReadError::Missing { path: display }),
            Err(source) => {
                return Err(ReadError::Io {
                    path: display,
                    source,
                })
            }
        };
        if meta.len() > RECORD_LIMIT {
            return Err(ReadError::NotAFile { path: display });
        }
        let bytes = fs::read(&path).map_err(|source| ReadError::Io {
            path: display.clone(),
            source,
        })?;
        String::from_utf8(bytes).map_err(|_| ReadError::NotUtf8 { path: display })
    }

    /// Moves something in the bin back to where it was. Refused, with nothing
    /// moved, if anything is already in a place it would go. For
    /// [`BinKind::Files`] the experiment must exist; the files return to
    /// their folders and the record is renamed in the bin so it is not listed
    /// again. Putting the record back in `artefacts.yaml` is the caller's.
    pub fn restore_from_bin(
        &self,
        stamp: &str,
        kind: BinKind,
        name: &str,
    ) -> Result<(), WriteError> {
        let display = format!("{NOTEBOOK_DIR}/{TRASH_DIR}/{stamp}/{name}");
        if !valid_stamp(stamp) || !is_single_name(name) {
            return Err(WriteError::NotTrashable { path: display });
        }
        let group = match kind {
            BinKind::Question => "questions",
            BinKind::Experiment | BinKind::Files => "experiments",
        };
        let source = self
            .notebook
            .join(TRASH_DIR)
            .join(stamp)
            .join(group)
            .join(name);
        let inspected = plain_entry(&source).map_err(|e| io_error("inspect", &display, e))?;
        let Some(meta) = inspected else {
            return Err(WriteError::Missing { path: display });
        };
        if meta.is_dir() == matches!(kind, BinKind::Question) {
            return Err(WriteError::NotTrashable { path: display });
        }
        match kind {
            BinKind::Question | BinKind::Experiment => {
                self.move_back(&source, &[group], name, &display)
            }
            BinKind::Files => self.restore_files(&source, name, &display),
        }
    }

    /// Renames `source` to `_notebook/<folders>/<name>`, refusing a name in use.
    fn move_back(
        &self,
        source: &Path,
        folders: &[&str],
        name: &str,
        display: &str,
    ) -> Result<(), WriteError> {
        let dir = self.confined_folder(folders, display)?;
        let target = dir.join(name);
        if plain_or_link(&target).map_err(|e| io_error("inspect", display, e))? {
            return Err(WriteError::Exists {
                path: display.to_owned(),
            });
        }
        let destination = Destination {
            dir: &dir,
            name,
            display,
            permissions: None,
        };
        replace(&mut RealIo, source, &target, &destination)
    }

    fn restore_files(
        &self,
        source: &Path,
        experiment: &str,
        display: &str,
    ) -> Result<(), WriteError> {
        let live = self.notebook.join("experiments").join(experiment);
        match plain_entry(&live).map_err(|e| io_error("inspect", display, e))? {
            Some(meta) if meta.is_dir() => {}
            _ => {
                return Err(WriteError::Missing {
                    path: format!("{NOTEBOOK_DIR}/experiments/{experiment}"),
                })
            }
        }
        let mut files = Vec::new();
        files_below(source, "", &mut files).map_err(|e| io_error("list", display, e))?;
        files.retain(|f| f != RECORD && f != RESTORED_RECORD);

        // Check every place first, so a refusal leaves everything where it was.
        for file in &files {
            let target: PathBuf = live.join(file);
            if plain_or_link(&target).map_err(|e| io_error("inspect", display, e))? {
                return Err(WriteError::Exists {
                    path: format!("{NOTEBOOK_DIR}/experiments/{experiment}/{file}"),
                });
            }
        }
        for file in &files {
            let mut parts: Vec<&str> = file.split('/').collect();
            let Some(leaf) = parts.pop() else { continue };
            let mut folders = vec!["experiments", experiment];
            folders.extend(parts);
            self.move_back(&source.join(file), &folders, leaf, display)?;
        }
        let record = source.join(RECORD);
        let renamed = source.join(RESTORED_RECORD);
        fs::rename(&record, &renamed).map_err(|e| io_error("keep the record of", display, e))
    }
}

/// Whether anything at all, a link included, is at `path`.
fn plain_or_link(path: &Path) -> io::Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e),
    }
}

fn is_plain_file(path: &Path) -> bool {
    matches!(plain_entry(path), Ok(Some(meta)) if meta.is_file())
}

/// Names of the plain files (or, with `folders`, plain folders) in `dir`,
/// sorted. A missing or unreadable folder has none.
fn child_names(dir: &Path, folders: bool) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|e| {
            e.file_type()
                .is_ok_and(|t| !t.is_symlink() && t.is_dir() == folders)
        })
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}
