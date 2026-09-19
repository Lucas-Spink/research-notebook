//! A project on read-only media, and locks that cannot be replaced.

use std::fs::{self, File};
use std::io;
use std::path::Path;

use nb_fs::lock::{AcquireOutcome, LockIo};
use nb_fs::{AtomicIo, LockError};

use crate::common::TestProject;
use crate::{held, FakeEnv, LOCK};

/// Every step that would create a file fails with `kind`, as on a read-only
/// volume or a folder the person may not write to.
struct Refusing(io::ErrorKind);

impl AtomicIo for Refusing {
    fn create_temp(&mut self, _path: &Path) -> io::Result<File> {
        Err(io::Error::from(self.0))
    }
}

impl LockIo for Refusing {
    fn create_exclusive(&mut self, _path: &Path, _bytes: &[u8]) -> io::Result<()> {
        Err(io::Error::from(self.0))
    }
}

#[test]
fn a_project_that_cannot_be_written_opens_read_only_and_gets_no_lock() {
    for kind in [
        io::ErrorKind::ReadOnlyFilesystem,
        io::ErrorKind::PermissionDenied,
    ] {
        let project = TestProject::new();

        let outcome = project
            .open()
            .acquire_lock_with(&FakeEnv::new("lab-pc", 1), &mut Refusing(kind), false)
            .unwrap();

        assert!(
            matches!(outcome, AcquireOutcome::ReadOnlyMedia),
            "{kind:?}: {outcome:?}"
        );
        assert!(!project.exists(LOCK), "{kind:?}");
        assert!(project.temp_files().is_empty(), "{kind:?}");
    }
}

#[test]
fn an_unrelated_failure_is_an_error_and_not_taken_for_read_only_media() {
    let project = TestProject::new();

    let error = project
        .open()
        .acquire_lock_with(
            &FakeEnv::new("lab-pc", 1),
            &mut Refusing(io::ErrorKind::OutOfMemory),
            false,
        )
        .unwrap_err();

    assert!(matches!(error, LockError::Io { .. }), "{error:?}");
}

#[test]
fn a_takeover_that_cannot_write_reports_read_only_media_and_keeps_the_old_lock() {
    let project = TestProject::new();
    held(
        project
            .open()
            .acquire_lock(&FakeEnv::new("lab-pc", 100), false)
            .unwrap(),
    );
    let before = project.read(LOCK);
    let taker = FakeEnv::new("laptop", 200);
    taker.advance(3_600);

    let outcome = project
        .open()
        .acquire_lock_with(&taker, &mut Refusing(io::ErrorKind::PermissionDenied), true)
        .unwrap();

    assert!(
        matches!(outcome, AcquireOutcome::ReadOnlyMedia),
        "{outcome:?}"
    );
    assert_eq!(project.read(LOCK), before);
}

#[test]
fn a_stale_lock_marked_read_only_is_never_made_writable() {
    let project = TestProject::new();
    held(
        project
            .open()
            .acquire_lock(&FakeEnv::new("lab-pc", 100), false)
            .unwrap(),
    );
    let before = project.read(LOCK);
    let mut permissions = fs::metadata(project.on_disk(LOCK)).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(project.on_disk(LOCK), permissions).unwrap();
    let taker = FakeEnv::new("laptop", 200);
    taker.advance(3_600);

    let outcome = project.open().acquire_lock(&taker, true).unwrap();

    assert!(
        matches!(outcome, AcquireOutcome::Unreadable { replaceable: false }),
        "{outcome:?}"
    );
    assert_eq!(project.read(LOCK), before);
    assert!(fs::metadata(project.on_disk(LOCK))
        .unwrap()
        .permissions()
        .readonly());

    // Let the temporary directory clean up.
    let mut permissions = fs::metadata(project.on_disk(LOCK)).unwrap().permissions();
    #[allow(clippy::permissions_set_readonly_false)]
    permissions.set_readonly(false);
    fs::set_permissions(project.on_disk(LOCK), permissions).unwrap();
}
