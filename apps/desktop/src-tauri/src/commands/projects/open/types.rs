//! What the open-action and availability commands accept and return
//! (FR-PRV-02, FR-EVD-07, FR-EVD-08). Inputs are checked when they are
//! deserialised, so a command never receives free text where a source
//! root or path belongs.

use nb_fs::{PathError, ProjectRelPath, ReadError};
use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;

use super::super::ids::Ulid;

/// An artefact's `source.root` (spec 5.8): the literal `"project"`, or the
/// `ulid` of one of the project's `external_roots`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SourceRoot(String);

impl SourceRoot {
    pub fn is_project(&self) -> bool {
        self.0 == "project"
    }

    /// The external root's id, or `None` for the project itself.
    pub fn external_id(&self) -> Option<&str> {
        if self.is_project() {
            None
        } else {
            Some(&self.0)
        }
    }
}

impl TryFrom<String> for SourceRoot {
    type Error = String;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        if text == "project" || Ulid::try_from(text.clone()).is_ok() {
            Ok(Self(text))
        } else {
            Err("expected \"project\" or a ULID".to_owned())
        }
    }
}

// Written by hand for the same reason as `Ulid` and `VersionPath`:
// `#[serde(try_from)]` makes the generated bindings split the type in two.
impl<'de> Deserialize<'de> for SourceRoot {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::try_from(String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

/// An artefact's `source.path` (spec 5.8): relative to its `source.root`,
/// which may be the project root itself rather than `_notebook/`, so this
/// is checked lexically (no `..`, not absolute) but not confined to the
/// notebook the way [`nb_fs::ProjectRelPath`] otherwise is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SourcePath(String);

impl SourcePath {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for SourcePath {
    type Error = PathError;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        Ok(Self(ProjectRelPath::parse(&text)?.to_string()))
    }
}

impl<'de> Deserialize<'de> for SourcePath {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::try_from(String::deserialize(deserializer)?)
            .map_err(|error| serde::de::Error::custom(error.to_string()))
    }
}

/// One of FR-PRV-02's distinct actions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum FileActionKind {
    OpenFile,
    Reveal,
    OpenInVsCode,
    CopyPath,
}

/// Why an action on a file or folder could not be completed. The `kind` is
/// the key of the user-facing message; no path or system text is sent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum OpenFailure {
    /// The project folder can no longer be opened.
    ProjectUnavailable,
    /// The version's file is not there, or is not a version file.
    FileUnavailable,
    /// The artefact's external root has no folder set on this machine.
    RootUnresolved,
    /// The external root's folder is set but no longer exists.
    RootFolderMissing,
    /// The application's settings could not be read.
    SettingsUnavailable,
    /// The action itself failed to start.
    ActionFailed,
}

impl From<ReadError> for OpenFailure {
    fn from(_: ReadError) -> Self {
        Self::FileUnavailable
    }
}

/// A linked artefact's availability, checked live and never persisted
/// (ADR-0031 §1): recomputed on every call, not read from a stored flag.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Availability {
    Available { size: u32 },
    Missing,
    RootUnresolved,
    RootFolderMissing,
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests.
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn source_root_accepts_project_and_ulids_only() {
        assert!(SourceRoot::try_from("project".to_owned())
            .unwrap()
            .is_project());
        let root = SourceRoot::try_from("01JAX9Q2B7N4M8T6V3W5Y1Z0KC".to_owned()).unwrap();
        assert_eq!(root.external_id(), Some("01JAX9Q2B7N4M8T6V3W5Y1Z0KC"));
        for bad in ["", "Project", "external", "../../etc"] {
            assert!(SourceRoot::try_from(bad.to_owned()).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn source_path_normalises_backslashes_and_refuses_traversal() {
        assert_eq!(
            SourcePath::try_from("results\\pca\\pca.csv".to_owned())
                .unwrap()
                .as_str(),
            "results/pca/pca.csv"
        );
        for bad in ["", "/etc/passwd", "../outside", "a/../b", "C:\\x"] {
            assert!(SourcePath::try_from(bad.to_owned()).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn a_source_root_is_accepted_by_deserialising_a_plain_string() {
        assert!(serde_json::from_str::<SourceRoot>("\"project\"").is_ok());
        assert!(serde_json::from_str::<SourceRoot>("\"not-a-root\"").is_err());
    }
}
