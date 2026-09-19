use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};
use specta::Type;

/// Stands for a folder the person chose in a native dialog. The webview holds
/// this number, never the path, so it cannot name a folder it was not given
/// (AGENTS.md rule 8).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
pub struct FolderHandle(u32);

/// The folders chosen so far in this run of the application.
#[derive(Debug, Default)]
pub struct PickedFolders {
    inner: Mutex<Picked>,
}

#[derive(Debug, Default)]
struct Picked {
    next: u32,
    folders: HashMap<u32, PathBuf>,
}

impl PickedFolders {
    /// Holds `path` and returns the handle that stands for it.
    pub fn insert(&self, path: PathBuf) -> FolderHandle {
        // A panic elsewhere cannot leave this map half-updated, so a poisoned
        // lock is still safe to use.
        let mut picked = self.inner.lock().unwrap_or_else(PoisonError::into_inner);
        let id = picked.next;
        picked.next = picked.next.wrapping_add(1);
        picked.folders.insert(id, path);
        FolderHandle(id)
    }

    /// The folder a handle stands for, if it was issued in this run.
    pub fn get(&self, handle: FolderHandle) -> Option<PathBuf> {
        let picked = self.inner.lock().unwrap_or_else(PoisonError::into_inner);
        picked.folders.get(&handle.0).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handles_stand_for_the_folder_they_were_issued_for() {
        let folders = PickedFolders::default();
        let a = folders.insert(PathBuf::from("/a"));
        let b = folders.insert(PathBuf::from("/b"));
        assert_ne!(a, b);
        assert_eq!(folders.get(a), Some(PathBuf::from("/a")));
        assert_eq!(folders.get(b), Some(PathBuf::from("/b")));
    }

    #[test]
    fn a_handle_that_was_never_issued_stands_for_nothing() {
        let folders = PickedFolders::default();
        let other = PickedFolders::default();
        let handle = other.insert(PathBuf::from("/x"));
        assert_eq!(folders.get(handle), None);
    }
}
