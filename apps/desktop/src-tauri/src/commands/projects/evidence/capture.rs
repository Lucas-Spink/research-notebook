//! Capturing a chosen source into an experiment, and observing one that is
//! linked instead (FR-EVD-02 to FR-EVD-05, FR-EVD-07, FR-EVD-12). The copy
//! is made by `nb-fs`, which only reads the source and writes inside
//! `_notebook/` (AGENTS.md rule 1); recording it in `artefacts.yaml` is left
//! to the webview, after this returns (ADR-0044 point 5).

use std::path::Path;

use nb_fs::{
    observe_link, CaptureName, CaptureResult, KnownVersion, ProjectRelPath, ProjectRoot,
    NOTEBOOK_DIR,
};

use super::types::{
    CaptureNaming, CaptureOutcomeDto, CaptureResultDto, CapturedProvenance, Destination,
    EvidenceFailure, ExperimentFolder, KnownVersionInput, LinkObservationDto,
};

/// Bytes as the number the bindings can carry; exact below 8 PiB.
#[allow(clippy::cast_precision_loss)]
pub(super) fn bytes(size: u64) -> f64 {
    size as f64
}

/// Copies `source` into `experiment`'s `destination` folder as a new version,
/// unless its content is already one of `known` (FR-EVD-05). Git provenance
/// is looked up for a new version (FR-EVD-12); a source outside any
/// repository the project can record simply has none.
pub(super) fn capture(
    project_root: &Path,
    source: &Path,
    experiment: &ExperimentFolder,
    destination: Destination,
    naming: &CaptureNaming,
    known: &[KnownVersionInput],
) -> Result<CaptureOutcomeDto, EvidenceFailure> {
    if !naming.is_plain() || !known.iter().all(KnownVersionInput::is_valid) {
        return Err(EvidenceFailure::InvalidRequest);
    }
    let project =
        ProjectRoot::open(project_root).map_err(|_| EvidenceFailure::ProjectUnavailable)?;
    let prefix = format!("{NOTEBOOK_DIR}/experiments/{}/", experiment.as_str());
    let folder = ProjectRelPath::parse(&format!("{prefix}{}", destination.folder_name()))
        .map_err(|_| EvidenceFailure::InvalidRequest)?;
    let name = match naming {
        CaptureNaming::New { original_file_name } => CaptureName::New { original_file_name },
        CaptureNaming::Version { stem, extension } => CaptureName::Version { stem, extension },
    };
    let known: Vec<KnownVersion> = known
        .iter()
        .map(|k| KnownVersion {
            sha256: k.sha256.clone(),
            number: k.number,
            same_artefact: k.same_artefact,
        })
        .collect();
    let outcome = project.capture_copy(source, &folder, name, &known)?;
    let (result, provenance) = match outcome.result {
        CaptureResult::Created(version) => {
            let file = version
                .path
                .as_str()
                .strip_prefix(&prefix)
                .ok_or(EvidenceFailure::Internal)?
                .to_owned();
            let created = CaptureResultDto::Created {
                file,
                sha256: version.sha256,
                size: bytes(version.size),
                number: version.number,
            };
            (created, provenance_of(source, project_root))
        }
        CaptureResult::Duplicate { version } => (CaptureResultDto::Duplicate { version }, None),
    };
    Ok(CaptureOutcomeDto {
        result,
        matches_other_artefact: outcome.matches_other_artefact,
        provenance,
    })
}

/// Git provenance for `source` (ADR-0032). A failure to read the repository
/// only means none is recorded: it never stops the capture.
fn provenance_of(source: &Path, project_root: &Path) -> Option<CapturedProvenance> {
    let found = nb_git::provenance_in_project(source, project_root).ok()??;
    Some(CapturedProvenance {
        repo: found.repo,
        commit: found.commit,
        path_in_repo: found.path_in_repo,
        file_dirty: found.file_dirty,
        tree_dirty: found.tree_dirty,
    })
}

/// A linked file's hash, size and modification time, for `applyLink`
/// (FR-EVD-07). The whole file is read to hash it; nothing is written.
pub(super) fn observe(source: &Path) -> Result<LinkObservationDto, EvidenceFailure> {
    let observed = observe_link(source)?;
    Ok(LinkObservationDto {
        sha256: observed.sha256,
        size: bytes(observed.size),
        observed_mtime: observed.observed_mtime.to_rfc3339(),
    })
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests, and they write
// fixture files with std::fs.
#[allow(clippy::unwrap_used, clippy::panic, clippy::disallowed_methods)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::SystemTime;

    use tempfile::TempDir;

    use super::*;

    const SOURCE_BYTES: &[u8] = b"pc1,pc2\n0.1,0.2\n";

    /// A project with an experiment, and a source file beside its notebook.
    fn project() -> (TempDir, PathBuf) {
        let root = tempfile::Builder::new()
            .prefix("nb-proj-")
            .tempdir()
            .unwrap();
        fs::create_dir_all(root.path().join("_notebook/experiments/EXP-001")).unwrap();
        let source = root.path().join("results/pca.csv");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::write(&source, SOURCE_BYTES).unwrap();
        (root, source)
    }

    fn experiment() -> ExperimentFolder {
        ExperimentFolder::try_from("EXP-001".to_owned()).unwrap()
    }

    fn new_name() -> CaptureNaming {
        CaptureNaming::New {
            original_file_name: "pca.csv".to_owned(),
        }
    }

    fn modified(path: &Path) -> SystemTime {
        fs::metadata(path).unwrap().modified().unwrap()
    }

    #[test]
    fn captures_a_copy_into_the_experiment_and_leaves_the_source_as_it_was() {
        let (root, source) = project();
        let before = modified(&source);

        let outcome = capture(
            root.path(),
            &source,
            &experiment(),
            Destination::Evidence,
            &new_name(),
            &[],
        )
        .unwrap();

        let CaptureResultDto::Created {
            file, size, number, ..
        } = &outcome.result
        else {
            panic!("expected a new version, got {:?}", outcome.result);
        };
        assert_eq!(file, "evidence/pca.csv");
        assert_eq!(*number, 1);
        assert!((*size - 16.0).abs() < f64::EPSILON);
        assert_eq!(
            fs::read(
                root.path()
                    .join("_notebook/experiments/EXP-001/evidence/pca.csv")
            )
            .unwrap(),
            SOURCE_BYTES
        );
        assert!(!outcome.matches_other_artefact);
        // Not in a git repository, so no provenance; the capture still happens.
        assert_eq!(outcome.provenance, None);
        assert_eq!(fs::read(&source).unwrap(), SOURCE_BYTES);
        assert_eq!(modified(&source), before);
    }

    #[test]
    fn capturing_the_same_content_again_makes_no_new_version() {
        let (root, source) = project();
        let first = capture(
            root.path(),
            &source,
            &experiment(),
            Destination::Evidence,
            &new_name(),
            &[],
        )
        .unwrap();
        let CaptureResultDto::Created { sha256, .. } = first.result else {
            panic!("expected a new version");
        };

        let again = capture(
            root.path(),
            &source,
            &experiment(),
            Destination::Evidence,
            &CaptureNaming::Version {
                stem: "pca".to_owned(),
                extension: ".csv".to_owned(),
            },
            &[KnownVersionInput {
                sha256,
                number: 1,
                same_artefact: true,
            }],
        )
        .unwrap();

        assert_eq!(again.result, CaptureResultDto::Duplicate { version: 1 });
    }

    #[test]
    fn refuses_a_name_with_a_folder_in_it_or_a_malformed_known_version() {
        let (root, source) = project();
        let bad_name = CaptureNaming::New {
            original_file_name: "../escape.csv".to_owned(),
        };
        assert_eq!(
            capture(
                root.path(),
                &source,
                &experiment(),
                Destination::Evidence,
                &bad_name,
                &[]
            ),
            Err(EvidenceFailure::InvalidRequest)
        );
        let bad_known = [KnownVersionInput {
            sha256: "not-a-hash".to_owned(),
            number: 1,
            same_artefact: true,
        }];
        assert_eq!(
            capture(
                root.path(),
                &source,
                &experiment(),
                Destination::Methods,
                &new_name(),
                &bad_known
            ),
            Err(EvidenceFailure::InvalidRequest)
        );
    }

    #[test]
    fn a_missing_source_is_reported_and_nothing_is_written() {
        let (root, _) = project();
        assert_eq!(
            capture(
                root.path(),
                &root.path().join("results/gone.csv"),
                &experiment(),
                Destination::Evidence,
                &new_name(),
                &[]
            ),
            Err(EvidenceFailure::SourceUnavailable)
        );
        assert!(!root
            .path()
            .join("_notebook/experiments/EXP-001/evidence/gone.csv")
            .exists());
    }

    #[test]
    fn observes_a_linked_file_without_changing_it() {
        let (_root, source) = project();
        let before = modified(&source);
        let observed = observe(&source).unwrap();
        assert_eq!(observed.sha256.len(), 64);
        assert!((observed.size - 16.0).abs() < f64::EPSILON);
        assert!(observed.observed_mtime.ends_with('Z'));
        assert_eq!(modified(&source), before);
    }
}
