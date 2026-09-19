use std::fmt;

use unicode_normalization::UnicodeNormalization;

use crate::error::PathError;

/// A validated path relative to a project root: forward slashes, Unicode
/// NFC, no `.` or `..`, no absolute or drive-letter form (spec 5.2, 9.3).
///
/// Validation is lexical. Whether the path stays inside the project once
/// links are resolved is decided when it is used ([`crate::ProjectRoot`]).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ProjectRelPath(String);

impl ProjectRelPath {
    /// Normalises `input` (backslashes to `/`, then NFC) and validates it.
    ///
    /// Backslashes are converted because paths reach the backend from
    /// Windows; the application never creates a name containing one
    /// (spec 9.2), so none is lost.
    pub fn parse(input: &str) -> Result<Self, PathError> {
        let text: String = input.replace('\\', "/").nfc().collect();
        if text.is_empty() {
            return Err(PathError::Empty);
        }
        if text.starts_with('/') || has_drive_prefix(&text) {
            return Err(PathError::Absolute);
        }
        for segment in text.split('/') {
            if segment.is_empty() {
                return Err(PathError::EmptySegment);
            }
            if segment.chars().any(char::is_control) {
                return Err(PathError::ControlCharacter);
            }
            // Windows drops trailing dots and spaces, so `.. ` and `...`
            // name `..` and `.` there.
            if segment.trim_end_matches(['.', ' ']).is_empty() {
                return Err(PathError::Traversal);
            }
        }
        Ok(Self(text))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn segments(&self) -> impl Iterator<Item = &str> {
        self.0.split('/')
    }
}

impl fmt::Display for ProjectRelPath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// `C:` at the start, with or without a following separator.
fn has_drive_prefix(text: &str) -> bool {
    let mut chars = text.chars();
    matches!((chars.next(), chars.next()), (Some(letter), Some(':')) if letter.is_ascii_alphabetic())
}
