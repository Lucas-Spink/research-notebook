//! Gate S2-G05: atomic writes survive a crash. A reader sees the old file or
//! the complete new one, never a partial file (spec 6.5, 9.3, risk "Crash
//! during save corrupts notes").
// disallowed_methods: the tests read and inspect files in throwaway temporary
// projects, and spawn this test binary as the writer to be killed.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

mod common;

use std::fs::{self, File};
use std::io;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use common::{rel, TestProject};
use nb_fs::{AtomicIo, RealIo, WriteError, LOCK_RETRY_BUDGET};
use proptest::prelude::*;

const TARGET: &str = "_notebook/notes.md";

// ---------------------------------------------------------------- basics

#[test]
fn writes_a_new_file_and_creates_missing_folders() {
    let project = TestProject::new();
    let path = "_notebook/experiments/EXP-001/experiment.md";
    project.open().write_atomic(&rel(path), b"hello\n").unwrap();
    assert_eq!(project.read(path), b"hello\n");
    assert!(project.temp_files().is_empty());
}

#[test]
fn replaces_an_existing_file_completely() {
    let project = TestProject::new();
    let root = project.open();
    root.write_atomic(&rel(TARGET), &vec![b'a'; 100_000])
        .unwrap();
    root.write_atomic(&rel(TARGET), b"short").unwrap();
    assert_eq!(project.read(TARGET), b"short");
    assert!(project.temp_files().is_empty());
}

#[test]
fn writes_empty_content() {
    let project = TestProject::new();
    let root = project.open();
    root.write_atomic(&rel(TARGET), b"something").unwrap();
    root.write_atomic(&rel(TARGET), b"").unwrap();
    assert_eq!(project.read(TARGET), b"");
}

proptest! {
    #[test]
    fn any_bytes_round_trip_and_leave_no_temp_file(
        first in prop::collection::vec(any::<u8>(), 0..150_000),
        second in prop::collection::vec(any::<u8>(), 0..150_000),
    ) {
        let project = TestProject::new();
        let root = project.open();
        root.write_atomic(&rel(TARGET), &first).unwrap();
        prop_assert_eq!(project.read(TARGET), first);
        root.write_atomic(&rel(TARGET), &second).unwrap();
        prop_assert_eq!(project.read(TARGET), second);
        prop_assert!(project.temp_files().is_empty());
    }
}

// ------------------------------------------------- fault injection by step

#[derive(Clone, Copy, Debug, PartialEq)]
enum Fault {
    CreateTemp,
    /// Fails before the n-th chunk (from 0), so n chunks were written.
    Write(usize),
    SyncFile,
    Rename,
    SyncDir,
}

/// The real filesystem with one step made to fail. With `crash` set the
/// writer also cannot clean up, as if the process had died at that step.
struct FaultIo {
    fault: Fault,
    crash: bool,
    chunk: usize,
    chunks_written: usize,
}

impl FaultIo {
    fn new(fault: Fault, crash: bool) -> Self {
        Self {
            fault,
            crash,
            chunk: 4,
            chunks_written: 0,
        }
    }
}

fn injected() -> io::Error {
    io::Error::other("injected fault")
}

impl AtomicIo for FaultIo {
    fn chunk_size(&self) -> usize {
        self.chunk
    }
    fn create_temp(&mut self, path: &Path) -> io::Result<File> {
        if self.fault == Fault::CreateTemp {
            return Err(injected());
        }
        RealIo.create_temp(path)
    }
    fn write_chunk(&mut self, file: &mut File, chunk: &[u8]) -> io::Result<()> {
        if self.fault == Fault::Write(self.chunks_written) {
            return Err(injected());
        }
        self.chunks_written += 1;
        RealIo.write_chunk(file, chunk)
    }
    fn sync_file(&mut self, file: &File) -> io::Result<()> {
        if self.fault == Fault::SyncFile {
            return Err(injected());
        }
        RealIo.sync_file(file)
    }
    fn rename(&mut self, from: &Path, to: &Path) -> io::Result<()> {
        if self.fault == Fault::Rename {
            return Err(injected());
        }
        RealIo.rename(from, to)
    }
    fn sync_dir(&mut self, dir: &Path) -> io::Result<()> {
        if self.fault == Fault::SyncDir {
            return Err(injected());
        }
        RealIo.sync_dir(dir)
    }
    fn remove_temp(&mut self, path: &Path) -> io::Result<()> {
        if self.crash {
            return Ok(());
        }
        RealIo.remove_temp(path)
    }
}

const OLD: &[u8] = b"old contents";
const NEW: &[u8] = b"new contents"; // 12 bytes: three chunks of four

const FAULTS: [Fault; 7] = [
    Fault::CreateTemp,
    Fault::Write(0),
    Fault::Write(1),
    Fault::Write(2),
    Fault::SyncFile,
    Fault::Rename,
    Fault::SyncDir,
];

fn is_temp_name(name: &str) -> bool {
    name.starts_with('.') && name.ends_with(".tmp")
}

#[test]
fn a_failure_at_any_step_leaves_the_old_file_or_the_complete_new_one() {
    for fault in FAULTS {
        for crash in [false, true] {
            for existed in [false, true] {
                let project = TestProject::new();
                let root = project.open();
                if existed {
                    root.write_atomic(&rel(TARGET), OLD).unwrap();
                }
                let mut io = FaultIo::new(fault, crash);
                let result = root.write_atomic_with(&mut io, &rel(TARGET), NEW);
                let context = format!("{fault:?} crash={crash} existed={existed}");

                if fault == Fault::SyncDir {
                    // The rename already happened; only durability of the
                    // directory entry is uncertain, so the write stands.
                    assert!(result.is_ok(), "{context}");
                    assert_eq!(project.read(TARGET), NEW, "{context}");
                } else {
                    assert!(result.is_err(), "{context}");
                    if existed {
                        assert_eq!(project.read(TARGET), OLD, "{context}");
                    } else {
                        assert!(!project.exists(TARGET), "{context}");
                    }
                }
                if crash {
                    assert!(
                        project.temp_files().iter().all(|n| is_temp_name(n)),
                        "{context}"
                    );
                } else {
                    assert!(project.temp_files().is_empty(), "{context}");
                }
            }
        }
    }
}

#[test]
fn a_partial_write_is_only_ever_in_the_temporary_file() {
    let project = TestProject::new();
    let root = project.open();
    root.write_atomic(&rel(TARGET), OLD).unwrap();

    let mut io = FaultIo::new(Fault::Write(1), true);
    assert!(root.write_atomic_with(&mut io, &rel(TARGET), NEW).is_err());

    assert_eq!(project.read(TARGET), OLD);
    let temps = project.temp_files();
    assert_eq!(temps.len(), 1, "{temps:?}");
    let partial = fs::read(project.on_disk("_notebook").join(&temps[0])).unwrap();
    assert_eq!(partial, &NEW[..4]);
}

#[test]
fn a_leftover_temporary_file_does_not_block_the_next_write() {
    let project = TestProject::new();
    let root = project.open();
    let mut io = FaultIo::new(Fault::Write(1), true);
    assert!(root.write_atomic_with(&mut io, &rel(TARGET), NEW).is_err());
    root.write_atomic(&rel(TARGET), b"after the crash").unwrap();
    assert_eq!(project.read(TARGET), b"after the crash");
}

// ------------------------------------------------------- retry on locks

/// Fails the rename with `error` a set number of times, and records pauses
/// instead of sleeping.
struct BusyIo {
    busy_for: usize,
    error: fn() -> io::Error,
    renames: usize,
    pauses: Vec<Duration>,
}

impl BusyIo {
    fn new(busy_for: usize, error: fn() -> io::Error) -> Self {
        Self {
            busy_for,
            error,
            renames: 0,
            pauses: Vec::new(),
        }
    }
}

impl AtomicIo for BusyIo {
    fn rename(&mut self, from: &Path, to: &Path) -> io::Result<()> {
        self.renames += 1;
        if self.renames <= self.busy_for {
            return Err((self.error)());
        }
        RealIo.rename(from, to)
    }
    fn pause(&mut self, duration: Duration) {
        self.pauses.push(duration);
    }
}

fn busy() -> io::Error {
    io::Error::from(io::ErrorKind::ResourceBusy)
}

#[test]
fn a_lock_that_clears_is_retried_with_backoff_and_the_write_succeeds() {
    let project = TestProject::new();
    let root = project.open();
    root.write_atomic(&rel(TARGET), OLD).unwrap();

    let mut io = BusyIo::new(3, busy);
    root.write_atomic_with(&mut io, &rel(TARGET), NEW).unwrap();

    assert_eq!(project.read(TARGET), NEW);
    assert_eq!(io.renames, 4);
    assert_eq!(io.pauses.len(), 3);
    assert!(
        io.pauses.windows(2).all(|w| w[1] >= w[0]),
        "{:?}",
        io.pauses
    );
    assert!(project.temp_files().is_empty());
}

#[test]
fn a_lock_that_never_clears_gives_up_after_five_seconds_naming_the_file() {
    let project = TestProject::new();
    let root = project.open();
    root.write_atomic(&rel(TARGET), OLD).unwrap();

    let mut io = BusyIo::new(usize::MAX, busy);
    let error = root
        .write_atomic_with(&mut io, &rel(TARGET), NEW)
        .unwrap_err();

    match error {
        WriteError::Locked { path } => assert_eq!(path, TARGET),
        other => panic!("expected Locked, got {other:?}"),
    }
    assert_eq!(LOCK_RETRY_BUDGET, Duration::from_secs(5));
    assert_eq!(io.pauses.iter().sum::<Duration>(), LOCK_RETRY_BUDGET);
    assert!(io.pauses.iter().all(|p| *p <= Duration::from_millis(500)));
    assert!(io.pauses[0] <= Duration::from_millis(20));
    assert_eq!(project.read(TARGET), OLD);
    assert!(project.temp_files().is_empty());
}

#[test]
fn other_rename_errors_are_not_retried() {
    let project = TestProject::new();
    let root = project.open();
    let mut io = BusyIo::new(usize::MAX, injected);
    let error = root
        .write_atomic_with(&mut io, &rel(TARGET), NEW)
        .unwrap_err();
    assert!(matches!(error, WriteError::Io { .. }), "{error:?}");
    assert_eq!(io.renames, 1);
    assert!(io.pauses.is_empty());
}

#[cfg(windows)]
#[test]
fn windows_access_denied_and_sharing_and_lock_violations_are_retried() {
    for code in [5, 32, 33] {
        fn code_5() -> io::Error {
            io::Error::from_raw_os_error(5)
        }
        fn code_32() -> io::Error {
            io::Error::from_raw_os_error(32)
        }
        fn code_33() -> io::Error {
            io::Error::from_raw_os_error(33)
        }
        let error = match code {
            5 => code_5,
            32 => code_32,
            _ => code_33,
        };
        let project = TestProject::new();
        let mut io = BusyIo::new(2, error);
        project
            .open()
            .write_atomic_with(&mut io, &rel(TARGET), NEW)
            .unwrap();
        assert_eq!(io.pauses.len(), 2, "os error {code}");
        assert_eq!(project.read(TARGET), NEW);
    }
}

// ------------------------------------------------------------ concurrency

#[test]
fn concurrent_writers_never_collide_and_readers_never_see_a_partial_file() {
    const LEN: usize = 100_000;
    let project = TestProject::new();
    let root = project.open();
    root.write_atomic(&rel(TARGET), &vec![0u8; LEN]).unwrap();
    let done = AtomicBool::new(false);
    let target = project.on_disk(TARGET);

    thread::scope(|scope| {
        let reader = scope.spawn(|| {
            let mut complete_reads = 0;
            while !done.load(Ordering::Relaxed) {
                // A read can fail while a replace is in progress on Windows;
                // when it succeeds the content must be whole.
                if let Ok(bytes) = fs::read(&target) {
                    assert_eq!(bytes.len(), LEN);
                    assert!(bytes.iter().all(|b| *b == bytes[0]));
                    complete_reads += 1;
                }
            }
            complete_reads
        });
        let writers: Vec<_> = (1..=4u8)
            .map(|id| {
                let root = &root;
                scope.spawn(move || {
                    for _ in 0..25 {
                        root.write_atomic(&rel(TARGET), &vec![id; LEN]).unwrap();
                    }
                })
            })
            .collect();
        for writer in writers {
            writer.join().unwrap();
        }
        done.store(true, Ordering::Relaxed);
        assert!(reader.join().unwrap() > 0);
    });

    let last = project.read(TARGET);
    assert_eq!(last.len(), LEN);
    assert!(last.iter().all(|b| *b == last[0]));
    assert!(project.temp_files().is_empty());
}

// ------------------------------------------------ killing a real process

const CHILD_ROOT: &str = "NB_FS_KILL_CHILD_ROOT";
const CHILD_READY: &str = "NB_FS_KILL_CHILD_READY";

/// A payload whose length changes with `k` and whose bytes depend on `k`,
/// so any truncated or mixed file differs from every payload.
fn payload(k: u64) -> Vec<u8> {
    let len = 200_000 + (k % 7) as usize * 50_000;
    let mut bytes = Vec::with_capacity(len + 16);
    bytes.extend(k.to_le_bytes());
    bytes.extend((len as u64).to_le_bytes());
    bytes.extend((0..len).map(|i| (i as u64).wrapping_mul(31).wrapping_add(k) as u8));
    bytes
}

fn payload_number(bytes: &[u8]) -> Option<u64> {
    let k = u64::from_le_bytes(bytes.get(..8)?.try_into().ok()?);
    (bytes == payload(k)).then_some(k)
}

/// Entry point of the child process for the kill test. It is an ordinary
/// test so no extra binary is needed: it does nothing unless the parent sets
/// the environment, in which case it rewrites the target until killed.
#[test]
fn kill_child_writer() {
    let Ok(root) = std::env::var(CHILD_ROOT) else {
        return;
    };
    let ready = std::env::var(CHILD_READY).unwrap();
    let project = nb_fs::ProjectRoot::open(Path::new(&root)).unwrap();
    let started = Instant::now();
    let mut k = 1;
    // Bounded, so an orphan cannot run forever if the parent dies.
    while started.elapsed() < Duration::from_secs(60) {
        project.write_atomic(&rel(TARGET), &payload(k)).unwrap();
        if k == 1 {
            fs::write(&ready, b"ready").unwrap();
        }
        k += 1;
    }
}

struct KillOnDrop(Child);

impl Drop for KillOnDrop {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn xorshift(state: &mut u64) -> u64 {
    *state ^= *state << 13;
    *state ^= *state >> 7;
    *state ^= *state << 17;
    *state
}

#[test]
fn killing_the_writer_at_random_moments_leaves_the_old_or_the_new_file() {
    let seed: u64 = std::env::var("NB_FS_KILL_SEED")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0x5EED_1234);
    let runs: usize = std::env::var("NB_FS_KILL_RUNS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30);
    eprintln!("kill test seed {seed} (set NB_FS_KILL_SEED to repeat), {runs} runs");
    let mut state = seed;

    let project = TestProject::new();
    let root = project.open();
    root.write_atomic(&rel(TARGET), &payload(0)).unwrap();
    let ready = tempfile::Builder::new()
        .prefix("nb-fs-ready-")
        .tempdir()
        .unwrap();
    let marker = ready.path().join("ready");

    for run in 0..runs {
        let _ = fs::remove_file(&marker);
        let child = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "kill_child_writer",
                "--nocapture",
                "--test-threads=1",
            ])
            .env(CHILD_ROOT, project.root())
            .env(CHILD_READY, &marker)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let child = KillOnDrop(child);

        let waited = Instant::now();
        while !marker.exists() {
            assert!(
                waited.elapsed() < Duration::from_secs(30),
                "the child never started writing"
            );
            thread::sleep(Duration::from_millis(2));
        }
        // Somewhere inside the next few writes.
        let delay = Duration::from_micros(xorshift(&mut state) % 60_000);
        thread::sleep(delay);
        drop(child);

        let bytes = fs::read(project.on_disk(TARGET)).unwrap();
        payload_number(&bytes).unwrap_or_else(|| {
            panic!("run {run} (seed {seed}, delay {delay:?}): the file is neither a complete old nor a complete new payload ({} bytes)", bytes.len())
        });
        assert!(
            project.temp_files().iter().all(|n| is_temp_name(n)),
            "run {run}: {:?}",
            project.temp_files()
        );
    }

    root.write_atomic(&rel(TARGET), b"after all the crashes")
        .unwrap();
    assert_eq!(project.read(TARGET), b"after all the crashes");
}
