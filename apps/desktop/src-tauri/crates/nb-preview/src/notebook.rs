//! Notebook previews (spec 8): the language and kernel of a Jupyter notebook
//! from its metadata, reading at most 1 MiB. R Markdown and Quarto documents
//! are known by their extension alone; their YAML front matter is not parsed
//! here (AGENTS.md rule 2, ADR-0038).

use std::io::{Read, Seek, SeekFrom};

use serde_json::Value;

use crate::encoding::read_bounded;
use crate::PreviewError;

/// Bytes of a notebook read at most (1 MiB).
pub const NOTEBOOK_METADATA_READ: u64 = 1024 * 1024;
/// Longest language or kernel name kept, in characters.
const MAX_NAME_CHARS: usize = 200;
/// `"metadata"` keys tried, from the end, before giving up.
const MAX_CANDIDATES: usize = 16;
const KEY: &[u8] = b"\"metadata\"";

/// The kinds of notebook spec 8 lists.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotebookFormat {
    Jupyter,
    RMarkdown,
    Quarto,
}

impl NotebookFormat {
    /// `ipynb`, `Rmd` or `qmd`, in any case; `None` for any other name.
    pub fn from_file_name(name: &str) -> Option<Self> {
        let lower = name.to_lowercase();
        let (_, extension) = lower.rsplit_once('.')?;
        match extension {
            "ipynb" => Some(Self::Jupyter),
            "rmd" => Some(Self::RMarkdown),
            "qmd" => Some(Self::Quarto),
            _ => None,
        }
    }
}

/// What a notebook preview shows besides the file's details.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotebookInfo {
    pub format: NotebookFormat,
    pub language: Option<String>,
    pub kernel: Option<String>,
}

/// The language and kernel of a notebook of `len` bytes. A notebook whose
/// metadata cannot be found or read gives `None` for both rather than an
/// error, since the file's details are still worth showing.
pub fn notebook_info<R: Read + Seek>(
    mut reader: R,
    len: u64,
    format: NotebookFormat,
) -> Result<NotebookInfo, PreviewError> {
    let (language, kernel) = match format {
        NotebookFormat::RMarkdown => (Some("R".to_owned()), None),
        NotebookFormat::Quarto => (None, None),
        NotebookFormat::Jupyter => {
            // nbformat writes the top-level metadata after the cells, so a
            // notebook too large to read whole keeps it in its last part.
            let start = len.saturating_sub(NOTEBOOK_METADATA_READ);
            reader.seek(SeekFrom::Start(start))?;
            let read = read_bounded(reader, NOTEBOOK_METADATA_READ, None)?;
            let metadata = if start == 0 {
                whole_metadata(&read.bytes)
            } else {
                trailing_metadata(&read.bytes)
            };
            metadata.map_or((None, None), |m| describe(&m))
        }
    };
    Ok(NotebookInfo {
        format,
        language,
        kernel,
    })
}

fn whole_metadata(bytes: &[u8]) -> Option<Value> {
    let notebook: Value = serde_json::from_slice(bytes).ok()?;
    notebook.get("metadata").cloned()
}

/// The last `"metadata"` object in `bytes` that names a kernel or language.
/// Cells have their own `metadata` objects, which never do.
fn trailing_metadata(bytes: &[u8]) -> Option<Value> {
    let keys = bytes
        .windows(KEY.len())
        .enumerate()
        .filter(|(_, window)| *window == KEY)
        .map(|(at, _)| at + KEY.len());
    let candidates: Vec<usize> = keys.collect();
    candidates
        .into_iter()
        .rev()
        .take(MAX_CANDIDATES)
        .find_map(|after_key| object_after_colon(&bytes[after_key..]))
        .filter(names_kernel_or_language)
}

fn object_after_colon(rest: &[u8]) -> Option<Value> {
    let rest = trim_start(rest).strip_prefix(b":")?;
    let rest = trim_start(rest);
    if !rest.starts_with(b"{") {
        return None;
    }
    let value = serde_json::Deserializer::from_slice(rest)
        .into_iter::<Value>()
        .next()?
        .ok()?;
    names_kernel_or_language(&value).then_some(value)
}

fn trim_start(bytes: &[u8]) -> &[u8] {
    let start = bytes
        .iter()
        .position(|b| !b.is_ascii_whitespace())
        .unwrap_or(bytes.len());
    &bytes[start..]
}

fn names_kernel_or_language(metadata: &Value) -> bool {
    metadata.get("kernelspec").is_some() || metadata.get("language_info").is_some()
}

fn describe(metadata: &Value) -> (Option<String>, Option<String>) {
    let text = |value: Option<&Value>| {
        value
            .and_then(Value::as_str)
            .map(|s| s.chars().take(MAX_NAME_CHARS).collect::<String>())
    };
    let kernelspec = metadata.get("kernelspec");
    let language = text(metadata.pointer("/language_info/name"))
        .or_else(|| text(kernelspec.and_then(|k| k.get("language"))));
    let kernel = text(kernelspec.and_then(|k| k.get("display_name")))
        .or_else(|| text(kernelspec.and_then(|k| k.get("name"))));
    (language, kernel)
}
