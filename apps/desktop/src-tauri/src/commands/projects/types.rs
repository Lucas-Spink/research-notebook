use nb_fs::hygiene::HygieneOutcome;
use nb_fs::settings::SettingsError;
use nb_fs::{CreateError, OpenError, ReadError};
use serde::Serialize;
use specta::Type;

use super::folders::FolderHandle;

/// Why a project command failed. The `kind` is the key of the user-facing
/// message, which lives in the frontend's message files (spec 6.5); no path
/// or system text is sent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProjectError {
    /// The folder cannot be used: it is missing or is not a folder.
    FolderUnavailable,
    /// The folder holds no `_notebook/project.yaml`.
    NotAProject,
    /// `_notebook` is a file or a link, or is spelt in another case.
    NotebookInvalid,
    /// Creating: `_notebook` already holds files, so nothing was written.
    AlreadyInUse,
    /// `project.yaml` exists but cannot be read as text.
    ProjectFileUnreadable,
    /// Something was written and failed part way, or was refused.
    WriteFailed,
    /// No recent project has that identifier.
    NotRemembered,
    /// The settings file is damaged, and is left as it is.
    SettingsDamaged,
    /// The settings file was written by a newer version, and is left as it is.
    SettingsNewer,
    /// The settings file could not be read or written.
    SettingsUnavailable,
    /// A background task failed. Not caused by the person's input.
    Internal,
}

impl From<OpenError> for ProjectError {
    fn from(error: OpenError) -> Self {
        match error {
            OpenError::Root { .. } => Self::FolderUnavailable,
            OpenError::NotebookInvalid { .. } => Self::NotAProject,
        }
    }
}

impl From<ReadError> for ProjectError {
    fn from(error: ReadError) -> Self {
        match error {
            ReadError::Missing { .. } => Self::NotAProject,
            ReadError::NotAFile { .. }
            | ReadError::EscapesNotebook { .. }
            | ReadError::NotUtf8 { .. }
            | ReadError::Io { .. } => Self::ProjectFileUnreadable,
        }
    }
}

impl From<CreateError> for ProjectError {
    fn from(error: CreateError) -> Self {
        match error {
            CreateError::Root { .. } => Self::FolderUnavailable,
            CreateError::NotebookInvalid { .. } => Self::NotebookInvalid,
            CreateError::NotEmpty { .. } => Self::AlreadyInUse,
            CreateError::Io { .. } | CreateError::Open(_) | CreateError::Write(_) => {
                Self::WriteFailed
            }
        }
    }
}

impl From<SettingsError> for ProjectError {
    fn from(error: SettingsError) -> Self {
        match error {
            SettingsError::Damaged { .. } => Self::SettingsDamaged,
            SettingsError::Newer { .. } => Self::SettingsNewer,
            SettingsError::Read(_) | SettingsError::Write(_) => Self::SettingsUnavailable,
        }
    }
}

/// A project folder that was opened. The text is `project.yaml` exactly as it
/// is on disk; the frontend parses it with `packages/format`, the only parser.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpenedProject {
    pub folder: FolderHandle,
    /// For display only.
    pub path: String,
    pub project_yaml: String,
}

/// What became of one repository hygiene file when a project was created.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum HygieneStatus {
    Added,
    Unchanged,
    /// Not updated. The project exists; the entries can be added by hand.
    Failed,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HygieneReport {
    /// `.gitignore` or `.gitattributes`.
    pub file: String,
    pub status: HygieneStatus,
}

impl HygieneReport {
    pub fn new(file: &str, outcome: &HygieneOutcome) -> Self {
        Self {
            file: file.to_owned(),
            status: match outcome {
                HygieneOutcome::Added => HygieneStatus::Added,
                HygieneOutcome::Unchanged => HygieneStatus::Unchanged,
                HygieneOutcome::Failed(_) => HygieneStatus::Failed,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreatedProject {
    pub folder: FolderHandle,
    /// For display only.
    pub path: String,
    pub hygiene: Vec<HygieneReport>,
}

/// A recent project as listed on the start screen.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub id: String,
    pub name: String,
    /// For display only.
    pub path: String,
    /// False when the folder no longer holds a project, so the person can be
    /// offered Locate project (FR-PRJ-03).
    pub available: bool,
}

/// Where an external root of a project is on this machine (FR-PRJ-07).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExternalRootStatus {
    pub root_id: String,
    /// For display only; `None` when no folder has been chosen on this machine.
    pub path: Option<String>,
    /// False when there is no path or the folder is gone, which marks the
    /// artefacts linked through it unavailable.
    pub available: bool,
}
