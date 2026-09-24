//! S3-T09 (FR-PRV-04): whatever thumbnails are stored, used and reopened, the
//! cache never holds more than its limit, keeps what was stored last, returns
//! exactly the bytes stored for a key, and touches nothing outside its folder.
// disallowed_methods: tests plant and inspect files in temporary folders.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

use std::collections::HashMap;
use std::fs;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use nb_fs::cache::CacheDir;
use nb_preview::cache::{ContentHash, Now, ThumbnailCache, ThumbnailKey, ThumbnailSize};
use proptest::prelude::*;

const LIMIT: u64 = 200;

#[derive(Debug, Clone)]
enum Op {
    Insert { hash: u8, size: u32, len: usize },
    Get { hash: u8, size: u32 },
    Reopen,
}

fn op() -> impl Strategy<Value = Op> {
    let hash = 0u8..12;
    let size = prop::sample::select(vec![64u32, 256]);
    prop_oneof![
        4 => (hash.clone(), size.clone(), 1usize..=80)
            .prop_map(|(hash, size, len)| Op::Insert { hash, size, len }),
        3 => (hash, size).prop_map(|(hash, size)| Op::Get { hash, size }),
        1 => Just(Op::Reopen),
    ]
}

fn key(hash: u8, size: u32) -> ThumbnailKey {
    ThumbnailKey::new(
        ContentHash::parse(&format!("{hash:02x}").repeat(32)).unwrap(),
        ThumbnailSize::new(size).unwrap(),
    )
}

/// Bytes that differ for every insert, so a stale file would be noticed.
fn contents(serial: usize, len: usize) -> Vec<u8> {
    (0..len).map(|i| (serial * 31 + i) as u8).collect()
}

fn clock() -> Now {
    let seconds = Arc::new(AtomicU64::new(1_800_000_000));
    Arc::new(move || {
        SystemTime::UNIX_EPOCH + Duration::from_secs(seconds.fetch_add(1, Ordering::Relaxed))
    })
}

fn bytes_on_disk(folder: &std::path::Path) -> u64 {
    fs::read_dir(folder)
        .unwrap()
        .map(|e| e.unwrap().metadata().unwrap().len())
        .sum()
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(
        std::env::var("PROPTEST_CASES").ok().and_then(|n| n.parse().ok()).unwrap_or(64)
    ))]

    #[test]
    fn cache_stays_within_its_limit_and_returns_what_was_stored(
        ops in prop::collection::vec(op(), 1..60)
    ) {
        let dir = tempfile::Builder::new().prefix("nb-thumbs-").tempdir().unwrap();
        let root = CacheDir::new(dir.path().join("cache"));
        root.ensure().unwrap();
        let bystander = dir.path().join("cache/index-P.sqlite");
        fs::write(&bystander, b"index").unwrap();
        let folder = dir.path().join("cache/thumbnails");

        let mut cache = ThumbnailCache::open_with_clock(&root, LIMIT, clock()).unwrap();
        // The bytes last stored for each key; a key may have been evicted since.
        let mut stored: HashMap<(u8, u32), Vec<u8>> = HashMap::new();

        for (serial, op) in ops.into_iter().enumerate() {
            match op {
                Op::Insert { hash, size, len } => {
                    let bytes = contents(serial, len);
                    let path = cache.insert(&key(hash, size), &bytes).unwrap();
                    prop_assert_eq!(fs::read(&path).unwrap(), bytes.clone());
                    stored.insert((hash, size), bytes);
                }
                Op::Get { hash, size } => {
                    if let Some(path) = cache.get(&key(hash, size)).unwrap() {
                        let expected = stored.get(&(hash, size));
                        prop_assert_eq!(Some(&fs::read(&path).unwrap()), expected);
                    }
                }
                Op::Reopen => {
                    cache = ThumbnailCache::open_with_clock(&root, LIMIT, clock()).unwrap();
                }
            }
            prop_assert!(cache.total_bytes() <= LIMIT, "total {}", cache.total_bytes());
            if folder.exists() {
                prop_assert_eq!(bytes_on_disk(&folder), cache.total_bytes());
            }
        }
        prop_assert_eq!(fs::read(&bystander).unwrap(), b"index".to_vec());
    }

    #[test]
    fn the_thumbnail_just_stored_is_never_evicted(
        lens in prop::collection::vec(1usize..=LIMIT as usize, 1..40)
    ) {
        let dir = tempfile::Builder::new().prefix("nb-thumbs-").tempdir().unwrap();
        let root = CacheDir::new(dir.path().join("cache"));
        let cache = ThumbnailCache::open_with_clock(&root, LIMIT, clock()).unwrap();

        for (i, len) in lens.into_iter().enumerate() {
            let k = key((i % 256) as u8, 256);
            cache.insert(&k, &contents(i, len)).unwrap();
            prop_assert!(cache.get(&k).unwrap().is_some(), "insert {i} of {len} bytes was evicted");
            prop_assert!(cache.total_bytes() <= LIMIT);
        }
    }
}
