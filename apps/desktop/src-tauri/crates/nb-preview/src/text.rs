//! Script and text previews (spec 8): the first 500 lines of a file, from a
//! read of at most 1 MiB, shown monospaced by the webview.

use std::io::Read;

use crate::encoding::{decode_text, read_bounded, whole_lines, TextEncoding};
use crate::PreviewError;

/// Bytes read at most (1 MiB).
pub const TEXT_READ: u64 = 1024 * 1024;
/// Lines shown at most.
pub const TEXT_LINES: usize = 500;

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
    let read = read_bounded(reader, TEXT_READ, None)?;
    let (text, encoding) = decode_text(&read.bytes, read.complete);
    let text = if read.complete {
        &text[..]
    } else {
        whole_lines(&text)
    };
    let mut lines: Vec<String> = text
        .lines()
        .take(TEXT_LINES + 1)
        .map(str::to_owned)
        .collect();
    let all_lines = lines.len() <= TEXT_LINES;
    lines.truncate(TEXT_LINES);
    Ok(TextSample {
        lines,
        encoding,
        complete: read.complete && all_lines,
    })
}
