//! Text encodings a preview recognises (spec 8): UTF-8, UTF-8 with a
//! byte-order mark, and Windows-1252 for anything that is not UTF-8, which is
//! what spreadsheet software on Windows commonly writes.

use std::io::{self, Read};

/// How a preview decoded the bytes it read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextEncoding {
    Utf8,
    Utf8Bom,
    Windows1252,
}

const BOM: &[u8] = b"\xEF\xBB\xBF";

/// Windows-1252 bytes 0x80 to 0x9F, the only range that differs from
/// ISO-8859-1. The five unassigned bytes map to the C1 control of the same
/// value, as the WHATWG Encoding Standard does.
const CP1252_HIGH: [char; 32] = [
    '\u{20AC}', '\u{0081}', '\u{201A}', '\u{0192}', '\u{201E}', '\u{2026}', '\u{2020}', '\u{2021}',
    '\u{02C6}', '\u{2030}', '\u{0160}', '\u{2039}', '\u{0152}', '\u{008D}', '\u{017D}', '\u{008F}',
    '\u{0090}', '\u{2018}', '\u{2019}', '\u{201C}', '\u{201D}', '\u{2022}', '\u{2013}', '\u{2014}',
    '\u{02DC}', '\u{2122}', '\u{0161}', '\u{203A}', '\u{0153}', '\u{009D}', '\u{017E}', '\u{0178}',
];

/// Decodes `bytes` as UTF-8 if they are, after removing a byte-order mark,
/// and as Windows-1252 otherwise.
///
/// `complete` says whether `bytes` is the whole file. When it is not, the
/// read limit may have cut a UTF-8 character in two; those trailing bytes
/// are dropped instead of making the whole text Windows-1252.
pub fn decode_text(bytes: &[u8], complete: bool) -> (String, TextEncoding) {
    let (body, encoding) = match bytes.strip_prefix(BOM) {
        Some(rest) => (rest, TextEncoding::Utf8Bom),
        None => (bytes, TextEncoding::Utf8),
    };
    match std::str::from_utf8(body) {
        Ok(text) => (text.to_owned(), encoding),
        // `error_len() == None` means the bytes end part-way through a
        // character, which only a cut at the read limit explains.
        Err(e) if !complete && e.error_len().is_none() => {
            let valid = &body[..e.valid_up_to()];
            (String::from_utf8_lossy(valid).into_owned(), encoding)
        }
        Err(_) => (
            bytes.iter().map(|&b| windows_1252(b)).collect(),
            TextEncoding::Windows1252,
        ),
    }
}

fn windows_1252(byte: u8) -> char {
    match byte {
        0x80..=0x9F => CP1252_HIGH[usize::from(byte - 0x80)],
        _ => char::from(byte),
    }
}

/// Bytes read from the start of a file, at most a limit.
pub(crate) struct Bounded {
    pub bytes: Vec<u8>,
    /// Whether the bytes are the whole file.
    pub complete: bool,
}

/// Reads at most `limit` bytes. Never asks `reader` for more, so a file is
/// complete only if it ended before the limit, or `known_len` says it is
/// exactly as long as what was read.
pub(crate) fn read_bounded<R: Read>(
    reader: R,
    limit: u64,
    known_len: Option<u64>,
) -> io::Result<Bounded> {
    let mut bytes = Vec::new();
    reader.take(limit).read_to_end(&mut bytes)?;
    let read = bytes.len() as u64;
    let complete = read < limit || known_len == Some(read);
    Ok(Bounded { bytes, complete })
}

/// The text up to its last line break, dropping a line the read limit cut
/// short. Text without a line break is kept whole.
pub(crate) fn whole_lines(text: &str) -> &str {
    match text.rfind('\n') {
        Some(end) => &text[..=end],
        None => text,
    }
}
