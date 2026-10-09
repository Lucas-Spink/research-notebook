//! Archive operations over a project's captured files: Verify (FR-ARC-03,
//! ADR-0052), which only reads; git bundles (FR-ARC-04, ADR-0053), which
//! write only under `_notebook/exports/git/`; and the static HTML export
//! (FR-ARC-05, ADR-0054), which writes only under `_notebook/exports/html/`;
//! and the machine-readable export (FR-ARC-07, ADR-0055), which writes only
//! under `_notebook/exports/machine/`.
//! All file access goes through `nb-fs`.
#![forbid(unsafe_code)]

mod git_bundle;
mod html_export;
mod machine_export;
mod verify;

pub use git_bundle::{write_git_bundles, write_git_bundles_with, BundleVerdict};
pub use html_export::{
    prepare_html_assets, write_html_pages, AssetKind, AssetRequest, AssetVerdict, PageVerdict,
    SampledTable,
};
pub use machine_export::{write_machine_files, FileVerdict};
pub use verify::{verify, Expected, Verdict};
