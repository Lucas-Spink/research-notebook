//! Delimited table previews (spec 8, FR-PRV-03, NFR-PERF-08): the header and
//! the first rows of a CSV or TSV file, gzip-compressed or not, from a
//! bounded read of its start. Dimensions are given only when the whole file
//! was read, since anything else would be a guess.

use std::fs::File;
use std::io::{BufReader, Read};

use flate2::read::MultiGzDecoder;

use crate::encoding::{decode_text, read_bounded, whole_lines, TextEncoding};
use crate::PreviewError;

/// Bytes read for the first preview (256 KiB).
pub const TABLE_INITIAL_READ: u64 = 256 * 1024;
/// Bytes read when the preview is expanded (8 MiB).
pub const TABLE_EXPANDED_READ: u64 = 8 * 1024 * 1024;
/// Rows shown at first, below the header.
pub const TABLE_INITIAL_ROWS: usize = 200;
/// Rows shown when expanded, below the header.
pub const TABLE_EXPANDED_ROWS: usize = 2_000;
/// Columns shown, from the left.
pub const TABLE_MAX_COLUMNS: usize = 50;

/// How much of the table to show.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TableExtent {
    Initial,
    Expanded,
}

impl TableExtent {
    fn read_limit(self) -> u64 {
        match self {
            Self::Initial => TABLE_INITIAL_READ,
            Self::Expanded => TABLE_EXPANDED_READ,
        }
    }

    fn row_limit(self) -> usize {
        match self {
            Self::Initial => TABLE_INITIAL_ROWS,
            Self::Expanded => TABLE_EXPANDED_ROWS,
        }
    }
}

/// The delimiter and compression of a table file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TableFormat {
    pub delimiter: u8,
    pub gzip: bool,
}

impl TableFormat {
    /// The format of `csv`, `tsv`, `csv.gz` and `tsv.gz` files, in any case;
    /// `None` for any other name.
    pub fn from_file_name(name: &str) -> Option<Self> {
        let lower = name.to_lowercase();
        let (stem, gzip) = match lower.strip_suffix(".gz") {
            Some(stem) => (stem, true),
            None => (lower.as_str(), false),
        };
        let delimiter = if stem.ends_with(".csv") {
            b','
        } else if stem.ends_with(".tsv") {
            b'\t'
        } else {
            return None;
        };
        Some(Self { delimiter, gzip })
    }
}

/// Rows and columns of a whole table. Rows do not count the header; columns
/// are the most fields in any row, header included.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TableDimensions {
    pub rows: u64,
    pub columns: u64,
}

/// What a table preview shows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TableSample {
    /// The first row, at most [`TABLE_MAX_COLUMNS`] fields.
    pub header: Vec<String>,
    /// The rows after it, each at most [`TABLE_MAX_COLUMNS`] fields.
    pub rows: Vec<Vec<String>>,
    pub encoding: TextEncoding,
    /// Bytes of table text read, after decompression.
    pub bytes_read: u64,
    /// Whether the whole file was read.
    pub complete: bool,
    /// Whether rows exist, or may exist, beyond those shown.
    pub more_rows: bool,
    /// Whether some row has more fields than are shown.
    pub more_columns: bool,
    /// Present only when the whole file was read.
    pub dimensions: Option<TableDimensions>,
}

/// Samples a table from an open file of length `len`, decompressing it
/// first if the format says it is gzip.
pub fn sample_table_file(
    file: File,
    len: u64,
    format: TableFormat,
    extent: TableExtent,
) -> Result<TableSample, PreviewError> {
    if format.gzip {
        sample(
            MultiGzDecoder::new(BufReader::new(file)),
            None,
            format,
            extent,
        )
    } else {
        sample(file, Some(len), format, extent)
    }
}

/// Samples a table from `reader`, decompressing it if the format says it is
/// gzip. At most the extent's read limit of table text is read.
pub fn sample_table<R: Read>(
    reader: R,
    format: TableFormat,
    extent: TableExtent,
) -> Result<TableSample, PreviewError> {
    if format.gzip {
        sample(MultiGzDecoder::new(reader), None, format, extent)
    } else {
        sample(reader, None, format, extent)
    }
}

fn sample<R: Read>(
    reader: R,
    known_len: Option<u64>,
    format: TableFormat,
    extent: TableExtent,
) -> Result<TableSample, PreviewError> {
    let read = read_bounded(reader, extent.read_limit(), known_len)?;
    let bytes_read = read.bytes.len() as u64;
    let (text, encoding) = decode_text(&read.bytes, read.complete);
    drop(read.bytes);
    let text = if read.complete {
        &text[..]
    } else {
        whole_lines(&text)
    };

    let mut records = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .delimiter(format.delimiter)
        .from_reader(text.as_bytes());
    let mut header = Vec::new();
    let mut rows = Vec::new();
    let mut count: u64 = 0;
    let mut widest: usize = 0;
    let row_limit = extent.row_limit();
    for record in records.records() {
        let record = record.map_err(|e| PreviewError::Table(e.to_string()))?;
        widest = widest.max(record.len());
        let fields = record
            .iter()
            .take(TABLE_MAX_COLUMNS)
            .map(str::to_owned)
            .collect();
        if count == 0 {
            header = fields;
        } else if rows.len() < row_limit {
            rows.push(fields);
        }
        count += 1;
    }
    let data_rows = count.saturating_sub(1);
    Ok(TableSample {
        header,
        more_rows: !read.complete || data_rows > rows.len() as u64,
        rows,
        encoding,
        bytes_read,
        complete: read.complete,
        more_columns: widest > TABLE_MAX_COLUMNS,
        dimensions: read.complete.then_some(TableDimensions {
            rows: data_rows,
            columns: widest as u64,
        }),
    })
}
