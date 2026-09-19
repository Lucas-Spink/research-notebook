use std::time::{SystemTime, UNIX_EPOCH};

/// 0000-01-01T00:00:00Z and 9999-12-31T23:59:59Z: what four digits can show.
const FIRST_UNIX: i64 = -62_167_219_200;
const LAST_UNIX: i64 = 253_402_300_799;
const SECONDS_PER_DAY: i64 = 86_400;
/// `YYYY-MM-DDTHH:MM:SSZ`.
const TEXT_LEN: usize = 20;

/// A moment in whole seconds since 1970-01-01T00:00:00Z.
///
/// Written and read as RFC 3339 in UTC with `Z` and second precision (spec
/// 5.2), the only form `.lock` uses. Done by hand, with the civil-date
/// algorithms from Howard Hinnant's "chrono-Compatible Low-Level Date
/// Algorithms", so the crate needs no date library.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Timestamp(i64);

impl Timestamp {
    pub fn from_unix(seconds: i64) -> Self {
        Self(seconds)
    }

    pub fn unix(self) -> i64 {
        self.0
    }

    /// The current time. A clock set before 1970 reads as 1970.
    pub fn now() -> Self {
        let seconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |since| {
                i64::try_from(since.as_secs()).unwrap_or(i64::MAX)
            });
        Self(seconds)
    }

    /// `2026-09-19T10:00:00Z`. A moment outside years 0000 to 9999 is shown
    /// as the nearest one that fits; no real lock is ever that far away.
    pub fn to_rfc3339(self) -> String {
        let clamped = self.0.clamp(FIRST_UNIX, LAST_UNIX);
        let days = clamped.div_euclid(SECONDS_PER_DAY);
        let seconds = clamped.rem_euclid(SECONDS_PER_DAY);
        let (year, month, day) = civil_from_days(days);
        format!(
            "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
            seconds / 3600,
            seconds % 3600 / 60,
            seconds % 60,
        )
    }

    /// Reads exactly the form [`Timestamp::to_rfc3339`] writes. Any other
    /// spelling of a moment, and any date that does not exist, is `None`.
    pub fn parse_rfc3339(text: &str) -> Option<Self> {
        let bytes = text.as_bytes();
        if bytes.len() != TEXT_LEN {
            return None;
        }
        let separators = [
            (4, b'-'),
            (7, b'-'),
            (10, b'T'),
            (13, b':'),
            (16, b':'),
            (19, b'Z'),
        ];
        if separators
            .iter()
            .any(|&(at, expected)| bytes[at] != expected)
        {
            return None;
        }
        let number = |from: usize, to: usize| -> Option<i64> {
            let digits = &bytes[from..to];
            if digits.iter().all(u8::is_ascii_digit) {
                digits
                    .iter()
                    .try_fold(0i64, |sum, digit| Some(sum * 10 + i64::from(digit - b'0')))
            } else {
                None
            }
        };
        let (year, month, day) = (number(0, 4)?, number(5, 7)?, number(8, 10)?);
        let (hour, minute, second) = (number(11, 13)?, number(14, 16)?, number(17, 19)?);
        let valid = (1..=12).contains(&month)
            && day >= 1
            && day <= days_in_month(year, month)
            && hour < 24
            && minute < 60
            && second < 60;
        valid.then(|| {
            Self(
                days_from_civil(year, month, day) * SECONDS_PER_DAY
                    + hour * 3600
                    + minute * 60
                    + second,
            )
        })
    }
}

fn is_leap_year(year: i64) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        2 if is_leap_year(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

/// Days since 1970-01-01 of a valid proleptic Gregorian date.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let shifted_month = if month > 2 { month - 3 } else { month + 9 };
    let day_of_year = (153 * shifted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// The year, month and day that is `days` after 1970-01-01.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let days = days + 719_468;
    let era = days.div_euclid(146_097);
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
    let month = if shifted_month < 10 {
        shifted_month + 3
    } else {
        shifted_month - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    (year, month, day)
}
