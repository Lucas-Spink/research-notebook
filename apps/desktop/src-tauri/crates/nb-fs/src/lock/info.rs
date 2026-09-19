use serde::{Deserialize, Serialize};

use super::time::Timestamp;

/// A heartbeat is written this often while a project is open (spec 5.11).
pub const HEARTBEAT_INTERVAL_SECONDS: i64 = 60;

/// A lock whose heartbeat is this old or older is stale (spec 5.11).
pub const STALE_AFTER_SECONDS: i64 = 300;

/// The keys of `.lock` in the order format-v1.md 4.7 lists them, which is
/// the order they are written in.
#[derive(Serialize)]
struct Written<'a> {
    host: &'a str,
    pid: u32,
    app_version: &'a str,
    opened: String,
    heartbeat: String,
}

/// What a lock file may hold. Keys this version does not know are ignored, as
/// the schema allows (`packages/format` `LockFile`), and a repeated key is an
/// error.
#[derive(Deserialize)]
struct Read {
    host: String,
    pid: u32,
    app_version: String,
    opened: String,
    heartbeat: String,
}

/// Who holds a lock and since when: the contents of `.lock` (format-v1.md 4.7).
///
/// This is the one place outside `packages/format` that reads and writes a
/// notebook file's text. The heartbeat runs without the webview, so Rust owns
/// it; ADR-0022 records the exception, and a sample shared with the
/// `packages/format` tests keeps the two in agreement.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LockInfo {
    pub host: String,
    pub pid: u32,
    pub app_version: String,
    pub opened: Timestamp,
    pub heartbeat: Timestamp,
}

impl LockInfo {
    /// The exact text of `.lock`: two-space JSON in documented key order
    /// with a final line feed (format-v1.md 3.5).
    pub fn to_file_text(&self) -> String {
        let written = Written {
            host: &self.host,
            pid: self.pid,
            app_version: &self.app_version,
            opened: self.opened.to_rfc3339(),
            heartbeat: self.heartbeat.to_rfc3339(),
        };
        // Serialising strings and numbers cannot fail; the fallback keeps
        // that from being a panic path.
        let mut text = serde_json::to_string_pretty(&written).unwrap_or_default();
        text.push('\n');
        text
    }

    /// Reads a lock file. `None` for anything that is not a complete, valid
    /// lock: not UTF-8, not one JSON object, a missing or mistyped key, a
    /// process id below 1, an empty or multi-line name, or a time that is
    /// not `YYYY-MM-DDTHH:MM:SSZ`.
    pub fn parse(bytes: &[u8]) -> Option<Self> {
        let read: Read = serde_json::from_slice(bytes).ok()?;
        let single_line = |text: &str| !text.is_empty() && !text.chars().any(char::is_control);
        if read.pid == 0 || !single_line(&read.host) || !single_line(&read.app_version) {
            return None;
        }
        Some(Self {
            host: read.host,
            pid: read.pid,
            app_version: read.app_version,
            opened: Timestamp::parse_rfc3339(&read.opened)?,
            heartbeat: Timestamp::parse_rfc3339(&read.heartbeat)?,
        })
    }

    /// Whether the heartbeat is five minutes old or more at `now`. A heartbeat
    /// in the future, from a clock that is ahead of ours, is not stale: when
    /// unsure the project stays read-only (P6).
    pub fn is_stale_at(&self, now: Timestamp) -> bool {
        now.unix().saturating_sub(self.heartbeat.unix()) >= STALE_AFTER_SECONDS
    }
}
