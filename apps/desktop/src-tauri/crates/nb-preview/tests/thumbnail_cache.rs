//! S3-T09 (FR-PRV-04): thumbnails are cached in the application cache folder,
//! keyed by content hash and thumbnail size, and the cache stays within its
//! size limit by removing the least recently used thumbnails.
// disallowed_methods: tests plant and inspect files in temporary folders.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

use std::cell::Cell;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use nb_fs::cache::CacheDir;
use nb_preview::cache::{
    ContentHash, KeyError, Now, ThumbnailCache, ThumbnailCacheError, ThumbnailKey, ThumbnailSize,
    DEFAULT_CACHE_LIMIT, DEFAULT_THUMBNAIL_SIZE, THUMBNAIL_FOLDER,
};
use nb_preview::PreviewError;
use tempfile::TempDir;

fn hash(n: u8) -> ContentHash {
    ContentHash::parse(&format!("{n:02x}").repeat(32)).unwrap()
}

fn key(n: u8) -> ThumbnailKey {
    ThumbnailKey::new(hash(n), DEFAULT_THUMBNAIL_SIZE)
}

/// A clock that moves one second on every reading.
fn ticking_clock() -> Now {
    let seconds = Arc::new(AtomicU64::new(1_800_000_000));
    Arc::new(move || {
        SystemTime::UNIX_EPOCH + Duration::from_secs(seconds.fetch_add(1, Ordering::Relaxed))
    })
}

struct Fixture {
    dir: TempDir,
    root: CacheDir,
}

impl Fixture {
    fn new() -> Self {
        let dir = tempfile::Builder::new()
            .prefix("nb-thumbs-")
            .tempdir()
            .unwrap();
        let root = CacheDir::new(dir.path().join("cache"));
        Self { dir, root }
    }

    fn open(&self, limit: u64) -> ThumbnailCache {
        ThumbnailCache::open_with_clock(&self.root, limit, ticking_clock()).unwrap()
    }

    fn folder(&self) -> PathBuf {
        self.dir.path().join("cache").join(THUMBNAIL_FOLDER)
    }

    fn names(&self) -> Vec<String> {
        let mut names: Vec<_> = fs::read_dir(self.folder())
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        names
    }
}

fn read(path: &Path) -> Vec<u8> {
    fs::read(path).unwrap()
}

#[test]
fn defaults_are_256_px_and_256_mib() {
    assert_eq!(DEFAULT_THUMBNAIL_SIZE.pixels(), 256);
    assert_eq!(DEFAULT_CACHE_LIMIT, 256 * 1024 * 1024);
}

#[test]
fn content_hash_accepts_only_64_lowercase_hex_characters() {
    assert!(ContentHash::parse(&"a".repeat(64)).is_ok());
    for bad in [
        "a".repeat(63),
        "a".repeat(65),
        "A".repeat(64),
        "g".repeat(64),
        format!("../{}", "a".repeat(61)),
        String::new(),
    ] {
        assert!(
            matches!(ContentHash::parse(&bad), Err(KeyError::Hash { .. })),
            "expected {bad:?} to be refused"
        );
    }
}

#[test]
fn thumbnail_size_is_between_16_and_1024_px() {
    assert!(ThumbnailSize::new(16).is_ok());
    assert!(ThumbnailSize::new(1024).is_ok());
    assert!(matches!(ThumbnailSize::new(15), Err(KeyError::Size { .. })));
    assert!(matches!(
        ThumbnailSize::new(1025),
        Err(KeyError::Size { .. })
    ));
}

#[test]
fn file_name_is_the_hash_and_size() {
    let k = key(0xab);
    assert_eq!(k.file_name(), format!("{}-256.png", "ab".repeat(32)));
    assert_eq!(ThumbnailKey::from_file_name(&k.file_name()), Some(k));
    assert_eq!(ThumbnailKey::from_file_name("notes.txt"), None);
    assert_eq!(
        ThumbnailKey::from_file_name(&format!("{}-9999.png", "ab".repeat(32))),
        None
    );
}

#[test]
fn a_miss_generates_stores_and_returns_the_thumbnail() {
    let fx = Fixture::new();
    let cache = fx.open(1024);
    assert_eq!(cache.get(&key(1)).unwrap(), None);

    let path = cache.insert(&key(1), b"png bytes").unwrap();

    assert_eq!(path, fx.folder().join(key(1).file_name()));
    assert_eq!(read(&path), b"png bytes");
    assert_eq!(cache.get(&key(1)).unwrap(), Some(path));
    assert_eq!(cache.total_bytes(), 9);
}

#[test]
fn a_hit_does_not_call_the_generator() {
    let fx = Fixture::new();
    let cache = fx.open(1024);
    let calls = Cell::new(0);
    let generate = || {
        calls.set(calls.get() + 1);
        Ok::<_, PreviewError>(b"png".to_vec())
    };

    let first = cache.get_or_insert_with(&key(1), generate).unwrap();
    let second = cache.get_or_insert_with(&key(1), generate).unwrap();

    assert_eq!(first, second);
    assert_eq!(calls.get(), 1);
}

#[test]
fn the_same_hash_at_another_size_is_a_miss() {
    let fx = Fixture::new();
    let cache = fx.open(1024);
    cache.insert(&key(1), b"256").unwrap();
    let small = ThumbnailKey::new(hash(1), ThumbnailSize::new(128).unwrap());

    assert_eq!(cache.get(&small).unwrap(), None);
    cache.insert(&small, b"128").unwrap();
    assert_eq!(read(&cache.get(&key(1)).unwrap().unwrap()), b"256");
    assert_eq!(read(&cache.get(&small).unwrap().unwrap()), b"128");
}

#[test]
fn a_generator_error_writes_nothing() {
    let fx = Fixture::new();
    let cache = fx.open(1024);

    let result = cache.get_or_insert_with(&key(1), || nb_preview::thumbnail_png(b"not an image"));

    assert!(matches!(result, Err(PreviewError::Decode(_))));
    assert!(fx.names().is_empty());
    assert_eq!(cache.total_bytes(), 0);
}

#[test]
fn a_thumbnail_larger_than_the_limit_is_refused_and_not_written() {
    let fx = Fixture::new();
    let cache = fx.open(4);

    let result = cache.insert(&key(1), b"12345");

    assert!(matches!(
        result,
        Err(ThumbnailCacheError::TooLarge { size: 5, limit: 4 })
    ));
    assert!(fx.names().is_empty());
}

#[test]
fn reopening_finds_the_stored_thumbnails() {
    let fx = Fixture::new();
    fx.open(1024).insert(&key(1), b"abc").unwrap();

    let cache = fx.open(1024);

    assert_eq!(cache.total_bytes(), 3);
    assert_eq!(read(&cache.get(&key(1)).unwrap().unwrap()), b"abc");
}

#[test]
fn a_thumbnail_removed_from_disk_becomes_a_miss() {
    let fx = Fixture::new();
    let cache = fx.open(1024);
    let path = cache.insert(&key(1), b"abc").unwrap();
    fs::remove_file(&path).unwrap();

    assert_eq!(cache.get(&key(1)).unwrap(), None);
    assert_eq!(cache.total_bytes(), 0);
}

#[test]
fn going_over_the_limit_removes_the_least_recently_used_first() {
    let fx = Fixture::new();
    // 40 bytes is over 35, and removing one 10-byte thumbnail reaches 31.
    let cache = fx.open(35);
    for n in 1..=3 {
        cache.insert(&key(n), &[n; 10]).unwrap();
    }
    // Using 1 makes 2 the least recently used.
    cache.get(&key(1)).unwrap().unwrap();

    cache.insert(&key(4), &[4; 10]).unwrap();

    assert_eq!(cache.get(&key(2)).unwrap(), None);
    for n in [1, 3, 4] {
        assert!(cache.get(&key(n)).unwrap().is_some(), "{n} was removed");
    }
    assert_eq!(cache.total_bytes(), 30);
}

#[test]
fn eviction_goes_down_to_nine_tenths_of_the_limit() {
    let fx = Fixture::new();
    let cache = fx.open(100);
    for n in 1..=10 {
        cache.insert(&key(n), &[n; 10]).unwrap();
    }
    assert_eq!(cache.total_bytes(), 100);

    cache.insert(&key(11), &[11; 10]).unwrap();

    // 110 bytes is over 100, so the oldest go until at most 90 remain.
    assert_eq!(cache.total_bytes(), 90);
    assert_eq!(cache.get(&key(1)).unwrap(), None);
    assert_eq!(cache.get(&key(2)).unwrap(), None);
    assert!(cache.get(&key(11)).unwrap().is_some());
}

#[test]
fn use_order_survives_reopening() {
    let fx = Fixture::new();
    {
        let cache = fx.open(35);
        for n in 1..=3 {
            cache.insert(&key(n), &[n; 10]).unwrap();
        }
        cache.get(&key(1)).unwrap().unwrap();
    }

    let cache = fx.open(35);
    cache.insert(&key(4), &[4; 10]).unwrap();

    assert_eq!(cache.get(&key(2)).unwrap(), None);
    assert!(cache.get(&key(1)).unwrap().is_some());
}

#[test]
fn opening_with_a_lower_limit_evicts_at_once() {
    let fx = Fixture::new();
    {
        let cache = fx.open(100);
        for n in 1..=5 {
            cache.insert(&key(n), &[n; 10]).unwrap();
        }
    }

    let cache = fx.open(20);

    assert!(cache.total_bytes() <= 20);
    assert!(cache.get(&key(5)).unwrap().is_some());
    assert_eq!(cache.get(&key(1)).unwrap(), None);
}

#[test]
fn other_files_in_the_folder_are_ignored_and_never_removed() {
    let fx = Fixture::new();
    fs::create_dir_all(fx.folder()).unwrap();
    fs::write(fx.folder().join("readme.txt"), [0; 50]).unwrap();
    fs::write(fx.folder().join(".x.png.1.2.tmp"), [0; 50]).unwrap();
    fs::write(fx.dir.path().join("cache/index-P.sqlite"), [0; 50]).unwrap();

    let cache = fx.open(20);
    for n in 1..=5 {
        cache.insert(&key(n), &[n; 10]).unwrap();
    }

    let names = fx.names();
    assert!(names.contains(&"readme.txt".to_owned()));
    assert!(names.contains(&".x.png.1.2.tmp".to_owned()));
    assert!(fx.dir.path().join("cache/index-P.sqlite").exists());
    assert!(cache.total_bytes() <= 20);
}
