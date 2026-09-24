//! S2-T07 and S3-T09: the application cache folder (spec 9.4) holds the
//! disposable index and thumbnails. `nb-fs` is the only crate that may create
//! or delete files, so the index and the thumbnail cache ask it to make
//! folders and to write, touch or remove one plain file name at a time.
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

// S3-T09: the thumbnail cache writes, lists and touches files in a child
// folder of the cache, still one plain file name at a time.

use std::time::{Duration, SystemTime};

fn thumbs(cache: &CacheDir) -> CacheDir {
    let thumbs = cache.subdir("thumbnails").unwrap();
    thumbs.ensure().unwrap();
    thumbs
}

#[test]
fn subdir_is_a_folder_inside_the_cache() {
    let (dir, cache) = cache();
    let thumbs = thumbs(&cache);
    assert!(dir.path().join("cache/thumbnails").is_dir());
    assert_eq!(
        thumbs.path_of("a.png").unwrap(),
        dir.path().join("cache/thumbnails/a.png")
    );
}

#[test]
fn subdir_refuses_names_that_are_not_one_plain_file_name() {
    let (_dir, cache) = cache();
    for name in ["..", "../x", "a/b", "a\\b", "C:x", "", ".hidden"] {
        assert!(
            matches!(cache.subdir(name), Err(CacheError::InvalidName { .. })),
            "expected `{name:?}` to be refused"
        );
    }
}

#[test]
fn write_file_writes_the_bytes_and_leaves_no_temporary_file() {
    let (dir, cache) = cache();
    let thumbs = thumbs(&cache);
    thumbs.write_file("a.png", b"first").unwrap();
    thumbs.write_file("a.png", b"second").unwrap();
    let folder = dir.path().join("cache/thumbnails");
    assert_eq!(fs::read(folder.join("a.png")).unwrap(), b"second");
    let names: Vec<_> = fs::read_dir(&folder)
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .collect();
    assert_eq!(names, ["a.png"]);
}

#[test]
fn write_file_refuses_names_that_are_not_one_plain_file_name() {
    let (dir, cache) = cache();
    let thumbs = thumbs(&cache);
    for name in ["../escape.png", "..\\escape.png", "a/b.png", ".hidden", ""] {
        assert!(
            matches!(
                thumbs.write_file(name, b"x"),
                Err(CacheError::InvalidName { .. })
            ),
            "expected `{name:?}` to be refused"
        );
    }
    assert!(!dir.path().join("cache/escape.png").exists());
}

#[test]
fn write_file_will_not_replace_a_folder() {
    let (dir, cache) = cache();
    let thumbs = thumbs(&cache);
    fs::create_dir(dir.path().join("cache/thumbnails/a.png")).unwrap();
    assert!(matches!(
        thumbs.write_file("a.png", b"x"),
        Err(CacheError::Write { .. })
    ));
    assert!(dir.path().join("cache/thumbnails/a.png").is_dir());
}

#[test]
fn list_files_reports_plain_files_with_size_and_modification_time() {
    let (dir, cache) = cache();
    let thumbs = thumbs(&cache);
    let folder = dir.path().join("cache/thumbnails");
    thumbs.write_file("a.png", b"abc").unwrap();
    thumbs.write_file("b.png", b"hello").unwrap();
    fs::create_dir(folder.join("sub")).unwrap();
    fs::write(folder.join(".a.png.1.2.tmp"), b"partial").unwrap();

    let mut files = thumbs.list_files().unwrap();
    files.sort_by(|x, y| x.name.cmp(&y.name));
    let summary: Vec<_> = files.iter().map(|f| (f.name.as_str(), f.size)).collect();
    assert_eq!(summary, [("a.png", 3), ("b.png", 5)]);
    let on_disk = fs::metadata(folder.join("a.png"))
        .unwrap()
        .modified()
        .unwrap();
    assert_eq!(files[0].modified, on_disk);
}

#[test]
fn list_files_of_a_missing_folder_is_empty() {
    let (_dir, cache) = cache();
    let thumbs = cache.subdir("thumbnails").unwrap();
    assert!(thumbs.list_files().unwrap().is_empty());
}

#[test]
fn touch_sets_the_modification_time_and_keeps_the_bytes() {
    let (dir, cache) = cache();
    let thumbs = thumbs(&cache);
    thumbs.write_file("a.png", b"keep").unwrap();
    let at = SystemTime::UNIX_EPOCH + Duration::from_secs(1_800_000_000);
    thumbs.touch("a.png", at).unwrap();
    let path = dir.path().join("cache/thumbnails/a.png");
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), at);
    assert_eq!(fs::read(&path).unwrap(), b"keep");
}

#[test]
fn touch_reports_a_missing_file() {
    let (_dir, cache) = cache();
    let thumbs = thumbs(&cache);
    assert!(matches!(
        thumbs.touch("gone.png", SystemTime::UNIX_EPOCH),
        Err(CacheError::Missing { .. })
    ));
}

#[test]
fn touch_refuses_bad_names_and_folders() {
    let (dir, cache) = cache();
    let thumbs = thumbs(&cache);
    fs::create_dir(dir.path().join("cache/thumbnails/sub")).unwrap();
    assert!(matches!(
        thumbs.touch("../x", SystemTime::UNIX_EPOCH),
        Err(CacheError::InvalidName { .. })
    ));
    assert!(matches!(
        thumbs.touch("sub", SystemTime::UNIX_EPOCH),
        Err(CacheError::NotAFile { .. })
    ));
}
