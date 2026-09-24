//! What a cached thumbnail is keyed by: the SHA-256 of the file it shows and
//! the size it was made at (FR-PRV-04). The key is also its file name, so the
//! cache can be rebuilt from a folder listing alone.

/// Smallest thumbnail size accepted, in pixels.
pub const MIN_THUMBNAIL_SIZE: u32 = 16;
/// Largest thumbnail size accepted, in pixels.
pub const MAX_THUMBNAIL_SIZE: u32 = 1024;
/// The size thumbnails are made at (spec 8: 256 px on the longest edge).
pub const DEFAULT_THUMBNAIL_SIZE: ThumbnailSize = ThumbnailSize(256);

const HASH_LEN: usize = 64;
const EXTENSION: &str = ".png";

/// Why a hash or size cannot be part of a key.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum KeyError {
    #[error("`{value}` is not a SHA-256 of 64 lowercase hexadecimal characters")]
    Hash { value: String },
    #[error("{value} px is not a thumbnail size between {MIN_THUMBNAIL_SIZE} and {MAX_THUMBNAIL_SIZE} px")]
    Size { value: u32 },
}

/// A SHA-256 as `artefacts.yaml` records it: 64 lowercase hexadecimal
/// characters, the same rule as the format's `Sha256` schema.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ContentHash(String);

impl ContentHash {
    pub fn parse(value: &str) -> Result<Self, KeyError> {
        let valid = value.len() == HASH_LEN
            && value
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
        if valid {
            Ok(Self(value.to_owned()))
        } else {
            Err(KeyError::Hash {
                value: value.to_owned(),
            })
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// The longest edge of a thumbnail, in pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ThumbnailSize(u32);

impl ThumbnailSize {
    pub fn new(pixels: u32) -> Result<Self, KeyError> {
        if (MIN_THUMBNAIL_SIZE..=MAX_THUMBNAIL_SIZE).contains(&pixels) {
            Ok(Self(pixels))
        } else {
            Err(KeyError::Size { value: pixels })
        }
    }

    pub fn pixels(self) -> u32 {
        self.0
    }
}

/// One cached thumbnail: which content, at which size.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ThumbnailKey {
    hash: ContentHash,
    size: ThumbnailSize,
}

impl ThumbnailKey {
    pub fn new(hash: ContentHash, size: ThumbnailSize) -> Self {
        Self { hash, size }
    }

    pub fn hash(&self) -> &ContentHash {
        &self.hash
    }

    pub fn size(&self) -> ThumbnailSize {
        self.size
    }

    /// `<sha256>-<size>.png`. Always a plain file name, since the hash is hex
    /// and the size a number.
    pub fn file_name(&self) -> String {
        format!("{}-{}{EXTENSION}", self.hash.0, self.size.0)
    }

    /// The key a cache file name stands for, or `None` for any other name,
    /// which the cache then leaves alone. Only the exact form
    /// [`ThumbnailKey::file_name`] produces is accepted, so each key has one
    /// file name.
    pub fn from_file_name(name: &str) -> Option<Self> {
        let stem = name.strip_suffix(EXTENSION)?;
        let (hash, size) = stem.split_once('-')?;
        let digits_only = !size.is_empty() && size.bytes().all(|b| b.is_ascii_digit());
        if !digits_only || size.starts_with('0') {
            return None;
        }
        let key = Self::new(
            ContentHash::parse(hash).ok()?,
            ThumbnailSize::new(size.parse().ok()?).ok()?,
        );
        Some(key)
    }
}
