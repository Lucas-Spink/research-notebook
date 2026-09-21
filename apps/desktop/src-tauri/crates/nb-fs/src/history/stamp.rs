use crate::lock::Timestamp;

/// `YYYY-MM-DDTHH-MM-SSZ`.
const STAMP_LEN: usize = 20;
/// Where the two colons of RFC 3339 are, which the stamp writes as hyphens.
const COLON_AT: [usize; 2] = [13, 16];

/// A moment as it appears in the names of snapshots, trash folders and
/// backup folders: `2026-09-21T10-15-00Z`, UTC, with hyphens where RFC 3339
/// has colons because Windows forbids colons in names (spec 9.2).
pub fn format_stamp(at: Timestamp) -> String {
    at.to_rfc3339().replace(':', "-")
}

/// Reads exactly what [`format_stamp`] writes; anything else is `None`.
pub fn parse_stamp(text: &str) -> Option<Timestamp> {
    let bytes = text.as_bytes();
    if bytes.len() != STAMP_LEN || COLON_AT.iter().any(|&at| bytes[at] != b'-') {
        return None;
    }
    let mut rfc3339 = text.to_owned();
    for at in COLON_AT {
        rfc3339.replace_range(at..=at, ":");
    }
    Timestamp::parse_rfc3339(&rfc3339)
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
        let stamp = format_stamp(self.at);
        if self.seq <= 1 {
            stamp
        } else {
            format!("{stamp}-{}", self.seq)
        }
    }

    /// Reads exactly what [`Snapshot::file_stem`] writes.
    pub fn parse_stem(stem: &str) -> Option<Self> {
        if stem.len() == STAMP_LEN {
            return parse_stamp(stem).map(|at| Self { at, seq: 1 });
        }
        let at = parse_stamp(stem.get(..STAMP_LEN)?)?;
        let digits = stem.get(STAMP_LEN..)?.strip_prefix('-')?;
        let canonical = !digits.starts_with('0') && digits.bytes().all(|b| b.is_ascii_digit());
        let seq: u32 = digits.parse().ok().filter(|_| canonical)?;
        // 1 is written with no suffix, so a suffix of 1 is not what we write.
        (seq >= 2).then_some(Self { at, seq })
    }
}
