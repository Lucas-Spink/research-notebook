//! Bundles (FR-ARC-08, ADR-0057). Asks for a destination folder in a native
//! dialog, then has `nb-archive` write the notebook bundle or the full archive
//! there. The project is only read, so a read-only or archived project can be
//! bundled. The webview never holds the destination: it only learns the name.

use std::path::Path;

use nb_archive::{BundleKind, BundleOutcome, BundlePlan, ExtraEntry};
use nb_fs::{ProjectRelPath, ProjectRoot};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};

use super::folders::{FolderHandle, PickedFolders};
use super::lock::with_root;
use super::pick_folder;
use super::types::ProjectError;

/// Which bundle to make.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BundleChoice {
    /// `_notebook/` only.
    Notebook,
    /// The whole project.
    Archive,
}

impl From<BundleChoice> for BundleKind {
    fn from(choice: BundleChoice) -> Self {
        match choice {
            BundleChoice::Notebook => Self::Notebook,
            BundleChoice::Archive => Self::Archive,
        }
    }
}

/// An entry added beside the project's files, such as the list of linked
/// files, built by `packages/format`.
#[derive(Debug, Clone, Deserialize, Type)]
pub struct BundleExtraInput {
    pub path: String,
    pub text: String,
}

/// What a bundle would hold.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BundleSummary {
    pub files: f64,
    pub bytes: f64,
    /// Links and unreadable names left out.
    pub skipped: f64,
    /// The files together may not fit in one file on a FAT32 drive.
    pub exceeds_fat32_limit: bool,
}

impl From<BundlePlan> for BundleSummary {
    // Counts and sizes are far below 2^53, the webview's exact limit.
    fn from(plan: BundlePlan) -> Self {
        Self {
            files: plan.files as f64,
            bytes: plan.bytes as f64,
            skipped: plan.skipped as f64,
            exceeds_fat32_limit: plan.exceeds_fat32_limit,
        }
    }
}

/// How writing a bundle ended. Carries no system text, which can name paths
/// the person did not ask about.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BundleResult {
    /// Written, read back and checked. `name` is the file name in the folder
    /// the person chose; `folder` is that folder, for display only.
    #[serde(rename_all = "camelCase")]
    Written {
        name: String,
        folder: String,
        bytes: f64,
        files: f64,
    },
    FolderInvalid,
    InsideProject,
    UnsafeName,
    /// The destination refused a file this large: typically a FAT32 drive.
    TooLargeForDestination,
    NoSpace,
    SourceChanged,
    Failed,
}

fn result_for(outcome: BundleOutcome, folder: &str) -> BundleResult {
    match outcome {
        BundleOutcome::Written { name, bytes, files } => BundleResult::Written {
            name,
            folder: folder.to_owned(),
            bytes: bytes as f64,
            files: files as f64,
        },
        BundleOutcome::FolderInvalid => BundleResult::FolderInvalid,
        BundleOutcome::InsideProject => BundleResult::InsideProject,
        BundleOutcome::UnsafeName => BundleResult::UnsafeName,
        BundleOutcome::TooLargeForDestination => BundleResult::TooLargeForDestination,
        BundleOutcome::NoSpace => BundleResult::NoSpace,
        BundleOutcome::SourceChanged => BundleResult::SourceChanged,
        BundleOutcome::Failed => BundleResult::Failed,
    }
}

/// Extras whose names are plain forward paths. A name such as `../x` would
/// escape the folder it is extracted into, so it is refused outright.
fn extras_from(inputs: &[BundleExtraInput]) -> Option<Vec<ExtraEntry>> {
    inputs
        .iter()
        .map(|input| {
            let valid = !input.path.contains('\\') && ProjectRelPath::parse(&input.path).is_ok();
            valid.then(|| ExtraEntry {
                path: input.path.clone(),
                bytes: input.text.clone().into_bytes(),
            })
        })
        .collect()
}

/// Counts what a bundle would hold, so the panel can say how large it is and
/// warn about FAT32 before anything is written. Reads only.
#[tauri::command]
#[specta::specta]
pub async fn plan_bundle(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    choice: BundleChoice,
) -> Result<BundleSummary, ProjectError> {
    with_root(&folders, folder, move |root| {
        nb_archive::plan_bundle(&root, choice.into())
            .map(BundleSummary::from)
            .map_err(|_| ProjectError::FileUnavailable)
    })
    .await
}

/// Asks for a destination folder and writes the bundle there as
/// `<stem>.nbk` (FR-ARC-08). `None` when the person cancels. Only reads the
/// project, so it needs no lock; nothing in the project changes.
#[tauri::command]
#[specta::specta]
pub async fn write_bundle(
    app: AppHandle,
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    choice: BundleChoice,
    stem: String,
    extras: Vec<BundleExtraInput>,
) -> Result<Option<BundleResult>, ProjectError> {
    let Some(extras) = extras_from(&extras) else {
        return Ok(Some(BundleResult::Failed));
    };
    let Some(destination) = pick_folder(&app, "Choose where to save the bundle").await? else {
        return Ok(None);
    };
    let shown = destination.to_string_lossy().into_owned();
    let outcome = with_root(&folders, folder, move |root| {
        Ok(store(&root, choice, &destination, &stem, &extras))
    })
    .await?;
    Ok(Some(result_for(outcome, &shown)))
}

pub(super) fn store(
    root: &ProjectRoot,
    choice: BundleChoice,
    destination: &Path,
    stem: &str,
    extras: &[ExtraEntry],
) -> BundleOutcome {
    nb_archive::write_bundle(root, choice.into(), destination, stem, extras)
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these write fixture files.
#[allow(clippy::unwrap_used, clippy::disallowed_methods)]
mod tests {
    use super::*;

    fn extra(path: &str) -> BundleExtraInput {
        BundleExtraInput {
            path: path.to_owned(),
            text: "x".to_owned(),
        }
    }

    #[test]
    fn extra_entries_must_be_plain_forward_paths() {
        assert!(extras_from(&[extra("LINKED_FILES.txt"), extra("notes/a.txt")]).is_some());
        for bad in ["", "../x", "a/../b", "/abs", "C:/x", "a\\b", "a//b"] {
            assert!(extras_from(&[extra(bad)]).is_none(), "{bad}");
        }
    }

    #[test]
    fn each_outcome_has_a_result_without_system_text() {
        let written = result_for(
            BundleOutcome::Written {
                name: "lab.nbk".to_owned(),
                bytes: 10,
                files: 3,
            },
            "D:/out",
        );
        assert_eq!(
            written,
            BundleResult::Written {
                name: "lab.nbk".to_owned(),
                folder: "D:/out".to_owned(),
                bytes: 10.0,
                files: 3.0,
            }
        );
        assert_eq!(
            result_for(BundleOutcome::TooLargeForDestination, ""),
            BundleResult::TooLargeForDestination
        );
        assert_eq!(
            result_for(BundleOutcome::InsideProject, ""),
            BundleResult::InsideProject
        );
    }

    #[test]
    fn the_plan_is_summarised_with_the_fat32_flag() {
        let summary = BundleSummary::from(BundlePlan {
            files: 2,
            bytes: 5,
            skipped: 1,
            exceeds_fat32_limit: true,
        });
        assert_eq!(summary.files, 2.0);
        assert!(summary.exceeds_fat32_limit);
    }

    #[test]
    fn a_bundle_goes_beside_the_project_and_the_project_is_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("project");
        std::fs::create_dir_all(project.join("_notebook")).unwrap();
        std::fs::write(project.join("_notebook/project.yaml"), b"x").unwrap();
        let out = dir.path().join("out");
        std::fs::create_dir_all(&out).unwrap();
        let root = ProjectRoot::open(&project).unwrap();

        let outcome = store(&root, BundleChoice::Notebook, &out, "lab", &[]);

        assert!(matches!(outcome, BundleOutcome::Written { .. }));
        assert!(out.join("lab.nbk").is_file());
        assert_eq!(std::fs::read_dir(&project).unwrap().count(), 1);
        assert_eq!(
            store(&root, BundleChoice::Archive, &project, "lab", &[]),
            BundleOutcome::InsideProject
        );
    }
}
