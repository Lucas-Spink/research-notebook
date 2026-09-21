use super::stamp::Snapshot;
use crate::lock::Timestamp;

/// Which of one file's snapshots to delete at `now` (spec 5.11): every
/// snapshot for 24 hours, then one per hour for 7 days, one per day for 90
/// days, and one per week after that. The newest snapshot in each UTC hour,
/// day or Monday-start week is the one kept, and each snapshot is judged by
/// its own age. Pure: nothing is read or deleted here.
pub fn plan_retention(_now: Timestamp, _snapshots: &[Snapshot]) -> Vec<Snapshot> {
    Vec::new()
}
