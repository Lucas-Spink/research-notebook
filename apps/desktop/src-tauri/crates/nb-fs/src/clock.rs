use crate::lock::Timestamp;

/// Where "now" comes from for history, trash and backups, so tests can move
/// time by hand and retention can be checked at any age (S2-G12).
pub trait Clock {
    fn now(&self) -> Timestamp;
}

/// The system clock.
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> Timestamp {
        Timestamp::now()
    }
}
