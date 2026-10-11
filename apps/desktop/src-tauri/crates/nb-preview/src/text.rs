//! Script and text previews (spec 8): the first 500 lines of a file, from a
//! read of at most 1 MiB, shown monospaced by the webview. The script viewer
//! (issue #104) reads further, since a script is read through, not skimmed.

use std::io::Read;

use crate::encoding::{decode_text, read_bounded, whole_lines, TextEncoding};
use crate::PreviewError;

/// Bytes read at most (1 MiB).
pub const TEXT_READ: u64 = 1024 * 1024;
/// Lines shown at most.
pub const TEXT_LINES: usize = 500;

/// Bytes of a script read at most (4 MiB), for the script viewer.
pub const SCRIPT_READ: u64 = 4 * 1024 * 1024;
/// Lines of a script shown at most.
pub const SCRIPT_LINES: usize = 20_000;

/// What a text preview shows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextSample {
    /// Lines without their line breaks.
    pub lines: Vec<String>,
    pub encoding: TextEncoding,
    /// Whether the lines are the whole file.
    pub complete: bool,
}

/// The first lines of `reader`, reading at most [`TEXT_READ`] bytes. A line
/// the read limit cut short is left out.
pub fn sample_text<R: Read>(reader: R) -> Result<TextSample, PreviewError> {
    sample_within(reader, TEXT_READ, TEXT_LINES)
}

/// The lines of a script for the viewer, reading at most [`SCRIPT_READ`]
/// bytes and showing at most [`SCRIPT_LINES`] lines.
pub fn sample_script<R: Read>(reader: R) -> Result<TextSample, PreviewError> {
    sample_within(reader, SCRIPT_READ, SCRIPT_LINES)
}

fn sample_within<R: Read>(
    reader: R,
    read_limit: u64,
    max_lines: usize,
) -> Result<TextSample, PreviewError> {
    let read = read_bounded(reader, read_limit, None)?;
    let (text, encoding) = decode_text(&read.bytes, read.complete);
    let text = if read.complete {
        &text[..]
    } else {
        whole_lines(&text)
    };
    let mut lines: Vec<String> = text
        .lines()
        .take(max_lines + 1)
        .map(str::to_owned)
        .collect();
    let all_lines = lines.len() <= max_lines;
    lines.truncate(max_lines);
    Ok(TextSample {
        lines,
        encoding,
        complete: read.complete && all_lines,
    })
}
