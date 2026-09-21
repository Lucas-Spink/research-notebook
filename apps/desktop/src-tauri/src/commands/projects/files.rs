//! Reading a notebook data file as text, to reload it after a change made
//! outside the application and to show both sides of a conflict (FR-HIS-05,
//! ADR-0024). Only the fixed set of files `packages/format` parses can be
//! asked for, so this is not a generic read (spec 6.5). The text goes to the
//! webview to be parsed by `packages/format`; this crate parses nothing.

use nb_fs::watch::is_notebook_data_path;
use nb_fs::{NotebookListing, ProjectRelPath, ReadError};
use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;
use tauri::State;

use super::folders::{FolderHandle, PickedFolders};
use super::lock::with_root;
use super::types::ProjectError;

/// A project-relative path of a notebook data file, such as
/// `_notebook/questions/Q-01.md`, checked so a command never receives free
/// text where a path belongs. Backslashes are accepted and stored as `/`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct NotebookPath(String);

impl NotebookPath {
    pub(super) fn to_rel(&self) -> Result<ProjectRelPath, ProjectError> {
        ProjectRelPath::parse(&self.0).map_err(|_| ProjectError::FileUnavailable)
    }
}

impl TryFrom<String> for NotebookPath {
    type Error = String;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        let path = ProjectRelPath::parse(&text).map_err(|e| e.to_string())?;
        let is_data = path
            .as_str()
            .strip_prefix("_notebook/")
            .is_some_and(is_notebook_data_path);
        if is_data {
            Ok(Self(path.to_string()))
        } else {
            Err("expected the path of a notebook data file".to_owned())
        }
    }
}

// Written by hand for the same reason as `Ulid`: `#[serde(try_from)]` makes
// the generated bindings split the type in two.
impl<'de> Deserialize<'de> for NotebookPath {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::try_from(String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

/// What reading a notebook data file found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileRead {
    /// The file's text exactly as on disk, and the SHA-256 of those bytes.
    Text { text: String, sha256: String },
    /// There is no such file now. Not an error: a file that was deleted
    /// after a change was reported is an ordinary outcome.
    Missing,
}

/// The question files and experiment folders a project has, by name, sorted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NotebookFiles {
    /// File names in `questions/`, such as `Q-001.md`.
    pub question_files: Vec<String>,
    /// Folder names in `experiments/`, such as `EXP-001`.
    pub experiment_folders: Vec<String>,
}

impl From<NotebookListing> for NotebookFiles {
    fn from(listing: NotebookListing) -> Self {
        Self {
            question_files: listing.question_files,
            experiment_folders: listing.experiment_folders,
        }
    }
}

/// Lists which question files and experiment folders the project has, so the
/// webview can read each with `read_notebook_file`. Only names are returned,
/// never paths outside the notebook. Nothing is written.
#[tauri::command]
#[specta::specta]
pub async fn list_notebook_files(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
) -> Result<NotebookFiles, ProjectError> {
    with_root(&folders, folder, |root| {
        root.list_notebook()
            .map(NotebookFiles::from)
            .map_err(|_| ProjectError::FileUnavailable)
    })
    .await
}

/// Reads one notebook data file. Nothing is written.
#[tauri::command]
#[specta::specta]
pub async fn read_notebook_file(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    path: NotebookPath,
) -> Result<FileRead, ProjectError> {
    with_root(&folders, folder, move |root| {
        match root.read_data_file(&path.to_rel()?) {
            Ok(file) => Ok(FileRead::Text {
                text: file.text,
                sha256: file.sha256,
            }),
            Err(ReadError::Missing { .. }) => Ok(FileRead::Missing),
            Err(_) => Err(ProjectError::FileUnavailable),
        }
    })
    .await
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests.
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    fn parse(text: &str) -> Result<NotebookPath, String> {
        NotebookPath::try_from(text.to_owned())
    }

    #[test]
    fn a_data_file_path_is_accepted_and_normalised() {
        assert_eq!(
            parse("_notebook/questions/Q-01.md").unwrap().0,
            "_notebook/questions/Q-01.md"
        );
        assert_eq!(
            parse("_notebook\\experiments\\EXP-001\\experiment.md")
                .unwrap()
                .0,
            "_notebook/experiments/EXP-001/experiment.md"
        );
    }

    #[test]
    fn anything_else_is_refused() {
        for path in [
            "",
            "README.md",
            "_notebook/README.md",
            "_notebook/.lock",
            "_notebook/../README.md",
            "_notebook/experiments/EXP-001/evidence/plot.csv",
            "/etc/passwd",
            "C:\\Windows\\win.ini",
        ] {
            assert!(parse(path).is_err(), "{path}");
        }
    }

    #[test]
    fn the_listing_reaches_the_webview_as_names_in_camel_case() {
        let files = NotebookFiles::from(NotebookListing {
            question_files: vec!["Q-001.md".to_owned()],
            experiment_folders: vec!["EXP-001".to_owned(), "EXP-002".to_owned()],
        });
        assert_eq!(
            serde_json::to_string(&files).unwrap(),
            r#"{"questionFiles":["Q-001.md"],"experimentFolders":["EXP-001","EXP-002"]}"#
        );
    }

    #[test]
    fn a_path_from_the_webview_is_checked_when_it_is_deserialised() {
        let ok: Result<NotebookPath, _> = serde_json::from_str("\"_notebook/project.yaml\"");
        assert!(ok.is_ok());
        let bad: Result<NotebookPath, _> = serde_json::from_str("\"../secrets.txt\"");
        assert!(bad.is_err());
    }
}
