//! Gate S3-G01 (Rust half): `cargo test -p nb-fs -- capture`. Same content
//! creates no version; changed content creates v2; v1 bytes unchanged
//! (FR-EVD-03 to FR-EVD-05). Wrapped in `mod capture` so the gate's filter
//! matches every test here.
// disallowed_methods: `source` below writes the throwaway analysis file a
// capture reads from; it is fixture setup, not the thing under test.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

mod capture {
    use std::fs::{self, File};
    use std::io;

    use sha2::{Digest, Sha256};

    use nb_fs::{
        AtomicIo, CaptureError, CaptureName, CaptureResult, KnownVersion, ProjectRelPath, RealIo,
    };

    use crate::common::TestProject;

    fn evidence_folder() -> ProjectRelPath {
        ProjectRelPath::parse("_notebook/experiments/EXP-001/evidence").unwrap()
    }

    fn sha256_hex(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    /// A file outside `_notebook/`, as a capture source. Never written to
    /// again by the test: capture must not touch it.
    fn source(project: &TestProject, name: &str, contents: &[u8]) -> std::path::PathBuf {
        let path = project.on_disk(name);
        fs::write(&path, contents).unwrap();
        path
    }

    #[test]
    fn creates_a_new_artefacts_first_version() {
        let project = TestProject::new();
        let root = project.open();
        let src = source(&project, "upload.pdf", b"first analysis");

        let outcome = root
            .capture_copy(
                &src,
                &evidence_folder(),
                CaptureName::New {
                    original_file_name: "PCA by treatment.pdf",
                },
                &[],
            )
            .unwrap();

        let CaptureResult::Created(version) = outcome.result else {
            panic!("expected a new version, got {:?}", outcome.result);
        };
        assert_eq!(version.file_name, "PCA by treatment.pdf");
        assert_eq!(version.number, 1);
        assert_eq!(version.sha256, sha256_hex(b"first analysis"));
        assert_eq!(version.size, "first analysis".len() as u64);
        assert_eq!(
            version.path.as_str(),
            "_notebook/experiments/EXP-001/evidence/PCA by treatment.pdf"
        );
        assert_eq!(
            project.read("_notebook/experiments/EXP-001/evidence/PCA by treatment.pdf"),
            b"first analysis"
        );
        assert!(!outcome.matches_other_artefact);
        assert!(project.temp_files().is_empty());

        // The source is read-only to this module: untouched.
        assert_eq!(project.read("upload.pdf"), b"first analysis");
    }

    #[test]
    fn resolves_a_name_collision_with_a_suffix() {
        let project = TestProject::new();
        let root = project.open();
        let first_src = source(&project, "one.png", b"content one");
        let second_src = source(&project, "two.png", b"content two");

        let first = root
            .capture_copy(
                &first_src,
                &evidence_folder(),
                CaptureName::New {
                    original_file_name: "figure.png",
                },
                &[],
            )
            .unwrap();
        let second = root
            .capture_copy(
                &second_src,
                &evidence_folder(),
                CaptureName::New {
                    original_file_name: "figure.png",
                },
                &[],
            )
            .unwrap();

        let CaptureResult::Created(first) = first.result else {
            panic!("expected a new version");
        };
        let CaptureResult::Created(second) = second.result else {
            panic!("expected a new version");
        };
        assert_eq!(first.file_name, "figure.png");
        assert_eq!(second.file_name, "figure-2.png");
        assert_eq!(
            project.read("_notebook/experiments/EXP-001/evidence/figure.png"),
            b"content one"
        );
        assert_eq!(
            project.read("_notebook/experiments/EXP-001/evidence/figure-2.png"),
            b"content two"
        );
    }

    #[test]
    fn names_a_later_version_with_v_and_number() {
        let project = TestProject::new();
        let root = project.open();
        let v1_src = source(&project, "v1.pdf", b"version one");
        root.capture_copy(
            &v1_src,
            &evidence_folder(),
            CaptureName::New {
                original_file_name: "pca_by_treatment.pdf",
            },
            &[],
        )
        .unwrap();

        let v2_src = source(&project, "v2.pdf", b"version two");
        let known = [KnownVersion {
            sha256: sha256_hex(b"version one"),
            number: 1,
            same_artefact: true,
        }];
        let outcome = root
            .capture_copy(
                &v2_src,
                &evidence_folder(),
                CaptureName::Version {
                    stem: "pca_by_treatment",
                    extension: ".pdf",
                },
                &known,
            )
            .unwrap();

        let CaptureResult::Created(version) = outcome.result else {
            panic!("expected a new version");
        };
        assert_eq!(version.file_name, "pca_by_treatment.v2.pdf");
        assert_eq!(version.number, 2);
        assert_eq!(
            project.read("_notebook/experiments/EXP-001/evidence/pca_by_treatment.pdf"),
            b"version one"
        );
        assert_eq!(
            project.read("_notebook/experiments/EXP-001/evidence/pca_by_treatment.v2.pdf"),
            b"version two"
        );
    }

    #[test]
    fn matching_content_is_a_duplicate_and_creates_no_file() {
        let project = TestProject::new();
        let root = project.open();
        let v1_src = source(&project, "v1.pdf", b"same bytes");
        root.capture_copy(
            &v1_src,
            &evidence_folder(),
            CaptureName::New {
                original_file_name: "result.pdf",
            },
            &[],
        )
        .unwrap();

        let again_src = source(&project, "again.pdf", b"same bytes");
        let known = [KnownVersion {
            sha256: sha256_hex(b"same bytes"),
            number: 1,
            same_artefact: true,
        }];
        let outcome = root
            .capture_copy(
                &again_src,
                &evidence_folder(),
                CaptureName::Version {
                    stem: "result",
                    extension: ".pdf",
                },
                &known,
            )
            .unwrap();

        assert_eq!(outcome.result, CaptureResult::Duplicate { version: 1 });
        assert!(!outcome.matches_other_artefact);
        // v1's bytes are unchanged and no v2 was created.
        assert_eq!(
            project.read("_notebook/experiments/EXP-001/evidence/result.pdf"),
            b"same bytes"
        );
        assert!(!project.exists("_notebook/experiments/EXP-001/evidence/result.v2.pdf"));
        assert!(project.temp_files().is_empty());
    }

    #[test]
    fn flags_a_match_with_a_different_artefact() {
        let project = TestProject::new();
        let root = project.open();
        let other_src = source(&project, "other.csv", b"shared bytes");
        let known = [KnownVersion {
            sha256: sha256_hex(b"shared bytes"),
            number: 1,
            same_artefact: false,
        }];

        let outcome = root
            .capture_copy(
                &other_src,
                &evidence_folder(),
                CaptureName::New {
                    original_file_name: "duplicate.csv",
                },
                &known,
            )
            .unwrap();

        assert!(matches!(outcome.result, CaptureResult::Created(_)));
        assert!(outcome.matches_other_artefact);
    }

    #[test]
    fn refuses_to_replace_an_existing_version_file() {
        let project = TestProject::new();
        let root = project.open();
        root.create_folder(&evidence_folder()).unwrap();
        fs::write(
            project.on_disk("_notebook/experiments/EXP-001/evidence/result.v2.pdf"),
            b"already there",
        )
        .unwrap();

        let src = source(&project, "new.pdf", b"a new version");
        let known = [KnownVersion {
            sha256: sha256_hex(b"some earlier content"),
            number: 1,
            same_artefact: true,
        }];
        let error = root
            .capture_copy(
                &src,
                &evidence_folder(),
                CaptureName::Version {
                    stem: "result",
                    extension: ".pdf",
                },
                &known,
            )
            .unwrap_err();

        assert!(matches!(error, CaptureError::VersionExists { .. }));
        assert_eq!(
            project.read("_notebook/experiments/EXP-001/evidence/result.v2.pdf"),
            b"already there"
        );
        assert!(project.temp_files().is_empty());
    }

    #[test]
    fn refuses_a_source_that_is_a_directory() {
        let project = TestProject::new();
        let root = project.open();

        let error = root
            .capture_copy(
                &project.on_disk("scripts"),
                &evidence_folder(),
                CaptureName::New {
                    original_file_name: "run.R",
                },
                &[],
            )
            .unwrap_err();

        // Windows refuses to open a directory as a file at all; Unix opens
        // it and this module then rejects it. Either way, nothing is written.
        assert!(matches!(
            error,
            CaptureError::SourceNotAFile | CaptureError::Source { .. }
        ));
        assert!(project.temp_files().is_empty());
    }

    /// An `AtomicIo` that silently corrupts the bytes it writes, as if the
    /// disk had (spec FR-EVD-03: the copy is verified, not just written).
    struct CorruptingIo;

    impl AtomicIo for CorruptingIo {
        fn chunk_size(&self) -> usize {
            4
        }
        fn write_chunk(&mut self, file: &mut File, chunk: &[u8]) -> io::Result<()> {
            let mut corrupted = chunk.to_vec();
            if let Some(last) = corrupted.last_mut() {
                *last ^= 0xFF;
            }
            RealIo.write_chunk(file, &corrupted)
        }
    }

    #[test]
    fn verification_catches_a_corrupted_write() {
        let project = TestProject::new();
        let root = project.open();
        let src = source(&project, "upload.bin", b"twelve bytes");

        let error = root
            .capture_copy_with(
                &mut CorruptingIo,
                &src,
                &evidence_folder(),
                CaptureName::New {
                    original_file_name: "data.bin",
                },
                &[],
            )
            .unwrap_err();

        assert!(matches!(error, CaptureError::VerificationFailed { .. }));
        assert!(!project.exists("_notebook/experiments/EXP-001/evidence/data.bin"));
        assert!(project.temp_files().is_empty());
        assert_eq!(project.read("upload.bin"), b"twelve bytes");
    }
}
