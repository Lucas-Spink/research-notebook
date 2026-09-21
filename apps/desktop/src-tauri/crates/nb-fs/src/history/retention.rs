use std::collections::BTreeMap;

use super::stamp::Snapshot;
use crate::lock::Timestamp;

const HOUR: i64 = 3_600;
const DAY: i64 = 24 * HOUR;
const WEEK: i64 = 7 * DAY;
const HOURLY_UNTIL: i64 = WEEK;
const DAILY_UNTIL: i64 = 90 * DAY;
/// 1970-01-01 was a Thursday, which is three days after a Monday.
const DAYS_EPOCH_AFTER_MONDAY: i64 = 3;

/// How coarsely a snapshot of a given age is thinned.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Tier {
    Hourly,
    Daily,
    Weekly,
}

/// The tier and UTC bucket a snapshot falls in, or `None` while it is less
/// than 24 hours old (or from the future), when every snapshot is kept.
fn bucket(now: Timestamp, at: Timestamp) -> Option<(Tier, i64)> {
    let age = now.unix().saturating_sub(at.unix());
    let unix = at.unix();
    if age < DAY {
        None
    } else if age < HOURLY_UNTIL {
        Some((Tier::Hourly, unix.div_euclid(HOUR)))
    } else if age < DAILY_UNTIL {
        Some((Tier::Daily, unix.div_euclid(DAY)))
    } else {
        let week = (unix.div_euclid(DAY) + DAYS_EPOCH_AFTER_MONDAY).div_euclid(7);
        Some((Tier::Weekly, week))
    }
}

/// Which of one file's snapshots to delete at `now` (spec 5.11): every
/// snapshot for 24 hours, then one per hour for 7 days, one per day for 90
/// days, and one per week after that. The newest snapshot in each UTC hour,
/// day or Monday-start week is the one kept, and each snapshot is judged by
/// its own age, so one that is 23 hours old is never merged with one that is
/// 25. The result is in ascending order. Pure: nothing is read or deleted here.
pub fn plan_retention(now: Timestamp, snapshots: &[Snapshot]) -> Vec<Snapshot> {
    let mut newest: BTreeMap<(Tier, i64), Snapshot> = BTreeMap::new();
    for snapshot in snapshots {
        if let Some(key) = bucket(now, snapshot.at) {
            newest
                .entry(key)
                .and_modify(|kept| *kept = (*kept).max(*snapshot))
                .or_insert(*snapshot);
        }
    }
    let mut doomed: Vec<Snapshot> = snapshots
        .iter()
        .filter(|s| bucket(now, s.at).is_some_and(|key| newest.get(&key) != Some(s)))
        .copied()
        .collect();
    doomed.sort();
    doomed.dedup();
    doomed
}
