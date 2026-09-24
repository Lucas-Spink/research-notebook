//! S3-T10 (spec 8): scripts and text show their first 500 lines, reading at
//! most 1 MiB, in UTF-8, UTF-8 with a byte-order mark, or Windows-1252.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::cell::Cell;
use std::io::{self, Read};
use std::rc::Rc;

use nb_preview::encoding::{decode_text, TextEncoding};
use nb_preview::text::{sample_text, TEXT_LINES, TEXT_READ};

struct Counting<R> {
    inner: R,
    count: Rc<Cell<u64>>,
}

impl<R: Read> Read for Counting<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.count.set(self.count.get() + n as u64);
        Ok(n)
    }
}

#[test]
fn a_short_file_is_shown_whole() {
    let sample = sample_text(&b"print('hi')\r\nx = 1\n"[..]).unwrap();

    assert_eq!(sample.lines, ["print('hi')", "x = 1"]);
    assert!(sample.complete);
    assert_eq!(sample.encoding, TextEncoding::Utf8);
}

#[test]
fn only_the_first_500_lines_are_shown() {
    let text: String = (0..600).map(|i| format!("line {i}\n")).collect();

    let sample = sample_text(text.as_bytes()).unwrap();

    assert_eq!(sample.lines.len(), TEXT_LINES);
    assert_eq!(sample.lines[499], "line 499");
    assert!(!sample.complete);
}

#[test]
fn bounds_text_reads_at_most_1_mib() {
    let big = vec![b'a'; 3 * 1024 * 1024];
    let count = Rc::new(Cell::new(0));
    let reader = Counting {
        inner: &big[..],
        count: count.clone(),
    };

    let sample = sample_text(reader).unwrap();

    assert!(count.get() <= TEXT_READ, "read {}", count.get());
    assert!(!sample.complete);
}

#[test]
fn a_cut_off_last_line_is_not_shown() {
    let mut text = String::new();
    while text.len() < TEXT_READ as usize + 10 {
        text.push_str(&"y".repeat(4000));
        text.push('\n');
    }

    let sample = sample_text(text.as_bytes()).unwrap();

    assert!(sample.lines.iter().all(|line| line.len() == 4000));
}

#[test]
fn encodings_are_detected() {
    assert_eq!(
        decode_text(b"\xEF\xBB\xBFhi", true),
        ("hi".to_owned(), TextEncoding::Utf8Bom)
    );
    assert_eq!(
        decode_text("héllo".as_bytes(), true),
        ("héllo".to_owned(), TextEncoding::Utf8)
    );
    assert_eq!(
        decode_text(b"h\xE9llo \x80\x9F", true),
        ("héllo €Ÿ".to_owned(), TextEncoding::Windows1252)
    );
}

#[test]
fn utf8_cut_mid_character_at_the_read_limit_is_still_utf8() {
    let bytes = "aé".as_bytes();
    let cut = &bytes[..bytes.len() - 1];

    assert_eq!(
        decode_text(cut, false),
        ("a".to_owned(), TextEncoding::Utf8)
    );
    // The same bytes as a whole file are not UTF-8.
    assert_eq!(decode_text(cut, true).1, TextEncoding::Windows1252);
}
