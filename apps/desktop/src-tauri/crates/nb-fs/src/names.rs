/// Device names Windows reserves, with or without an extension (spec 9.2).
/// The superscript digits are reserved by current Windows as well.
const RESERVED: [&str; 28] = [
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
    "COM\u{b9}",
    "COM\u{b2}",
    "COM\u{b3}",
    "LPT\u{b9}",
    "LPT\u{b2}",
    "LPT\u{b3}",
];

const FORBIDDEN: [char; 7] = ['<', '>', ':', '"', '|', '?', '*'];

/// Whether one path segment is a name Windows treats as an ordinary file or
/// folder (spec 9.2). Refusing the others on every platform keeps a project
/// portable, and keeps a write from reaching a device (`CON`), an alternate
/// data stream (`name:stream`) or a differently named file (trailing dot).
pub(crate) fn is_windows_safe_segment(segment: &str) -> bool {
    if segment.ends_with('.') || segment.ends_with(' ') {
        return false;
    }
    if segment
        .chars()
        .any(|c| FORBIDDEN.contains(&c) || c.is_control())
    {
        return false;
    }
    let stem = segment.split('.').next().unwrap_or(segment);
    !RESERVED
        .iter()
        .any(|reserved| stem.eq_ignore_ascii_case(reserved))
}
