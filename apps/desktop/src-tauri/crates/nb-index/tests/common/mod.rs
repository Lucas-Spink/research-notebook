// disallowed_methods: test helpers build and inspect throwaway projects in
// temporary directories; the std::fs write calls are how fixtures are made,
// not the thing under test.
#![allow(
    dead_code,
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use nb_fs::cache::CacheDir;
use nb_fs::{ProjectRelPath, ProjectRoot};
use nb_index::{
    ArtefactRow, ExperimentRow, FileRecords, FileUpdate, FtsEntry, FtsKind, GroupRow, Index,
    MembershipRow, OpenOutcome, QuestionRow, Scan, ScanMode, SourceRow, VersionRow,
};
use sha2::{Digest, Sha256};
use tempfile::TempDir;

pub const PROJECT_ID: &str = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";

/// A throwaway project and the cache folder its index lives in.
pub struct TestProject {
    pub dir: TempDir,
    /// Holds the cache folder, which lives beside the project, not in it.
    pub cache_home: TempDir,
    pub cache: CacheDir,
}

impl TestProject {
    pub fn new() -> Self {
        let dir = tempfile::Builder::new()
            .prefix("nb-index-")
            .tempdir()
            .unwrap();
        fs::create_dir_all(dir.path().join("_notebook")).unwrap();
        fs::create_dir_all(dir.path().join("results")).unwrap();
        fs::write(dir.path().join("results/pca.csv"), b"a,b\n1,2\n").unwrap();
        let cache_home = tempfile::Builder::new()
            .prefix("nb-index-cache-")
            .tempdir()
            .unwrap();
        let cache = CacheDir::new(cache_home.path().join("cache"));
        Self {
            dir,
            cache_home,
            cache,
        }
    }

    pub fn root_dir(&self) -> &Path {
        self.dir.path()
    }

    pub fn root(&self) -> ProjectRoot {
        ProjectRoot::open(self.root_dir()).unwrap()
    }

    pub fn open_index(&self) -> (Index, OpenOutcome) {
        Index::open(&self.cache, PROJECT_ID).unwrap()
    }

    /// The path of `notebook_path` (relative to `_notebook/`) on disk.
    pub fn file(&self, notebook_path: &str) -> PathBuf {
        self.root_dir().join("_notebook").join(notebook_path)
    }

    pub fn write(&self, notebook_path: &str, text: &str) {
        let path = self.file(notebook_path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    pub fn remove(&self, notebook_path: &str) {
        fs::remove_file(self.file(notebook_path)).unwrap();
    }

    pub fn set_mtime(&self, notebook_path: &str, time: SystemTime) {
        let file = fs::OpenOptions::new()
            .write(true)
            .open(self.file(notebook_path))
            .unwrap();
        file.set_modified(time).unwrap();
    }

    pub fn mtime(&self, notebook_path: &str) -> SystemTime {
        fs::metadata(self.file(notebook_path))
            .unwrap()
            .modified()
            .unwrap()
    }

    /// Brings `index` up to date with the disk, as the application will:
    /// scan, "parse" each changed file, apply. Returns the scan.
    pub fn sync(&self, index: &mut Index, mode: ScanMode) -> Scan {
        let scan = index.scan(&self.root(), mode).unwrap();
        self.apply(index, &scan);
        scan
    }

    /// A full rebuild in place: clear, scan everything, apply.
    pub fn rebuild(&self, index: &mut Index) -> Scan {
        let scan = index.rebuild_scan(&self.root()).unwrap();
        self.apply(index, &scan);
        scan
    }

    fn apply(&self, index: &mut Index, scan: &Scan) {
        let updates: Vec<FileUpdate> = scan
            .changed
            .iter()
            .map(|meta| {
                let notebook_path = meta.path.as_str().strip_prefix("_notebook/").unwrap();
                let text = fs::read_to_string(self.file(notebook_path)).unwrap();
                FileUpdate {
                    meta: meta.clone(),
                    records: fake_parse(notebook_path, &text),
                }
            })
            .collect();
        index.apply(&updates, &scan.removed).unwrap();
    }
}

pub fn later(time: SystemTime, seconds: u64) -> SystemTime {
    time + Duration::from_secs(seconds)
}

pub fn rel(path: &str) -> ProjectRelPath {
    ProjectRelPath::parse(path).unwrap()
}

pub fn changed_paths(scan: &Scan) -> Vec<String> {
    let mut paths: Vec<String> = scan
        .changed
        .iter()
        .map(|m| m.path.as_str().to_owned())
        .collect();
    paths.sort();
    paths
}

pub fn removed_paths(scan: &Scan) -> Vec<String> {
    let mut paths: Vec<String> = scan.removed.iter().map(|p| p.as_str().to_owned()).collect();
    paths.sort();
    paths
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

/// The stand-in for `packages/format`, whose real parsing is not reachable
/// from Rust. The rows depend only on the text, as a real parse would:
///
/// - `questions/<name>.md`: the first line is the title.
/// - `experiments/<name>/experiment.md`: the first line is the title; each
///   further line is a section's text.
/// - `experiments/<name>/artefacts.yaml`: each line is `name|file`, an
///   artefact with one version, all in one group.
/// - `bibliography.json`: each line is `citekey|title`.
pub fn fake_parse(notebook_path: &str, text: &str) -> FileRecords {
    let parts: Vec<&str> = notebook_path.split('/').collect();
    let mut rows = FileRecords::default();
    match parts.as_slice() {
        ["questions", name] => {
            let id = name.trim_end_matches(".md");
            let title = text.lines().next().unwrap_or("");
            rows.questions.push(QuestionRow {
                id: id.to_owned(),
                reference: id.to_owned(),
                title: title.to_owned(),
                created: "2026-09-01T00:00:00Z".to_owned(),
            });
            rows.fts.push(fts(FtsKind::Title, id, title));
        }
        ["experiments", name, "experiment.md"] => {
            let mut lines = text.lines();
            let title = lines.next().unwrap_or("");
            rows.experiments.push(ExperimentRow {
                id: (*name).to_owned(),
                reference: (*name).to_owned(),
                question: "q1".to_owned(),
                title: title.to_owned(),
                status: "planned".to_owned(),
                started: None,
                completed: None,
                created: "2026-09-01T00:00:00Z".to_owned(),
                updated: "2026-09-01T00:00:00Z".to_owned(),
            });
            rows.fts.push(fts(FtsKind::Title, name, title));
            for section in lines {
                rows.fts.push(fts(FtsKind::Section, name, section));
            }
        }
        ["experiments", name, "artefacts.yaml"] => {
            for (n, line) in text.lines().enumerate() {
                let (artefact_name, file) = line.split_once('|').unwrap_or((line, ""));
                let id = format!("{name}-a{n}");
                rows.artefacts.push(ArtefactRow {
                    id: id.clone(),
                    experiment: (*name).to_owned(),
                    name: artefact_name.to_owned(),
                    role: "result".to_owned(),
                    mode: "copy".to_owned(),
                    kind: "image".to_owned(),
                    source_root: "project".to_owned(),
                    source_path: "results/pca.csv".to_owned(),
                    created: "2026-09-01T00:00:00Z".to_owned(),
                    link_sha256: None,
                    link_size: None,
                });
                rows.versions.push(VersionRow {
                    artefact: id.clone(),
                    number: 1,
                    file: file.to_owned(),
                    sha256: sha256_hex(file.as_bytes()),
                    size: i64::try_from(file.len()).unwrap(),
                    captured: "2026-09-01T00:00:00Z".to_owned(),
                });
                rows.memberships.push(MembershipRow {
                    group: format!("{name}-g"),
                    artefact: id.clone(),
                    position: i64::try_from(n).unwrap(),
                });
                rows.fts.push(fts(FtsKind::Name, &id, artefact_name));
                rows.fts.push(fts(FtsKind::Filename, &id, file));
            }
            if !text.is_empty() {
                rows.groups.push(GroupRow {
                    id: format!("{name}-g"),
                    experiment: (*name).to_owned(),
                    parent: None,
                    name: "Figures".to_owned(),
                    position: 0,
                });
            }
        }
        ["bibliography.json"] => {
            for line in text.lines() {
                let (citekey, title) = line.split_once('|').unwrap_or((line, ""));
                rows.sources.push(SourceRow {
                    citekey: citekey.to_owned(),
                    title: Some(title.to_owned()),
                    status: "ok".to_owned(),
                });
                rows.fts.push(fts(FtsKind::SourceTitle, citekey, title));
            }
        }
        _ => {}
    }
    rows
}

fn fts(kind: FtsKind, owner: &str, text: &str) -> FtsEntry {
    FtsEntry {
        kind,
        owner: owner.to_owned(),
        text: text.to_owned(),
    }
}

/// Relative path -> (size, mtime, SHA-256) of every file and folder under
/// the project folder, for proving nothing in a project was written.
pub fn snapshot(root: &Path) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    walk(root, root, &mut out);
    out
}

fn walk(root: &Path, dir: &Path, out: &mut BTreeMap<String, String>) {
    for entry in fs::read_dir(dir).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        let rel = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        let meta = entry.metadata().unwrap();
        if meta.is_dir() {
            out.insert(rel, "dir".to_owned());
            walk(root, &path, out);
        } else {
            let hash = sha256_hex(&fs::read(&path).unwrap());
            let modified = meta.modified().unwrap();
            out.insert(rel, format!("{} {:?} {hash}", meta.len(), modified));
        }
    }
}
