use std::fmt;

use crate::error::PathError;

/// A validated path relative to a project root: forward slashes, Unicode
/// NFC, no `.` or `..`, no absolute or drive-letter form (spec 5.2, 9.3).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ProjectRelPath(String);

impl ProjectRelPath {
    /// Normalises `input` (backslashes to `/`, then NFC) and validates it.
    pub fn parse(_input: &str) -> Result<Self, PathError> {
        Err(PathError::Empty)
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
