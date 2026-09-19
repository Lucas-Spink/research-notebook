//! RFC 3339 in UTC with `Z` and second precision (spec 5.2), which is all
//! that `.lock` holds. Written and read by hand so no date crate is needed.

use nb_fs::lock::{LockInfo, Timestamp};
use proptest::prelude::*;

/// 0000-01-01T00:00:00Z and 9999-12-31T23:59:59Z.
const FIRST: i64 = -62_167_219_200;
const LAST: i64 = 253_402_300_799;

#[test]
fn known_moments_format_as_expected() {
    for (unix, text) in [
        (0, "1970-01-01T00:00:00Z"),
        (-1, "1969-12-31T23:59:59Z"),
        (951_868_800, "2000-03-01T00:00:00Z"),
        (1_709_164_800, "2024-02-29T00:00:00Z"),
        (1_789_812_000, "2026-09-19T10:00:00Z"),
        (2_147_483_647, "2038-01-19T03:14:07Z"),
        (FIRST, "0000-01-01T00:00:00Z"),
        (LAST, "9999-12-31T23:59:59Z"),
    ] {
        assert_eq!(Timestamp::from_unix(unix).to_rfc3339(), text);
        assert_eq!(
            Timestamp::parse_rfc3339(text).map(Timestamp::unix),
            Some(unix)
        );
    }
}

#[test]
fn anything_but_second_precision_utc_is_refused() {
    for text in [
        "",
        "2026-09-19",
        "2026-09-19T10:00:00",
        "2026-09-19T10:00:00z",
        "2026-09-19t10:00:00Z",
        "2026-09-19 10:00:00Z",
        "2026-09-19T10:00:00+00:00",
        "2026-09-19T10:00:00.5Z",
        "2026-09-19T10:00:00Z ",
        " 2026-09-19T10:00:00Z",
        "2026-09-19T10:00:00ZZ",
        "12026-09-19T10:00:00Z",
        "26-09-19T10:00:00Z",
        "2026-13-19T10:00:00Z",
        "2026-00-19T10:00:00Z",
        "2026-09-00T10:00:00Z",
        "2026-09-31T10:00:00Z",
        "2026-02-29T10:00:00Z",
        "1900-02-29T10:00:00Z",
        "2026-09-19T24:00:00Z",
        "2026-09-19T10:60:00Z",
        "2026-09-19T10:00:60Z",
        "2026-09-19T1\u{0660}:00:00Z",
        "+026-09-19T10:00:00Z",
    ] {
        assert_eq!(Timestamp::parse_rfc3339(text), None, "{text:?}");
    }
}

#[test]
fn leap_days_are_accepted_only_in_leap_years() {
    for text in ["2024-02-29T00:00:00Z", "2000-02-29T00:00:00Z"] {
        assert!(Timestamp::parse_rfc3339(text).is_some(), "{text}");
    }
    for text in ["2025-02-29T00:00:00Z", "2100-02-29T00:00:00Z"] {
        assert!(Timestamp::parse_rfc3339(text).is_none(), "{text}");
    }
}

proptest! {
    #[test]
    fn a_timestamp_survives_formatting_and_parsing(unix in FIRST..=LAST) {
        let text = Timestamp::from_unix(unix).to_rfc3339();
        prop_assert_eq!(text.len(), 20);
        prop_assert_eq!(Timestamp::parse_rfc3339(&text), Some(Timestamp::from_unix(unix)));
    }

    /// Text order is time order, which is why the format was chosen.
    #[test]
    fn formatted_timestamps_sort_as_the_moments_do(a in FIRST..=LAST, b in FIRST..=LAST) {
        let (ta, tb) = (Timestamp::from_unix(a).to_rfc3339(), Timestamp::from_unix(b).to_rfc3339());
        prop_assert_eq!(a.cmp(&b), ta.cmp(&tb));
    }

    #[test]
    fn lock_text_survives_writing_and_reading(
        host in "[^\\p{Cc}]{1,40}",
        pid in 1u32..,
        opened in FIRST..=LAST,
        heartbeat in FIRST..=LAST,
    ) {
        let info = LockInfo {
            host,
            pid,
            app_version: "1.2.3".to_owned(),
            opened: Timestamp::from_unix(opened),
            heartbeat: Timestamp::from_unix(heartbeat),
        };
        let text = info.to_file_text();
        prop_assert!(text.ends_with('\n'));
        prop_assert_eq!(LockInfo::parse(text.as_bytes()), Some(info));
    }
}
