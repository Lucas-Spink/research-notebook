//! Least recently used bookkeeping for the thumbnail cache: each file name's
//! size and when it was last used, as a counter that only grows. Keeping the
//! order in memory means a store never has to list the folder again.

use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Default)]
pub(super) struct Lru {
    /// File name to its size and position in `order`.
    entries: HashMap<String, Entry>,
    /// Position to file name, oldest use first.
    order: BTreeMap<u64, String>,
    next: u64,
    total: u64,
}

#[derive(Debug, Clone, Copy)]
struct Entry {
    size: u64,
    used: u64,
}

impl Lru {
    pub(super) fn contains(&self, name: &str) -> bool {
        self.entries.contains_key(name)
    }

    pub(super) fn total(&self) -> u64 {
        self.total
    }

    /// Records `name` with `size` as the most recently used, replacing any
    /// earlier record of it.
    pub(super) fn put(&mut self, name: String, size: u64) {
        self.forget(&name);
        let used = self.bump();
        self.order.insert(used, name.clone());
        self.entries.insert(name, Entry { size, used });
        self.total += size;
    }

    /// Marks `name` as the most recently used, if it is recorded.
    pub(super) fn touch(&mut self, name: &str) {
        if let Some(entry) = self.entries.get(name).copied() {
            self.put(name.to_owned(), entry.size);
        }
    }

    pub(super) fn forget(&mut self, name: &str) {
        if let Some(entry) = self.entries.remove(name) {
            self.order.remove(&entry.used);
            self.total -= entry.size;
        }
    }

    /// Every recorded name, least recently used first.
    pub(super) fn oldest_first(&self) -> Vec<String> {
        self.order.values().cloned().collect()
    }

    fn bump(&mut self) -> u64 {
        let used = self.next;
        self.next += 1;
        used
    }
}
