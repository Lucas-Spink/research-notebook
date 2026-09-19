use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use super::filter::is_notebook_data_path;

/// When a path, or an overflow, was first and last seen in a burst.
#[derive(Debug, Clone, Copy)]
struct Seen {
    first: Instant,
    last: Instant,
}

/// What is ready to report.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Due {
    /// Notebook-relative data file paths, sorted.
    pub paths: Vec<String>,
    /// Events may have been lost, so every file should be re-checked.
    pub overflow: bool,
}

/// Turns bursts of raw events into single reports. An atomic write is
/// several events (create the temporary file, write it, rename it), and an
/// editor's save may be more, so a file is reported once it has been quiet
/// for `window`, or after `max_wait` if it never is.
///
/// A pure state machine: it is given the time, so tests drive it without
/// sleeping, and it does no I/O.
#[derive(Debug)]
pub struct Coalescer {
    window: Duration,
    max_wait: Duration,
    pending: BTreeMap<String, Seen>,
    overflow: Option<Seen>,
}

impl Coalescer {
    pub fn new(window: Duration, max_wait: Duration) -> Self {
        Self {
            window,
            max_wait,
            pending: BTreeMap::new(),
            overflow: None,
        }
    }

    /// Notes an event for `relative`, a path relative to `_notebook/` with
    /// `/` separators. Paths that are not notebook data files are dropped.
    pub fn record(&mut self, relative: &str, now: Instant) {
        if !is_notebook_data_path(relative) {
            return;
        }
        touch(self.pending.entry(relative.to_owned()), now);
    }

    /// Notes that the operating system lost events, or reported an error.
    pub fn record_overflow(&mut self, now: Instant) {
        self.overflow = Some(match self.overflow {
            Some(seen) => Seen { last: now, ..seen },
            None => Seen {
                first: now,
                last: now,
            },
        });
    }

    /// When the next report becomes ready, if any is waiting.
    pub fn next_due(&self) -> Option<Instant> {
        self.pending
            .values()
            .chain(self.overflow.as_ref())
            .map(|seen| self.due_at(seen))
            .min()
    }

    /// Removes and returns everything that is ready at `now`.
    pub fn take_due(&mut self, now: Instant) -> Due {
        let (window, max_wait) = (self.window, self.max_wait);
        let ready = |seen: &Seen| due_at(window, max_wait, seen) <= now;
        let paths: Vec<String> = self
            .pending
            .iter()
            .filter(|(_, seen)| ready(seen))
            .map(|(path, _)| path.clone())
            .collect();
        for path in &paths {
            self.pending.remove(path);
        }
        let overflow = self.overflow.as_ref().is_some_and(ready);
        if overflow {
            self.overflow = None;
        }
        Due { paths, overflow }
    }

    fn due_at(&self, seen: &Seen) -> Instant {
        due_at(self.window, self.max_wait, seen)
    }
}

fn touch(entry: std::collections::btree_map::Entry<'_, String, Seen>, now: Instant) {
    entry.and_modify(|seen| seen.last = now).or_insert(Seen {
        first: now,
        last: now,
    });
}

fn due_at(window: Duration, max_wait: Duration, seen: &Seen) -> Instant {
    (seen.last + window).min(seen.first + max_wait)
}
