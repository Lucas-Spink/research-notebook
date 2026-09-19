use nb_fs::ProjectRelPath;

/// How much of the disk a scan trusts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanMode {
    /// A file whose size and modification time match the index is unchanged
    /// without being read.
    Quick,
    /// Every file is hashed, so an edit that kept the size and the time
    /// (coarse clocks, tools that restore times) is still found.
    Full,
}

/// A notebook file as it was when scanned.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileMeta {
    pub path: ProjectRelPath,
    pub size: u64,
    /// Nanoseconds since 1970-01-01.
    pub mtime_ns: i64,
    /// Lower-case hexadecimal SHA-256 of the content.
    pub sha256: String,
}

/// The result of comparing the disk with the index.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Scan {
    pub changed: Vec<FileMeta>,
    pub removed: Vec<ProjectRelPath>,
    pub unchanged: usize,
    /// Files that could not be read now (for example held by another
    /// process). The index keeps whatever it has for them.
    pub unreadable: Vec<(ProjectRelPath, String)>,
}
