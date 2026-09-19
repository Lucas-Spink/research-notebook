//! Gate S2-G09: lock behaviour (spec 5.11, FR-PRJ-05, ADR-0022). A second
//! instance opens read-only; a stale lock is taken over only when the caller
//! confirms; a heartbeat keeps a lock live; a lock is released only by its
//! owner.
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

mod acquire;
mod heartbeat;
mod media;
mod release;
mod stale;
mod timestamps;

use std::cell::Cell;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use common::TestProject;
use nb_fs::lock::{AcquireOutcome, HeldLock, LockEnv, Timestamp};

pub const LOCK: &str = "_notebook/.lock";

/// 2026-09-19T10:00:00Z, the moment every scenario starts.
pub const START: i64 = 1_789_812_000;

/// A process with a name, a pid and a clock the test moves by hand. Two of
/// these on one project stand for two running instances.
pub struct FakeEnv {
    now: Cell<i64>,
    host: &'static str,
    pid: u32,
}

impl FakeEnv {
    pub fn new(host: &'static str, pid: u32) -> Self {
        Self {
            now: Cell::new(START),
            host,
            pid,
        }
    }

    pub fn set(&self, unix: i64) {
        self.now.set(unix);
    }

    pub fn advance(&self, seconds: i64) {
        self.now.set(self.now.get() + seconds);
    }

    pub fn unix(&self) -> i64 {
        self.now.get()
    }
}

impl LockEnv for FakeEnv {
    fn now(&self) -> Timestamp {
        Timestamp::from_unix(self.now.get())
    }
    fn host(&self) -> String {
        self.host.to_owned()
    }
    fn pid(&self) -> u32 {
        self.pid
    }
    fn app_version(&self) -> String {
        "0.1.0".to_owned()
    }
}

/// Every file under `_notebook/` with its bytes, to prove a refused or
/// read-only open changed nothing (S2-G04).
pub fn notebook_files(project: &TestProject) -> BTreeMap<String, Vec<u8>> {
    fn walk(root: &Path, dir: &Path, files: &mut BTreeMap<String, Vec<u8>>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            let rel = path
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            if path.is_dir() {
                walk(root, &path, files);
            } else {
                files.insert(rel, fs::read(&path).unwrap());
            }
        }
    }
    let mut files = BTreeMap::new();
    walk(project.root(), &project.on_disk("_notebook"), &mut files);
    files
}

/// The held lock, failing the test with what came back instead.
pub fn held(outcome: AcquireOutcome) -> HeldLock {
    match outcome {
        AcquireOutcome::Acquired(held) => held,
        other => panic!("expected the lock to be acquired, got {other:?}"),
    }
}

/// Puts `text` in `.lock` as another program might have left it.
pub fn plant_lock(project: &TestProject, text: &[u8]) {
    fs::write(project.on_disk(LOCK), text).unwrap();
}
