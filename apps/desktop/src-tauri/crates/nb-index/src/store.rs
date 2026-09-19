use std::path::Path;
use std::time::Duration;

use nb_fs::cache::CacheDir;
use nb_fs::ProjectRelPath;
use rusqlite::{params, Connection, ErrorCode, Transaction};

use crate::records::FileRecords;
use crate::rows::insert_rows;
use crate::scan::FileMeta;
use crate::schema::{self, SCHEMA_VERSION, TABLES};
use crate::IndexError;

/// How long to wait for another connection's lock.
const BUSY_TIMEOUT: Duration = Duration::from_secs(5);
/// Longest project id accepted, so the file name stays legal everywhere.
const MAX_ID_LEN: usize = 64;
/// Files SQLite may leave beside a database.
const DATABASE_SUFFIXES: [&str; 4] = ["", "-journal", "-wal", "-shm"];

/// Why an existing database was discarded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResetReason {
    /// It was written with another schema version.
    SchemaMismatch { found: i64 },
    /// SQLite reported it is not a database, is damaged or lacks a table.
    Unreadable,
}

/// What [`Index::open`] found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpenOutcome {
    /// There was no database; an empty one was made.
    Created,
    /// The existing database was current and is kept as it is.
    Reused,
    /// The existing database was removed and an empty one made. Scan it as
    /// any other empty index: every file is reported as changed.
    Reset(ResetReason),
}

/// A parsed file: its state when scanned, and its rows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileUpdate {
    pub meta: FileMeta,
    pub records: FileRecords,
}

/// One project's index. Methods block; callers run them on a blocking thread.
pub struct Index {
    pub(crate) conn: Connection,
}

impl Index {
    /// The database's file name in the cache folder for `project_id`.
    pub fn file_name(project_id: &str) -> String {
        format!("index-{project_id}.sqlite")
    }

    /// Opens the index of the project `project_id` in `cache`, creating the
    /// cache folder and the database if needed. A database with another
    /// schema version, or that SQLite cannot read, is removed and replaced
    /// by an empty one, since everything in it can be derived again (P1).
    ///
    /// Other failures, such as another process holding the database, are
    /// returned and nothing is removed.
    pub fn open(cache: &CacheDir, project_id: &str) -> Result<(Self, OpenOutcome), IndexError> {
        check_project_id(project_id)?;
        cache.ensure()?;
        let name = Self::file_name(project_id);
        let path = cache.path_of(&name)?;
        let mut reason = None;
        if path.exists() {
            match inspect(&path)? {
                Inspection::Current => return Ok((Self::connect(&path)?, OpenOutcome::Reused)),
                Inspection::Discard(why) => {
                    for suffix in DATABASE_SUFFIXES {
                        cache.remove_file(&format!("{name}{suffix}"))?;
                    }
                    reason = Some(why);
                }
            }
        }
        let index = Self::connect(&path)?;
        schema::create(&index.conn)?;
        Ok((
            index,
            reason.map_or(OpenOutcome::Created, OpenOutcome::Reset),
        ))
    }

    fn connect(path: &Path) -> Result<Self, IndexError> {
        let conn = Connection::open(path)?;
        conn.busy_timeout(BUSY_TIMEOUT)?;
        // Cascades remove a file's rows with the file. The index is
        // disposable, so a crash costs a rebuild, not data: NORMAL is enough.
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;")?;
        Ok(Self { conn })
    }

    /// Replaces the rows of every file in `updates` and drops those of every
    /// path in `removed`, in one transaction: a failure changes nothing.
    ///
    /// Each update carries the metadata the file had when it was scanned, so
    /// a file edited between the scan and the parse is seen as changed by
    /// the next scan.
    pub fn apply(
        &mut self,
        updates: &[FileUpdate],
        removed: &[ProjectRelPath],
    ) -> Result<(), IndexError> {
        let tx = self.conn.transaction()?;
        for path in removed {
            delete_file(&tx, path.as_str())?;
        }
        for update in updates {
            let file = update.meta.path.as_str();
            delete_file(&tx, file)?;
            insert_file(&tx, &update.meta)?;
            insert_rows(&tx, file, &update.records)?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Removes every row, leaving the empty schema.
    pub fn clear(&mut self) -> Result<(), IndexError> {
        let tx = self.conn.transaction()?;
        for table in TABLES.iter().rev() {
            tx.execute(&format!("DELETE FROM {table}"), [])?;
        }
        tx.commit()?;
        Ok(())
    }
}

/// A project id is a ULID in practice; anything that could not be one plain
/// file name is refused rather than escaped.
fn check_project_id(id: &str) -> Result<(), IndexError> {
    let valid = !id.is_empty()
        && id.len() <= MAX_ID_LEN
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if valid {
        Ok(())
    } else {
        Err(IndexError::InvalidProjectId { id: id.to_owned() })
    }
}

enum Inspection {
    Current,
    Discard(ResetReason),
}

/// Decides whether an existing database can be kept. Only a version mismatch
/// or a database SQLite calls not-a-database or corrupt is discarded; being
/// busy or hitting an I/O error is returned, because another process may be
/// using a perfectly good index.
fn inspect(path: &Path) -> Result<Inspection, IndexError> {
    match probe(path) {
        Ok(Some(found)) if found != SCHEMA_VERSION => {
            Ok(Inspection::Discard(ResetReason::SchemaMismatch { found }))
        }
        Ok(Some(_)) => Ok(Inspection::Current),
        Ok(None) => Ok(Inspection::Discard(ResetReason::Unreadable)),
        Err(e) if is_unreadable(&e) => Ok(Inspection::Discard(ResetReason::Unreadable)),
        Err(e) => Err(e.into()),
    }
}

/// The stored schema version, or `None` if a database of the current
/// version fails a quick integrity check or lacks a table.
fn probe(path: &Path) -> rusqlite::Result<Option<i64>> {
    let conn = Connection::open(path)?;
    conn.busy_timeout(BUSY_TIMEOUT)?;
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version != SCHEMA_VERSION {
        return Ok(Some(version));
    }
    let check: String = conn.query_row("PRAGMA quick_check(1)", [], |r| r.get(0))?;
    let present: i64 = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name IN \
         ('files','questions','experiments','artefacts','versions','groups',\
          'memberships','refs','citations','sources','fts')",
        [],
        |r| r.get(0),
    )?;
    let expected = i64::try_from(TABLES.len()).unwrap_or(i64::MAX);
    Ok((check == "ok" && present == expected).then_some(version))
}

fn is_unreadable(error: &rusqlite::Error) -> bool {
    matches!(
        error,
        rusqlite::Error::SqliteFailure(e, _)
            if matches!(e.code, ErrorCode::NotADatabase | ErrorCode::DatabaseCorrupt)
    )
}

fn delete_file(tx: &Transaction<'_>, path: &str) -> rusqlite::Result<()> {
    // FTS5 tables cannot cascade, so their rows are deleted by hand.
    tx.prepare_cached("DELETE FROM fts WHERE file = ?1")?
        .execute([path])?;
    tx.prepare_cached("DELETE FROM files WHERE path = ?1")?
        .execute([path])?;
    Ok(())
}

fn insert_file(tx: &Transaction<'_>, meta: &FileMeta) -> rusqlite::Result<()> {
    let size = i64::try_from(meta.size).unwrap_or(i64::MAX);
    tx.prepare_cached("INSERT INTO files (path, size, mtime_ns, sha256) VALUES (?1, ?2, ?3, ?4)")?
        .execute(params![
            meta.path.as_str(),
            size,
            meta.mtime_ns,
            meta.sha256
        ])?;
    Ok(())
}
