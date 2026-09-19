//! The repository hygiene entries of spec 5.12, added to the project root
//! `.gitignore` and `.gitattributes` when a project is created.
//!
//! These are the only files the application writes outside `_notebook/`
//! (FR-PRJ-01). The two names are fixed and existing lines are never
//! removed or changed.

use std::fs;
use std::io;

use crate::atomic::{self, Destination, RealIo};
use crate::error::WriteError;
use crate::project::ProjectRoot;
use crate::target::check_target;

/// One of the two repository files the application appends to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HygieneFile {
    GitIgnore,
    GitAttributes,
}

impl HygieneFile {
    /// Both files, in the order they are handled.
    pub const ALL: [HygieneFile; 2] = [HygieneFile::GitIgnore, HygieneFile::GitAttributes];

    /// The file's name at the project root.
    pub fn file_name(self) -> &'static str {
        match self {
            Self::GitIgnore => ".gitignore",
            Self::GitAttributes => ".gitattributes",
        }
    }

    /// The comment that introduces the entries, as spec 5.12 words it.
    pub fn header(self) -> &'static str {
        match self {
            Self::GitIgnore => "# .gitignore (added by Research Notebook)",
            Self::GitAttributes => "# .gitattributes (added by Research Notebook)",
        }
    }

    /// The entries to add. The evidence and methods folders are left out of
    /// `.gitignore` when the project keeps evidence in git.
    pub fn lines(self, evidence_in_git: bool) -> Vec<&'static str> {
        match self {
            Self::GitIgnore => {
                let mut lines = vec![
                    "_notebook/.lock",
                    "_notebook/.history/",
                    "_notebook/.trash/",
                    "_notebook/inbox/",
                    "_notebook/backups/",
                ];
                if !evidence_in_git {
                    lines.push("_notebook/experiments/*/evidence/");
                    lines.push("_notebook/experiments/*/methods/");
                }
                lines
            }
            Self::GitAttributes => vec![
                "_notebook/**/*.md text eol=lf",
                "_notebook/**/*.yaml text eol=lf",
                "_notebook/**/*.json text eol=lf",
                "_notebook/**/*.csl text eol=lf",
            ],
        }
    }
}

/// What happened to one hygiene file.
#[derive(Debug)]
pub enum HygieneOutcome {
    /// Entries were appended, or the file was created.
    Added,
    /// Every entry was already present, so the file was not touched.
    Unchanged,
    /// The file could not be updated, for instance because it is a link or
    /// read-only. The project is still created; the person can add the
    /// entries themselves.
    Failed(WriteError),
}

/// A line without its line ending or trailing blanks, which git ignores.
fn trimmed(line: &[u8]) -> &[u8] {
    let end = line
        .iter()
        .rposition(|b| !matches!(b, b'\r' | b' ' | b'\t'))
        .map_or(0, |i| i + 1);
    &line[..end]
}

fn has_line(content: &[u8], wanted: &str) -> bool {
    content
        .split(|b| *b == b'\n')
        .any(|line| trimmed(line) == wanted.as_bytes())
}

/// The content of a hygiene file after adding whichever of `lines` it does
/// not have yet, or `None` when it has them all. Existing bytes are kept as
/// they are; new lines follow them, in the file's own line ending, under
/// `header` unless that is already there.
pub fn append_missing_lines(existing: &[u8], header: &str, lines: &[&str]) -> Option<Vec<u8>> {
    let missing: Vec<&str> = lines
        .iter()
        .copied()
        .filter(|line| !has_line(existing, line))
        .collect();
    if missing.is_empty() {
        return None;
    }
    let eol: &[u8] = match existing.iter().position(|b| *b == b'\n') {
        Some(i) if i > 0 && existing.get(i - 1) == Some(&b'\r') => b"\r\n",
        _ => b"\n",
    };
    let mut out = existing.to_vec();
    if !out.is_empty() && !out.ends_with(b"\n") {
        out.extend_from_slice(eol);
    }
    let mut add = |line: &str| {
        out.extend_from_slice(line.as_bytes());
        out.extend_from_slice(eol);
    };
    if !has_line(existing, header) {
        add(header);
    }
    for line in missing {
        add(line);
    }
    Some(out)
}

impl ProjectRoot {
    /// Adds the missing entries of `file` to the project root. The root is
    /// the parent of `_notebook/`, which was resolved when this was opened.
    pub(crate) fn add_hygiene(&self, file: HygieneFile, evidence_in_git: bool) -> HygieneOutcome {
        match self.try_add_hygiene(file, evidence_in_git) {
            Ok(true) => HygieneOutcome::Added,
            Ok(false) => HygieneOutcome::Unchanged,
            Err(error) => HygieneOutcome::Failed(error),
        }
    }

    fn try_add_hygiene(
        &self,
        file: HygieneFile,
        evidence_in_git: bool,
    ) -> Result<bool, WriteError> {
        let display = file.file_name();
        let Some(root) = self.notebook.parent() else {
            return Err(WriteError::OutsideNotebook {
                path: display.to_owned(),
            });
        };
        let permissions = check_target(root, display, display)?;
        let existing = match fs::read(root.join(display)) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == io::ErrorKind::NotFound => Vec::new(),
            Err(source) => {
                return Err(WriteError::Io {
                    operation: "read",
                    path: display.to_owned(),
                    source,
                })
            }
        };
        let Some(updated) =
            append_missing_lines(&existing, file.header(), &file.lines(evidence_in_git))
        else {
            return Ok(false);
        };
        let destination = Destination {
            dir: root,
            name: display,
            display,
            permissions,
        };
        atomic::write(&mut RealIo, &destination, &updated)?;
        Ok(true)
    }
}
