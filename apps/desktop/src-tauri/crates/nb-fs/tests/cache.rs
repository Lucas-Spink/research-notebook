//! S2-T07: the application cache folder (spec 9.4) holds the disposable
//! index. `nb-fs` is the only crate that may create or delete files, so the
//! index asks it to make the folder and to remove a damaged database, and
//! nothing else in the cache.
// disallowed_methods: tests build and inspect throwaway folders in temporary
// directories; the std::fs write calls are fixture setup.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

use std::fs;

use nb_fs::cache::{CacheDir, CacheError};
use tempfile::TempDir;

fn cache() -> (TempDir, CacheDir) {
    let dir = tempfile::Builder::new()
        .prefix("nb-cache-")
        .tempdir()
        .unwrap();
    let cache = CacheDir::new(dir.path().join("cache"));
    (dir, cache)
}

#[test]
fn ensure_creates_the_folder_and_its_parents() {
    let (dir, cache) = cache();
    assert!(!dir.path().join("cache").exists());
    cache.ensure().unwrap();
    assert!(dir.path().join("cache").is_dir());
    cache.ensure().unwrap();
}

#[test]
fn remove_file_deletes_a_file_in_the_cache() {
    let (dir, cache) = cache();
    cache.ensure().unwrap();
    fs::write(dir.path().join("cache/index-A.sqlite"), b"junk").unwrap();
    cache.remove_file("index-A.sqlite").unwrap();
    assert!(!dir.path().join("cache/index-A.sqlite").exists());
}

#[test]
fn remove_file_treats_a_missing_file_as_done() {
    let (_dir, cache) = cache();
    cache.ensure().unwrap();
    cache.remove_file("index-A.sqlite-wal").unwrap();
}

#[test]
fn remove_file_refuses_names_that_are_not_one_plain_file_name() {
    let (dir, cache) = cache();
    cache.ensure().unwrap();
    let outside = dir.path().join("precious.txt");
    fs::write(&outside, b"keep").unwrap();
    for name in [
        "../precious.txt",
        "..\\precious.txt",
        "sub/file.sqlite",
        "/etc/passwd",
        "C:\\file.sqlite",
        "..",
        ".",
        "",
        ".hidden",
        "a\0b",
    ] {
        assert!(
            matches!(cache.remove_file(name), Err(CacheError::InvalidName { .. })),
            "expected `{name:?}` to be refused"
        );
    }
    assert_eq!(fs::read(&outside).unwrap(), b"keep");
}

#[test]
fn remove_file_will_not_remove_a_folder() {
    let (dir, cache) = cache();
    cache.ensure().unwrap();
    fs::create_dir(dir.path().join("cache/thumbs")).unwrap();
    assert!(matches!(
        cache.remove_file("thumbs"),
        Err(CacheError::NotAFile { .. })
    ));
    assert!(dir.path().join("cache/thumbs").is_dir());
}
