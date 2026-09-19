//! The derived index (spec 6.6, ADR-0023): a SQLite database in the
//! application cache folder that holds only data reproducible from a
//! project's `_notebook/` files, so deleting it loses nothing (P1).
//!
//! `nb-index` reads a project's files only to size, time and hash them. It
//! never parses them (AGENTS.md rule 2) and never writes inside the project.
//! The flow is:
//!
//! 1. [`Index::open`] finds or creates the database for the project id, and
//!    starts empty if the stored schema version differs or the file is
//!    unreadable.
//! 2. [`Index::scan`] compares the files on disk with the `files` table and
//!    says which changed and which were removed.
//! 3. The caller parses each changed file with `packages/format` and passes
//!    the rows to [`Index::apply`], which replaces them in one transaction.
//!
//! A full rebuild is [`Index::rebuild_scan`], which empties the index and
//! reports every file as changed, followed by the same `apply`.

mod discover;
mod dump;
mod error;
mod records;
mod rows;
mod scan;
mod schema;
mod search;
mod store;

pub use error::IndexError;
pub use records::*;
pub use scan::{FileMeta, Scan, ScanMode};
pub use schema::SCHEMA_VERSION;
pub use search::SearchHit;
pub use store::{FileUpdate, Index, OpenOutcome, ResetReason};
