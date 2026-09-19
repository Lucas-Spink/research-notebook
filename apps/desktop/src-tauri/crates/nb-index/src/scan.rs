use std::collections::{HashMap, HashSet};

use nb_fs::{ProjectRelPath, ProjectRoot};

use crate::discover::{self, DiskFile};
use crate::store::Index;
use crate::IndexError;

/// How much of the disk a scan trusts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanMode {
    /// A file whose size and modification time match the index is unchanged
    /// without being read.
    Quick,
    /// Every file is hashed, so an edit that kept the size and the time
    /// (coarse clocks, tools that restore times) is still found.
    Full,
}

/// A notebook file as it was when scanned.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileMeta {
    pub path: ProjectRelPath,
    pub size: u64,
    /// Nanoseconds since 1970-01-01.
    pub mtime_ns: i64,
    /// Lower-case hexadecimal SHA-256 of the content.
    pub sha256: String,
}

/// The result of comparing the disk with the index.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Scan {
    /// Files new or different since they were indexed, by path.
    pub changed: Vec<FileMeta>,
    /// Indexed files that are no longer on disk.
    pub removed: Vec<ProjectRelPath>,
    /// Files the index already holds as they are.
    pub unchanged: usize,
    /// Files that could not be read now (for example held by another
    /// process). The index keeps whatever it has for them.
    pub unreadable: Vec<(ProjectRelPath, String)>,
}

struct Stored {
    size: i64,
    mtime_ns: i64,
    sha256: String,
}

impl Index {
    /// Compares the notebook data files on disk with the index. Reads files
    /// only to hash them; nothing in the project is written.
    ///
    /// A file whose content is unchanged but whose time or size the index
    /// remembers differently is brought up to date here and counted as
    /// unchanged, so the next quick scan does not hash it again.
    pub fn scan(&mut self, root: &ProjectRoot, mode: ScanMode) -> Result<Scan, IndexError> {
        let disk = discover::list(root.notebook_dir())?;
        let stored = self.stored_files()?;
        let mut scan = Scan::default();
        let mut refresh: Vec<&DiskFile> = Vec::new();
        let mut seen: HashSet<&str> = HashSet::new();
        for file in &disk {
            seen.insert(file.key.as_str());
            let known = stored.get(file.key.as_str());
            if let Some(s) = known {
                if mode == ScanMode::Quick && same_stat(s, file) {
                    scan.unchanged += 1;
                    continue;
                }
            }
            let sha256 = match discover::sha256_hex(&file.path) {
                Ok(hash) => hash,
                Err(e) => {
                    scan.unreadable.push((file.key.clone(), e.to_string()));
                    continue;
                }
            };
            match known {
                Some(s) if s.sha256 == sha256 => {
                    scan.unchanged += 1;
                    if !same_stat(s, file) {
                        refresh.push(file);
                    }
                }
                _ => scan.changed.push(FileMeta {
                    path: file.key.clone(),
                    size: file.size,
                    mtime_ns: file.mtime_ns,
                    sha256,
                }),
            }
        }
        scan.removed = removed(&stored, &seen)?;
        scan.changed
            .sort_by(|a, b| a.path.as_str().cmp(b.path.as_str()));
        scan.removed.sort_by(|a, b| a.as_str().cmp(b.as_str()));
        self.refresh_stat(&refresh)?;
        Ok(scan)
    }

    /// Empties the index and scans every file, for a full rebuild: apply the
    /// returned scan as usual.
    pub fn rebuild_scan(&mut self, root: &ProjectRoot) -> Result<Scan, IndexError> {
        self.clear()?;
        self.scan(root, ScanMode::Full)
    }

    fn stored_files(&self) -> Result<HashMap<String, Stored>, IndexError> {
        let mut statement = self
            .conn
            .prepare("SELECT path, size, mtime_ns, sha256 FROM files")?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                Stored {
                    size: row.get(1)?,
                    mtime_ns: row.get(2)?,
                    sha256: row.get(3)?,
                },
            ))
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    fn refresh_stat(&mut self, files: &[&DiskFile]) -> Result<(), IndexError> {
        if files.is_empty() {
            return Ok(());
        }
        let tx = self.conn.transaction()?;
        for file in files {
            let size = i64::try_from(file.size).unwrap_or(i64::MAX);
            tx.prepare_cached("UPDATE files SET size = ?2, mtime_ns = ?3 WHERE path = ?1")?
                .execute(rusqlite::params![file.key.as_str(), size, file.mtime_ns])?;
        }
        tx.commit()?;
        Ok(())
    }
}

fn same_stat(stored: &Stored, file: &DiskFile) -> bool {
    stored.mtime_ns == file.mtime_ns && u64::try_from(stored.size).is_ok_and(|s| s == file.size)
}

/// Indexed paths that are not on disk. A path the index holds that no longer
/// parses as a project path cannot be produced by this crate, so it is
/// reported as damage.
fn removed(
    stored: &HashMap<String, Stored>,
    seen: &HashSet<&str>,
) -> Result<Vec<ProjectRelPath>, IndexError> {
    stored
        .keys()
        .filter(|path| !seen.contains(path.as_str()))
        .map(|path| {
            ProjectRelPath::parse(path).map_err(|e| IndexError::Damaged {
                reason: format!("`{path}` is not a project path: {e}"),
            })
        })
        .collect()
}
