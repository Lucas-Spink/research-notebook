//! Resolving an artefact's `source` to an absolute path (FR-PRJ-07, spec 5.8,
//! ADR-0031 §5: "the project loader's job"), and checking a linked file's
//! live availability from it (FR-EVD-07, FR-EVD-08). Pure path arithmetic
//! and one settings read; the one filesystem check is [`nb_fs::link::stat_link`],
//! which only reads metadata, never bytes.
//!
//! Unlike `_notebook/`, a source may legitimately point anywhere under the
//! project root (`source.root: "project"`) or an external root the person
//! has configured, so nothing here canonicalises or confines the result the
//! way `nb_fs`'s own writes do: these actions only ever read or launch
//! another program, never write.

use std::path::{Path, PathBuf};

use nb_fs::link::{stat_link, LinkStatus};
use nb_fs::settings::SettingsStore;

use super::types::{Availability, OpenFailure, SourcePath, SourceRoot};

/// Why a linked source's root could not be resolved to a folder. Distinct
/// from [`OpenFailure`] so the availability command can report these as
/// ordinary outcomes rather than command errors.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum RootProblem {
    Unresolved,
    FolderMissing,
    SettingsUnavailable,
}

impl From<RootProblem> for OpenFailure {
    fn from(problem: RootProblem) -> Self {
        match problem {
            RootProblem::Unresolved => Self::RootUnresolved,
            RootProblem::FolderMissing => Self::RootFolderMissing,
            RootProblem::SettingsUnavailable => Self::SettingsUnavailable,
        }
    }
}

/// The folder `root` names: `project_root` itself, or the configured folder
/// of the external root it identifies.
pub(super) fn resolve_root(
    settings: &SettingsStore,
    project_root: &Path,
    project_id: &str,
    root: &SourceRoot,
) -> Result<PathBuf, RootProblem> {
    let Some(root_id) = root.external_id() else {
        return Ok(project_root.to_path_buf());
    };
    let loaded = settings
        .load()
        .map_err(|_| RootProblem::SettingsUnavailable)?;
    let Some(path) = loaded.external_root(project_id, root_id) else {
        return Err(RootProblem::Unresolved);
    };
    let folder = PathBuf::from(path);
    if folder.is_dir() {
        Ok(folder)
    } else {
        Err(RootProblem::FolderMissing)
    }
}

/// The absolute path `root`/`path` names, joining `path`'s already-validated
/// forward-slash segments onto the resolved root folder.
pub(super) fn resolve_source(
    settings: &SettingsStore,
    project_root: &Path,
    project_id: &str,
    root: &SourceRoot,
    path: &SourcePath,
) -> Result<PathBuf, RootProblem> {
    Ok(resolve_root(settings, project_root, project_id, root)?.join(path.as_str()))
}

/// The live availability of the linked file at `root`/`path` (FR-EVD-07):
/// checked now, never read from a stored flag (ADR-0031 §1).
pub(super) fn linked_availability(
    settings: &SettingsStore,
    project_root: &Path,
    project_id: &str,
    root: &SourceRoot,
    path: &SourcePath,
) -> Result<Availability, OpenFailure> {
    let resolved = match resolve_source(settings, project_root, project_id, root, path) {
        Ok(resolved) => resolved,
        Err(RootProblem::Unresolved) => return Ok(Availability::RootUnresolved),
        Err(RootProblem::FolderMissing) => return Ok(Availability::RootFolderMissing),
        Err(RootProblem::SettingsUnavailable) => return Err(OpenFailure::SettingsUnavailable),
    };
    match stat_link(&resolved).map_err(|_| OpenFailure::FileUnavailable)? {
        LinkStatus::Missing => Ok(Availability::Missing),
        LinkStatus::Present { size, .. } => Ok(Availability::Available { size }),
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

    const PROJECT_ID: &str = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";
    const ROOT_ID: &str = "01JAXA1C5D8E2F4G6H7J9K0M1N";

    fn source_root(text: &str) -> SourceRoot {
        SourceRoot::try_from(text.to_owned()).unwrap()
    }

    fn source_path(text: &str) -> SourcePath {
        SourcePath::try_from(text.to_owned()).unwrap()
    }

    fn settings_store() -> (TempDir, SettingsStore) {
        let dir = tempfile::Builder::new()
            .prefix("nb-settings-")
            .tempdir()
            .unwrap();
        let store = SettingsStore::new(dir.path());
        (dir, store)
    }

    #[test]
    fn a_project_root_resolves_to_the_project_folder_with_no_settings_read() {
        let project = tempfile::Builder::new()
            .prefix("nb-proj-")
            .tempdir()
            .unwrap();
        let (_settings_dir, settings) = settings_store();

        let resolved = resolve_source(
            &settings,
            project.path(),
            PROJECT_ID,
            &source_root("project"),
            &source_path("results/pca/pca.csv"),
        )
        .unwrap();

        assert_eq!(resolved, project.path().join("results/pca/pca.csv"));
    }

    #[test]
    fn an_unconfigured_external_root_is_unresolved() {
        let project = tempfile::Builder::new()
            .prefix("nb-proj-")
            .tempdir()
            .unwrap();
        let (_settings_dir, settings) = settings_store();

        let result = resolve_source(
            &settings,
            project.path(),
            PROJECT_ID,
            &source_root(ROOT_ID),
            &source_path("data/counts.h5"),
        );

        assert_eq!(result, Err(RootProblem::Unresolved));
    }

    #[test]
    fn an_external_root_whose_folder_is_gone_is_reported_as_missing() {
        let project = tempfile::Builder::new()
            .prefix("nb-proj-")
            .tempdir()
            .unwrap();
        let (_settings_dir, settings) = settings_store();
        settings
            .update(|s| {
                s.set_external_root(PROJECT_ID, ROOT_ID, "Z:\\gone\\raw-data");
            })
            .unwrap();

        let result = resolve_source(
            &settings,
            project.path(),
            PROJECT_ID,
            &source_root(ROOT_ID),
            &source_path("data/counts.h5"),
        );

        assert_eq!(result, Err(RootProblem::FolderMissing));
    }

    #[test]
    fn a_configured_external_root_resolves_beneath_its_folder() {
        let project = tempfile::Builder::new()
            .prefix("nb-proj-")
            .tempdir()
            .unwrap();
        let external = tempfile::Builder::new()
            .prefix("nb-ext-")
            .tempdir()
            .unwrap();
        let (_settings_dir, settings) = settings_store();
        settings
            .update(|s| {
                s.set_external_root(PROJECT_ID, ROOT_ID, &external.path().to_string_lossy());
            })
            .unwrap();

        let resolved = resolve_source(
            &settings,
            project.path(),
            PROJECT_ID,
            &source_root(ROOT_ID),
            &source_path("data/counts.h5"),
        )
        .unwrap();

        assert_eq!(resolved, external.path().join("data/counts.h5"));
    }

    #[test]
    fn availability_reports_a_present_file_by_size() {
        let project = tempfile::Builder::new()
            .prefix("nb-proj-")
            .tempdir()
            .unwrap();
        fs::create_dir_all(project.path().join("results")).unwrap();
        fs::write(project.path().join("results/pca.csv"), b"a,b\n1,2\n").unwrap();
        let (_settings_dir, settings) = settings_store();

        let availability = linked_availability(
            &settings,
            project.path(),
            PROJECT_ID,
            &source_root("project"),
            &source_path("results/pca.csv"),
        )
        .unwrap();

        assert_eq!(availability, Availability::Available { size: 8 });
    }

    #[test]
    fn availability_reports_a_missing_file_without_erroring() {
        let project = tempfile::Builder::new()
            .prefix("nb-proj-")
            .tempdir()
            .unwrap();
        let (_settings_dir, settings) = settings_store();

        let availability = linked_availability(
            &settings,
            project.path(),
            PROJECT_ID,
            &source_root("project"),
            &source_path("results/gone.csv"),
        )
        .unwrap();

        assert_eq!(availability, Availability::Missing);
    }

    #[test]
    fn availability_reports_unresolved_and_folder_missing_roots() {
        let project = tempfile::Builder::new()
            .prefix("nb-proj-")
            .tempdir()
            .unwrap();
        let (_settings_dir, settings) = settings_store();

        assert_eq!(
            linked_availability(
                &settings,
                project.path(),
                PROJECT_ID,
                &source_root(ROOT_ID),
                &source_path("x"),
            )
            .unwrap(),
            Availability::RootUnresolved
        );

        settings
            .update(|s| s.set_external_root(PROJECT_ID, ROOT_ID, "Z:\\gone"))
            .unwrap();
        assert_eq!(
            linked_availability(
                &settings,
                project.path(),
                PROJECT_ID,
                &source_root(ROOT_ID),
                &source_path("x"),
            )
            .unwrap(),
            Availability::RootFolderMissing
        );
    }
}
