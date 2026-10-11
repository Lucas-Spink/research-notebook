//! Issue #104: the script viewer reads further than a text preview (up to
//! 4 MiB and 20,000 lines), and a notebook is read whole up to 16 MiB so its
//! cells can be drawn. Neither reads past its bound.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::cell::Cell;
use std::io::{self, Read};
use std::rc::Rc;

use nb_preview::encoding::TextEncoding;
use nb_preview::notebook::{notebook_body, NOTEBOOK_BODY_READ};
use nb_preview::text::{sample_script, SCRIPT_LINES, SCRIPT_READ, TEXT_LINES};
use nb_preview::PreviewError;

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
fn a_script_longer_than_a_text_preview_is_shown_in_full() {
    let text: String = (0..2_000).map(|i| format!("x{i} <- {i}\n")).collect();

    let sample = sample_script(text.as_bytes()).unwrap();

    assert!(sample.lines.len() > TEXT_LINES);
    assert_eq!(sample.lines.len(), 2_000);
    assert!(sample.complete);
}

#[test]
fn a_script_keeps_its_indentation_and_blank_lines() {
    let sample = sample_script(&b"def f():\n\n    return 1\n"[..]).unwrap();

    assert_eq!(sample.lines, ["def f():", "", "    return 1"]);
}

#[test]
fn an_empty_script_has_no_lines_and_is_complete() {
    let sample = sample_script(&b""[..]).unwrap();

    assert!(sample.lines.is_empty());
    assert!(sample.complete);
}

#[test]
fn a_script_is_cut_at_the_line_limit() {
    let text: String = (0..SCRIPT_LINES + 5).map(|_| "x\n").collect();

    let sample = sample_script(text.as_bytes()).unwrap();

    assert_eq!(sample.lines.len(), SCRIPT_LINES);
    assert!(!sample.complete);
}

#[test]
fn bounds_script_reads_at_most_4_mib() {
    let big = vec![b'a'; 9 * 1024 * 1024];
    let count = Rc::new(Cell::new(0));
    let reader = Counting {
        inner: &big[..],
        count: count.clone(),
    };

    let sample = sample_script(reader).unwrap();

    assert!(count.get() <= SCRIPT_READ, "read {}", count.get());
    assert!(!sample.complete);
}

#[test]
fn a_script_in_windows_1252_is_decoded() {
    let sample = sample_script(&b"# caf\xE9\n"[..]).unwrap();

    assert_eq!(sample.lines, ["# caf\u{e9}"]);
    assert_eq!(sample.encoding, TextEncoding::Windows1252);
}

#[test]
fn a_notebook_body_is_returned_whole() {
    let json = br#"{"cells": [], "nbformat": 4}"#;

    let body = notebook_body(&json[..], json.len() as u64).unwrap();

    assert_eq!(body.text.as_bytes(), json);
    assert_eq!(body.encoding, TextEncoding::Utf8);
}

#[test]
fn bounds_a_notebook_above_16_mib_is_refused_before_it_is_read() {
    let count = Rc::new(Cell::new(0));
    let reader = Counting {
        inner: io::repeat(b'a'),
        count: count.clone(),
    };

    let error = notebook_body(reader, NOTEBOOK_BODY_READ + 1).unwrap_err();

    assert!(matches!(error, PreviewError::FileTooLarge { .. }));
    assert_eq!(count.get(), 0);
}

#[test]
fn a_notebook_of_exactly_16_mib_is_read() {
    let big = vec![b' '; NOTEBOOK_BODY_READ as usize];

    let body = notebook_body(&big[..], big.len() as u64).unwrap();

    assert_eq!(body.text.len() as u64, NOTEBOOK_BODY_READ);
}
