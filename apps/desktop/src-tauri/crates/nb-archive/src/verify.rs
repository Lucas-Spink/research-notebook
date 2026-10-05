use nb_fs::{ProjectRelPath, ProjectRoot, ReadError};

/// What the manifest says one file should be. Read from `manifest.csv` by
/// `packages/format`, the only parser; this crate never reads the CSV.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Expected {
    /// Project-relative path beginning `_notebook/`.
    pub path: String,
    pub size: u64,
    /// Lower-case hexadecimal SHA-256.
    pub sha256: String,
}

/// How one listed file compares with the manifest.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verdict {
    /// Same size and hash.
    Matches,
    /// Nothing is there.
    Missing,
    /// Something is there that could not be read as a captured file, or the
    /// manifest's path is not a captured file's path.
    Unreadable,
    /// The bytes on disk are not those the manifest recorded.
    Differs {
        size_changed: bool,
        hash_changed: bool,
    },
}

/// Re-hashes each listed file and compares it with the manifest. Reads only.
/// One verdict per entry, in the order given. The modification time is not
/// compared: copying an archive changes it without changing the bytes.
pub fn verify(root: &ProjectRoot, expected: &[Expected]) -> Vec<Verdict> {
    expected
        .iter()
        .map(|entry| verify_one(root, entry))
        .collect()
}

fn verify_one(root: &ProjectRoot, entry: &Expected) -> Verdict {
    let Ok(path) = ProjectRelPath::parse(&entry.path) else {
        return Verdict::Unreadable;
    };
    match root.observe_version_file(&path) {
        Ok(seen) => {
            let size_changed = seen.size != entry.size;
            let hash_changed = !seen.sha256.eq_ignore_ascii_case(&entry.sha256);
            if size_changed || hash_changed {
                Verdict::Differs {
                    size_changed,
                    hash_changed,
                }
            } else {
                Verdict::Matches
            }
        }
        Err(ReadError::Missing { .. }) => Verdict::Missing,
        Err(_) => Verdict::Unreadable,
    }
}
