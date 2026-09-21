//! The timestamp in the names of snapshots, trash folders and backups.

use nb_fs::history::{format_stamp, parse_stamp, Snapshot};

use super::ts;

#[test]
fn a_stamp_is_utc_with_hyphens_where_rfc_3339_has_colons() {
    assert_eq!(
        format_stamp(ts("2026-09-21T10:15:00Z")),
        "2026-09-21T10-15-00Z"
    );
    assert_eq!(
        format_stamp(ts("2026-01-02T03:04:05Z")),
        "2026-01-02T03-04-05Z"
    );
}

#[test]
fn a_stamp_reads_back_as_the_same_moment() {
    for text in [
        "2026-09-21T10:15:00Z",
        "1970-01-01T00:00:00Z",
        "2024-02-29T23:59:59Z",
    ] {
        assert_eq!(
            parse_stamp(&format_stamp(ts(text))),
            Some(ts(text)),
            "{text}"
        );
    }
}

#[test]
fn only_the_exact_form_is_a_stamp() {
    for text in [
        "",
        "2026-09-21T10:15:00Z",
        "2026-09-21T10-15-00",
        "2026-09-21 10-15-00Z",
        "2026-09-21T10-15-00+01-00",
        "20260921T101500Z",
        "2026-13-01T10-15-00Z",
        "2026-02-30T10-15-00Z",
        "2026-09-21T24-00-00Z",
        "2026-09-21T10-15-00Z-2",
    ] {
        assert_eq!(parse_stamp(text), None, "{text:?}");
    }
}

#[test]
fn the_first_snapshot_in_a_second_has_no_suffix_and_the_next_ones_count_up() {
    let at = ts("2026-09-21T10:15:00Z");
    let name = |seq| Snapshot { at, seq }.file_stem();
    assert_eq!(name(1), "2026-09-21T10-15-00Z");
    assert_eq!(name(2), "2026-09-21T10-15-00Z-2");
    assert_eq!(name(13), "2026-09-21T10-15-00Z-13");
}

#[test]
fn a_snapshot_stem_reads_back_and_other_stems_do_not() {
    let at = ts("2026-09-21T10:15:00Z");
    for seq in [1, 2, 13] {
        let snapshot = Snapshot { at, seq };
        assert_eq!(Snapshot::parse_stem(&snapshot.file_stem()), Some(snapshot));
    }
    for stem in [
        "",
        "notes",
        // A suffix of 1 or 0, or with a leading zero, is not what is written.
        "2026-09-21T10-15-00Z-1",
        "2026-09-21T10-15-00Z-0",
        "2026-09-21T10-15-00Z-02",
        "2026-09-21T10-15-00Z-",
        "2026-09-21T10-15-00Z-x",
        "2026-09-21T10-15-00Z-2-3",
    ] {
        assert_eq!(Snapshot::parse_stem(stem), None, "{stem:?}");
    }
}

#[test]
fn snapshots_sort_by_time_then_by_suffix() {
    let early = ts("2026-09-21T10:15:00Z");
    let late = ts("2026-09-21T10:15:01Z");
    let mut snapshots = vec![
        Snapshot { at: late, seq: 1 },
        Snapshot { at: early, seq: 2 },
        Snapshot { at: early, seq: 1 },
    ];
    snapshots.sort();
    assert_eq!(
        snapshots,
        vec![
            Snapshot { at: early, seq: 1 },
            Snapshot { at: early, seq: 2 },
            Snapshot { at: late, seq: 1 },
        ]
    );
}
