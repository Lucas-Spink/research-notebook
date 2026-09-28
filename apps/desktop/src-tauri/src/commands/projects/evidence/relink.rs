//! Relink (FR-EVD-08, ADR-0031 §3, ADR-0044 point 7): looking for a missing
//! linked file's new location among one folder's direct entries. The folder
//! is chosen and resolved exactly as discovery's is (ADR-0044 point 1); a
//! candidate carries its own observation, so confirming one needs no second
//! read of it. Nothing here writes anything — recording a confirmed
//! candidate is `applyRelink` in `packages/format`, after the person
//! confirms it themselves (AGENTS.md rule 2, ADR-0031 §4).

use std::path::Path;

use nb_fs::link::{find_relink_candidates, RelinkExpectation};
use nb_fs::settings::SettingsStore;

use super::super::ids::Ulid;
use super::capture::bytes;
use super::discovery::{checked_folder, location_under};
use super::inbox::byte_count;
use super::types::{DiscoveryFolder, EvidenceFailure, RelinkCandidateDto};

/// Ranked candidates for a missing linked file's new location (FR-EVD-08):
/// `chosen`'s direct entries matching at least one of `file_name`, `size` or
/// `sha256`, highest confidence first. Neither this nor listing them applies
/// anything; only a caller's later `applyRelink`, after confirmation, does.
#[allow(clippy::too_many_arguments)]
pub(super) fn list_candidates(
    settings: &SettingsStore,
    project: &Path,
    project_id: &Ulid,
    chosen: &DiscoveryFolder,
    file_name: &str,
    size: f64,
    sha256: &str,
) -> Result<Vec<RelinkCandidateDto>, EvidenceFailure> {
    let size = byte_count(size).ok_or(EvidenceFailure::InvalidRequest)?;
    let absolute = checked_folder(settings, project, project_id, chosen)?;
    let expected = RelinkExpectation {
        file_name,
        size,
        sha256,
    };
    let found = find_relink_candidates(&absolute, &expected)
        .map_err(|_| EvidenceFailure::FolderUnavailable)?;
    Ok(found
        .into_iter()
        .filter_map(|candidate| {
            let name = candidate.path.file_name()?.to_str()?.to_owned();
            let location = location_under(chosen, &name)?;
            Some(RelinkCandidateDto {
                location,
                name,
                sha256: candidate.observation.sha256,
                size: bytes(candidate.observation.size),
                observed_mtime: candidate.observation.observed_mtime.to_rfc3339(),
                name_matches: candidate.name_matches,
                size_matches: candidate.size_matches,
                hash_matches: candidate.hash_matches,
            })
        })
        .collect())
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests, and they write
// fixture files with std::fs.
#[allow(clippy::unwrap_used, clippy::disallowed_methods)]
mod tests {
    use std::fs;

    use tempfile::TempDir;

    use crate::commands::projects::open::{SourcePath, SourceRoot};

    use super::*;

    fn project() -> TempDir {
        let root = tempfile::Builder::new()
            .prefix("nb-proj-")
            .tempdir()
            .unwrap();
        fs::create_dir_all(root.path().join("_notebook")).unwrap();
        fs::create_dir_all(root.path().join("moved")).unwrap();
        fs::write(root.path().join("moved/pca.csv"), b"a,b\n1,2\n").unwrap();
        root
    }

    fn chosen(prefix: Option<&str>) -> DiscoveryFolder {
        DiscoveryFolder {
            root: SourceRoot::try_from("project".to_owned()).unwrap(),
            prefix: prefix.map(|p| SourcePath::try_from(p.to_owned()).unwrap()),
        }
    }

    #[test]
    fn a_matching_file_is_offered_as_a_candidate_under_the_chosen_folder() {
        let root = project();
        let settings_dir = tempfile::Builder::new()
            .prefix("nb-settings-")
            .tempdir()
            .unwrap();
        let settings = SettingsStore::new(settings_dir.path());
        let project_id = Ulid::try_from("01JA0000000000000000000000".to_owned()).unwrap();

        let candidates = list_candidates(
            &settings,
            root.path(),
            &project_id,
            &chosen(Some("moved")),
            "pca.csv",
            8.0,
            "0".repeat(64).as_str(),
        )
        .unwrap();

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].name, "pca.csv");
        assert!(candidates[0].name_matches);
        assert!(candidates[0].size_matches);
        assert!(!candidates[0].hash_matches);
    }

    #[test]
    fn a_size_that_is_not_a_whole_number_of_bytes_is_refused() {
        let root = project();
        let settings_dir = tempfile::Builder::new()
            .prefix("nb-settings-")
            .tempdir()
            .unwrap();
        let settings = SettingsStore::new(settings_dir.path());
        let project_id = Ulid::try_from("01JA0000000000000000000000".to_owned()).unwrap();

        assert_eq!(
            list_candidates(
                &settings,
                root.path(),
                &project_id,
                &chosen(Some("moved")),
                "pca.csv",
                -1.0,
                &"0".repeat(64),
            ),
            Err(EvidenceFailure::InvalidRequest)
        );
    }
}
