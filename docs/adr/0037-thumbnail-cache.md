# ADR-0037: Thumbnail cache

- Status: Proposed
- Date: 2026-09-24
- Deciders: maintainer
- Spec sections affected: 6.3 (nb-fs, nb-preview), 7.6 (FR-PRV-04), 8, 9.4, 15.2

## Context

S3-T09 builds the thumbnail cache. FR-PRV-04 says thumbnails are cached in the application cache folder, keyed by content hash and thumbnail size. The task also asks for a bounded cache size. Spec 15.2 left "Default thumbnail sizes and cache size limit" open until Stage 3. Four other things are not settled by the spec:

- how a derived-data crate writes files, when `clippy.toml` and AGENTS.md rule 1 keep every `std::fs` write inside `nb-fs`
- what "least recently used" means across restarts
- whether the cache hashes file content itself
- how much of the cache is wired into the app in this task

## Decision

1. **Scope: the engine only**, as in ADR-0030 §4 and ADR-0035 §1. This task ships:
   - `nb_preview::cache::ThumbnailCache`
   - the `nb_fs::cache` methods it needs

   The following are left to S3-T10 and S3-T11, which have callers for them:
   - resolving the Tauri cache folder (`app_cache_dir()` plus a `cache` child, to match spec 9.4 on Windows)
   - holding one `ThumbnailCache` in app state
   - the command that returns an artefact version's thumbnail
2. **Defaults (spec 15.2):**
   - One thumbnail size, **256 px** on the longest edge, as spec 8 already says.
   - A size limit of **256 MiB** (`DEFAULT_CACHE_LIMIT`). A 256 px PNG is usually 20 to 150 KB, so this holds a few thousand thumbnails, enough for the 2,000-artefact Results tree (S3-G11).

   The limit is a constant, not a setting. `ThumbnailSize` accepts 16 to 1,024 px, so a later HiDPI size needs no key change.
3. **Layout and key:**
   - Files live in `<cache>/thumbnails/`, named `<sha256>-<size>.png`, for example `3a…9f-256.png`.
   - The hash is the format's `Sha256`: 64 lowercase hexadecimal characters, checked by `ContentHash::parse`.
   - The key is its file name, so the cache is rebuilt from one folder listing.
   - `ThumbnailKey::from_file_name` accepts only the exact form `file_name` produces. Any other file in the folder is ignored, never counted and never removed.
4. **The cache trusts the hash it is given.**
   - For a captured version, the caller passes the SHA-256 recorded in `artefacts.yaml`.
   - For a linked artefact, the caller passes the hash the link check last observed (ADR-0031).
   - Hashing on every lookup would mean reading up to 200 MB (spec 8's raster bound) just to find a 100 KB thumbnail.
5. **`nb-fs` does the writing.** `CacheDir` gains four methods:
   - `subdir(name)`
   - `write_file(name, bytes)`, which uses the existing atomic write, so a crash leaves the old thumbnail or the new one
   - `list_files()`, which returns plain visible files with size and mtime
   - `touch(name, time)`, which sets the mtime only

   Each takes one plain file name, checked as `remove_file` already was (ADR-0023 §7). None can reach outside its folder, follow a link or replace a folder. This extends the cache permission spec 6.3 gives `nb-fs`. `nb-fs` is a protected path.
6. **Least recently used, with the order kept on disk as mtimes:**
   - In a run, the order is an in-memory counter, so a store never lists the folder again.
   - A hit or a store also sets the file's mtime, through `touch` and an injected clock.
   - Opening the cache sorts existing thumbnails by (mtime, name).
7. **Eviction:**
   - It starts when a store takes the total over the limit, and removes the least recently used until at most **nine tenths** of the limit is used. This way, filling a full cache does not remove one file per store.
   - The thumbnail just stored is never removed.
   - A thumbnail larger than the whole limit is refused with `TooLarge` and not written.
   - Opening with a lower limit evicts at once.
   - A thumbnail that cannot be removed, for example one the webview holds open on Windows, stays counted and is tried again at the next eviction.
8. **A thumbnail deleted by someone else is a miss.** If `get` finds the file gone, it forgets the entry and returns `None`, so the caller makes it again.
9. **Concurrency.**
   - `ThumbnailCache` is `Send + Sync`. One mutex guards the bookkeeping and is held while a file is written.
   - `get_or_insert_with` generates without holding the lock, so a slow decode does not block other lookups. Two threads may make the same thumbnail, and the second atomic write replaces the first with identical content.
10. **Dependencies.** `nb-preview` depends on `nb-fs` (a path crate), plus the workspace's existing `proptest` 1.11.0 and `tempfile` 3.27.0 as dev-dependencies. No crate is added to `Cargo.lock`.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Write thumbnails with `std::fs` inside `nb-preview`, allowing the lint there | It breaks AGENTS.md rule 1 and scatters filesystem writes. `nb-fs` already owns the cache folder (ADR-0023). |
| Evict by creation time (first in, first out) | Frequently viewed thumbnails would be removed as readily as ones never looked at again. Setting mtime on a hit is one cheap call. |
| Record use order in an index file or SQLite table | This adds a second file that can disagree with the folder. Mtimes are always in step with the files they describe. |
| List the folder on every store to find the total | This costs O(n) filesystem calls per store, thousands of metadata reads while a Results tree fills. |
| Evict only down to the limit | A full cache would then remove one file on every store. |
| Rehash the source file on every lookup | This reads up to 200 MB to find a small thumbnail, and the hash is already recorded. |
| Wire the Tauri command now | No preview UI calls it until S3-T10/T11. A command without a caller is untested wiring. |

## Consequences

- **Spec 15.2's open question is answered here.** The spec row points to this ADR. Spec 6.3's `nb-fs` row should name writes in the cache folder as well as deletions. That is specification text, left for the maintainer, as ADR-0023 did.
- **Stray temporary files.** Hidden temporary files from a write interrupted by a crash (`.<name>.<pid>.<n>.tmp`) are ignored and not counted, but not removed either. They are small and rare. A later task may add a cleanup of stale `.tmp` files older than a day.
- **Trusting the hash has a cost.** A linked file changed without a new observation would show a stale thumbnail until the link check records the new hash. S3-T10 must pass the observed hash, not the recorded one, for linked artefacts.
- **Algorithm changes need a new folder.** A change to how thumbnails are made (for example, colour management) must use a new folder name or clear the old one, since keys do not include a generator version.
- **The mtime order has limits.** Where the filesystem's mtime resolution is coarse (FAT32, 2 s), ties fall back to name order after a restart. In-run order is exact.
- **Tests:**
  - `crates/nb-fs/tests/cache.rs`: subfolder, write, list, touch and name refusal.
  - `crates/nb-preview/tests/thumbnail_cache.rs`: hit and miss, size in the key, generator failure, reopen, LRU order across reopen, the nine-tenths target, lowered limit, and foreign files left alone.
  - `crates/nb-preview/tests/thumbnail_cache_property.rs`: two properties.
    - Over random store, use and reopen sequences, the total never exceeds the limit, matches the bytes on disk, a hit returns exactly the bytes last stored for that key, and a file beside the folder is untouched.
    - The thumbnail just stored is never evicted.

  The property tests run 64 cases by default and take `PROPTEST_CASES`. They were also run at 1,000.
- **Not tested:**
  - Eviction failing while a file is held open (Windows-only behaviour, which would need a real lock).
  - macOS, where only CI runs the suite.
