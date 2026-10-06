//! Archive operations over a project's captured files: Verify (FR-ARC-03,
//! ADR-0052), which only reads, and git bundles (FR-ARC-04, ADR-0053), which
//! write only under `_notebook/exports/git/`. All file access goes through
//! `nb-fs`.
#![forbid(unsafe_code)]

mod git_bundle;
mod verify;

pub use git_bundle::{write_git_bundles, write_git_bundles_with, BundleVerdict};
pub use verify::{verify, Expected, Verdict};
