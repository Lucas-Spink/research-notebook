//! History, trash and version-change backups (spec 5.11, FR-HIS-01, 02, 04;
//! ADR-0025). `history_retention` is gate S2-G12.
// disallowed_methods: the tests build and inspect files in throwaway
// temporary projects, outside any real project.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

#[path = "../common/mod.rs"]
mod common;

mod backup;
mod history_retention;
mod scope;
mod snapshot;
mod stamp;
mod trash;

use std::cell::Cell;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use common::TestProject;
use nb_fs::lock::Timestamp;
use nb_fs::Clock;
use sha2::{Digest, Sha256};

/// A clock the test moves by hand.
pub struct FakeClock(Cell<i64>);

impl FakeClock {
    pub fn at(text: &str) -> Self {
        Self(Cell::new(ts(text).unix()))
    }

    pub fn set(&self, text: &str) {
        self.0.set(ts(text).unix());
    }

    pub fn advance(&self, seconds: i64) {
        self.0.set(self.0.get() + seconds);
    }
}

impl Clock for FakeClock {
    fn now(&self) -> Timestamp {
        Timestamp::from_unix(self.0.get())
    }
}

/// A moment from its RFC 3339 form, `2026-09-21T10:15:00Z`.
pub fn ts(text: &str) -> Timestamp {
    Timestamp::parse_rfc3339(text).unwrap()
}

pub fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

/// Puts `bytes` at `rel` (project-relative), creating folders: a file as it
/// might have been left by an earlier session or another program.
pub fn plant(project: &TestProject, rel: &str, bytes: &[u8]) {
    let path = project.on_disk(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, bytes).unwrap();
}

/// Every file under `dir` (project-relative, `/`-separated) with its bytes.
pub fn files_under(project: &TestProject, dir: &str) -> BTreeMap<String, Vec<u8>> {
    fn walk(root: &Path, dir: &Path, files: &mut BTreeMap<String, Vec<u8>>) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(root, &path, files);
            } else {
                let rel = path
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                files.insert(rel, fs::read(&path).unwrap());
            }
        }
    }
    let mut files = BTreeMap::new();
    walk(project.root(), &project.on_disk(dir), &mut files);
    files
}
