//! Requests the VS Code extension left in `_notebook/inbox/` (spec 5.10,
//! ADR-0033, ADR-0044 point 6): finding them, reading one's text for
//! `packages/format` to parse (AGENTS.md rule 2), placing a copy-mode
//! payload in an experiment, and removing a request once it has been
//! recorded. All writing is `nb-fs`'s, inside `_notebook/`.

use std::path::Path;

use nb_fs::{PayloadExpectation, ProjectRoot};

use super::capture::{capture_name, destination_folder, known_versions, outcome_dto};
use super::types::{
    CaptureNaming, CaptureOutcomeDto, Destination, EvidenceFailure, ExperimentFolder, InboxName,
    KnownVersionInput,
};

fn open(project_root: &Path) -> Result<ProjectRoot, EvidenceFailure> {
    ProjectRoot::open(project_root).map_err(|_| EvidenceFailure::ProjectUnavailable)
}

/// The folder names of the requests waiting, sorted. Empty when there is no
/// inbox: most projects never receive a request.
pub(super) fn list(project_root: &Path) -> Result<Vec<String>, EvidenceFailure> {
    open(project_root)?
        .list_inbox_requests()
        .map_err(|_| EvidenceFailure::RequestUnavailable)
}

/// The text of `request`'s `request.json`, unparsed.
pub(super) fn read(project_root: &Path, request: &InboxName) -> Result<String, EvidenceFailure> {
    open(project_root)?
        .read_inbox_request(request.as_str())
        .map(|file| file.text)
        .map_err(|_| EvidenceFailure::RequestUnavailable)
}

/// A whole number of bytes from the number the bindings carry.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub(super) fn byte_count(size: f64) -> Option<u64> {
    // 2^53: the largest range in which an f64 counts every integer.
    let exact =
        size.is_finite() && size >= 0.0 && size.fract() == 0.0 && size < 9_007_199_254_740_992.0;
    exact.then_some(size as u64)
}

/// Places `request`'s copy-mode payload in `experiment` as a new version,
/// once it has been checked against the `sha256` and `size` the request
/// declared. A payload that does not match is left where it is.
#[allow(clippy::too_many_arguments)]
pub(super) fn import_payload(
    project_root: &Path,
    request: &InboxName,
    payload: &InboxName,
    sha256: &str,
    size: f64,
    experiment: &ExperimentFolder,
    destination: Destination,
    naming: &CaptureNaming,
    known: &[KnownVersionInput],
) -> Result<CaptureOutcomeDto, EvidenceFailure> {
    let size = byte_count(size).ok_or(EvidenceFailure::InvalidRequest)?;
    if !naming.is_plain() || !known.iter().all(KnownVersionInput::is_valid) {
        return Err(EvidenceFailure::InvalidRequest);
    }
    let project = open(project_root)?;
    let (prefix, folder) = destination_folder(experiment, destination)?;
    let outcome = project.import_inbox_payload(
        request.as_str(),
        payload.as_str(),
        PayloadExpectation { sha256, size },
        &folder,
        capture_name(naming),
        &known_versions(known),
    )?;
    // The request carries its own provenance, so none is looked up here.
    outcome_dto(outcome, &prefix, || None)
}

/// Deletes `request`'s folder, once the import it asked for is recorded.
pub(super) fn remove(project_root: &Path, request: &InboxName) -> Result<(), EvidenceFailure> {
    open(project_root)?
        .remove_inbox_request(request.as_str())
        .map_err(EvidenceFailure::from)
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests, and they write
// fixture files with std::fs.
#[allow(clippy::unwrap_used, clippy::panic, clippy::disallowed_methods)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use nb_fs::observe_link;
    use tempfile::TempDir;

    use super::super::types::CaptureResultDto;
    use super::*;

    const REQUEST: &str = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";
    const PAYLOAD_BYTES: &[u8] = b"pc1,pc2\n0.1,0.2\n";

    fn name(text: &str) -> InboxName {
        InboxName::try_from(text.to_owned()).unwrap()
    }

    /// A project with an experiment and one waiting request, its payload
    /// `scores.csv`. Returns the project folder and the payload's hash.
    fn project() -> (TempDir, PathBuf, String) {
        let root = tempfile::Builder::new()
            .prefix("nb-proj-")
            .tempdir()
            .unwrap();
        fs::create_dir_all(root.path().join("_notebook/experiments/EXP-001")).unwrap();
        let inbox = root.path().join("_notebook/inbox").join(REQUEST);
        fs::create_dir_all(&inbox).unwrap();
        fs::write(inbox.join("scores.csv"), PAYLOAD_BYTES).unwrap();
        fs::write(inbox.join("request.json"), "{\"request_id\":\"x\"}\n").unwrap();
        let sha = observe_link(&inbox.join("scores.csv")).unwrap().sha256;
        let path = root.path().to_path_buf();
        (root, path, sha)
    }

    fn import(
        project: &Path,
        sha256: &str,
        size: f64,
        known: &[KnownVersionInput],
    ) -> Result<CaptureOutcomeDto, EvidenceFailure> {
        import_payload(
            project,
            &name(REQUEST),
            &name("scores.csv"),
            sha256,
            size,
            &ExperimentFolder::try_from("EXP-001".to_owned()).unwrap(),
            Destination::Evidence,
            &CaptureNaming::New {
                original_file_name: "scores.csv".to_owned(),
            },
            known,
        )
    }

    #[test]
    fn lists_waiting_requests_and_reads_a_request_as_text() {
        let (_root, project, _) = project();
        assert_eq!(list(&project).unwrap(), vec![REQUEST.to_owned()]);
        assert_eq!(
            read(&project, &name(REQUEST)).unwrap(),
            "{\"request_id\":\"x\"}\n"
        );
    }

    #[test]
    fn a_project_with_no_inbox_has_no_requests() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("_notebook")).unwrap();
        assert_eq!(list(root.path()).unwrap(), Vec::<String>::new());
    }

    #[test]
    fn a_request_that_is_not_there_cannot_be_read() {
        let (_root, project, _) = project();
        assert_eq!(
            read(&project, &name("01JAX9Q2B7N4M8T6V3W5Y1Z0KD")),
            Err(EvidenceFailure::RequestUnavailable)
        );
    }

    #[test]
    fn a_matching_payload_becomes_a_new_version_and_the_inbox_copy_stays_until_removed() {
        let (_root, project, sha) = project();
        let outcome = import(&project, &sha, PAYLOAD_BYTES.len() as f64, &[]).unwrap();

        match outcome.result {
            CaptureResultDto::Created { file, number, .. } => {
                assert_eq!(file, "evidence/scores.csv");
                assert_eq!(number, 1);
            }
            other @ CaptureResultDto::Duplicate { .. } => panic!("{other:?}"),
        }
        assert!(outcome.provenance.is_none());
        assert!(project
            .join("_notebook/experiments/EXP-001/evidence/scores.csv")
            .is_file());
        assert!(project
            .join("_notebook/inbox")
            .join(REQUEST)
            .join("scores.csv")
            .is_file());
    }

    #[test]
    fn a_payload_that_is_not_what_was_declared_is_left_alone() {
        let (_root, project, sha) = project();
        assert_eq!(
            import(&project, &sha, 3.0, &[]),
            Err(EvidenceFailure::PayloadMismatch)
        );
        assert_eq!(
            import(&project, &"0".repeat(64), PAYLOAD_BYTES.len() as f64, &[]),
            Err(EvidenceFailure::PayloadMismatch)
        );
        assert!(!project
            .join("_notebook/experiments/EXP-001/evidence")
            .exists());
    }

    #[test]
    fn content_already_held_makes_no_version() {
        let (_root, project, sha) = project();
        let known = [KnownVersionInput {
            sha256: sha.clone(),
            number: 1,
            same_artefact: true,
        }];
        let outcome = import(&project, &sha, PAYLOAD_BYTES.len() as f64, &known).unwrap();
        assert_eq!(outcome.result, CaptureResultDto::Duplicate { version: 1 });
    }

    #[test]
    fn a_size_that_is_not_a_whole_number_of_bytes_is_refused() {
        let (_root, project, sha) = project();
        for size in [-1.0, 1.5, f64::NAN, f64::INFINITY, 1e300] {
            assert_eq!(
                import(&project, &sha, size, &[]),
                Err(EvidenceFailure::InvalidRequest),
                "{size}"
            );
        }
    }

    #[test]
    fn a_processed_request_is_removed_and_nothing_else() {
        let (_root, project, _) = project();
        remove(&project, &name(REQUEST)).unwrap();
        assert!(!project.join("_notebook/inbox").join(REQUEST).exists());
        assert!(project.join("_notebook/experiments/EXP-001").is_dir());
        assert_eq!(list(&project).unwrap(), Vec::<String>::new());
    }
}
