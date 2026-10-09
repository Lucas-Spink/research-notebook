//! FR-ARC-05 (ADR-0054): downscaled figures, sampled tables and the pages
//! themselves, written only under `_notebook/exports/html/`.
#![allow(clippy::unwrap_used, clippy::panic, clippy::disallowed_methods)]

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use nb_archive::{
    prepare_html_assets, write_html_pages, AssetKind, AssetRequest, AssetVerdict, PageVerdict,
};
use nb_fs::ProjectRoot;
use tempfile::TempDir;

const EVIDENCE: &str = "_notebook/experiments/EXP-001/evidence";
const HTML: &str = "_notebook/exports/html";

fn hash(seed: char) -> String {
    seed.to_string().repeat(64)
}

fn project() -> (TempDir, ProjectRoot) {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join(EVIDENCE)).unwrap();
    fs::write(dir.path().join("analysis.R"), "print(1)\n").unwrap();
    let root = ProjectRoot::open(dir.path()).unwrap();
    (dir, root)
}

fn put(dir: &TempDir, name: &str, bytes: &[u8]) -> String {
    let path = format!("{EVIDENCE}/{name}");
    fs::write(dir.path().join(&path), bytes).unwrap();
    path
}

fn png(width: u32, height: u32) -> Vec<u8> {
    let image = image::RgbImage::from_pixel(width, height, image::Rgb([200, 30, 30]));
    let mut out = std::io::Cursor::new(Vec::new());
    image.write_to(&mut out, image::ImageFormat::Png).unwrap();
    out.into_inner()
}

fn request(file: &str, kind: AssetKind, seed: char) -> AssetRequest {
    AssetRequest {
        file: file.to_owned(),
        sha256: hash(seed),
        kind,
    }
}

/// Every file under the project, with its bytes, so a change anywhere shows.
fn snapshot(dir: &TempDir) -> BTreeMap<String, Vec<u8>> {
    fn walk(base: &Path, at: &Path, found: &mut BTreeMap<String, Vec<u8>>) {
        for entry in fs::read_dir(at).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(base, &path, found);
            } else {
                let name = path.strip_prefix(base).unwrap().to_string_lossy();
                found.insert(name.replace('\\', "/"), fs::read(&path).unwrap());
            }
        }
    }
    let mut found = BTreeMap::new();
    walk(dir.path(), dir.path(), &mut found);
    found
}

fn dimensions(path: &Path) -> (u32, u32) {
    image::image_dimensions(path).unwrap()
}

#[test]
fn a_large_figure_is_reduced_to_800_pixels_and_keeps_its_proportions() {
    let (dir, root) = project();
    let file = put(&dir, "big.png", &png(2000, 1000));

    let verdicts = prepare_html_assets(&root, &[request(&file, AssetKind::Image, 'a')]);

    let AssetVerdict::Image {
        file: out,
        width,
        height,
    } = &verdicts[0]
    else {
        panic!("expected an image, got {:?}", verdicts[0]);
    };
    assert_eq!((*width, *height), (800, 400));
    assert_eq!(out, &format!("{HTML}/assets/{}-800.png", hash('a')));
    assert_eq!(dimensions(&dir.path().join(out)), (800, 400));
}

#[test]
fn a_small_figure_is_not_enlarged() {
    let (dir, root) = project();
    let file = put(&dir, "small.png", &png(120, 60));

    let verdicts = prepare_html_assets(&root, &[request(&file, AssetKind::Image, 'b')]);

    assert!(matches!(
        verdicts[0],
        AssetVerdict::Image {
            width: 120,
            height: 60,
            ..
        }
    ));
}

#[test]
fn the_original_is_left_exactly_as_it_was() {
    let (dir, root) = project();
    let bytes = png(1600, 900);
    let file = put(&dir, "orig.png", &bytes);

    prepare_html_assets(&root, &[request(&file, AssetKind::Image, 'c')]);

    assert_eq!(fs::read(dir.path().join(&file)).unwrap(), bytes);
}

#[test]
fn a_table_is_sampled_with_its_header_and_first_rows() {
    let (dir, root) = project();
    let file = put(&dir, "counts.csv", b"gene,count\nA,1\nB,2\n");

    let verdicts = prepare_html_assets(&root, &[request(&file, AssetKind::Table, 'd')]);

    let AssetVerdict::Table(table) = &verdicts[0] else {
        panic!("expected a table, got {:?}", verdicts[0]);
    };
    assert_eq!(table.header, ["gene", "count"]);
    assert_eq!(table.rows, [["A", "1"], ["B", "2"]]);
    assert!(!table.more_rows);
    assert_eq!(table.total_rows, Some(2));
}

#[test]
fn a_long_table_is_cut_and_says_so() {
    let (dir, root) = project();
    let mut text = String::from("n\n");
    for n in 0..1000 {
        text.push_str(&format!("{n}\n"));
    }
    let file = put(&dir, "long.csv", text.as_bytes());

    let verdicts = prepare_html_assets(&root, &[request(&file, AssetKind::Table, 'e')]);

    let AssetVerdict::Table(table) = &verdicts[0] else {
        panic!("expected a table");
    };
    assert!(table.rows.len() < 1000);
    assert!(table.more_rows);
}

#[test]
fn a_table_in_another_format_is_only_linked() {
    let (dir, root) = project();
    let file = put(&dir, "book.xlsx", b"PK");

    let verdicts = prepare_html_assets(&root, &[request(&file, AssetKind::Table, 'f')]);

    assert_eq!(verdicts, [AssetVerdict::Unsupported]);
}

#[test]
fn a_missing_file_and_an_undecodable_image_are_reported_not_skipped() {
    let (dir, root) = project();
    let broken = put(&dir, "broken.png", b"not an image");

    let verdicts = prepare_html_assets(
        &root,
        &[
            request(&format!("{EVIDENCE}/gone.png"), AssetKind::Image, '1'),
            request(&broken, AssetKind::Image, '2'),
        ],
    );

    assert_eq!(verdicts, [AssetVerdict::Missing, AssetVerdict::Unavailable]);
}

#[test]
fn only_captured_version_files_can_be_asked_for() {
    let (dir, root) = project();
    fs::create_dir_all(dir.path().join("_notebook")).unwrap();
    fs::write(dir.path().join("_notebook/project.yaml"), "name: x\n").unwrap();

    let verdicts = prepare_html_assets(
        &root,
        &[
            request("_notebook/project.yaml", AssetKind::Table, '3'),
            request("analysis.R", AssetKind::Table, '4'),
            request("_notebook/../analysis.R", AssetKind::Table, '5'),
        ],
    );

    assert_eq!(verdicts, [const { AssetVerdict::Refused }; 3]);
}

#[test]
fn a_hash_that_is_not_a_sha256_is_refused_before_it_names_a_file() {
    let (dir, root) = project();
    let file = put(&dir, "a.png", &png(10, 10));
    let bad = AssetRequest {
        file,
        sha256: "../../evil".to_owned(),
        kind: AssetKind::Image,
    };

    assert_eq!(prepare_html_assets(&root, &[bad]), [AssetVerdict::Refused]);
    assert!(!dir.path().join(HTML).exists());
}

#[test]
fn preparing_assets_changes_nothing_outside_exports_html() {
    let (dir, root) = project();
    let image = put(&dir, "a.png", &png(1000, 1000));
    let table = put(&dir, "t.csv", b"a\n1\n");
    let before = snapshot(&dir);

    prepare_html_assets(
        &root,
        &[
            request(&image, AssetKind::Image, '6'),
            request(&table, AssetKind::Table, '7'),
        ],
    );

    let after = snapshot(&dir);
    for (path, bytes) in &before {
        assert_eq!(after.get(path), Some(bytes), "{path} changed");
    }
    for path in after.keys().filter(|p| !before.contains_key(*p)) {
        assert!(path.starts_with(&format!("{HTML}/")), "{path} is new");
    }
}

fn page(name: &str, html: &str) -> (String, String) {
    (name.to_owned(), html.to_owned())
}

#[test]
fn pages_are_written_under_exports_html() {
    let (dir, root) = project();

    let verdicts = write_html_pages(
        &root,
        &[
            page("index.html", "<p>i</p>"),
            page("EXP-001.html", "<p>e</p>"),
        ],
    );

    assert_eq!(verdicts, [PageVerdict::Written; 2]);
    assert_eq!(
        fs::read_to_string(dir.path().join(HTML).join("index.html")).unwrap(),
        "<p>i</p>"
    );
    assert!(dir.path().join(HTML).join("EXP-001.html").is_file());
}

#[test]
fn a_page_name_that_is_not_a_plain_html_file_name_is_refused() {
    let (dir, root) = project();
    let before = snapshot(&dir);

    let verdicts = write_html_pages(
        &root,
        &[
            page("../x.html", "x"),
            page("a/b.html", "x"),
            page("a\\b.html", "x"),
            page("notes.txt", "x"),
            page(".html", "x"),
            page("", "x"),
            page("C:x.html", "x"),
        ],
    );

    assert_eq!(verdicts, [PageVerdict::Refused; 7]);
    assert_eq!(snapshot(&dir), before);
}

#[test]
fn one_refused_page_does_not_stop_the_others_and_a_rerun_replaces_a_page() {
    let (dir, root) = project();
    write_html_pages(&root, &[page("index.html", "old")]);

    let verdicts = write_html_pages(&root, &[page("bad.txt", "x"), page("index.html", "new")]);

    assert_eq!(verdicts, [PageVerdict::Refused, PageVerdict::Written]);
    assert_eq!(
        fs::read_to_string(dir.path().join(HTML).join("index.html")).unwrap(),
        "new"
    );
}

#[test]
fn writing_pages_changes_nothing_outside_exports_html() {
    let (dir, root) = project();
    let before = snapshot(&dir);

    write_html_pages(&root, &[page("index.html", "<p>i</p>")]);

    let after = snapshot(&dir);
    for (path, bytes) in &before {
        assert_eq!(after.get(path), Some(bytes), "{path} changed");
    }
    let new: Vec<_> = after.keys().filter(|p| !before.contains_key(*p)).collect();
    assert_eq!(new, [&format!("{HTML}/index.html")]);
}
