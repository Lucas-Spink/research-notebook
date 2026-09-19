use std::io;
use std::path::Path;
use std::time::Duration;

use nb_fs::{AtomicIo, RealIo, WriteError, LOCK_RETRY_BUDGET};

use crate::common::{rel, TestProject};
use crate::{injected, NEW, OLD, TARGET};

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
