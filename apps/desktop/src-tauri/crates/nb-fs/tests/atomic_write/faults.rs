use std::fs::{self, File};
use std::io;
use std::path::Path;

use nb_fs::{AtomicIo, RealIo};

use crate::common::{rel, TestProject};
use crate::{injected, is_temp_name, NEW, OLD, TARGET};

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

const FAULTS: [Fault; 7] = [
    Fault::CreateTemp,
    Fault::Write(0),
    Fault::Write(1),
    Fault::Write(2),
    Fault::SyncFile,
    Fault::Rename,
    Fault::SyncDir,
];

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
