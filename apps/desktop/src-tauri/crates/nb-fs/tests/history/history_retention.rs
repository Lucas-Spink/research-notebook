//! Gate S2-G12: retention with a mocked clock (spec 5.11, FR-HIS-02). Every
//! snapshot for 24 hours, one per hour for 7 days, one per day for 90 days,
//! one per week after that, the newest in each UTC hour, day or Monday-start
//! week surviving. The clock is a plain `now` argument; nothing reads the time.

use std::collections::BTreeSet;

use nb_fs::history::{plan_retention, Snapshot};
use nb_fs::lock::Timestamp;
use proptest::prelude::*;

use super::ts;

const HOUR: i64 = 3_600;
const DAY: i64 = 86_400;
const WEEK: i64 = 7 * DAY;

/// A Monday, midnight UTC, so hour, day and week boundaries are easy to see.
const NOW: &str = "2026-09-21T00:00:00Z";

fn snap(text: &str) -> Snapshot {
    Snapshot {
        at: ts(text),
        seq: 1,
    }
}

fn snaps(texts: &[&str]) -> Vec<Snapshot> {
    texts.iter().map(|t| snap(t)).collect()
}

/// What retention would delete, as RFC 3339 texts, for readable assertions.
fn deleted(now: &str, texts: &[&str]) -> Vec<String> {
    let mut plan = plan_retention(ts(now), &snaps(texts));
    plan.sort();
    plan.iter().map(|s| s.at.to_rfc3339()).collect()
}

#[test]
fn every_snapshot_in_the_last_24_hours_is_kept() {
    // One every ten minutes, oldest 23 h 50 min old: all in one hour buckets
    // of six, and none may go.
    let now = ts(NOW).unix();
    let all: Vec<Snapshot> = (0..144)
        .map(|n| Snapshot {
            at: Timestamp::from_unix(now - n * 600),
            seq: 1,
        })
        .collect();
    assert!(plan_retention(ts(NOW), &all).is_empty());
}

#[test]
fn from_24_hours_on_only_the_newest_in_each_hour_is_kept() {
    // Three days old, three in one hour: the newest stays.
    assert_eq!(
        deleted(
            NOW,
            &[
                "2026-09-18T12:00:00Z",
                "2026-09-18T12:10:00Z",
                "2026-09-18T12:20:00Z",
            ]
        ),
        ["2026-09-18T12:00:00Z", "2026-09-18T12:10:00Z"]
    );
    // One in each of three hours: none goes.
    assert!(deleted(
        NOW,
        &[
            "2026-09-18T12:20:00Z",
            "2026-09-18T13:20:00Z",
            "2026-09-18T14:20:00Z",
        ]
    )
    .is_empty());
}

#[test]
fn from_7_days_on_only_the_newest_on_each_day_is_kept() {
    // A month old, three on one day: 17:00 stays.
    assert_eq!(
        deleted(
            NOW,
            &[
                "2026-08-21T08:00:00Z",
                "2026-08-21T09:00:00Z",
                "2026-08-21T17:00:00Z",
            ]
        ),
        ["2026-08-21T08:00:00Z", "2026-08-21T09:00:00Z"]
    );
    // One on each of three days: none goes. The UTC day ends at midnight.
    assert!(deleted(
        NOW,
        &[
            "2026-08-21T23:59:59Z",
            "2026-08-22T00:00:00Z",
            "2026-08-23T12:00:00Z",
        ]
    )
    .is_empty());
}

#[test]
fn from_90_days_on_only_the_newest_in_each_week_is_kept() {
    // The week of Monday 18 May 2026 to Sunday 24 May: Sunday 23:00 stays.
    assert_eq!(
        deleted(
            NOW,
            &[
                "2026-05-18T09:00:00Z",
                "2026-05-20T09:00:00Z",
                "2026-05-24T23:00:00Z",
            ]
        ),
        ["2026-05-18T09:00:00Z", "2026-05-20T09:00:00Z"]
    );
}

#[test]
fn weeks_start_on_monday() {
    // Sunday 23:59:59 and Monday 00:00:00 are in different weeks.
    assert!(deleted(NOW, &["2026-05-24T23:59:59Z", "2026-05-25T00:00:00Z"]).is_empty());
    // Monday 00:00:00 and Sunday 23:59:59 of the same week are in one.
    assert_eq!(
        deleted(NOW, &["2026-05-18T00:00:00Z", "2026-05-24T23:59:59Z"]),
        ["2026-05-18T00:00:00Z"]
    );
}

#[test]
fn a_snapshot_alone_in_its_week_is_kept_however_old() {
    assert!(deleted(NOW, &["2021-09-21T00:00:00Z"]).is_empty());
    assert!(deleted(NOW, &["1990-01-01T00:00:00Z"]).is_empty());
}

#[test]
fn a_snapshot_is_judged_by_its_own_age() {
    // 23 h 30 min old and exactly 24 h old share a clock hour, but the first
    // is kept for being recent and the second is the one of its hour.
    assert!(deleted(NOW, &["2026-09-20T00:00:00Z", "2026-09-20T00:30:00Z"]).is_empty());
    // Exactly 7 days old goes by the day, and 12 hours younger by the hour,
    // so the two are not in one bucket even on the same date.
    assert!(deleted(NOW, &["2026-09-14T00:00:00Z", "2026-09-14T12:00:00Z"]).is_empty());
    // Exactly 90 days old goes by the week, and 12 hours younger by the day.
    assert!(deleted(NOW, &["2026-06-23T00:00:00Z", "2026-06-23T12:00:00Z"]).is_empty());
}

#[test]
fn snapshots_from_the_same_second_are_told_apart_by_their_suffix() {
    let at = ts("2026-08-21T08:00:00Z");
    let same_second = [
        Snapshot { at, seq: 1 },
        Snapshot { at, seq: 2 },
        Snapshot { at, seq: 3 },
    ];
    assert_eq!(
        plan_retention(ts(NOW), &same_second),
        vec![Snapshot { at, seq: 1 }, Snapshot { at, seq: 2 }]
    );
}

#[test]
fn a_snapshot_from_the_future_is_kept() {
    assert!(deleted(NOW, &["2026-09-22T00:00:00Z", "2026-09-22T00:00:01Z"]).is_empty());
}

#[test]
fn nothing_to_plan_deletes_nothing() {
    assert!(plan_retention(ts(NOW), &[]).is_empty());
}

/// Snapshots every 20 minutes for 200 days, the newest made at `now`.
/// Counts by age: 72 in the last 24 hours; 145 hours from 24 hours to 7 days
/// (each hour bucket is whole except the oldest, which loses its :00 snapshot
/// to the daily tier); 84 days from 90 days to 7 days; and 17 weeks beyond.
#[test]
fn snapshot_counts_match_the_policy_at_1_day_7_days_90_days_and_beyond() {
    let now = ts(NOW).unix();
    let all: Vec<Snapshot> = (0..=200 * 72)
        .map(|n| Snapshot {
            at: Timestamp::from_unix(now - n * 1_200),
            seq: 1,
        })
        .collect();
    assert_eq!(all.len(), 14_401);

    let doomed: BTreeSet<Snapshot> = plan_retention(ts(NOW), &all).into_iter().collect();
    let kept: Vec<i64> = all
        .iter()
        .filter(|s| !doomed.contains(s))
        .map(|s| now - s.at.unix())
        .collect();

    let count = |from: i64, to: i64| kept.iter().filter(|&&age| age >= from && age < to).count();
    assert_eq!(count(0, DAY), 72, "under 24 hours");
    assert_eq!(count(DAY, WEEK), 145, "24 hours to 7 days");
    assert_eq!(count(WEEK, 90 * DAY), 84, "7 to 90 days");
    assert_eq!(count(90 * DAY, i64::MAX), 17, "90 days and older");
    assert_eq!(kept.len(), 72 + 145 + 84 + 17);
}

/// The same 200 days made under a clock that moves on a day at a time and
/// prunes at the end of each day, as the application does with every save.
/// Snapshots get older tier by tier, and none of the hours, days and weeks
/// that had a snapshot is left without one.
#[test]
fn pruning_as_time_passes_leaves_no_gap_in_any_tier() {
    let start = ts(NOW).unix() - 200 * DAY;
    let mut live: Vec<Snapshot> = Vec::new();
    for day in 0..200 {
        let clock = start + day * DAY;
        live.extend((0..72).map(|n| Snapshot {
            at: Timestamp::from_unix(clock + n * 1_200),
            seq: 1,
        }));
        let now = Timestamp::from_unix(clock + DAY);
        let doomed: BTreeSet<Snapshot> = plan_retention(now, &live).into_iter().collect();
        live.retain(|s| !doomed.contains(s));
    }
    let now = ts(NOW).unix();
    let count = |from: i64, to: i64| {
        live.iter()
            .filter(|s| {
                let age = now - s.at.unix();
                age >= from && age < to
            })
            .count()
    };
    // The newest snapshot is 20 minutes old, so one fewer than above is
    // within the last 24 hours.
    assert_eq!(count(0, DAY), 71, "under 24 hours");
    assert_eq!(count(DAY, WEEK), 145, "24 hours to 7 days");
    assert_eq!(count(WEEK, 90 * DAY), 84, "7 to 90 days");
    assert_eq!(count(90 * DAY, i64::MAX), 17, "90 days and older");
}

/// The bucket a snapshot would be kept for, by the words of the policy.
fn tier_and_bucket(now: i64, at: i64) -> (u8, i64) {
    let age = now - at;
    if age < DAY {
        (0, at) // never shared: every one is its own
    } else if age < WEEK {
        (1, at.div_euclid(HOUR))
    } else if age < 90 * DAY {
        (2, at.div_euclid(DAY))
    } else {
        // 1970-01-01 was a Thursday, three days after a Monday.
        (3, (at.div_euclid(DAY) + 3).div_euclid(7))
    }
}

fn arbitrary_snapshots() -> impl Strategy<Value = (i64, Vec<Snapshot>)> {
    // Anywhere from 1970 to 2100, so every tier and the weekly tail occur.
    let now = 0i64..4_102_444_800;
    let ages = prop::collection::vec((-2 * DAY..3_000 * DAY, 1u32..4), 0..60);
    (now, ages).prop_map(|(now, ages)| {
        let mut snapshots: Vec<Snapshot> = ages
            .into_iter()
            .map(|(age, seq)| Snapshot {
                at: Timestamp::from_unix(now - age),
                seq,
            })
            .collect();
        snapshots.sort();
        snapshots.dedup();
        (now, snapshots)
    })
}

proptest! {
    /// Only snapshots that were given can be deleted, each once.
    #[test]
    fn history_retention_plans_only_what_exists((now, snapshots) in arbitrary_snapshots()) {
        let plan = plan_retention(Timestamp::from_unix(now), &snapshots);
        let unique: BTreeSet<_> = plan.iter().copied().collect();
        prop_assert_eq!(unique.len(), plan.len());
        prop_assert!(plan.iter().all(|s| snapshots.contains(s)));
    }

    /// Nothing younger than 24 hours, and never the newest, is deleted.
    #[test]
    fn history_retention_never_deletes_recent_or_newest((now, snapshots) in arbitrary_snapshots()) {
        let plan = plan_retention(Timestamp::from_unix(now), &snapshots);
        for gone in &plan {
            prop_assert!(now - gone.at.unix() >= DAY);
        }
        if let Some(newest) = snapshots.iter().max() {
            prop_assert!(!plan.contains(newest));
        }
    }

    /// What is left holds at most one snapshot per bucket from 24 hours on.
    #[test]
    fn history_retention_leaves_one_per_bucket((now, snapshots) in arbitrary_snapshots()) {
        let doomed: BTreeSet<_> =
            plan_retention(Timestamp::from_unix(now), &snapshots).into_iter().collect();
        let mut seen = BTreeSet::new();
        for s in snapshots.iter().filter(|s| !doomed.contains(s)) {
            let (tier, bucket) = tier_and_bucket(now, s.at.unix());
            if tier > 0 {
                prop_assert!(seen.insert((tier, bucket)), "two left in {tier}/{bucket}");
            }
        }
    }

    /// The one kept in a bucket is its newest.
    #[test]
    fn history_retention_keeps_the_newest_in_a_bucket((now, snapshots) in arbitrary_snapshots()) {
        let doomed: BTreeSet<_> =
            plan_retention(Timestamp::from_unix(now), &snapshots).into_iter().collect();
        for gone in &doomed {
            let key = tier_and_bucket(now, gone.at.unix());
            let survivor = snapshots
                .iter()
                .filter(|s| !doomed.contains(s) && tier_and_bucket(now, s.at.unix()) == key)
                .max();
            prop_assert!(survivor.is_some_and(|kept| kept > gone));
        }
    }

    /// Planning again on what is left deletes nothing, and the order the
    /// snapshots come in does not matter.
    #[test]
    fn history_retention_is_idempotent_and_order_free((now, snapshots) in arbitrary_snapshots()) {
        let now = Timestamp::from_unix(now);
        let plan = plan_retention(now, &snapshots);
        let left: Vec<Snapshot> = snapshots.iter().copied().filter(|s| !plan.contains(s)).collect();
        prop_assert!(plan_retention(now, &left).is_empty());

        let mut reversed = snapshots.clone();
        reversed.reverse();
        let mut again = plan_retention(now, &reversed);
        let mut first = plan;
        first.sort();
        again.sort();
        prop_assert_eq!(first, again);
    }
}
