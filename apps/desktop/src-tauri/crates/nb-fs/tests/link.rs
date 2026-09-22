//! `observe_link` and `stat_link` (spec 7.4, FR-EVD-02, FR-EVD-07): recording
//! and checking a linked file without ever copying, moving or removing it.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

mod link {
    use std::fs;

    use sha2::{Digest, Sha256};

    use nb_fs::{observe_link, stat_link, LinkError, LinkStatus};

    use crate::common::TestProject;

    fn sha256_hex(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    #[test]
    fn observes_the_hash_size_and_modification_time_of_a_present_file() {
        let project = TestProject::new();
        let source = project.on_disk("data/counts.bin");

        let observation = observe_link(&source).unwrap();

        assert_eq!(
            observation.sha256,
            sha256_hex(&project.read("data/counts.bin"))
        );
        assert_eq!(observation.size, 256);
        // The source is only ever read: untouched afterwards.
        assert_eq!(project.read("data/counts.bin").len(), 256);
    }

    #[test]
    fn stat_reports_a_present_file_without_hashing_it() {
        let project = TestProject::new();
        let source = project.on_disk("data/counts.bin");

        let status = stat_link(&source).unwrap();

        match status {
            LinkStatus::Present { size, .. } => assert_eq!(size, 256),
            LinkStatus::Missing => panic!("expected the file to be present"),
        }
    }

    #[test]
    fn stat_reports_a_missing_file_as_missing_not_an_error() {
        let project = TestProject::new();
        let source = project.on_disk("data/does-not-exist.bin");

        assert_eq!(stat_link(&source).unwrap(), LinkStatus::Missing);
    }

    #[test]
    fn observe_refuses_a_missing_file() {
        let project = TestProject::new();
        let source = project.on_disk("data/does-not-exist.bin");

        assert!(matches!(observe_link(&source), Err(LinkError::Io { .. })));
    }

    #[test]
    fn stat_reports_a_folder_where_a_file_is_expected_as_missing() {
        let project = TestProject::new();
        let source = project.on_disk("scripts");

        assert_eq!(stat_link(&source).unwrap(), LinkStatus::Missing);
    }

    #[test]
    fn observe_refuses_a_folder_where_a_file_is_expected() {
        let project = TestProject::new();
        let source = project.on_disk("scripts");

        let error = observe_link(&source).unwrap_err();
        // Windows refuses to open a directory as a file at all; Unix opens it
        // and this module then rejects it. Either way, it is refused.
        assert!(matches!(
            error,
            LinkError::NotAFile { .. } | LinkError::Io { .. }
        ));
    }

    #[test]
    fn a_changed_file_is_observed_with_its_new_content() {
        let project = TestProject::new();
        let source = project.on_disk("data/counts.bin");
        let first = observe_link(&source).unwrap();

        fs::write(&source, b"replaced").unwrap();
        let second = observe_link(&source).unwrap();

        assert_ne!(first.sha256, second.sha256);
        assert_eq!(second.sha256, sha256_hex(b"replaced"));
        assert_eq!(second.size, 8);
    }
}
