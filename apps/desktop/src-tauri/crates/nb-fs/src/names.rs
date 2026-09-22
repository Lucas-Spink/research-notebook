//! Windows-safe file names (spec 9.2), used both for path validation and for
//! naming captured evidence (FR-EVD-04).

use unicode_normalization::UnicodeNormalization;

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

/// Longest name [`sanitise`] produces (S3-G10).
const MAX_LEN: usize = 64;

/// Used when nothing usable survives sanitising (an empty name, or one made
/// only of characters that had to be replaced or trimmed).
const FALLBACK: &str = "file";

/// Whether `name` is one Windows treats as an ordinary file or folder (spec
/// 9.2), with no device, alternate-data-stream or trailing-dot meaning.
/// Checked on every platform so a project stays portable.
pub fn is_windows_safe(name: &str) -> bool {
    if name.is_empty() || name.ends_with('.') || name.ends_with(' ') {
        return false;
    }
    if name
        .chars()
        .any(|c| FORBIDDEN.contains(&c) || c.is_control())
    {
        return false;
    }
    let stem = name.split('.').next().unwrap_or(name);
    !RESERVED
        .iter()
        .any(|reserved| stem.eq_ignore_ascii_case(reserved))
}

/// As [`is_windows_safe`], for one segment of a project-relative path.
pub(crate) fn is_windows_safe_segment(segment: &str) -> bool {
    is_windows_safe(segment)
}

/// Splits `name` at its last `.`, so `"a.b.c"` is `("a.b", ".c")`. A name
/// with no dot, or only a leading one (`".gitignore"`), has no extension.
pub(crate) fn split_extension(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(0) | None => (name, ""),
        Some(i) => (&name[..i], &name[i..]),
    }
}

/// Trims trailing dots and spaces, which Windows drops from a name (spec 9.2).
fn trim_unsafe_end(name: &str) -> &str {
    name.trim_end_matches(['.', ' '])
}

/// Turns an arbitrary name into one [`is_windows_safe`] accepts, at most
/// [`MAX_LEN`] characters long (S3-G10, FR-EVD-04): normalises to Unicode
/// NFC, replaces characters Windows forbids, control characters and path
/// separators (which would otherwise split it into more than one segment)
/// with `_`, trims a trailing dot or space, and falls back to a fixed name if
/// nothing usable is left. A reserved device name is escaped with a
/// trailing `_`.
///
/// Idempotent: sanitising an already-safe name returns it unchanged, so it
/// is safe to call again on a name this function already produced.
pub fn sanitise(name: &str) -> String {
    let mut cleaned: String = name
        .nfc()
        .map(|c| {
            if c.is_control() || c == '/' || c == '\\' || FORBIDDEN.contains(&c) {
                '_'
            } else {
                c
            }
        })
        .collect();

    cleaned = trim_unsafe_end(&cleaned).to_owned();
    if cleaned.is_empty() {
        cleaned = FALLBACK.to_owned();
    }

    if cleaned.chars().count() > MAX_LEN {
        cleaned = cleaned.chars().take(MAX_LEN).collect();
        cleaned = trim_unsafe_end(&cleaned).to_owned();
        if cleaned.is_empty() {
            cleaned = FALLBACK.to_owned();
        }
    }

    let stem = cleaned.split('.').next().unwrap_or(&cleaned).to_owned();
    if RESERVED
        .iter()
        .any(|reserved| stem.eq_ignore_ascii_case(reserved))
    {
        // Escaped right after the stem, not at the end, because a reserved
        // name is decided by the text before the first dot: "CON.txt" is
        // unsafe, but "CON_.txt" is not.
        if cleaned.chars().count() >= MAX_LEN {
            cleaned.pop();
        }
        let stem_chars = stem.chars().count();
        let byte_index = cleaned
            .char_indices()
            .nth(stem_chars)
            .map(|(i, _)| i)
            .unwrap_or(cleaned.len());
        cleaned.insert(byte_index, '_');
    }

    debug_assert!(is_windows_safe(&cleaned));
    debug_assert!(cleaned.chars().count() <= MAX_LEN);
    cleaned
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_an_already_safe_name() {
        assert_eq!(sanitise("figure.png"), "figure.png");
    }

    #[test]
    fn replaces_forbidden_characters() {
        assert_eq!(sanitise("a<b>c:d\"e|f?g*h"), "a_b_c_d_e_f_g_h");
    }

    #[test]
    fn replaces_path_separators() {
        assert_eq!(sanitise("a/b\\c"), "a_b_c");
    }

    #[test]
    fn trims_trailing_dots_and_spaces() {
        assert_eq!(sanitise("name. "), "name");
    }

    #[test]
    fn escapes_a_reserved_device_name() {
        assert_eq!(sanitise("CON"), "CON_");
        assert!(is_windows_safe(&sanitise("CON")));
        // The stem (before the first dot) is what Windows checks, so the
        // escape goes there, not at the very end.
        assert_eq!(sanitise("CON.txt"), "CON_.txt");
        assert!(is_windows_safe(&sanitise("CON.txt")));
    }

    #[test]
    fn falls_back_when_nothing_survives() {
        assert_eq!(sanitise(""), FALLBACK);
        assert_eq!(sanitise("..."), FALLBACK);
        assert_eq!(sanitise("<<<"), "___");
    }

    #[test]
    fn truncates_long_names() {
        let long = "a".repeat(200);
        let out = sanitise(&long);
        assert_eq!(out.chars().count(), MAX_LEN);
    }

    #[test]
    fn splits_extension_at_the_last_dot() {
        assert_eq!(split_extension("a.b.c"), ("a.b", ".c"));
        assert_eq!(split_extension("noext"), ("noext", ""));
        assert_eq!(split_extension(".gitignore"), (".gitignore", ""));
    }
}
