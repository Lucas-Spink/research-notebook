//! Inserting one file's rows, one statement per table.

use rusqlite::{params, Transaction};

use crate::records::FileRecords;

/// Inserts every row of `rows`, filed under `file`. The caller has removed
/// the file's previous rows.
pub(crate) fn insert_rows(
    tx: &Transaction<'_>,
    file: &str,
    rows: &FileRecords,
) -> rusqlite::Result<()> {
    for r in &rows.questions {
        tx.prepare_cached(
            "INSERT INTO questions (file, id, reference, title, created) VALUES (?1,?2,?3,?4,?5)",
        )?
        .execute(params![file, r.id, r.reference, r.title, r.created])?;
    }
    for r in &rows.experiments {
        tx.prepare_cached(
            "INSERT INTO experiments (file, id, reference, question, title, status, started, \
             completed, created, updated) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        )?
        .execute(params![
            file,
            r.id,
            r.reference,
            r.question,
            r.title,
            r.status,
            r.started,
            r.completed,
            r.created,
            r.updated
        ])?;
    }
    for r in &rows.artefacts {
        tx.prepare_cached(
            "INSERT INTO artefacts (file, id, experiment, name, role, mode, kind, source_root, \
             source_path, created, link_sha256, link_size) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        )?
        .execute(params![
            file,
            r.id,
            r.experiment,
            r.name,
            r.role,
            r.mode,
            r.kind,
            r.source_root,
            r.source_path,
            r.created,
            r.link_sha256,
            r.link_size
        ])?;
    }
    for r in &rows.versions {
        tx.prepare_cached(
            "INSERT INTO versions (file, artefact, number, version_file, sha256, size, captured) \
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
        )?
        .execute(params![
            file, r.artefact, r.number, r.file, r.sha256, r.size, r.captured
        ])?;
    }
    for r in &rows.groups {
        tx.prepare_cached(
            "INSERT INTO groups (file, id, experiment, parent, name, position) \
             VALUES (?1,?2,?3,?4,?5,?6)",
        )?
        .execute(params![
            file,
            r.id,
            r.experiment,
            r.parent,
            r.name,
            r.position
        ])?;
    }
    for r in &rows.memberships {
        tx.prepare_cached(
            "INSERT INTO memberships (file, group_id, artefact, position) VALUES (?1,?2,?3,?4)",
        )?
        .execute(params![file, r.group, r.artefact, r.position])?;
    }
    for r in &rows.refs {
        tx.prepare_cached(
            "INSERT INTO refs (file, experiment, section, artefact, version, char_offset) \
             VALUES (?1,?2,?3,?4,?5,?6)",
        )?
        .execute(params![
            file,
            r.experiment,
            r.section,
            r.artefact,
            r.version,
            r.offset
        ])?;
    }
    for r in &rows.citations {
        tx.prepare_cached(
            "INSERT INTO citations (file, experiment, section, citekey, cluster, position) \
             VALUES (?1,?2,?3,?4,?5,?6)",
        )?
        .execute(params![
            file,
            r.experiment,
            r.section,
            r.citekey,
            r.cluster,
            r.position
        ])?;
    }
    for r in &rows.sources {
        tx.prepare_cached(
            "INSERT INTO sources (file, citekey, title, status) VALUES (?1,?2,?3,?4)",
        )?
        .execute(params![file, r.citekey, r.title, r.status])?;
    }
    for r in &rows.fts {
        tx.prepare_cached("INSERT INTO fts (file, kind, owner, text) VALUES (?1,?2,?3,?4)")?
            .execute(params![file, r.kind.as_str(), r.owner, r.text])?;
    }
    Ok(())
}
