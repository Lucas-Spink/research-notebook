//! Archive operations over a project's captured files: Verify (FR-ARC-03,
//! ADR-0052), which only reads; git bundles (FR-ARC-04, ADR-0053), which
//! write only under `_notebook/exports/git/`; and the static HTML export
//! (FR-ARC-05, ADR-0054), which writes only under `_notebook/exports/html/`;
//! and the machine-readable export (FR-ARC-07, ADR-0055), which writes only
//! under `_notebook/exports/machine/`; and the project PDF (FR-ARC-06,
//! ADR-0056), which writes only `_notebook/exports/pdf/project.pdf`; and
//! bundles (FR-ARC-08, ADR-0057), which write one new file in a folder the
//! person chose, outside the project.
//! All file access goes through `nb-fs`.
#![forbid(unsafe_code)]

mod bundle;
mod git_bundle;
mod html_export;
mod machine_export;
mod pdf_export;
mod verify;

pub use bundle::{
    exceeds_fat32_limit, plan_bundle, write_bundle, BundleKind, BundleOutcome, BundlePlan,
    ExtraEntry, BUNDLE_EXTENSION, FAT32_MAX_FILE,
};
pub use git_bundle::{write_git_bundles, write_git_bundles_with, BundleVerdict};
pub use html_export::{
    prepare_html_assets, write_html_pages, AssetKind, AssetRequest, AssetVerdict, PageVerdict,
    SampledTable,
};
pub use machine_export::{write_machine_files, FileVerdict};
pub use pdf_export::write_project_pdf;
pub use verify::{verify, Expected, Verdict};
