//! What the evidence commands accept and return (FR-EVD-01 to FR-EVD-05,
//! FR-EVD-12, ADR-0044). Inputs are checked when they are deserialised, so a
//! command never receives free text where a folder, file name or hash
//! belongs, and no absolute path ever crosses to the webview.

use nb_fs::{CaptureError, LinkError};
use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;

use super::super::open::{SourcePath, SourceRoot};

/// Where a file the person chose sits, in the terms `artefacts.yaml`
/// records (spec 5.8): a root and a path relative to it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SourceLocation {
    pub root: SourceRoot,
    pub path: SourcePath,
}

/// Why a chosen file cannot be captured. The `kind` is the key of the
/// user-facing message; no path or system text is sent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Refusal {
    /// Neither under the project folder nor under an external root set on
    /// this machine, so the format cannot record where it came from.
    OutsideRoots,
    /// Inside the project's own `_notebook/` folder.
    InsideNotebook,
    /// A folder, or something else that is not a regular file.
    NotAFile,
    /// It could not be read.
    Unreadable,
}

/// One file the person picked or dropped: where it is and how big, or why
/// it cannot be captured. Its `name` is the file's own name, for display.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ChosenFile {
    Located {
        name: String,
        /// Bytes. A number, not a `u64`, which the bindings cannot carry;
        /// exact for any file under 8 PiB.
        size: f64,
        location: SourceLocation,
    },
    Refused {
        name: String,
        reason: Refusal,
    },
}

/// An experiment's folder under `experiments/`: one path segment, so a
/// capture can only ever land in that experiment's own folders.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ExperimentFolder(String);

impl ExperimentFolder {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for ExperimentFolder {
    type Error = String;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        let single =
            !text.is_empty() && text != "." && text != ".." && !text.contains(['/', '\\', ':']);
        if single {
            Ok(Self(text))
        } else {
            Err("expected one folder name".to_owned())
        }
    }
}

// Written by hand, as `SourceRoot` is: `#[serde(try_from)]` makes the
// generated bindings split the type in two.
impl<'de> Deserialize<'de> for ExperimentFolder {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::try_from(String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

/// Which of an experiment's folders a capture goes into (spec 5.8).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Destination {
    Evidence,
    Methods,
}

impl Destination {
    pub fn folder_name(self) -> &'static str {
        match self {
            Self::Evidence => "evidence",
            Self::Methods => "methods",
        }
    }
}

/// How the captured file is named (FR-EVD-04): from the source's own name
/// for a new artefact, or from the first version's stem and extension for a
/// later one. Neither may contain a folder separator.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CaptureNaming {
    #[serde(rename_all = "camelCase")]
    New {
        original_file_name: String,
    },
    Version {
        stem: String,
        extension: String,
    },
}

impl CaptureNaming {
    /// Whether every part is a plain name: no separator, and an extension
    /// that is empty or starts with a dot.
    pub fn is_plain(&self) -> bool {
        let plain = |part: &str| !part.contains(['/', '\\']);
        match self {
            Self::New { original_file_name } => {
                !original_file_name.is_empty() && plain(original_file_name)
            }
            Self::Version { stem, extension } => {
                !stem.is_empty()
                    && plain(stem)
                    && plain(extension)
                    && (extension.is_empty() || extension.starts_with('.'))
            }
        }
    }
}

/// A version already recorded in the experiment's `artefacts.yaml`, which
/// the webview parsed (AGENTS.md rule 2), so a capture can tell a duplicate.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct KnownVersionInput {
    pub sha256: String,
    pub number: u32,
    pub same_artefact: bool,
}

impl KnownVersionInput {
    pub fn is_valid(&self) -> bool {
        self.number >= 1
            && self.sha256.len() == 64
            && self
                .sha256
                .chars()
                .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
    }
}

/// Git provenance of the source (FR-EVD-12), as `CapturedFile.provenance`
/// in `packages/format` takes it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CapturedProvenance {
    pub repo: String,
    pub commit: String,
    pub path_in_repo: String,
    pub file_dirty: bool,
    pub tree_dirty: bool,
}

/// What a capture did (FR-EVD-03 to FR-EVD-05).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CaptureResultDto {
    /// A new version was placed. `file` is relative to the experiment
    /// folder, beginning `evidence/` or `methods/`.
    Created {
        file: String,
        sha256: String,
        size: f64,
        number: u32,
    },
    /// The same content is already that artefact's `version`; nothing was
    /// written.
    Duplicate { version: u32 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CaptureOutcomeDto {
    pub result: CaptureResultDto,
    /// The same content is already a version of a different artefact: a
    /// warning to show, not a reason to refuse (ADR-0030).
    pub matches_other_artefact: bool,
    /// `None` when the source is not in a git repository the project can
    /// record (ADR-0032).
    pub provenance: Option<CapturedProvenance>,
}

/// A linked file's observation (FR-EVD-07), as `applyLink` takes it.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LinkObservationDto {
    pub sha256: String,
    pub size: f64,
    /// `YYYY-MM-DDTHH:MM:SSZ`.
    pub observed_mtime: String,
}

/// Why an evidence command could not complete. The `kind` is the key of the
/// user-facing message; no path or system text is sent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EvidenceFailure {
    /// The project folder can no longer be opened.
    ProjectUnavailable,
    /// The application's settings could not be read.
    SettingsUnavailable,
    /// The source's external root has no folder set on this machine, or its
    /// folder is gone.
    RootUnavailable,
    /// The source is not there, or is not a regular file.
    SourceUnavailable,
    /// A name, folder or known version was not acceptable.
    InvalidRequest,
    /// The copy did not match its source after writing; nothing was kept.
    VerificationFailed,
    /// The version file that would be written already exists.
    VersionExists,
    /// Writing inside `_notebook/` failed.
    WriteFailed,
    /// The file picker could not be shown, or something else went wrong.
    Internal,
}

impl From<CaptureError> for EvidenceFailure {
    fn from(error: CaptureError) -> Self {
        match error {
            CaptureError::Source { .. } | CaptureError::SourceNotAFile => Self::SourceUnavailable,
            CaptureError::VerificationFailed { .. } => Self::VerificationFailed,
            CaptureError::VersionExists { .. } => Self::VersionExists,
            CaptureError::Write(_) => Self::WriteFailed,
        }
    }
}

impl From<LinkError> for EvidenceFailure {
    fn from(_: LinkError) -> Self {
        Self::SourceUnavailable
    }
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests.
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn an_experiment_folder_is_one_plain_segment() {
        assert_eq!(
            ExperimentFolder::try_from("EXP-001".to_owned())
                .unwrap()
                .as_str(),
            "EXP-001"
        );
        for bad in ["", ".", "..", "EXP-001/evidence", "..\\EXP-002", "C:x"] {
            assert!(
                ExperimentFolder::try_from(bad.to_owned()).is_err(),
                "{bad:?}"
            );
        }
    }

    #[test]
    fn capture_names_never_carry_a_folder() {
        let new = |name: &str| CaptureNaming::New {
            original_file_name: name.to_owned(),
        };
        let version = |stem: &str, extension: &str| CaptureNaming::Version {
            stem: stem.to_owned(),
            extension: extension.to_owned(),
        };
        assert!(new("pca plot.png").is_plain());
        assert!(version("pca", ".png").is_plain());
        assert!(version("README", "").is_plain());
        assert!(!new("").is_plain());
        assert!(!new("../x.png").is_plain());
        assert!(!version("a/b", ".png").is_plain());
        assert!(!version("pca", "png").is_plain());
        assert!(!version("pca", ".p\\ng").is_plain());
    }

    #[test]
    fn a_known_version_needs_a_real_hash_and_number() {
        let known = |sha256: &str, number| KnownVersionInput {
            sha256: sha256.to_owned(),
            number,
            same_artefact: true,
        };
        assert!(known(&"a".repeat(64), 1).is_valid());
        assert!(!known(&"a".repeat(64), 0).is_valid());
        assert!(!known(&"A".repeat(64), 1).is_valid());
        assert!(!known(&"a".repeat(63), 1).is_valid());
    }
}
