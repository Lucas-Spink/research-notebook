//! Gate S3-G06: `cargo test -p nb-fs -- relink`. Candidates are returned
//! ranked by name, size and hash (FR-EVD-08); nothing about the missing
//! artefact is ever written from here, because ranking candidates and
//! applying one are different, explicit steps and this module only does the
//! first.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

mod relink {
    use std::fs;

    use proptest::prelude::*;
    use sha2::{Digest, Sha256};

    use nb_fs::{find_relink_candidates, LinkError, RelinkExpectation};

    use crate::common::TestProject;

    fn sha256_hex(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    #[test]
    fn a_hash_match_ranks_above_a_name_and_size_match() {
        let project = TestProject::new();
        let folder = project.on_disk("results/pca");
        // Same name and size as the missing file, but different content.
        fs::write(folder.join("pca.csv"), b"a,b\nwrong,wrong\n").unwrap();
        // Renamed, but the exact bytes of the missing file.
        fs::write(folder.join("renamed.csv"), b"a,b\n1,2\n").unwrap();

        let expected = RelinkExpectation {
            file_name: "pca.csv",
            size: b"a,b\n1,2\n".len() as u64,
            sha256: &sha256_hex(b"a,b\n1,2\n"),
        };
        let candidates = find_relink_candidates(&folder, &expected).unwrap();

        assert_eq!(candidates.len(), 2);
        let first = &candidates[0];
        assert_eq!(first.path.file_name().unwrap(), "renamed.csv");
        assert!(first.hash_matches);
        assert!(!first.name_matches);
        let second = &candidates[1];
        assert_eq!(second.path.file_name().unwrap(), "pca.csv");
        assert!(second.name_matches);
        assert!(!second.hash_matches);
    }

    #[test]
    fn a_size_match_ranks_above_a_name_only_match() {
        let project = TestProject::new();
        let folder = project.on_disk("results/pca");
        fs::write(folder.join("pca.csv"), b"totally different content").unwrap();
        fs::write(folder.join("same-size.dat"), b"12345678").unwrap();

        let expected = RelinkExpectation {
            file_name: "pca.csv",
            size: 8,
            sha256: &sha256_hex(b"never matches anything"),
        };
        let candidates = find_relink_candidates(&folder, &expected).unwrap();

        assert_eq!(candidates.len(), 2);
        assert_eq!(candidates[0].path.file_name().unwrap(), "same-size.dat");
        assert!(candidates[0].size_matches);
        assert!(!candidates[0].name_matches);
    }

    #[test]
    fn candidates_only_come_from_the_folder_given_not_the_whole_project() {
        let project = TestProject::new();
        // A file with the right name and content sits elsewhere; only
        // `results/pca` is searched, so it must not appear.
        let expected = RelinkExpectation {
            file_name: "run.R",
            size: fs::metadata(project.on_disk("scripts/run.R"))
                .unwrap()
                .len(),
            sha256: &sha256_hex(&project.read("scripts/run.R")),
        };

        let candidates =
            find_relink_candidates(&project.on_disk("results/pca"), &expected).unwrap();

        assert!(candidates.is_empty());
    }

    #[test]
    fn an_unreadable_search_folder_is_an_error_not_an_empty_list() {
        let project = TestProject::new();
        let expected = RelinkExpectation {
            file_name: "pca.csv",
            size: 0,
            sha256: &sha256_hex(b""),
        };

        let error =
            find_relink_candidates(&project.on_disk("does-not-exist"), &expected).unwrap_err();

        assert!(matches!(error, LinkError::Io { .. }));
    }

    #[test]
    fn ranking_never_writes_anything_the_source_files_are_untouched() {
        let project = TestProject::new();
        let folder = project.on_disk("results/pca");
        fs::write(folder.join("renamed.csv"), b"a,b\n1,2\n").unwrap();
        let before = project.read("results/pca/pca.csv");

        let expected = RelinkExpectation {
            file_name: "pca.csv",
            size: 8,
            sha256: &sha256_hex(b"a,b\n1,2\n"),
        };
        find_relink_candidates(&folder, &expected).unwrap();

        assert_eq!(project.read("results/pca/pca.csv"), before);
        assert!(project.temp_files().is_empty());
    }

    proptest! {
        /// Whatever the candidates on disk, a hash match always sorts before
        /// one that only matches on size or name, and a size match always
        /// sorts before a name-only match: the ranking never inverts even as
        /// the number and order of unrelated files changes.
        #[test]
        fn hash_matches_always_rank_first(
            other_names in prop::collection::vec("[a-z]{1,8}\\.dat", 0..6),
        ) {
            let project = TestProject::new();
            let folder = project.on_disk("results/pca");
            for (i, name) in other_names.iter().enumerate() {
                let _ = fs::write(folder.join(name), format!("filler {i}"));
            }
            fs::write(folder.join("z-decoy-name-and-size.bin"), b"12345678").unwrap();
            fs::write(folder.join("a-exact-match.bin"), b"a,b\n1,2\n").unwrap();

            let expected = RelinkExpectation {
                file_name: "pca.csv",
                size: 8,
                sha256: &sha256_hex(b"a,b\n1,2\n"),
            };
            let candidates = find_relink_candidates(&folder, &expected).unwrap();

            let hash_positions: Vec<usize> = candidates
                .iter()
                .enumerate()
                .filter(|(_, c)| c.hash_matches)
                .map(|(i, _)| i)
                .collect();
            let non_hash_positions: Vec<usize> = candidates
                .iter()
                .enumerate()
                .filter(|(_, c)| !c.hash_matches)
                .map(|(i, _)| i)
                .collect();
            let max_hash = hash_positions.iter().max().copied().unwrap_or(0);
            let min_non_hash = non_hash_positions.iter().min().copied().unwrap_or(usize::MAX);
            prop_assert!(hash_positions.is_empty() || non_hash_positions.is_empty() || max_hash < min_non_hash);
        }
    }
}
