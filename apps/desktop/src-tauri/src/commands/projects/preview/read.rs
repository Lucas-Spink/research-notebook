//! The preview commands' work, apart from Tauri state so it can be tested
//! on a temporary project. Every function only opens a version's file
//! through `nb-fs` and hands it to `nb-preview`; nothing is written except
//! the thumbnail cache.

use std::io::BufReader;
use std::path::PathBuf;

use nb_fs::ProjectRoot;
use nb_preview::cache::{ThumbnailCache, ThumbnailKey, DEFAULT_THUMBNAIL_SIZE};
use nb_preview::notebook::{notebook_info, NotebookFormat};
use nb_preview::raster::cached_raster_thumbnail;
use nb_preview::table::{sample_table_file, TableExtent, TableFormat};
use nb_preview::text::sample_text;
use nb_preview::webview::{check_webview_file, WebviewKind};
use nb_preview::PreviewError;

use super::types::{
    AssetFile, AssetKind, Dimensions, NotebookPreview, PreviewFailure, Sha256Hex, TablePreview,
    TextPreview, VersionPath,
};

/// The cached thumbnail of a raster image version, made if needed.
pub(super) fn thumbnail(
    root: &ProjectRoot,
    cache: &ThumbnailCache,
    file: &VersionPath,
    sha256: &Sha256Hex,
) -> Result<AssetFile, PreviewFailure> {
    let key = ThumbnailKey::new(sha256.to_hash()?, DEFAULT_THUMBNAIL_SIZE);
    // Opened even when the cache has the thumbnail, so a version whose file
    // has gone is reported as missing rather than shown from the cache.
    let opened = root.open_version_file(&file.to_rel()?)?;
    let path = cached_raster_thumbnail(cache, &key, move || {
        Ok::<_, PreviewError>((BufReader::new(opened.file), opened.len))
    })?;
    asset_file(path)
}

/// The absolute path of a file the webview renders itself, once it passes
/// its spec 8 bound. The caller allows exactly this file in the asset
/// protocol's scope.
pub(super) fn asset(
    root: &ProjectRoot,
    file: &VersionPath,
    kind: AssetKind,
) -> Result<AssetFile, PreviewFailure> {
    let opened = root.open_version_file(&file.to_rel()?)?;
    let kind = match kind {
        AssetKind::Image => WebviewKind::Image,
        AssetKind::Pdf => WebviewKind::Pdf,
        AssetKind::Svg => WebviewKind::Svg,
    };
    check_webview_file(kind, opened.len)?;
    asset_file(opened.path)
}

pub(super) fn table(
    root: &ProjectRoot,
    file: &VersionPath,
    expanded: bool,
) -> Result<TablePreview, PreviewFailure> {
    let format =
        TableFormat::from_file_name(file.file_name()).ok_or(PreviewFailure::NotPreviewable)?;
    let opened = root.open_version_file(&file.to_rel()?)?;
    let extent = if expanded {
        TableExtent::Expanded
    } else {
        TableExtent::Initial
    };
    let sample = sample_table_file(opened.file, opened.len, format, extent)?;
    let count = |n: u64| u32::try_from(n).unwrap_or(u32::MAX);
    Ok(TablePreview {
        header: sample.header,
        rows: sample.rows,
        encoding: sample.encoding.into(),
        complete: sample.complete,
        more_rows: sample.more_rows,
        more_columns: sample.more_columns,
        dimensions: sample.dimensions.map(|d| Dimensions {
            rows: count(d.rows),
            columns: count(d.columns),
        }),
    })
}

pub(super) fn text(root: &ProjectRoot, file: &VersionPath) -> Result<TextPreview, PreviewFailure> {
    let opened = root.open_version_file(&file.to_rel()?)?;
    let sample = sample_text(opened.file)?;
    Ok(TextPreview {
        lines: sample.lines,
        encoding: sample.encoding.into(),
        complete: sample.complete,
    })
}

pub(super) fn notebook(
    root: &ProjectRoot,
    file: &VersionPath,
) -> Result<NotebookPreview, PreviewFailure> {
    let format =
        NotebookFormat::from_file_name(file.file_name()).ok_or(PreviewFailure::NotPreviewable)?;
    let opened = root.open_version_file(&file.to_rel()?)?;
    let info = notebook_info(opened.file, opened.len, format)?;
    Ok(NotebookPreview {
        kind: info.format.into(),
        language: info.language,
        kernel: info.kernel,
    })
}

fn asset_file(path: PathBuf) -> Result<AssetFile, PreviewFailure> {
    let path = path
        .into_os_string()
        .into_string()
        .map_err(|_| PreviewFailure::FileUnavailable)?;
    Ok(AssetFile { path })
}

#[cfg(test)]
// The workspace denies unwrap outside tests; these are tests, and they write
// fixture files with std::fs.
#[allow(clippy::unwrap_used, clippy::disallowed_methods)]
mod tests {
    use std::fs;

    use nb_fs::cache::CacheDir;
    use tempfile::TempDir;

    use super::*;

    fn project(files: &[(&str, &[u8])]) -> (TempDir, ProjectRoot) {
        let dir = tempfile::tempdir().unwrap();
        for (rel, bytes) in files {
            let path = dir.path().join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, bytes).unwrap();
        }
        fs::create_dir_all(dir.path().join("_notebook")).unwrap();
        let root = ProjectRoot::open(dir.path()).unwrap();
        (dir, root)
    }

    fn path(text: &str) -> VersionPath {
        VersionPath::try_from(text.to_owned()).unwrap()
    }

    const EVIDENCE: &str = "_notebook/experiments/EXP-001/evidence";

    #[test]
    fn a_table_preview_gives_rows_and_dimensions() {
        let (_dir, root) = project(&[(&format!("{EVIDENCE}/t.csv"), b"a,b\n1,2\n")]);

        let preview = table(&root, &path(&format!("{EVIDENCE}/t.csv")), false).unwrap();

        assert_eq!(preview.header, ["a", "b"]);
        assert_eq!(preview.rows, [["1", "2"]]);
        assert_eq!(
            preview.dimensions,
            Some(Dimensions {
                rows: 1,
                columns: 2
            })
        );
    }

    #[test]
    fn a_table_preview_of_a_file_that_is_not_a_table_is_refused() {
        let (_dir, root) = project(&[(&format!("{EVIDENCE}/t.txt"), b"a,b\n")]);

        assert_eq!(
            table(&root, &path(&format!("{EVIDENCE}/t.txt")), false),
            Err(PreviewFailure::NotPreviewable)
        );
    }

    #[test]
    fn a_missing_file_is_reported_as_missing() {
        let (_dir, root) = project(&[]);

        assert_eq!(
            text(&root, &path(&format!("{EVIDENCE}/gone.txt"))),
            Err(PreviewFailure::FileMissing)
        );
    }

    #[test]
    fn text_and_notebook_previews_read_their_file() {
        let (_dir, root) = project(&[
            (&format!("{EVIDENCE}/run.py"), b"print(1)\n"),
            (&format!("{EVIDENCE}/a.Rmd"), b"---\n---\n"),
        ]);

        let lines = text(&root, &path(&format!("{EVIDENCE}/run.py"))).unwrap();
        let rmd = notebook(&root, &path(&format!("{EVIDENCE}/a.Rmd"))).unwrap();

        assert_eq!(lines.lines, ["print(1)"]);
        assert_eq!(rmd.language.as_deref(), Some("R"));
    }

    #[test]
    fn an_svg_above_20_mb_is_not_handed_to_the_webview() {
        let (dir, root) = project(&[(&format!("{EVIDENCE}/big.svg"), b"<svg/>")]);
        let big = fs::OpenOptions::new()
            .write(true)
            .open(dir.path().join(format!("{EVIDENCE}/big.svg")))
            .unwrap();
        big.set_len(20 * 1000 * 1000 + 1).unwrap();

        assert_eq!(
            asset(&root, &path(&format!("{EVIDENCE}/big.svg")), AssetKind::Svg),
            Err(PreviewFailure::TooLarge)
        );
    }

    #[test]
    fn an_asset_is_given_by_its_resolved_absolute_path() {
        let (_dir, root) = project(&[(&format!("{EVIDENCE}/a.svg"), b"<svg/>")]);

        let file = asset(&root, &path(&format!("{EVIDENCE}/a.svg")), AssetKind::Svg).unwrap();

        assert!(PathBuf::from(&file.path).is_absolute());
        assert!(file.path.ends_with("a.svg"));
    }

    #[test]
    fn a_thumbnail_that_cannot_be_decoded_is_unreadable_and_a_missing_one_missing() {
        let (dir, root) = project(&[(&format!("{EVIDENCE}/p.png"), b"not a png")]);
        let cache =
            ThumbnailCache::open(&CacheDir::new(dir.path().join("cache")), 1 << 20).unwrap();
        let hash: Sha256Hex = serde_json::from_str(&format!("\"{}\"", "d".repeat(64))).unwrap();

        assert_eq!(
            thumbnail(&root, &cache, &path(&format!("{EVIDENCE}/p.png")), &hash),
            Err(PreviewFailure::Unreadable)
        );
        assert_eq!(
            thumbnail(&root, &cache, &path(&format!("{EVIDENCE}/q.png")), &hash),
            Err(PreviewFailure::FileMissing)
        );
    }
}
