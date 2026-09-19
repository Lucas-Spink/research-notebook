use nb_fs::cache::CacheDir;
use nb_fs::{ProjectRelPath, ProjectRoot};
use rusqlite::Connection;

use crate::records::FileRecords;
use crate::scan::{FileMeta, Scan, ScanMode};
use crate::IndexError;

/// Why an existing database was discarded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResetReason {
    /// It was written with another schema version.
    SchemaMismatch { found: i64 },
    /// SQLite could not read it.
    Unreadable,
}

/// What [`Index::open`] found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpenOutcome {
    Created,
    Reused,
    Reset(ResetReason),
}

/// A parsed file: the state it was scanned in, and its rows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileUpdate {
    pub meta: FileMeta,
    pub records: FileRecords,
}

pub struct Index {
    pub(crate) conn: Connection,
}

impl Index {
    pub fn file_name(project_id: &str) -> String {
        format!("index-{project_id}.sqlite")
    }

    pub fn open(cache: &CacheDir, project_id: &str) -> Result<(Self, OpenOutcome), IndexError> {
        cache.ensure()?;
        let path = cache.path_of(&Self::file_name(project_id))?;
        let conn = Connection::open(path)?;
        Ok((Self { conn }, OpenOutcome::Created))
    }

    pub fn scan(&mut self, _root: &ProjectRoot, _mode: ScanMode) -> Result<Scan, IndexError> {
        Ok(Scan::default())
    }

    pub fn apply(
        &mut self,
        _updates: &[FileUpdate],
        _removed: &[ProjectRelPath],
    ) -> Result<(), IndexError> {
        Ok(())
    }

    pub fn clear(&mut self) -> Result<(), IndexError> {
        Ok(())
    }

    pub fn rebuild_scan(&mut self, root: &ProjectRoot) -> Result<Scan, IndexError> {
        self.clear()?;
        self.scan(root, ScanMode::Full)
    }
}
