//! S3-T10 (spec 8): a notebook preview shows the language and kernel from the
//! notebook's metadata, reading at most 1 MiB of it. Jupyter writes the
//! top-level `metadata` after the cells, so for a large notebook it is found
//! in the last 1 MiB. R Markdown and Quarto are known by their extension.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::cell::Cell;
use std::io::{self, Cursor, Read, Seek, SeekFrom};
use std::rc::Rc;

use nb_preview::notebook::{notebook_info, NotebookFormat, NotebookInfo, NOTEBOOK_METADATA_READ};

const METADATA: &str = r#""metadata": {
  "kernelspec": {"display_name": "Python 3 (ipykernel)", "language": "python", "name": "python3"},
  "language_info": {"name": "python", "version": "3.12.1"}
 },
 "nbformat": 4,
 "nbformat_minor": 5
}"#;

fn notebook_with_output(output_bytes: usize) -> Vec<u8> {
    let cell = format!(
        r#"{{"cell_type": "code", "metadata": {{"tags": []}}, "outputs": [{{"data": {{"text/plain": "{}"}}, "metadata": {{}}}}], "source": ["x"]}}"#,
        "z".repeat(output_bytes)
    );
    format!("{{\n \"cells\": [{cell}],\n {METADATA}\n").into_bytes()
}

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

impl<R: Seek> Seek for Counting<R> {
    fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
        self.inner.seek(pos)
    }
}

fn info(bytes: Vec<u8>) -> NotebookInfo {
    let len = bytes.len() as u64;
    notebook_info(Cursor::new(bytes), len, NotebookFormat::Jupyter).unwrap()
}

#[test]
fn a_small_notebook_gives_language_and_kernel() {
    let found = info(notebook_with_output(10));

    assert_eq!(found.language.as_deref(), Some("python"));
    assert_eq!(found.kernel.as_deref(), Some("Python 3 (ipykernel)"));
}

#[test]
fn bounds_a_large_notebook_is_read_only_at_its_end() {
    let bytes = notebook_with_output(5 * 1024 * 1024);
    let len = bytes.len() as u64;
    let count = Rc::new(Cell::new(0));
    let reader = Counting {
        inner: Cursor::new(bytes),
        count: count.clone(),
    };

    let found = notebook_info(reader, len, NotebookFormat::Jupyter).unwrap();

    assert!(
        count.get() <= NOTEBOOK_METADATA_READ,
        "read {}",
        count.get()
    );
    assert_eq!(found.language.as_deref(), Some("python"));
    assert_eq!(found.kernel.as_deref(), Some("Python 3 (ipykernel)"));
}

#[test]
fn a_cell_metadata_object_is_not_taken_for_the_notebook_metadata() {
    // Without top-level metadata, the cells' own `metadata` objects must not
    // be reported as a kernel.
    let bytes = br#"{"cells": [{"cell_type": "code", "metadata": {"tags": []}, "source": []}], "nbformat": 4}"#.to_vec();

    let found = info(bytes);

    assert_eq!(found.language, None);
    assert_eq!(found.kernel, None);
}

#[test]
fn a_damaged_notebook_gives_no_language_rather_than_an_error() {
    let found = info(b"{ this is not json".to_vec());

    assert_eq!(found.language, None);
    assert_eq!(found.kernel, None);
}

#[test]
fn r_markdown_is_r_and_quarto_has_no_language_from_its_extension() {
    let rmd = notebook_info(Cursor::new(Vec::new()), 0, NotebookFormat::RMarkdown).unwrap();
    let qmd = notebook_info(Cursor::new(Vec::new()), 0, NotebookFormat::Quarto).unwrap();

    assert_eq!(rmd.language.as_deref(), Some("R"));
    assert_eq!(qmd.language, None);
    assert_eq!(qmd.kernel, None);
}

#[test]
fn formats_come_from_the_extension() {
    assert_eq!(
        NotebookFormat::from_file_name("a.ipynb"),
        Some(NotebookFormat::Jupyter)
    );
    assert_eq!(
        NotebookFormat::from_file_name("a.Rmd"),
        Some(NotebookFormat::RMarkdown)
    );
    assert_eq!(
        NotebookFormat::from_file_name("a.QMD"),
        Some(NotebookFormat::Quarto)
    );
    assert_eq!(NotebookFormat::from_file_name("a.md"), None);
}
