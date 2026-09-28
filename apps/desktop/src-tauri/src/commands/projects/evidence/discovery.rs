//! Discovery (FR-EVD-09, ADR-0035, ADR-0044 point 7): resolving the chosen
//! folder, running the scan and turning what it finds into locations the
//! webview can ask to add. Commands themselves live in `mod.rs`, as the
//! other evidence commands do; this module holds the state a scan needs to
//! be cancelled and the work between locating the folder and reporting back.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use nb_fs::discovery::{discover, DiscoveryOptions, DEFAULT_EXCLUDES};
use nb_fs::settings::SettingsStore;

use super::super::ids::Ulid;
use super::super::open::{resolve_root, RootProblem, SourcePath};
use super::capture::bytes;
use super::locate;
use super::types::{
    DiscoveredFileDto, DiscoveryFolder, DiscoveryOptionsDto, DiscoveryProgressDto,
    DiscoveryResultDto, EvidenceFailure, SourceLocation,
};

/// The scan this window is running, if any, so a cancel command can reach
/// its flag. Only one scan runs at a time, as only one discovery dialog can
/// be open.
#[derive(Debug, Default)]
pub struct DiscoveryScans {
    inner: Mutex<Option<Arc<AtomicBool>>>,
}

impl DiscoveryScans {
    /// Starts a new scan, replacing any earlier flag, and returns it.
    pub(super) fn start(&self) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        *self.inner.lock().unwrap_or_else(PoisonError::into_inner) = Some(flag.clone());
        flag
    }

    /// Clears the running scan once it has finished, cancelled or not.
    pub(super) fn finish(&self) {
        *self.inner.lock().unwrap_or_else(PoisonError::into_inner) = None;
    }

    /// Sets the running scan's cancel flag, if one is running.
    pub(super) fn cancel(&self) {
        if let Some(flag) = self
            .inner
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .as_ref()
        {
            flag.store(true, Ordering::Relaxed);
        }
    }
}

/// The clutter a scan excludes unless told otherwise (ADR-0035 point 4), for
/// the dialog to show and let the person edit.
pub(super) fn default_excludes() -> Vec<String> {
    DEFAULT_EXCLUDES.iter().map(|s| (*s).to_owned()).collect()
}

/// The absolute path `chosen` names, checked the way a picked folder is
/// checked, so a location that reached this command another way cannot name
/// anything the person could not have picked.
pub(super) fn checked_folder(
    settings: &SettingsStore,
    project: &Path,
    project_id: &Ulid,
    chosen: &DiscoveryFolder,
) -> Result<PathBuf, EvidenceFailure> {
    let root_folder =
        resolve_root(settings, project, project_id.as_str(), &chosen.root).map_err(|problem| {
            match problem {
                RootProblem::SettingsUnavailable => EvidenceFailure::SettingsUnavailable,
                RootProblem::Unresolved | RootProblem::FolderMissing => {
                    EvidenceFailure::RootUnavailable
                }
            }
        })?;
    let resolved = match &chosen.prefix {
        Some(prefix) => root_folder.join(prefix.as_str()),
        None => root_folder.clone(),
    };
    let externals = match chosen.root.external_id() {
        None => Vec::new(),
        Some(id) => vec![(id.to_owned(), root_folder)],
    };
    locate::locate_folder(&resolved, project, &externals)
        .map_err(|_| EvidenceFailure::FolderUnavailable)?;
    Ok(resolved)
}

/// A file directly under `chosen`: its root, with `rel_path` appended to its
/// prefix. Shared with relink, whose candidates sit the same way under a
/// folder the person points at (ADR-0031 §3).
pub(super) fn location_under(chosen: &DiscoveryFolder, rel_path: &str) -> Option<SourceLocation> {
    let full = match &chosen.prefix {
        Some(prefix) => format!("{}/{rel_path}", prefix.as_str()),
        None => rel_path.to_owned(),
    };
    Some(SourceLocation {
        root: chosen.root.clone(),
        path: SourcePath::try_from(full).ok()?,
    })
}

/// Scans `absolute` (already checked against `chosen`) for files to capture
/// (FR-EVD-09), reporting progress through `progress` and stopping early
/// once `cancel` is set.
pub(super) fn run_scan(
    absolute: &Path,
    chosen: &DiscoveryFolder,
    options: DiscoveryOptionsDto,
    captured: &[String],
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(DiscoveryProgressDto),
) -> Result<DiscoveryResultDto, EvidenceFailure> {
    let options = DiscoveryOptions {
        include: options.include,
        exclude: options.exclude,
    };
    let mut report = |found: &nb_fs::discovery::DiscoveryProgress| {
        progress(DiscoveryProgressDto {
            files_seen: bytes(found.files_seen),
            folders_seen: bytes(found.folders_seen),
        });
    };
    let found = discover(absolute, &options, captured, cancel, &mut report)?;
    Ok(result_dto(found, chosen))
}

/// `found` as the webview takes it: each proposed file placed under
/// `chosen`, and only a count of what was skipped, never a path.
fn result_dto(found: nb_fs::discovery::Discovery, chosen: &DiscoveryFolder) -> DiscoveryResultDto {
    let files = found
        .files
        .into_iter()
        .filter_map(|file| {
            let location = location_under(chosen, &file.rel_path)?;
            let name = file
                .rel_path
                .rsplit('/')
                .next()
                .unwrap_or(&file.rel_path)
                .to_owned();
            Some(DiscoveredFileDto {
                location,
                name,
                size: bytes(file.size),
                modified: file.modified.to_rfc3339(),
                captured: file.captured,
            })
        })
        .collect();
    DiscoveryResultDto {
        files,
        folders_visited: bytes(found.folders_visited),
        skipped: bytes(found.skipped.len() as u64),
        cancelled: found.cancelled,
    }
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests, and they write
// fixture files with std::fs.
#[allow(clippy::unwrap_used, clippy::disallowed_methods)]
mod tests {
    use std::fs;

    use tempfile::TempDir;

    use super::*;
    use crate::commands::projects::open::SourceRoot;

    fn project() -> TempDir {
        let root = tempfile::Builder::new()
            .prefix("nb-proj-")
            .tempdir()
            .unwrap();
        fs::create_dir_all(root.path().join("_notebook")).unwrap();
        fs::create_dir_all(root.path().join("results")).unwrap();
        fs::write(root.path().join("results/pca.csv"), b"a,b\n").unwrap();
        root
    }

    fn chosen(root: &str, prefix: Option<&str>) -> DiscoveryFolder {
        DiscoveryFolder {
            root: SourceRoot::try_from(root.to_owned()).unwrap(),
            prefix: prefix.map(|p| SourcePath::try_from(p.to_owned()).unwrap()),
        }
    }

    #[test]
    fn default_excludes_match_the_engine() {
        assert_eq!(
            default_excludes(),
            DEFAULT_EXCLUDES
                .iter()
                .map(|s| (*s).to_string())
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn a_discovered_file_is_placed_under_the_chosen_folders_prefix() {
        let location = location_under(&chosen("project", Some("results")), "pca.csv");
        assert_eq!(
            location,
            Some(SourceLocation {
                root: SourceRoot::try_from("project".to_owned()).unwrap(),
                path: SourcePath::try_from("results/pca.csv".to_owned()).unwrap(),
            })
        );
    }

    #[test]
    fn a_discovered_file_under_the_root_itself_keeps_its_own_path() {
        let location = location_under(&chosen("project", None), "results/pca.csv");
        assert_eq!(
            location,
            Some(SourceLocation {
                root: SourceRoot::try_from("project".to_owned()).unwrap(),
                path: SourcePath::try_from("results/pca.csv".to_owned()).unwrap(),
            })
        );
    }

    #[test]
    fn a_checked_folder_resolves_the_project_root_itself() {
        let root = project();
        let settings_dir = tempfile::Builder::new()
            .prefix("nb-settings-")
            .tempdir()
            .unwrap();
        let settings = SettingsStore::new(settings_dir.path());
        let project_id = Ulid::try_from("01JA0000000000000000000000".to_owned()).unwrap();
        let target = chosen("project", None);

        let absolute = checked_folder(&settings, root.path(), &project_id, &target).unwrap();

        assert_eq!(absolute, root.path());
    }

    #[test]
    fn a_scan_finds_a_file_and_marks_it_captured() {
        let root = project();
        let options = DiscoveryOptionsDto {
            include: Vec::new(),
            exclude: default_excludes(),
        };
        let cancel = AtomicBool::new(false);
        let mut progress_calls = 0;

        let dto = run_scan(
            root.path(),
            &chosen("project", None),
            options,
            &["results/pca.csv".to_owned()],
            &cancel,
            &mut |_| progress_calls += 1,
        )
        .unwrap();

        assert!(progress_calls >= 2);
        assert_eq!(dto.files.len(), 1);
        assert_eq!(dto.files[0].name, "pca.csv");
        assert!(dto.files[0].captured);
        assert!(!dto.cancelled);
    }

    #[test]
    fn an_invalid_pattern_is_reported_and_a_flag_shared_between_start_and_cancel() {
        let root = project();
        let bad = DiscoveryOptionsDto {
            include: vec!["[".to_owned()],
            exclude: Vec::new(),
        };
        assert_eq!(
            run_scan(
                root.path(),
                &chosen("project", None),
                bad,
                &[],
                &AtomicBool::new(false),
                &mut |_| {},
            ),
            Err(EvidenceFailure::InvalidPattern)
        );

        let scans = DiscoveryScans::default();
        let flag = scans.start();
        assert!(!flag.load(Ordering::Relaxed));
        scans.cancel();
        assert!(flag.load(Ordering::Relaxed));
        scans.finish();
    }
}
