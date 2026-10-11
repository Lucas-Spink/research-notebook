//! The bin: removing an artefact's files, listing what is in `.trash/` and
//! restoring it (ADR-0062). The moves are in `nb-fs`; these commands check
//! the project is writable, validate what the webview sends, and map results.
//! The record kept with removed files is made and read by `packages/format`;
//! nothing here parses it.

use nb_fs::lock::LockRegistry;
use nb_fs::{BinEntry, BinKind, BinnedFiles, ProjectRelPath, SystemClock, WriteError};
use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;
use tauri::State;

use super::evidence::ExperimentFolder;
use super::folders::{FolderHandle, PickedFolders};
use super::history::writable;
use super::lock::with_root;
use super::preview::VersionPath;
use super::types::ProjectError;

/// A name or stamp that is one plain segment: no separators, no `..`. `nb-fs`
/// checks it again against what is actually in the bin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct BinSegment(String);

impl TryFrom<String> for BinSegment {
    type Error = String;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        let plain = !text.is_empty()
            && text != ".."
            && text != "."
            && !text.contains(['/', '\\', ':'])
            && !text.chars().any(char::is_control);
        if plain {
            Ok(Self(text))
        } else {
            Err("expected one plain name".to_owned())
        }
    }
}

impl<'de> Deserialize<'de> for BinSegment {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::try_from(String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

/// What a bin entry is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BinEntryKind {
    Question,
    Experiment,
    Files,
}

impl From<BinKind> for BinEntryKind {
    fn from(kind: BinKind) -> Self {
        match kind {
            BinKind::Question => Self::Question,
            BinKind::Experiment => Self::Experiment,
            BinKind::Files => Self::Files,
        }
    }
}

impl From<BinEntryKind> for BinKind {
    fn from(kind: BinEntryKind) -> Self {
        match kind {
            BinEntryKind::Question => Self::Question,
            BinEntryKind::Experiment => Self::Experiment,
            BinEntryKind::Files => Self::Files,
        }
    }
}

/// One thing in the bin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BinItem {
    /// When it was binned, as the bin's folder name (`2026-09-21T10-15-00Z`).
    pub stamp: String,
    pub kind: BinEntryKind,
    /// A question's file name, or an experiment's folder name.
    pub name: String,
    /// Where it comes back to, relative to the project folder.
    pub original: String,
    /// The note kept when it was binned, as text for `packages/format` to read.
    pub note: Option<String>,
}

impl From<BinEntry> for BinItem {
    fn from(entry: BinEntry) -> Self {
        Self {
            stamp: entry.stamp,
            kind: entry.kind.into(),
            name: entry.name,
            original: entry.original,
            note: entry.note,
        }
    }
}

/// What removing an artefact's files did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BinnedItem {
    pub stamp: String,
    pub moved: u32,
    pub missing: u32,
}

impl From<BinnedFiles> for BinnedItem {
    fn from(binned: BinnedFiles) -> Self {
        Self {
            stamp: binned.stamp,
            moved: u32::try_from(binned.moved).unwrap_or(u32::MAX),
            missing: u32::try_from(binned.missing).unwrap_or(u32::MAX),
        }
    }
}

fn failed(error: &WriteError) -> ProjectError {
    match error {
        WriteError::Exists { .. } => ProjectError::NameTaken,
        _ => ProjectError::WriteFailed,
    }
}

/// Moves an artefact's captured files to the bin and keeps its record beside
/// them (`record` is an `artefacts.yaml` holding just that artefact, made by
/// `packages/format`). Pass no files for a linked artefact: only the record
/// is kept, and the linked file is never touched. Nothing is deleted.
#[tauri::command]
#[specta::specta]
pub async fn bin_artefact_files(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
    experiment: ExperimentFolder,
    files: Vec<VersionPath>,
    record: String,
) -> Result<BinnedItem, ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        writable(locks.health(&root))?;
        let paths = files
            .iter()
            .map(|f| ProjectRelPath::parse(f.as_str()).map_err(|_| ProjectError::WriteFailed))
            .collect::<Result<Vec<_>, _>>()?;
        root.bin_artefact_files(experiment.as_str(), &paths, record.as_bytes(), &SystemClock)
            .map(BinnedItem::from)
            .map_err(|e| failed(&e))
    })
    .await
}

/// Everything in the bin, oldest first.
#[tauri::command]
#[specta::specta]
pub async fn list_bin(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
) -> Result<Vec<BinItem>, ProjectError> {
    with_root(&folders, folder, move |root| {
        root.list_bin()
            .map(|entries| entries.into_iter().map(BinItem::from).collect())
            .map_err(|_| ProjectError::FileUnavailable)
    })
    .await
}

/// The record kept with files removed from an experiment, as text for
/// `packages/format` to read.
#[tauri::command]
#[specta::specta]
pub async fn read_binned_record(
    folders: State<'_, PickedFolders>,
    folder: FolderHandle,
    stamp: BinSegment,
    experiment: ExperimentFolder,
) -> Result<String, ProjectError> {
    with_root(&folders, folder, move |root| {
        root.read_binned_record(&stamp.0, experiment.as_str())
            .map_err(|_| ProjectError::FileUnavailable)
    })
    .await
}

/// Moves something in the bin back to where it was. Refused, with nothing
/// moved, if anything is already there.
#[tauri::command]
#[specta::specta]
pub async fn restore_from_bin(
    folders: State<'_, PickedFolders>,
    locks: State<'_, LockRegistry>,
    folder: FolderHandle,
    stamp: BinSegment,
    kind: BinEntryKind,
    name: BinSegment,
) -> Result<(), ProjectError> {
    let locks = locks.inner().clone();
    with_root(&folders, folder, move |root| {
        writable(locks.health(&root))?;
        root.restore_from_bin(&stamp.0, kind.into(), &name.0)
            .map_err(|e| failed(&e))
    })
    .await
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn a_bin_segment_is_one_plain_name() {
        assert!(BinSegment::try_from("2026-09-21T10-15-00Z".to_owned()).is_ok());
        assert!(BinSegment::try_from("Q-001.md".to_owned()).is_ok());
        for bad in ["", ".", "..", "a/b", "a\\b", "c:x", "a\nb"] {
            assert!(BinSegment::try_from(bad.to_owned()).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn a_name_in_the_way_is_its_own_error() {
        let exists = WriteError::Exists { path: "x".into() };
        assert_eq!(failed(&exists), ProjectError::NameTaken);
        let missing = WriteError::Missing { path: "x".into() };
        assert_eq!(failed(&missing), ProjectError::WriteFailed);
    }

    #[test]
    fn the_kinds_round_trip() {
        for kind in [BinKind::Question, BinKind::Experiment, BinKind::Files] {
            assert_eq!(BinKind::from(BinEntryKind::from(kind)), kind);
        }
    }
}
