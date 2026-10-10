//! The notebook bundle and the full archive (FR-ARC-08, ADR-0057): ZIP64
//! files that hold `_notebook/` or the whole project, written beside the
//! project and never inside it. Reads the project; the only write is the new
//! file `nb-fs` places in the folder the person chose.

use std::collections::{BTreeMap, BTreeSet};
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use nb_fs::{ArchiveFile, ArchiveScope, ExportError, ProjectRoot, ReadError};
use sha2::{Digest, Sha256};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, DateTime, ZipArchive, ZipWriter};

/// The registered file extension of both kinds of bundle, which a marker
/// entry inside tells apart (ADR-0057 §3).
pub const BUNDLE_EXTENSION: &str = "nbk";

/// The largest file FAT32 can hold: 4 GiB less one byte.
pub const FAT32_MAX_FILE: u64 = 4 * 1024 * 1024 * 1024 - 1;

/// Name of the entry that says what a bundle is.
const MARKER_PATH: &str = "NOTEBOOK-BUNDLE.json";

/// Extensions of formats that are already compressed, so deflating them again
/// costs time and gains nothing. Matched without regard to case.
const ALREADY_COMPRESSED: [&str; 31] = [
    "png", "jpg", "jpeg", "gif", "webp", "heic", "avif", "pdf", "zip", "gz", "tgz", "bz2", "xz",
    "zst", "7z", "rar", "lz4", "mp3", "m4a", "ogg", "flac", "mp4", "m4v", "mov", "mkv", "webm",
    "avi", "docx", "xlsx", "pptx", "bundle",
];

/// Which bundle to write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BundleKind {
    /// `_notebook/` only.
    Notebook,
    /// The whole project folder.
    Archive,
}

impl BundleKind {
    fn scope(self) -> ArchiveScope {
        match self {
            Self::Notebook => ArchiveScope::Notebook,
            Self::Archive => ArchiveScope::Project,
        }
    }

    fn marker(self) -> &'static [u8] {
        match self {
            Self::Notebook => b"{\"bundle_version\":1,\"kind\":\"notebook\"}\n",
            Self::Archive => b"{\"bundle_version\":1,\"kind\":\"archive\"}\n",
        }
    }
}

/// An entry the caller adds to the bundle beside the project's files, such as
/// the list of linked files. Its text is produced by `packages/format`; this
/// crate only stores it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtraEntry {
    /// Forward-slash path inside the bundle.
    pub path: String,
    pub bytes: Vec<u8>,
}

/// What a bundle would hold, found without writing anything.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BundlePlan {
    pub files: usize,
    /// The total size of the files before compression.
    pub bytes: u64,
    /// Links and names that cannot be stored, left out.
    pub skipped: usize,
    /// The files together may not fit in the single file FAT32 allows.
    pub exceeds_fat32_limit: bool,
}

/// How writing a bundle ended. Carries no text from the system, which can
/// name paths the person did not ask about.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BundleOutcome {
    /// Written, read back and checked. `name` is the file's name in the folder.
    Written {
        name: String,
        bytes: u64,
        files: usize,
    },
    /// The destination is not a folder that exists.
    FolderInvalid,
    /// The destination is the project or lies within it.
    InsideProject,
    /// The name is not an ordinary file name.
    UnsafeName,
    /// The destination refused a file this large: typically a FAT32 drive.
    TooLargeForDestination,
    /// The destination ran out of space.
    NoSpace,
    /// A file changed or vanished while it was being stored, so the bundle
    /// would not match the project. Nothing was kept; try again.
    SourceChanged,
    /// Anything else, including a file that could not be read or a bundle that
    /// did not read back correctly. Nothing was kept.
    Failed,
}

/// Whether `bytes` may not fit in a file on a FAT32 drive.
pub fn exceeds_fat32_limit(bytes: u64) -> bool {
    bytes >= FAT32_MAX_FILE
}

/// Counts what a bundle of `kind` would hold. Reads only.
pub fn plan_bundle(root: &ProjectRoot, kind: BundleKind) -> Result<BundlePlan, ReadError> {
    let listing = root.list_archive_files(kind.scope())?;
    let bytes = listing.files.iter().map(|f| f.size).sum();
    Ok(BundlePlan {
        files: listing.files.len(),
        bytes,
        skipped: listing.skipped,
        exceeds_fat32_limit: exceeds_fat32_limit(bytes),
    })
}

/// Writes a bundle of `kind` into `folder` as `<stem>.nbk`, or `<stem> (2).nbk`
/// and so on when that is taken. The file is built beside its final name,
/// read back and checked against what was stored, and only then given its
/// name; any failure leaves nothing in `folder`. The project is only read.
pub fn write_bundle(
    root: &ProjectRoot,
    kind: BundleKind,
    folder: &Path,
    stem: &str,
    extras: &[ExtraEntry],
) -> BundleOutcome {
    let Ok(listing) = root.list_archive_files(kind.scope()) else {
        return BundleOutcome::Failed;
    };
    if !names_are_distinct(&listing.files, extras) {
        return BundleOutcome::Failed;
    }
    let name = format!("{stem}.{BUNDLE_EXTENSION}");
    let mut stored = 0;
    let result = root.write_new_outside(folder, &name, |file| {
        stored = store_all(root, kind, &listing.files, extras, file)?;
        Ok::<_, Failure>(())
    });
    match result {
        Ok(exported) => BundleOutcome::Written {
            name: exported.name,
            bytes: exported.bytes,
            files: stored,
        },
        Err(ExportError::FolderInvalid) => BundleOutcome::FolderInvalid,
        Err(ExportError::InsideProject) => BundleOutcome::InsideProject,
        Err(ExportError::UnsafeName) => BundleOutcome::UnsafeName,
        Err(ExportError::Io { source, .. }) => outcome_for_io(&source),
        Err(ExportError::Produce(failure)) => failure.outcome(),
    }
}

/// The marker and extras may not take the place of a project file, which the
/// archive would then hold twice.
fn names_are_distinct(files: &[ArchiveFile], extras: &[ExtraEntry]) -> bool {
    let mut seen: BTreeSet<&str> = files.iter().map(|f| f.path.as_str()).collect();
    seen.insert(MARKER_PATH)
        && extras
            .iter()
            .all(|extra| !extra.path.is_empty() && seen.insert(extra.path.as_str()))
}

#[derive(Debug)]
enum Failure {
    Io(io::Error),
    Zip(zip::result::ZipError),
    SourceChanged,
    Unreadable,
    ReadBackDiffers,
}

impl Failure {
    fn outcome(&self) -> BundleOutcome {
        match self {
            Self::Io(source) | Self::Zip(zip::result::ZipError::Io(source)) => {
                outcome_for_io(source)
            }
            Self::SourceChanged => BundleOutcome::SourceChanged,
            Self::Zip(_) | Self::Unreadable | Self::ReadBackDiffers => BundleOutcome::Failed,
        }
    }
}

impl From<io::Error> for Failure {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<zip::result::ZipError> for Failure {
    fn from(error: zip::result::ZipError) -> Self {
        Self::Zip(error)
    }
}

/// `ERROR_FILE_TOO_LARGE` on Windows and `EFBIG` on Linux and macOS.
const WINDOWS_FILE_TOO_LARGE: i32 = 223;
const UNIX_FILE_TOO_LARGE: i32 = 27;

fn outcome_for_io(error: &io::Error) -> BundleOutcome {
    if error.kind() == io::ErrorKind::FileTooLarge
        || matches!(
            error.raw_os_error(),
            Some(WINDOWS_FILE_TOO_LARGE | UNIX_FILE_TOO_LARGE)
        )
    {
        BundleOutcome::TooLargeForDestination
    } else if error.kind() == io::ErrorKind::StorageFull {
        BundleOutcome::NoSpace
    } else {
        BundleOutcome::Failed
    }
}

/// What was stored for one entry, to compare with what reads back.
type Stored = BTreeMap<String, (u64, [u8; 32])>;

/// Stores every entry in `file`, then reads the file back and checks that each
/// entry decompresses to the bytes that went in. Returns the entry count
/// without the marker.
fn store_all(
    root: &ProjectRoot,
    kind: BundleKind,
    files: &[ArchiveFile],
    extras: &[ExtraEntry],
    file: &mut File,
) -> Result<usize, Failure> {
    let mut stored = Stored::new();
    let mut writer = ZipWriter::new(&mut *file);
    store_bytes(&mut writer, MARKER_PATH, kind.marker(), &mut stored)?;
    for entry in files {
        store_file(root, &mut writer, entry, &mut stored)?;
    }
    for extra in extras {
        store_bytes(&mut writer, &extra.path, &extra.bytes, &mut stored)?;
    }
    writer.finish()?;
    read_back(file, &stored)?;
    Ok(files.len() + extras.len())
}

fn options(
    method: CompressionMethod,
    size: u64,
    modified: Option<SystemTime>,
) -> SimpleFileOptions {
    let options = SimpleFileOptions::default()
        .compression_method(method)
        .large_file(size >= u64::from(u32::MAX));
    match modified.and_then(zip_time) {
        Some(time) => options.last_modified_time(time),
        None => options,
    }
}

fn store_bytes(
    writer: &mut ZipWriter<&mut File>,
    path: &str,
    bytes: &[u8],
    stored: &mut Stored,
) -> Result<(), Failure> {
    let method = method_for(path);
    writer.start_file(path, options(method, bytes.len() as u64, None))?;
    writer.write_all(bytes)?;
    stored.insert(
        path.to_owned(),
        (bytes.len() as u64, Sha256::digest(bytes).into()),
    );
    Ok(())
}

fn store_file(
    root: &ProjectRoot,
    writer: &mut ZipWriter<&mut File>,
    entry: &ArchiveFile,
    stored: &mut Stored,
) -> Result<(), Failure> {
    let mut source = root.open_archive_file(&entry.path).map_err(|e| match e {
        ReadError::Missing { .. } => Failure::SourceChanged,
        _ => Failure::Unreadable,
    })?;
    writer.start_file(
        &entry.path,
        options(method_for(&entry.path), entry.size, entry.modified),
    )?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    let mut count = 0u64;
    loop {
        let read = source.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        let chunk = &buffer[..read];
        hasher.update(chunk);
        writer.write_all(chunk)?;
        count += read as u64;
    }
    // The file grew or shrank since it was listed: what is stored is not what
    // the plan, or the person, saw.
    if count != entry.size {
        return Err(Failure::SourceChanged);
    }
    stored.insert(entry.path.clone(), (count, hasher.finalize().into()));
    Ok(())
}

/// Reads the finished file from the start. Each entry is decompressed, so its
/// CRC is checked by the reader as well as its hash here.
fn read_back(file: &mut File, stored: &Stored) -> Result<(), Failure> {
    file.seek(SeekFrom::Start(0))?;
    let mut archive = ZipArchive::new(&mut *file)?;
    if archive.len() != stored.len() {
        return Err(Failure::ReadBackDiffers);
    }
    let mut buffer = vec![0u8; 1024 * 1024];
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let name = entry.name()?.into_owned();
        let Some((size, expected)) = stored.get(&name) else {
            return Err(Failure::ReadBackDiffers);
        };
        let mut hasher = Sha256::new();
        let mut count = 0u64;
        loop {
            let read = entry.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
            count += read as u64;
        }
        let actual: [u8; 32] = hasher.finalize().into();
        if count != *size || actual != *expected {
            return Err(Failure::ReadBackDiffers);
        }
    }
    Ok(())
}

/// Already-compressed formats are stored as they are; the rest are deflated.
fn method_for(path: &str) -> CompressionMethod {
    let extension = path
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase());
    match extension {
        Some(extension) if ALREADY_COMPRESSED.contains(&extension.as_str()) => {
            CompressionMethod::Stored
        }
        _ => CompressionMethod::Deflated,
    }
}

/// A file time as a ZIP time (UTC, to the second, 1980 to 2107), or `None`
/// for a time the format cannot hold.
fn zip_time(time: SystemTime) -> Option<DateTime> {
    let seconds = time.duration_since(UNIX_EPOCH).ok()?.as_secs();
    let (year, month, day) = civil_from_days(i64::try_from(seconds / 86_400).ok()?);
    let in_day = seconds % 86_400;
    DateTime::from_date_and_time(
        u16::try_from(year).ok()?,
        month,
        day,
        u8::try_from(in_day / 3_600).ok()?,
        u8::try_from(in_day % 3_600 / 60).ok()?,
        u8::try_from(in_day % 60).ok()?,
    )
    .ok()
}

/// The calendar date of `days` since 1970-01-01 (proleptic Gregorian).
fn civil_from_days(days: i64) -> (i64, u8, u8) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
    let month = if shifted_month < 10 {
        shifted_month + 3
    } else {
        shifted_month - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    // `month` is 1..=12 and `day` 1..=31 by construction.
    (year, month as u8, day as u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_are_converted_from_days_since_the_epoch() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_787), (2024, 3, 5));
        assert_eq!(civil_from_days(11_016), (2000, 2, 29));
        assert_eq!(civil_from_days(-1), (1969, 12, 31));
    }

    #[test]
    fn a_time_before_1980_has_no_zip_time() {
        assert!(zip_time(UNIX_EPOCH).is_none());
    }

    #[test]
    fn extensions_are_matched_without_regard_to_case() {
        assert_eq!(method_for("a/B.PNG"), CompressionMethod::Stored);
        assert_eq!(method_for("a/b.tar.gz"), CompressionMethod::Stored);
        assert_eq!(method_for("a/b.csv"), CompressionMethod::Deflated);
        assert_eq!(method_for("a/noextension"), CompressionMethod::Deflated);
        assert_eq!(method_for("a.png/readme"), CompressionMethod::Deflated);
    }
}
