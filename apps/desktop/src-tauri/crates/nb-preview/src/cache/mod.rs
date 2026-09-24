//! The thumbnail cache (FR-PRV-04, ADR-0037): PNG thumbnails in the
//! `thumbnails` folder of the application cache folder (spec 9.4), one file
//! per content hash and size, kept within a size limit by removing the least
//! recently used first.
//!
//! Everything here is derived data: losing the folder only means thumbnails
//! are made again. Every write and removal goes through `nb_fs::cache`, which
//! confines it to plain file names in that one folder.

mod key;
mod lru;

use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::SystemTime;

use nb_fs::cache::{CacheDir, CacheError};

pub use key::{
    ContentHash, KeyError, ThumbnailKey, ThumbnailSize, DEFAULT_THUMBNAIL_SIZE, MAX_THUMBNAIL_SIZE,
    MIN_THUMBNAIL_SIZE,
};
use lru::Lru;

/// The folder inside the application cache folder that holds thumbnails.
pub const THUMBNAIL_FOLDER: &str = "thumbnails";
/// The default size limit: 256 MiB, room for thousands of 256 px thumbnails.
pub const DEFAULT_CACHE_LIMIT: u64 = 256 * 1024 * 1024;

/// Where "now" comes from when a thumbnail's use is recorded on disk, so
/// tests can control the order a reopened cache sees.
pub type Now = Arc<dyn Fn() -> SystemTime + Send + Sync>;

/// Why the cache could not store or look up a thumbnail.
#[derive(Debug, thiserror::Error)]
pub enum ThumbnailCacheError {
    #[error(transparent)]
    Cache(#[from] CacheError),
    #[error("a thumbnail of {size} bytes is larger than the cache limit of {limit} bytes")]
    TooLarge { size: u64, limit: u64 },
}

/// The thumbnail cache of one application run. Methods block; callers run
/// them on a blocking thread. It can be shared between threads.
pub struct ThumbnailCache {
    dir: CacheDir,
    limit: u64,
    now: Now,
    lru: Mutex<Lru>,
}

impl ThumbnailCache {
    /// Opens the thumbnail folder in the application cache folder `root`,
    /// creating it if needed, with the system clock.
    pub fn open(root: &CacheDir, limit: u64) -> Result<Self, ThumbnailCacheError> {
        Self::open_with_clock(root, limit, Arc::new(SystemTime::now))
    }

    /// Opens the cache as [`ThumbnailCache::open`], with `now` as the clock.
    ///
    /// The existing thumbnails are listed once; their modification times give
    /// the order they were last used. Files whose names are not thumbnail
    /// keys are ignored and never removed. If the thumbnails already exceed
    /// `limit`, the least recently used are removed now.
    pub fn open_with_clock(
        root: &CacheDir,
        limit: u64,
        now: Now,
    ) -> Result<Self, ThumbnailCacheError> {
        let dir = root.subdir(THUMBNAIL_FOLDER)?;
        dir.ensure()?;
        let mut files: Vec<_> = dir
            .list_files()?
            .into_iter()
            .filter(|file| ThumbnailKey::from_file_name(&file.name).is_some())
            .collect();
        files.sort_by(|a, b| (a.modified, &a.name).cmp(&(b.modified, &b.name)));
        let mut lru = Lru::default();
        for file in files {
            lru.put(file.name, file.size);
        }
        let cache = Self {
            dir,
            limit,
            now,
            lru: Mutex::new(lru),
        };
        cache.evict(&mut cache.lock(), None);
        Ok(cache)
    }

    /// The path of the cached thumbnail for `key`, recording it as used, or
    /// `None` if there is none. A thumbnail removed from disk by someone
    /// else is forgotten and reported as missing.
    pub fn get(&self, key: &ThumbnailKey) -> Result<Option<PathBuf>, ThumbnailCacheError> {
        let name = key.file_name();
        let mut lru = self.lock();
        if !lru.contains(&name) {
            return Ok(None);
        }
        let path = self.dir.path_of(&name)?;
        match self.dir.touch(&name, (self.now)()) {
            Ok(()) => {}
            Err(CacheError::Missing { .. } | CacheError::NotAFile { .. }) => {
                lru.forget(&name);
                return Ok(None);
            }
            // The file is there but its time could not be set, for example
            // while another process holds it. It is still a hit; only the
            // order a later run sees is less exact.
            Err(_) => {}
        }
        lru.touch(&name);
        Ok(Some(path))
    }

    /// Stores `png` as the thumbnail for `key`, replacing any earlier one,
    /// and returns its path. If that takes the cache over its limit, the
    /// least recently used other thumbnails are removed until at most nine
    /// tenths of the limit is used, so the next few stores do not each
    /// remove one. A thumbnail larger than the whole limit is refused.
    pub fn insert(&self, key: &ThumbnailKey, png: &[u8]) -> Result<PathBuf, ThumbnailCacheError> {
        let size = png.len() as u64;
        if size > self.limit {
            return Err(ThumbnailCacheError::TooLarge {
                size,
                limit: self.limit,
            });
        }
        let name = key.file_name();
        let path = self.dir.path_of(&name)?;
        let mut lru = self.lock();
        self.dir.write_file(&name, png)?;
        // Recorded on disk too, so a reopened cache orders it correctly even
        // when the filesystem's own time differs from `now`.
        let _ = self.dir.touch(&name, (self.now)());
        lru.put(name.clone(), size);
        self.evict(&mut lru, Some(&name));
        Ok(path)
    }

    /// The cached thumbnail for `key`, made by `generate` and stored if there
    /// is none. Nothing is stored when `generate` fails.
    pub fn get_or_insert_with<E>(
        &self,
        key: &ThumbnailKey,
        generate: impl FnOnce() -> Result<Vec<u8>, E>,
    ) -> Result<PathBuf, E>
    where
        E: From<ThumbnailCacheError>,
    {
        if let Some(path) = self.get(key)? {
            return Ok(path);
        }
        // Made without holding the lock, so a slow image does not hold up
        // other lookups. Two threads may make the same thumbnail; the second
        // store replaces the first with identical content.
        let png = generate()?;
        Ok(self.insert(key, &png)?)
    }

    /// The bytes the cached thumbnails take up.
    pub fn total_bytes(&self) -> u64 {
        self.lock().total()
    }

    /// Removes least recently used thumbnails, never `keep`, once the total
    /// is over the limit, until at most nine tenths of it is used.
    ///
    /// A thumbnail that cannot be removed, such as one another process holds
    /// open on Windows, stays counted and is tried again next time.
    fn evict(&self, lru: &mut Lru, keep: Option<&str>) {
        if lru.total() <= self.limit {
            return;
        }
        let target = self.limit - self.limit / 10;
        for name in lru.oldest_first() {
            if lru.total() <= target {
                break;
            }
            if Some(name.as_str()) == keep {
                continue;
            }
            if self.dir.remove_file(&name).is_ok() {
                lru.forget(&name);
            }
        }
    }

    /// The bookkeeping stays consistent even if a thread panicked holding
    /// the lock: every change to it is a single step.
    fn lock(&self) -> MutexGuard<'_, Lru> {
        self.lru.lock().unwrap_or_else(PoisonError::into_inner)
    }
}
