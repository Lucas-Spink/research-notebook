use crate::lock::Timestamp;

/// A moment as it appears in the names of snapshots, trash folders and
/// backup folders: `2026-09-21T10-15-00Z`, UTC, with hyphens where RFC 3339
/// has colons because Windows forbids colons in names (spec 9.2).
pub fn format_stamp(_at: Timestamp) -> String {
    String::new()
}

/// Reads exactly what [`format_stamp`] writes; anything else is `None`.
pub fn parse_stamp(_text: &str) -> Option<Timestamp> {
    None
}

/// One snapshot of a file. Two snapshots made in the same second are told
/// apart by `seq`, so a snapshot is never overwritten.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Snapshot {
    pub at: Timestamp,
    /// 1 for the first in a second, then 2, 3 and so on.
    pub seq: u32,
}

impl Snapshot {
    /// The name without its extension: the stamp, followed by `-<seq>` from
    /// the second one on.
    pub fn file_stem(&self) -> String {
        String::new()
    }

    /// Reads exactly what [`Snapshot::file_stem`] writes.
    pub fn parse_stem(_stem: &str) -> Option<Self> {
        None
    }
}
