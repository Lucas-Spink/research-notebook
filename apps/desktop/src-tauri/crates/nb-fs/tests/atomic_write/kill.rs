use std::fs;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use crate::common::{rel, TestProject};
use crate::{is_temp_name, TARGET};

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
                "kill::kill_child_writer",
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
