//! A Typst `World` that serves a fixed template and a fixed set of virtual
//! files, and nothing else, so a template cannot reach outside what the call
//! gave it (ADR-0007).

use std::collections::HashMap;

use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use typst_kit::fonts::FontStore;

use crate::ExportError;

pub(crate) struct FixedWorld {
    library: LazyHash<Library>,
    fonts: FontStore,
    main_id: FileId,
    main_source: Source,
    files: HashMap<FileId, Bytes>,
}

impl FixedWorld {
    /// `template` is committed source; `files` are `(absolute virtual path,
    /// bytes)` the template may read, such as `("/data.json", ...)`.
    pub(crate) fn new(template: &str, files: &[(&str, &[u8])]) -> Result<Self, ExportError> {
        let main_id = virtual_file_id("/main.typ")?;
        let mut served = HashMap::new();
        for (path, bytes) in files {
            served.insert(virtual_file_id(path)?, Bytes::new(bytes.to_vec()));
        }
        let mut fonts = FontStore::new();
        fonts.extend(typst_kit::fonts::embedded());
        Ok(Self {
            library: LazyHash::new(Library::builder().build()),
            fonts,
            main_id,
            main_source: Source::new(main_id, template.to_string()),
            files: served,
        })
    }
}

impl World for FixedWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        self.fonts.book()
    }

    fn main(&self) -> FileId {
        self.main_id
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.main_id {
            Ok(self.main_source.clone())
        } else {
            Err(FileError::NotSource)
        }
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        self.files
            .get(&id)
            .cloned()
            .ok_or_else(|| FileError::NotFound(id.vpath().get_without_slash().into()))
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.font(index)
    }

    // The templates never call Typst's `datetime()` function, so a fixed
    // `None` is correct; the PDF's own date comes from the injected timestamp.
    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        None
    }
}

fn virtual_file_id(path: &str) -> Result<FileId, ExportError> {
    let vpath = VirtualPath::new(path).map_err(ExportError::InvalidVirtualPath)?;
    Ok(FileId::new(RootedPath::new(VirtualRoot::Project, vpath)))
}
