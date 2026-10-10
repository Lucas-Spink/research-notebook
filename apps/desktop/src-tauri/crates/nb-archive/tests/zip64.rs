//! S6-G04 (FR-ARC-08, ADR-0057): an archive over 4 GiB extracts byte-identical.
//! Slow and large, so it runs only with `--ignored` in the nightly workflow.
// disallowed_methods: the test builds a throwaway project in a temporary
// directory, outside any real project.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write};

use nb_archive::{write_bundle, BundleKind, BundleOutcome};
use nb_fs::ProjectRoot;
use sha2::{Digest, Sha256};
use zip::ZipArchive;

const BIG: u64 = 4 * 1024 * 1024 * 1024 + 4096;

fn sha_of(reader: &mut impl Read) -> (u64, [u8; 32]) {
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    let mut count = 0;
    loop {
        let read = reader.read(&mut buffer).unwrap();
        if read == 0 {
            return (count, hasher.finalize().into());
        }
        hasher.update(&buffer[..read]);
        count += read as u64;
    }
}

#[test]
#[ignore = "writes a file over 4 GiB; run nightly with --ignored"]
fn an_archive_over_four_gibibytes_extracts_byte_identical() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("_notebook")).unwrap();
    fs::write(
        dir.path().join("_notebook/project.yaml"),
        b"format_version: 1\n",
    )
    .unwrap();
    // `.gz` is stored, so the archive itself is over 4 GiB. A few marked
    // bytes at both ends and across the 4 GiB boundary catch a truncated offset.
    let mut big = File::create(dir.path().join("data.gz")).unwrap();
    big.set_len(BIG).unwrap();
    for position in [0, u64::from(u32::MAX) - 2, u64::from(u32::MAX) + 2, BIG - 4] {
        big.seek(SeekFrom::Start(position)).unwrap();
        big.write_all(&[0xA5; 4]).unwrap();
    }
    big.sync_all().unwrap();
    drop(big);
    let expected = sha_of(&mut File::open(dir.path().join("data.gz")).unwrap());
    let root = ProjectRoot::open(dir.path()).unwrap();
    let target = tempfile::tempdir().unwrap();

    let outcome = write_bundle(&root, BundleKind::Archive, target.path(), "big", &[]);

    let BundleOutcome::Written { name, bytes, .. } = outcome else {
        panic!("not written: {outcome:?}");
    };
    assert!(bytes > BIG, "the archive is {bytes} bytes");
    let mut archive = ZipArchive::new(File::open(target.path().join(name)).unwrap()).unwrap();
    let mut entry = archive.by_name("data.gz").unwrap();
    assert_eq!(entry.size(), BIG);
    assert_eq!(sha_of(&mut entry), expected);
}
