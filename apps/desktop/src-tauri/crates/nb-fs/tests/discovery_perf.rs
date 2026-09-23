//! NFR-PERF-05 / gate S3-G07 (intent): discovery over 50,000 files reports
//! progress within 500 ms, stops within 1 s of being cancelled, and never
//! enters an excluded folder. Spec 10.1 measures this with an integration
//! test; the gate's `pnpm bench -- discovery` harness does not exist yet.
// disallowed_methods: the test builds a throwaway tree in a temporary
// directory; the std::fs write calls are fixture setup.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::{Duration, Instant};

use nb_fs::discovery::{discover, DiscoveryOptions};
use tempfile::TempDir;

const FILES: usize = 50_000;
const EXCLUDED_FILES: usize = 10_000;
const PER_FOLDER: usize = 250;

/// 40,000 analysis files in 160 folders plus 10,000 in `node_modules`.
fn large_tree() -> TempDir {
    let dir = tempfile::Builder::new()
        .prefix("nb-discovery-perf-")
        .tempdir()
        .unwrap();
    let write_many = |base: &Path, count: usize| {
        for i in 0..count {
            let folder = base.join(format!("d{:03}", i / PER_FOLDER));
            if i % PER_FOLDER == 0 {
                fs::create_dir_all(&folder).unwrap();
            }
            fs::write(folder.join(format!("f{i}.csv")), b"a,b\n").unwrap();
        }
    };
    write_many(&dir.path().join("results"), FILES - EXCLUDED_FILES);
    write_many(&dir.path().join("node_modules"), EXCLUDED_FILES);
    dir
}

#[test]
fn discovery_over_50000_files_meets_nfr_perf_05() {
    let dir = large_tree();
    let options = DiscoveryOptions::default();

    // A full scan: first progress within 500 ms, nothing from node_modules.
    let cancel = AtomicBool::new(false);
    let started = Instant::now();
    let mut first_progress = None;
    let found = discover(dir.path(), &options, &[], &cancel, &mut |_| {
        first_progress.get_or_insert_with(|| started.elapsed());
    })
    .unwrap();
    let first_progress = first_progress.unwrap();
    assert!(
        first_progress < Duration::from_millis(500),
        "first progress after {first_progress:?}"
    );
    assert_eq!(found.files.len(), FILES - EXCLUDED_FILES);
    assert!(found
        .files
        .iter()
        .all(|f| !f.rel_path.starts_with("node_modules")));
    // The chosen folder, results/ and its 160 folders; neither node_modules
    // nor any of its 40 folders is entered.
    assert_eq!(found.folders_visited, 1 + 1 + 160);

    // A second scan cancelled from another thread, as the UI would, stops
    // within 1 s of the flag being set. The scan holds at its first report
    // with files until the flag is set, so a fast disk cannot finish the
    // scan before the cancel arrives and make the test pass vacuously.
    let cancel = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::channel::<()>();
    let scan = {
        let cancel = Arc::clone(&cancel);
        let root = dir.path().to_path_buf();
        thread::spawn(move || {
            let mut signalled = false;
            let found = discover(&root, &options, &[], &cancel, &mut |p| {
                if !signalled && p.files_seen > 0 {
                    signalled = true;
                    tx.send(()).unwrap();
                    while !cancel.load(Ordering::Relaxed) {
                        thread::yield_now();
                    }
                }
            })
            .unwrap();
            (found, Instant::now())
        })
    };
    rx.recv_timeout(Duration::from_secs(10)).unwrap();
    let cancelled_at = Instant::now();
    cancel.store(true, Ordering::Relaxed);
    let (found, finished_at) = scan.join().unwrap();
    let stop = finished_at.saturating_duration_since(cancelled_at);
    assert!(found.cancelled, "the scan should report being cancelled");
    assert!(
        stop < Duration::from_secs(1),
        "stopped {stop:?} after cancel"
    );
}
