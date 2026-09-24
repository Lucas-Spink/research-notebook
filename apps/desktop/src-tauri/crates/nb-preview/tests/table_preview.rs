//! S3-T10 (spec 8, FR-PRV-03, NFR-PERF-08, gate S3-G08): a delimited table
//! preview shows the header and 200 rows (2,000 expanded) of at most 50
//! columns, reads at most 256 KiB (8 MiB expanded) of the file after any gzip
//! decompression, and gives dimensions only when the whole file was counted.
//!
//! The gate runs `cargo test -p nb-preview -- bounds`, so every test of a
//! read limit lives in the `bounds` module.
// disallowed_methods: tests build throwaway files in temporary directories.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

use std::cell::Cell;
use std::io::{self, Read, Write};
use std::rc::Rc;

use nb_preview::encoding::TextEncoding;
use nb_preview::table::{
    sample_table, TableDimensions, TableExtent, TableFormat, TABLE_EXPANDED_READ,
    TABLE_EXPANDED_ROWS, TABLE_INITIAL_READ, TABLE_INITIAL_ROWS, TABLE_MAX_COLUMNS,
};

const CSV: TableFormat = TableFormat {
    delimiter: b',',
    gzip: false,
};
const CSV_GZ: TableFormat = TableFormat {
    delimiter: b',',
    gzip: true,
};

/// Counts the bytes a reader hands out, shared so the test can look after
/// the reader has been consumed.
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

fn counting<R: Read>(inner: R) -> (Counting<R>, Rc<Cell<u64>>) {
    let count = Rc::new(Cell::new(0));
    (
        Counting {
            inner,
            count: count.clone(),
        },
        count,
    )
}

/// A CSV of `total` bytes made on the fly, so 2 GB needs no disk or memory:
/// a header, then rows `n,value n,...` repeated.
struct SyntheticCsv {
    total: u64,
    produced: u64,
    pending: Vec<u8>,
    row: u64,
}

impl SyntheticCsv {
    fn new(total: u64) -> Self {
        Self {
            total,
            produced: 0,
            pending: b"id,name,score\n".to_vec(),
            row: 0,
        }
    }
}

impl Read for SyntheticCsv {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.produced >= self.total {
            return Ok(0);
        }
        if self.pending.is_empty() {
            self.row += 1;
            self.pending =
                format!("{},value {},{}\n", self.row, self.row, self.row % 97).into_bytes();
        }
        let left = (self.total - self.produced) as usize;
        let n = buf.len().min(self.pending.len()).min(left);
        buf[..n].copy_from_slice(&self.pending[..n]);
        self.pending.drain(..n);
        self.produced += n as u64;
        Ok(n)
    }
}

const TWO_GB: u64 = 2 * 1024 * 1024 * 1024;

fn table(text: &str) -> nb_preview::table::TableSample {
    sample_table(text.as_bytes(), CSV, TableExtent::Initial).unwrap()
}

mod bounds {
    use super::*;

    #[test]
    fn bounds_a_2_gb_csv_reads_at_most_256_kib_and_shows_200_rows() {
        let (reader, count) = counting(SyntheticCsv::new(TWO_GB));

        let sample = sample_table(reader, CSV, TableExtent::Initial).unwrap();

        assert!(
            count.get() <= TABLE_INITIAL_READ,
            "read {} bytes",
            count.get()
        );
        assert_eq!(sample.header, ["id", "name", "score"]);
        assert_eq!(sample.rows.len(), TABLE_INITIAL_ROWS);
        assert_eq!(sample.rows[0], ["1", "value 1", "1"]);
        assert!(!sample.complete);
        assert!(sample.more_rows);
        assert_eq!(sample.dimensions, None);
    }

    #[test]
    fn bounds_expanded_reads_at_most_8_mib_and_shows_2000_rows() {
        let (reader, count) = counting(SyntheticCsv::new(TWO_GB));

        let sample = sample_table(reader, CSV, TableExtent::Expanded).unwrap();

        assert!(
            count.get() <= TABLE_EXPANDED_READ,
            "read {} bytes",
            count.get()
        );
        assert_eq!(sample.rows.len(), TABLE_EXPANDED_ROWS);
        assert_eq!(sample.dimensions, None);
    }

    #[test]
    fn bounds_a_gzip_csv_expanding_to_2_gb_is_bounded_after_decompression() {
        // One gzip member of 1 MiB of rows, repeated: a valid multi-member
        // gzip file that decompresses to 2 GB.
        let mut plain = Vec::new();
        SyntheticCsv::new(1024 * 1024)
            .read_to_end(&mut plain)
            .unwrap();
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        encoder.write_all(&plain).unwrap();
        let member = encoder.finish().unwrap();
        let members = (TWO_GB / plain.len() as u64) as usize;
        let gz = RepeatBytes::new(member, members);
        let (reader, compressed) = counting(gz);
        let decompressed_limit = TABLE_INITIAL_READ;

        let sample = sample_table(reader, CSV_GZ, TableExtent::Initial).unwrap();

        assert_eq!(sample.header, ["id", "name", "score"]);
        assert_eq!(sample.rows.len(), TABLE_INITIAL_ROWS);
        assert!(
            sample.bytes_read <= decompressed_limit,
            "{}",
            sample.bytes_read
        );
        // The compressed input read is far below one member per row shown.
        assert!(
            compressed.get() < 2 * 1024 * 1024,
            "read {} compressed",
            compressed.get()
        );
        assert_eq!(sample.dimensions, None);
    }

    #[test]
    fn bounds_a_real_2_gb_file_is_sampled_through_the_file_api() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.csv");
        {
            let mut file = std::fs::File::create(&path).unwrap();
            file.write_all(b"a,b\n1,2\n").unwrap();
            file.set_len(TWO_GB).unwrap();
        }
        let file = std::fs::File::open(&path).unwrap();

        let sample =
            nb_preview::table::sample_table_file(file, TWO_GB, CSV, TableExtent::Initial).unwrap();

        assert!(sample.bytes_read <= TABLE_INITIAL_READ);
        assert_eq!(sample.header, ["a", "b"]);
        assert_eq!(sample.dimensions, None);
    }

    #[test]
    fn bounds_only_50_columns_are_kept() {
        let header: Vec<String> = (0..60).map(|i| format!("c{i}")).collect();
        let text = format!("{}\n{}\n", header.join(","), vec!["x"; 60].join(","));

        let sample = table(&text);

        assert_eq!(sample.header.len(), TABLE_MAX_COLUMNS);
        assert_eq!(sample.rows[0].len(), TABLE_MAX_COLUMNS);
        assert!(sample.more_columns);
        assert_eq!(
            sample.dimensions,
            Some(TableDimensions {
                rows: 1,
                columns: 60
            })
        );
    }
}

/// Hands out `bytes` `times` times in a row.
struct RepeatBytes {
    bytes: Vec<u8>,
    times: usize,
    pos: usize,
}

impl RepeatBytes {
    fn new(bytes: Vec<u8>, times: usize) -> Self {
        Self {
            bytes,
            times,
            pos: 0,
        }
    }
}

impl Read for RepeatBytes {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.times == 0 {
            return Ok(0);
        }
        let n = buf.len().min(self.bytes.len() - self.pos);
        buf[..n].copy_from_slice(&self.bytes[self.pos..self.pos + n]);
        self.pos += n;
        if self.pos == self.bytes.len() {
            self.pos = 0;
            self.times -= 1;
        }
        Ok(n)
    }
}

#[test]
fn a_small_file_is_counted_in_full() {
    let sample = table("a,b\n1,2\n3,4\n5,6\n");

    assert!(sample.complete);
    assert!(!sample.more_rows);
    assert_eq!(sample.encoding, TextEncoding::Utf8);
    assert_eq!(sample.rows, [["1", "2"], ["3", "4"], ["5", "6"]]);
    assert_eq!(
        sample.dimensions,
        Some(TableDimensions {
            rows: 3,
            columns: 2
        })
    );
}

#[test]
fn a_file_with_more_rows_than_shown_reports_more_rows() {
    let mut text = String::from("n\n");
    for i in 0..250 {
        text.push_str(&format!("{i}\n"));
    }

    let sample = table(&text);

    assert_eq!(sample.rows.len(), TABLE_INITIAL_ROWS);
    assert!(sample.more_rows);
    assert_eq!(
        sample.dimensions,
        Some(TableDimensions {
            rows: 250,
            columns: 1
        })
    );
}

#[test]
fn quoted_fields_keep_delimiters_and_line_breaks() {
    let sample = table("a,b\n\"x, y\",\"line 1\nline 2\"\n");

    assert_eq!(sample.rows, [["x, y", "line 1\nline 2"]]);
}

#[test]
fn ragged_rows_are_shown_as_they_are() {
    let sample = table("a,b,c\n1\n1,2,3,4\n");

    assert_eq!(sample.rows[0], ["1"]);
    assert_eq!(sample.rows[1], ["1", "2", "3", "4"]);
    assert_eq!(sample.dimensions.unwrap().columns, 4);
}

#[test]
fn tab_separated_files_use_tabs() {
    let format = TableFormat::from_file_name("results.TSV").unwrap();
    let sample = sample_table(&b"a\tb\n1,5\t2\n"[..], format, TableExtent::Initial).unwrap();

    assert_eq!(sample.rows, [["1,5", "2"]]);
}

#[test]
fn a_byte_order_mark_is_detected_and_removed() {
    let sample = sample_table(&b"\xEF\xBB\xBFa,b\n1,2\n"[..], CSV, TableExtent::Initial).unwrap();

    assert_eq!(sample.encoding, TextEncoding::Utf8Bom);
    assert_eq!(sample.header, ["a", "b"]);
}

#[test]
fn windows_1252_is_detected_when_the_bytes_are_not_utf8() {
    let sample =
        sample_table(&b"name\ncaf\xE9 \x80 \x96\n"[..], CSV, TableExtent::Initial).unwrap();

    assert_eq!(sample.encoding, TextEncoding::Windows1252);
    assert_eq!(sample.rows, [["café € –"]]);
}

#[test]
fn a_cut_off_last_row_is_not_shown() {
    // The first 256 KiB end part-way through a row; that row is dropped
    // rather than shown cut short.
    // Rows of about 2 KiB, so fewer than 200 fit and the cut row would be
    // the last one shown.
    let long = "x".repeat(2000);
    let mut text = String::from("a,b\n");
    while text.len() < TABLE_INITIAL_READ as usize + 5000 {
        text.push_str(&format!("1,{long}\n"));
    }
    let sample = sample_table(text.as_bytes(), CSV, TableExtent::Initial).unwrap();
    assert!(sample.rows.len() < TABLE_INITIAL_ROWS);
    for row in &sample.rows {
        assert_eq!(row, &["1", long.as_str()]);
    }
}

#[test]
fn file_names_decide_delimiter_and_gzip() {
    let cases = [
        ("a.csv", Some((b',', false))),
        ("a.tsv", Some((b'\t', false))),
        ("a.csv.gz", Some((b',', true))),
        ("A.TSV.GZ", Some((b'\t', true))),
        ("a.txt", None),
        ("a.gz", None),
    ];
    for (name, expected) in cases {
        let got = TableFormat::from_file_name(name).map(|f| (f.delimiter, f.gzip));
        assert_eq!(got, expected, "{name}");
    }
}

#[test]
fn corrupt_gzip_is_an_error_not_a_panic() {
    let result = sample_table(
        &b"\x1f\x8b\x08\x00not really gzip"[..],
        CSV_GZ,
        TableExtent::Initial,
    );
    assert!(result.is_err());
}
