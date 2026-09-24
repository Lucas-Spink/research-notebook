//! What the preview commands accept and return (spec 8). Inputs are checked
//! when they are deserialised, so a command never receives free text where a
//! path or hash belongs.

use nb_fs::{ProjectRelPath, ReadError};
use nb_preview::cache::ContentHash;
use nb_preview::encoding::TextEncoding;
use nb_preview::notebook::NotebookFormat;
use nb_preview::PreviewError;
use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;

/// The project-relative path of a captured version's file, such as
/// `_notebook/experiments/EXP-001/evidence/plot.png`. Backslashes are
/// accepted and stored as `/`. Where it resolves is checked again by `nb-fs`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct VersionPath(String);

impl VersionPath {
    pub(super) fn to_rel(&self) -> Result<ProjectRelPath, PreviewFailure> {
        ProjectRelPath::parse(&self.0).map_err(|_| PreviewFailure::FileUnavailable)
    }

    /// The file name, the last segment of the path.
    pub(super) fn file_name(&self) -> &str {
        self.0.rsplit('/').next().unwrap_or(&self.0)
    }
}

impl TryFrom<String> for VersionPath {
    type Error = String;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        let path = ProjectRelPath::parse(&text).map_err(|e| e.to_string())?;
        let segments: Vec<&str> = path.as_str().split('/').collect();
        let valid = matches!(
            segments.as_slice(),
            ["_notebook", "experiments", _, "evidence" | "methods", _, ..]
        );
        if valid {
            Ok(Self(path.to_string()))
        } else {
            Err("expected a file in an experiment's evidence/ or methods/ folder".to_owned())
        }
    }
}

// Written by hand for the same reason as `NotebookPath`: `#[serde(try_from)]`
// makes the generated bindings split the type in two.
impl<'de> Deserialize<'de> for VersionPath {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::try_from(String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

/// A version's SHA-256 as `artefacts.yaml` records it: 64 lowercase
/// hexadecimal characters.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Sha256Hex(String);

impl Sha256Hex {
    pub(super) fn to_hash(&self) -> Result<ContentHash, PreviewFailure> {
        ContentHash::parse(&self.0).map_err(|_| PreviewFailure::Internal)
    }
}

impl<'de> Deserialize<'de> for Sha256Hex {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let text = String::deserialize(deserializer)?;
        ContentHash::parse(&text).map_err(serde::de::Error::custom)?;
        Ok(Self(text))
    }
}

/// Why a preview could not be made. The `kind` is the key of the message
/// the webview shows with its recovery action (FR-PRV-05); no path or system
/// text is sent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PreviewFailure {
    /// The project folder can no longer be opened.
    ProjectUnavailable,
    /// The version's file is not there.
    FileMissing,
    /// The file is there but cannot be opened, or is not a version file.
    FileUnavailable,
    /// The file's name does not fit the preview asked for.
    NotPreviewable,
    /// Above the spec 8 size bound for this preview.
    TooLarge,
    /// An image above 100 megapixels.
    TooManyPixels,
    /// The content could not be decoded or parsed.
    Unreadable,
    /// The thumbnail cache could not be used.
    CacheUnavailable,
    /// A background task failed. Not caused by the file.
    Internal,
}

impl From<ReadError> for PreviewFailure {
    fn from(error: ReadError) -> Self {
        match error {
            ReadError::Missing { .. } => Self::FileMissing,
            _ => Self::FileUnavailable,
        }
    }
}

impl From<PreviewError> for PreviewFailure {
    fn from(error: PreviewError) -> Self {
        match error {
            PreviewError::Decode(_) | PreviewError::Table(_) => Self::Unreadable,
            PreviewError::Io(_) => Self::FileUnavailable,
            PreviewError::Cache(_) => Self::CacheUnavailable,
            PreviewError::FileTooLarge { .. } => Self::TooLarge,
            PreviewError::TooManyPixels { .. } => Self::TooManyPixels,
        }
    }
}

/// A file the webview may load through the asset protocol, by its absolute
/// path, for `convertFileSrc`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetFile {
    pub path: String,
}

/// What the webview renders a file as itself (spec 8).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum AssetKind {
    Image,
    Pdf,
    Svg,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Encoding {
    Utf8,
    Utf8Bom,
    Windows1252,
}

impl From<TextEncoding> for Encoding {
    fn from(encoding: TextEncoding) -> Self {
        match encoding {
            TextEncoding::Utf8 => Self::Utf8,
            TextEncoding::Utf8Bom => Self::Utf8Bom,
            TextEncoding::Windows1252 => Self::Windows1252,
        }
    }
}

/// Rows (without the header) and columns of a whole table.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
pub struct Dimensions {
    pub rows: u32,
    pub columns: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TablePreview {
    pub header: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub encoding: Encoding,
    pub complete: bool,
    pub more_rows: bool,
    pub more_columns: bool,
    /// Present only when the whole file was read (spec 8).
    pub dimensions: Option<Dimensions>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TextPreview {
    pub lines: Vec<String>,
    pub encoding: Encoding,
    pub complete: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum NotebookKind {
    Jupyter,
    RMarkdown,
    Quarto,
}

impl From<NotebookFormat> for NotebookKind {
    fn from(format: NotebookFormat) -> Self {
        match format {
            NotebookFormat::Jupyter => Self::Jupyter,
            NotebookFormat::RMarkdown => Self::RMarkdown,
            NotebookFormat::Quarto => Self::Quarto,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NotebookPreview {
    pub kind: NotebookKind,
    pub language: Option<String>,
    pub kernel: Option<String>,
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests.
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    fn parse(text: &str) -> Result<VersionPath, String> {
        VersionPath::try_from(text.to_owned())
    }

    #[test]
    fn evidence_and_methods_files_are_accepted_and_normalised() {
        assert_eq!(
            parse("_notebook/experiments/EXP-001/evidence/plot.png")
                .unwrap()
                .0,
            "_notebook/experiments/EXP-001/evidence/plot.png"
        );
        assert_eq!(
            parse("_notebook\\experiments\\EXP-001\\methods\\run.py")
                .unwrap()
                .file_name(),
            "run.py"
        );
    }

    #[test]
    fn anything_else_is_refused() {
        for path in [
            "",
            "_notebook/experiments/EXP-001/experiment.md",
            "_notebook/experiments/EXP-001/evidence",
            "_notebook/experiments/EXP-001/evidence/../experiment.md",
            "_notebook/project.yaml",
            "results/plot.png",
            "/etc/passwd",
            "C:\\Windows\\win.ini",
        ] {
            assert!(parse(path).is_err(), "{path}");
        }
    }

    #[test]
    fn a_hash_must_be_64_lowercase_hex_characters() {
        let good = format!("\"{}\"", "a".repeat(64));
        assert!(serde_json::from_str::<Sha256Hex>(&good).is_ok());
        let upper = format!("\"{}\"", "A".repeat(64));
        assert!(serde_json::from_str::<Sha256Hex>(&upper).is_err());
        assert!(serde_json::from_str::<Sha256Hex>("\"abc\"").is_err());
    }

    #[test]
    fn failures_reach_the_webview_as_message_keys() {
        assert_eq!(
            serde_json::to_string(&PreviewFailure::TooManyPixels).unwrap(),
            r#"{"kind":"tooManyPixels"}"#
        );
    }
}
