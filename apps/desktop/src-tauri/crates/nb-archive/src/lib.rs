//! Archive operations over a project's captured files. Read-only so far:
//! Verify (FR-ARC-03, ADR-0052). Nothing here writes; all file access goes
//! through `nb-fs`.
#![forbid(unsafe_code)]

mod verify;

pub use verify::{verify, Expected, Verdict};
