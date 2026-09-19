// disallowed_methods: test helpers build and inspect throwaway projects in
// temporary directories, outside any real project; the std::fs write calls
// are how fixtures are made, not the thing under test.
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
use std::time::SystemTime;

use nb_fs::{ProjectRelPath, ProjectRoot};
use sha2::{Digest, Sha256};
use tempfile::TempDir;

/// A throwaway project: analysis files outside `_notebook/` that the
/// application must never touch, and an empty `_notebook/`.
pub struct TestProject {
    pub dir: TempDir,
}

impl TestProject {
    pub fn new() -> Self {
        let dir = tempfile::Builder::new().prefix("nb-fs-").tempdir().unwrap();
        let root = dir.path();
        fs::create_dir(root.join("_notebook")).unwrap();
        fs::create_dir_all(root.join("scripts")).unwrap();
        fs::create_dir_all(root.join("results/pca")).unwrap();
        fs::create_dir_all(root.join("data")).unwrap();
        fs::write(root.join("README.md"), b"Analysis of organoids\n").unwrap();
        fs::write(root.join("scripts/run.R"), b"print('hello')\n").unwrap();
        fs::write(root.join("results/pca/pca.csv"), b"a,b\n1,2\n").unwrap();
        fs::write(
            root.join("data/counts.bin"),
            (0..=255u8).collect::<Vec<_>>(),
        )
        .unwrap();
        Self { dir }
    }

    pub fn root(&self) -> &Path {
        self.dir.path()
    }

    pub fn open(&self) -> ProjectRoot {
        ProjectRoot::open(self.root()).unwrap()
    }

    /// The location of a project-relative path on disk.
    pub fn on_disk(&self, rel: &str) -> PathBuf {
        self.root().join(rel)
    }

    pub fn read(&self, rel: &str) -> Vec<u8> {
        fs::read(self.on_disk(rel)).unwrap()
    }

    pub fn exists(&self, rel: &str) -> bool {
        self.on_disk(rel).exists()
    }

    /// Names of `*.tmp` files anywhere under `_notebook/`.
    pub fn temp_files(&self) -> Vec<String> {
        let mut found = Vec::new();
        collect_temp_files(&self.on_disk("_notebook"), &mut found);
        found
    }
}

fn collect_temp_files(dir: &Path, found: &mut Vec<String>) {
    for entry in fs::read_dir(dir).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        if path.is_dir() {
            collect_temp_files(&path, found);
        } else if entry.file_name().to_string_lossy().ends_with(".tmp") {
            found.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
}

pub fn rel(path: &str) -> ProjectRelPath {
    ProjectRelPath::parse(path).unwrap()
}

/// One entry of a directory snapshot.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Entry {
    Dir {
        mtime: SystemTime,
    },
    File {
        size: u64,
        mtime: SystemTime,
        sha256: String,
    },
    Link,
}

/// Records every path under `root` except `_notebook/`: relative path, size,
/// modification time and SHA-256 (docs/testing-guide.md, filesystem safety).
/// Links are recorded, never followed.
pub fn snapshot_outside_notebook(root: &Path) -> BTreeMap<String, Entry> {
    let mut entries = BTreeMap::new();
    // The root itself: its modification time changes if anything is created in it.
    let mtime = fs::metadata(root).unwrap().modified().unwrap();
    entries.insert(".".to_owned(), Entry::Dir { mtime });
    walk(root, root, &mut entries);
    entries
}

fn walk(root: &Path, dir: &Path, entries: &mut BTreeMap<String, Entry>) {
    for item in fs::read_dir(dir).unwrap() {
        let item = item.unwrap();
        let path = item.path();
        let relative = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        if relative == "_notebook" {
            continue;
        }
        let meta = fs::symlink_metadata(&path).unwrap();
        if meta.file_type().is_symlink() {
            entries.insert(relative, Entry::Link);
        } else if meta.is_dir() {
            entries.insert(
                relative,
                Entry::Dir {
                    mtime: meta.modified().unwrap(),
                },
            );
            walk(root, &path, entries);
        } else {
            let sha256 = format!("{:x}", Sha256::digest(fs::read(&path).unwrap()));
            entries.insert(
                relative,
                Entry::File {
                    size: meta.len(),
                    mtime: meta.modified().unwrap(),
                    sha256,
                },
            );
        }
    }
}

/// Makes `link` a directory link to `target`: a symlink on Unix and a
/// junction on Windows, which needs no privilege.
pub fn make_dir_link(link: &Path, target: &Path) {
    #[cfg(unix)]
    std::os::unix::fs::symlink(target, link).unwrap();
    #[cfg(windows)]
    {
        // mklink reads `/` as a switch, so every separator must be a backslash.
        let native = |path: &Path| path.to_string_lossy().replace('/', "\\");
        let output = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(native(link))
            .arg(native(target))
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "mklink /J failed: {}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
