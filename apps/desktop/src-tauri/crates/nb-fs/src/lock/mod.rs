//! The project lock (spec 5.11, FR-PRJ-05, ADR-0022): `_notebook/.lock`
//! marks a project as open for writing. A second instance opens read-only, a
//! stale lock is taken over only when the caller has the person's
//! confirmation, and a lock is released only by the instance that made it.
//!
//! Liveness is decided from the heartbeat alone, as the specification says.
//! Nothing here checks whether the process is still running.

mod current;
mod info;
mod time;

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::Path;

use crate::atomic::{AtomicIo, RealIo};
use crate::error::{LockError, WriteError};
use crate::path::ProjectRelPath;
use crate::project::ProjectRoot;
use current::{read_current, Current};

pub use info::{LockInfo, HEARTBEAT_INTERVAL_SECONDS, STALE_AFTER_SECONDS};
pub use time::Timestamp;

const LOCK_PATH: &str = "_notebook/.lock";

/// The facts about this process a lock records, and the clock. Supplied by the
/// caller so tests can run two instances on one project and move time by hand.
pub trait LockEnv {
    fn now(&self) -> Timestamp;
    fn host(&self) -> String;
    fn pid(&self) -> u32;
    fn app_version(&self) -> String;
}

/// This machine and process.
#[derive(Debug, Clone)]
pub struct SystemEnv {
    app_version: String,
}

impl SystemEnv {
    pub fn new(app_version: &str) -> Self {
        Self {
            app_version: app_version.to_owned(),
        }
    }
}

impl LockEnv for SystemEnv {
    fn now(&self) -> Timestamp {
        Timestamp::now()
    }

    /// The machine name with control characters removed, or `unknown` when it
    /// has none, because a lock must name a host.
    fn host(&self) -> String {
        let name = gethostname::gethostname().to_string_lossy().into_owned();
        let clean: String = name.chars().filter(|c| !c.is_control()).collect();
        if clean.trim().is_empty() {
            "unknown".to_owned()
        } else {
            clean
        }
    }

    fn pid(&self) -> u32 {
        std::process::id()
    }

    fn app_version(&self) -> String {
        self.app_version.clone()
    }
}

/// The step that creates a lock file exclusively, separated so tests can make
/// it fail as a read-only volume does. It extends [`AtomicIo`] because taking
/// over a lock is an ordinary atomic write.
pub trait LockIo: AtomicIo {
    /// Creates `path`, failing if it exists, and writes `bytes` to it. A
    /// failure after the file was created removes it again: it is the file
    /// this call made, so nothing else is deleted.
    fn create_exclusive(&mut self, path: &Path, bytes: &[u8]) -> io::Result<()> {
        let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
        let written = file.write_all(bytes).and_then(|()| file.sync_all());
        if written.is_err() {
            drop(file);
            let _ = fs::remove_file(path);
        }
        written
    }
}

impl LockIo for RealIo {}

/// A lock this instance holds. Keep it while the project is open: refreshing
/// and releasing check the file still holds exactly what this instance last
/// wrote.
#[derive(Debug)]
pub struct HeldLock {
    info: LockInfo,
    /// The bytes of `.lock` as this instance last wrote them, which is how it
    /// recognises its own lock without parsing anything.
    written: Vec<u8>,
}

impl HeldLock {
    fn new(info: LockInfo) -> Self {
        let written = info.to_file_text().into_bytes();
        Self { info, written }
    }

    pub fn info(&self) -> &LockInfo {
        &self.info
    }
}

/// What came of trying to lock a project. Only `Acquired` allows writing.
#[derive(Debug)]
pub enum AcquireOutcome {
    Acquired(HeldLock),
    /// Another instance holds it and its heartbeat is recent. Never taken over.
    Live(LockInfo),
    /// The heartbeat is five minutes old or more. Taken over only when the
    /// caller confirms.
    Stale(LockInfo),
    /// `.lock` exists but is not a valid lock. With `replaceable` it is taken
    /// over on confirmation like a stale one; without, it is a folder, a
    /// link or a read-only file that the application will not replace.
    Unreadable {
        replaceable: bool,
    },
    /// The lock could not be written because the project's medium or folder
    /// does not allow writing.
    ReadOnlyMedia,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefreshOutcome {
    Refreshed,
    /// `.lock` is missing or no longer holds what this instance wrote: another
    /// instance took over. It is left as it is, and this instance must stop writing.
    Lost,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReleaseOutcome {
    Released,
    AlreadyGone,
    /// `.lock` holds something other than what this instance wrote, and is left alone.
    NotOurs,
}

/// A failed create that means the volume or folder rejects writes.
fn is_read_only_medium(error: &io::Error) -> bool {
    if matches!(
        error.kind(),
        io::ErrorKind::ReadOnlyFilesystem | io::ErrorKind::PermissionDenied
    ) {
        return true;
    }
    // ERROR_WRITE_PROTECT.
    cfg!(windows) && error.raw_os_error() == Some(19)
}

/// What to do about a lock file that is already there.
enum Decision {
    Refuse(AcquireOutcome),
    Replace,
}

/// A lock that is live is never replaced. A stale or unreadable one is
/// replaced only with the person's confirmation.
fn decide(bytes: &[u8], now: Timestamp, confirmed: bool) -> Decision {
    match LockInfo::parse(bytes) {
        Some(info) if !info.is_stale_at(now) => Decision::Refuse(AcquireOutcome::Live(info)),
        Some(info) if !confirmed => Decision::Refuse(AcquireOutcome::Stale(info)),
        None if !confirmed => Decision::Refuse(AcquireOutcome::Unreadable { replaceable: true }),
        _ => Decision::Replace,
    }
}

impl ProjectRoot {
    /// Locks the project for writing. `confirm_takeover` is the person's
    /// answer to "take over this lock?": it lets a stale or unreadable lock
    /// be replaced, and is ignored for a live one.
    ///
    /// Blocks while a locked file is retried, for up to five seconds.
    pub fn acquire_lock<E: LockEnv + ?Sized>(
        &self,
        env: &E,
        confirm_takeover: bool,
    ) -> Result<AcquireOutcome, LockError> {
        self.acquire_lock_with(env, &mut RealIo, confirm_takeover)
    }

    /// As [`ProjectRoot::acquire_lock`], with the file steps supplied by `io`
    /// so tests can inject failures.
    pub fn acquire_lock_with<E: LockEnv + ?Sized, I: LockIo>(
        &self,
        env: &E,
        io: &mut I,
        confirm_takeover: bool,
    ) -> Result<AcquireOutcome, LockError> {
        let path = self.notebook.join(".lock");
        let now = env.now();
        let mine = LockInfo {
            host: env.host(),
            pid: env.pid(),
            app_version: env.app_version(),
            opened: now,
            heartbeat: now,
        };
        // Someone may create the lock between looking and creating: look again.
        for _ in 0..3 {
            match read_current(&path)? {
                Current::Absent => {
                    let ours = HeldLock::new(mine.clone());
                    match io.create_exclusive(&path, &ours.written) {
                        Ok(()) => return Ok(AcquireOutcome::Acquired(ours)),
                        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {}
                        Err(e) if is_read_only_medium(&e) => {
                            return Ok(AcquireOutcome::ReadOnlyMedia)
                        }
                        Err(source) => {
                            return Err(LockError::Io {
                                operation: "create",
                                source,
                            })
                        }
                    }
                }
                Current::Blocked => return Ok(AcquireOutcome::Unreadable { replaceable: false }),
                Current::File { bytes } => {
                    return match decide(&bytes, now, confirm_takeover) {
                        Decision::Refuse(outcome) => Ok(outcome),
                        Decision::Replace => self.take_over(io, HeldLock::new(mine)),
                    }
                }
            }
        }
        Err(LockError::Io {
            operation: "create",
            source: io::Error::from(io::ErrorKind::AlreadyExists),
        })
    }

    /// Replaces a stale or unreadable lock with ours, atomically, and checks
    /// that ours is what ended up there. Two instances confirming at the same
    /// moment both write; the one that finds the other's lock behind it stays
    /// read-only.
    fn take_over<I: LockIo>(
        &self,
        io: &mut I,
        ours: HeldLock,
    ) -> Result<AcquireOutcome, LockError> {
        let path = ProjectRelPath::parse(LOCK_PATH).map_err(WriteError::from)?;
        match self.write_atomic_with(io, &path, &ours.written) {
            Ok(()) => {}
            Err(WriteError::Io { source, .. }) if is_read_only_medium(&source) => {
                return Ok(AcquireOutcome::ReadOnlyMedia)
            }
            Err(
                WriteError::TargetIsLink { .. }
                | WriteError::TargetIsDirectory { .. }
                | WriteError::ReadOnly { .. },
            ) => return Ok(AcquireOutcome::Unreadable { replaceable: false }),
            Err(other) => return Err(other.into()),
        }
        match read_current(&self.notebook.join(".lock"))? {
            Current::File { bytes } if bytes == ours.written => Ok(AcquireOutcome::Acquired(ours)),
            Current::File { bytes } => Ok(match LockInfo::parse(&bytes) {
                Some(info) => AcquireOutcome::Live(info),
                None => AcquireOutcome::Unreadable { replaceable: true },
            }),
            Current::Absent | Current::Blocked => {
                Ok(AcquireOutcome::Unreadable { replaceable: false })
            }
        }
    }

    /// Writes a fresh heartbeat into a lock this instance holds. Call it every
    /// [`HEARTBEAT_INTERVAL_SECONDS`]. If the file no longer holds exactly what
    /// this instance last wrote the lock is lost, the file is left alone, and
    /// the caller must stop writing.
    pub fn refresh_lock<E: LockEnv + ?Sized>(
        &self,
        env: &E,
        held: &mut HeldLock,
    ) -> Result<RefreshOutcome, LockError> {
        match read_current(&self.notebook.join(".lock"))? {
            Current::File { bytes } if bytes == held.written => {}
            _ => return Ok(RefreshOutcome::Lost),
        }
        let refreshed = LockInfo {
            heartbeat: env.now(),
            ..held.info.clone()
        };
        let text = refreshed.to_file_text().into_bytes();
        let path = ProjectRelPath::parse(LOCK_PATH).map_err(WriteError::from)?;
        self.write_atomic(&path, &text)?;
        *held = HeldLock {
            info: refreshed,
            written: text,
        };
        Ok(RefreshOutcome::Refreshed)
    }

    /// Removes the lock when the project is closed, if it is still the one
    /// this instance wrote. It is the only file the application deletes
    /// outside `.history`, `.trash`, `inbox` and the cache (ADR-0022).
    pub fn release_lock(&self, held: HeldLock) -> Result<ReleaseOutcome, LockError> {
        let path = self.notebook.join(".lock");
        match read_current(&path)? {
            Current::Absent => Ok(ReleaseOutcome::AlreadyGone),
            Current::File { bytes } if bytes == held.written => match fs::remove_file(&path) {
                Ok(()) => Ok(ReleaseOutcome::Released),
                Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(ReleaseOutcome::AlreadyGone),
                Err(source) => Err(LockError::Io {
                    operation: "remove",
                    source,
                }),
            },
            _ => Ok(ReleaseOutcome::NotOurs),
        }
    }
}
