//! Gate S3-G04: `cargo test --test inbox_import`. Requests written with no
//! app running import on next open; invalid requests stay with error (spec
//! 5.10). Wrapped in `mod inbox_import` so the gate's filter matches every
//! test here.
// disallowed_methods: fixture setup below writes the inbox folders a test
// reads back; it is fixture setup, not the thing under test.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

mod inbox_import {
    use std::fs;

    use sha2::{Digest, Sha256};

    use nb_fs::{
        CaptureName, CaptureResult, InboxError, KnownVersion, PayloadExpectation, ProjectRelPath,
    };

    use crate::common::TestProject;

    fn evidence_folder() -> ProjectRelPath {
        ProjectRelPath::parse("_notebook/experiments/EXP-001/evidence").unwrap()
    }

    fn sha256_hex(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    /// Seeds `_notebook/inbox/<request_id>/<payload>` with `contents`, as the
    /// VS Code extension would have written it (request.json's own content
    /// is irrelevant to these Rust-level primitives, which never parse it).
    fn seed_request(project: &TestProject, request_id: &str, payload: &str, contents: &[u8]) {
        let dir = project.on_disk(&format!("_notebook/inbox/{request_id}"));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("request.json"), b"{}").unwrap();
        fs::write(dir.join(payload), contents).unwrap();
    }

    #[test]
    fn lists_a_well_formed_request_folder() {
        let project = TestProject::new();
        let root = project.open();
        seed_request(
            &project,
            "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
            "figure.png",
            b"data",
        );

        let found = root.list_inbox_requests().unwrap();

        assert_eq!(found, vec!["01JAX9Q2B7N4M8T6V3W5Y1Z0KC".to_owned()]);
    }

    #[test]
    fn ignores_a_tmp_suffixed_folder() {
        let project = TestProject::new();
        let root = project.open();
        fs::create_dir_all(project.on_disk("_notebook/inbox/01JAX9Q2B7N4M8T6V3W5Y1Z0KC.tmp"))
            .unwrap();

        let found = root.list_inbox_requests().unwrap();

        assert!(found.is_empty());
    }

    #[test]
    fn ignores_a_hidden_entry() {
        let project = TestProject::new();
        let root = project.open();
        fs::create_dir_all(project.on_disk("_notebook/inbox/.DS_Store")).unwrap();

        let found = root.list_inbox_requests().unwrap();

        assert!(found.is_empty());
    }

    #[test]
    fn missing_inbox_folder_lists_nothing() {
        let project = TestProject::new();
        let root = project.open();

        assert_eq!(root.list_inbox_requests().unwrap(), Vec::<String>::new());
    }

    #[test]
    fn reads_the_request_json_text() {
        let project = TestProject::new();
        let root = project.open();
        seed_request(
            &project,
            "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
            "figure.png",
            b"data",
        );

        let read = root
            .read_inbox_request("01JAX9Q2B7N4M8T6V3W5Y1Z0KC")
            .unwrap();

        assert_eq!(read.text, "{}");
        assert_eq!(read.sha256, sha256_hex(b"{}"));
    }

    #[test]
    fn imports_a_copy_mode_payload_as_a_new_artefact() {
        let project = TestProject::new();
        let root = project.open();
        let contents = b"first analysis";
        seed_request(
            &project,
            "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
            "figure.png",
            contents,
        );

        let outcome = root
            .import_inbox_payload(
                "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
                "figure.png",
                PayloadExpectation {
                    sha256: &sha256_hex(contents),
                    size: contents.len() as u64,
                },
                &evidence_folder(),
                CaptureName::New {
                    original_file_name: "figure.png",
                },
                &[],
            )
            .unwrap();

        let CaptureResult::Created(version) = outcome.result else {
            panic!("expected a created version");
        };
        assert_eq!(version.file_name, "figure.png");
        assert_eq!(
            project.read("_notebook/experiments/EXP-001/evidence/figure.png"),
            contents
        );
        // The payload copied from is left in place; only remove_inbox_request cleans it up.
        assert!(project.exists("_notebook/inbox/01JAX9Q2B7N4M8T6V3W5Y1Z0KC/figure.png"));
    }

    #[test]
    fn imports_a_later_version_of_an_existing_artefact() {
        let project = TestProject::new();
        let root = project.open();
        seed_request(&project, "REQUEST0000000000000000V1", "data.csv", b"v1");
        root.import_inbox_payload(
            "REQUEST0000000000000000V1",
            "data.csv",
            PayloadExpectation {
                sha256: &sha256_hex(b"v1"),
                size: 2,
            },
            &evidence_folder(),
            CaptureName::New {
                original_file_name: "data.csv",
            },
            &[],
        )
        .unwrap();

        seed_request(&project, "REQUEST0000000000000000V2", "data.csv", b"v2!");
        let known = [KnownVersion {
            sha256: sha256_hex(b"v1"),
            number: 1,
            same_artefact: true,
        }];
        let outcome = root
            .import_inbox_payload(
                "REQUEST0000000000000000V2",
                "data.csv",
                PayloadExpectation {
                    sha256: &sha256_hex(b"v2!"),
                    size: 3,
                },
                &evidence_folder(),
                CaptureName::Version {
                    stem: "data",
                    extension: ".csv",
                },
                &known,
            )
            .unwrap();

        let CaptureResult::Created(version) = outcome.result else {
            panic!("expected a created version");
        };
        assert_eq!(version.file_name, "data.v2.csv");
        assert_eq!(version.number, 2);
    }

    #[test]
    fn refuses_a_payload_that_does_not_match_the_declared_hash() {
        let project = TestProject::new();
        let root = project.open();
        let contents = b"tampered";
        seed_request(
            &project,
            "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
            "figure.png",
            contents,
        );

        let error = root
            .import_inbox_payload(
                "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
                "figure.png",
                PayloadExpectation {
                    sha256: &sha256_hex(b"not the real bytes"),
                    size: contents.len() as u64,
                },
                &evidence_folder(),
                CaptureName::New {
                    original_file_name: "figure.png",
                },
                &[],
            )
            .unwrap_err();

        assert!(matches!(error, InboxError::PayloadMismatch { .. }));
        // Nothing moved: the inbox payload is byte-identical, evidence/ untouched.
        assert_eq!(
            project.read("_notebook/inbox/01JAX9Q2B7N4M8T6V3W5Y1Z0KC/figure.png"),
            contents
        );
        assert!(!project.exists("_notebook/experiments/EXP-001/evidence/figure.png"));
    }

    #[test]
    fn refuses_a_payload_of_the_wrong_declared_size() {
        let project = TestProject::new();
        let root = project.open();
        let contents = b"exactly eight";
        seed_request(
            &project,
            "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
            "figure.png",
            contents,
        );

        let error = root
            .import_inbox_payload(
                "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
                "figure.png",
                PayloadExpectation {
                    sha256: &sha256_hex(contents),
                    size: contents.len() as u64 + 1,
                },
                &evidence_folder(),
                CaptureName::New {
                    original_file_name: "figure.png",
                },
                &[],
            )
            .unwrap_err();

        assert!(matches!(error, InboxError::PayloadMismatch { .. }));
    }

    #[test]
    fn removes_a_processed_request_folder() {
        let project = TestProject::new();
        let root = project.open();
        seed_request(
            &project,
            "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
            "figure.png",
            b"data",
        );

        root.remove_inbox_request("01JAX9Q2B7N4M8T6V3W5Y1Z0KC")
            .unwrap();

        assert!(!project.exists("_notebook/inbox/01JAX9Q2B7N4M8T6V3W5Y1Z0KC"));
        assert!(root.list_inbox_requests().unwrap().is_empty());
    }

    #[test]
    fn removing_a_missing_request_is_an_error() {
        let project = TestProject::new();
        let root = project.open();

        let error = root
            .remove_inbox_request("01JAX9Q2B7N4M8T6V3W5Y1Z0KC")
            .unwrap_err();

        assert!(matches!(error, InboxError::Read(_)));
    }

    #[test]
    fn a_request_folder_survives_with_no_app_running_and_imports_on_next_open() {
        // Simulates the VS Code extension writing a request while the app is
        // closed (spec 5.10, S3-G04): the folder just needs to be on disk.
        let project = TestProject::new();
        let contents = b"written while closed";
        seed_request(
            &project,
            "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
            "notes.txt",
            contents,
        );

        // The app "opens" and imports on next open.
        let root = project.open();
        assert_eq!(
            root.list_inbox_requests().unwrap(),
            vec!["01JAX9Q2B7N4M8T6V3W5Y1Z0KC".to_owned()]
        );
        root.import_inbox_payload(
            "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
            "notes.txt",
            PayloadExpectation {
                sha256: &sha256_hex(contents),
                size: contents.len() as u64,
            },
            &ProjectRelPath::parse("_notebook/experiments/EXP-001/methods").unwrap(),
            CaptureName::New {
                original_file_name: "notes.txt",
            },
            &[],
        )
        .unwrap();
        root.remove_inbox_request("01JAX9Q2B7N4M8T6V3W5Y1Z0KC")
            .unwrap();

        assert!(root.list_inbox_requests().unwrap().is_empty());
        assert_eq!(
            project.read("_notebook/experiments/EXP-001/methods/notes.txt"),
            contents
        );
    }

    #[test]
    fn rejects_a_request_id_with_a_path_separator() {
        let project = TestProject::new();
        let root = project.open();

        let error = root
            .import_inbox_payload(
                "../escape",
                "figure.png",
                PayloadExpectation {
                    sha256: "0",
                    size: 0,
                },
                &evidence_folder(),
                CaptureName::New {
                    original_file_name: "figure.png",
                },
                &[],
            )
            .unwrap_err();

        assert!(matches!(error, InboxError::InvalidRequestId { .. }));
    }
}
