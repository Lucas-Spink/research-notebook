use rusqlite::Connection;

/// The layout version this build writes, kept in SQLite's `user_version`.
/// Any other value found in a database triggers a full rebuild (spec 6.6):
/// the index is derived, so replacing it is always safe and never needs a
/// migration.
pub const SCHEMA_VERSION: i64 = 1;

/// Every table, in the order the dump lists them.
pub(crate) const TABLES: [&str; 11] = [
    "files",
    "questions",
    "experiments",
    "artefacts",
    "versions",
    "groups",
    "memberships",
    "refs",
    "citations",
    "sources",
    "fts",
];

/// Every table but `files` holds the rows of one file, removed with it by
/// `ON DELETE CASCADE`. There are no unique keys on ids: two files sharing
/// an id is a project fault the loader reports (format-v1.md section 5), and
/// the index must still describe the files as they are.
const DDL: &str = "
CREATE TABLE files (
    path TEXT PRIMARY KEY,
    size INTEGER NOT NULL,
    mtime_ns INTEGER NOT NULL,
    sha256 TEXT NOT NULL
);
CREATE TABLE questions (
    file TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
    id TEXT NOT NULL, reference TEXT NOT NULL, title TEXT NOT NULL, created TEXT NOT NULL
);
CREATE TABLE experiments (
    file TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
    id TEXT NOT NULL, reference TEXT NOT NULL, question TEXT NOT NULL, title TEXT NOT NULL,
    status TEXT NOT NULL, started TEXT, completed TEXT, created TEXT NOT NULL, updated TEXT NOT NULL
);
CREATE TABLE artefacts (
    file TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
    id TEXT NOT NULL, experiment TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
    mode TEXT NOT NULL, kind TEXT NOT NULL, source_root TEXT NOT NULL, source_path TEXT NOT NULL,
    created TEXT NOT NULL, link_sha256 TEXT, link_size INTEGER
);
CREATE TABLE versions (
    file TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
    artefact TEXT NOT NULL, number INTEGER NOT NULL, version_file TEXT NOT NULL,
    sha256 TEXT NOT NULL, size INTEGER NOT NULL, captured TEXT NOT NULL
);
CREATE TABLE groups (
    file TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
    id TEXT NOT NULL, experiment TEXT NOT NULL, parent TEXT, name TEXT NOT NULL,
    position INTEGER NOT NULL
);
CREATE TABLE memberships (
    file TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
    group_id TEXT NOT NULL, artefact TEXT NOT NULL, position INTEGER NOT NULL
);
CREATE TABLE refs (
    file TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
    experiment TEXT NOT NULL, section TEXT NOT NULL, artefact TEXT NOT NULL,
    version INTEGER, char_offset INTEGER NOT NULL
);
CREATE TABLE citations (
    file TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
    experiment TEXT NOT NULL, section TEXT NOT NULL, citekey TEXT NOT NULL,
    cluster INTEGER NOT NULL, position INTEGER NOT NULL
);
CREATE TABLE sources (
    file TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
    citekey TEXT NOT NULL, title TEXT, status TEXT NOT NULL
);
CREATE INDEX questions_file ON questions(file);
CREATE INDEX experiments_file ON experiments(file);
CREATE INDEX artefacts_file ON artefacts(file);
CREATE INDEX versions_file ON versions(file);
CREATE INDEX groups_file ON groups(file);
CREATE INDEX memberships_file ON memberships(file);
CREATE INDEX refs_file ON refs(file);
CREATE INDEX citations_file ON citations(file);
CREATE INDEX sources_file ON sources(file);
CREATE INDEX experiments_id ON experiments(id);
CREATE INDEX artefacts_id ON artefacts(id);
CREATE INDEX artefacts_experiment ON artefacts(experiment);
CREATE VIRTUAL TABLE fts USING fts5(
    file UNINDEXED, kind UNINDEXED, owner UNINDEXED, text,
    tokenize = 'unicode61 remove_diacritics 2'
);
";

/// Creates every table in an empty database and stamps the version, in one
/// transaction so a half-made schema is never left behind.
pub(crate) fn create(conn: &Connection) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute_batch(DDL)?;
    tx.execute_batch(&format!("PRAGMA user_version = {SCHEMA_VERSION};"))?;
    tx.commit()
}
