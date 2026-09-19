use std::collections::BTreeMap;
use std::path::Path;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use notify::event::ModifyKind;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use super::coalesce::Coalescer;
use super::filter::is_notebook_data_folder;
use super::state::read_state;
use super::{Change, ChangeBatch, WatchError};
use crate::path::ProjectRelPath;
use crate::project::{ProjectRoot, NOTEBOOK_DIR};

/// How long a file must be quiet before it is reported.
const WINDOW: Duration = Duration::from_millis(300);
/// The longest a file that keeps changing is held back.
const MAX_WAIT: Duration = Duration::from_secs(2);
/// How long the worker sleeps when nothing is waiting.
const IDLE: Duration = Duration::from_secs(60);

enum Message {
    Event(notify::Result<Event>),
    Stop,
}

/// Changes waiting to be taken, the newest state of each path.
#[derive(Default)]
struct Pending {
    changes: BTreeMap<String, Change>,
    needs_rescan: bool,
}

struct Shared {
    pending: Mutex<Pending>,
    ready: Condvar,
}

impl Shared {
    fn lock(&self) -> MutexGuard<'_, Pending> {
        // A panic elsewhere cannot leave the map half-updated.
        self.pending.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// A running watcher on one project's `_notebook/`. It only reads: it hashes
/// changed files and never writes, renames or removes anything. Dropping it
/// stops the operating-system watch and the worker thread.
pub struct ProjectWatcher {
    shared: Arc<Shared>,
    stop: Sender<Message>,
    worker: Option<JoinHandle<()>>,
    // Kept alive for as long as events are wanted.
    watcher: Option<RecommendedWatcher>,
}

impl ProjectWatcher {
    /// Takes the changes reported since the last call, without waiting.
    pub fn poll(&self) -> ChangeBatch {
        take(&mut self.shared.lock())
    }

    /// Waits up to `timeout` for a change, then takes what is waiting. Empty
    /// if nothing came.
    pub fn wait(&self, timeout: Duration) -> ChangeBatch {
        let guard = self.shared.lock();
        let (mut guard, _) = self
            .shared
            .ready
            .wait_timeout_while(guard, timeout, |p| p.changes.is_empty() && !p.needs_rescan)
            .unwrap_or_else(PoisonError::into_inner);
        take(&mut guard)
    }
}

fn take(pending: &mut Pending) -> ChangeBatch {
    let taken = std::mem::take(pending);
    ChangeBatch {
        changes: taken.changes.into_values().collect(),
        needs_rescan: taken.needs_rescan,
    }
}

impl Drop for ProjectWatcher {
    fn drop(&mut self) {
        // Stop the events first so nothing is sent to a finished worker.
        self.watcher = None;
        let _ = self.stop.send(Message::Stop);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl ProjectRoot {
    /// Starts watching `_notebook/` for changes made by anything else.
    /// Changes the application makes itself are reported too: the caller
    /// tells them apart by content hash (ADR-0024).
    pub fn watch(&self) -> Result<ProjectWatcher, WatchError> {
        let notebook = self.notebook.clone();
        let (tx, rx) = mpsc::channel();
        let events = tx.clone();
        let mut watcher = notify::recommended_watcher(move |event| {
            let _ = events.send(Message::Event(event));
        })
        .map_err(|e| WatchError::Start(e.to_string()))?;
        watcher
            .watch(&notebook, RecursiveMode::Recursive)
            .map_err(|e| WatchError::Start(e.to_string()))?;

        let shared = Arc::new(Shared {
            pending: Mutex::new(Pending::default()),
            ready: Condvar::new(),
        });
        let worker_shared = Arc::clone(&shared);
        let worker = thread::Builder::new()
            .name("nb-fs-watch".to_owned())
            .spawn(move || run(&notebook, &rx, &worker_shared))
            .map_err(|e| WatchError::Start(e.to_string()))?;
        Ok(ProjectWatcher {
            shared,
            stop: tx,
            worker: Some(worker),
            watcher: Some(watcher),
        })
    }
}

/// The worker: feeds events to the coalescer and publishes what settles.
fn run(notebook: &Path, rx: &mpsc::Receiver<Message>, shared: &Shared) {
    let mut coalescer = Coalescer::new(WINDOW, MAX_WAIT);
    loop {
        let wait = coalescer
            .next_due()
            .map_or(IDLE, |due| due.saturating_duration_since(Instant::now()));
        match rx.recv_timeout(wait) {
            Ok(Message::Event(event)) => record(notebook, event, &mut coalescer),
            Ok(Message::Stop) | Err(RecvTimeoutError::Disconnected) => return,
            Err(RecvTimeoutError::Timeout) => {}
        }
        let due = coalescer.take_due(Instant::now());
        if due.paths.is_empty() && !due.overflow {
            continue;
        }
        publish(notebook, &due.paths, due.overflow, shared);
    }
}

fn record(notebook: &Path, event: notify::Result<Event>, coalescer: &mut Coalescer) {
    let now = Instant::now();
    let event = match event {
        Ok(event) => event,
        Err(_) => return coalescer.record_overflow(now),
    };
    if matches!(event.kind, EventKind::Access(_)) {
        return;
    }
    if event.need_rescan() {
        coalescer.record_overflow(now);
    }
    let folder_gone = matches!(
        event.kind,
        EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))
    );
    for path in &event.paths {
        let Some(relative) = relative_to(notebook, path) else {
            continue;
        };
        // Removing or renaming a folder of data files may be reported for
        // the folder alone, so the files in it are asked to be re-checked.
        if folder_gone && is_notebook_data_folder(&relative) {
            coalescer.record_overflow(now);
        }
        coalescer.record(&relative, now);
    }
}

/// Reads each settled file and makes its state available to `poll`.
fn publish(notebook: &Path, paths: &[String], overflow: bool, shared: &Shared) {
    let mut changes = Vec::with_capacity(paths.len());
    for relative in paths {
        let Ok(path) = ProjectRelPath::parse(&format!("{NOTEBOOK_DIR}/{relative}")) else {
            continue;
        };
        let state = read_state(&notebook.join(relative));
        changes.push(Change { path, state });
    }
    let mut pending = shared.lock();
    for change in changes {
        pending
            .changes
            .insert(change.path.as_str().to_owned(), change);
    }
    pending.needs_rescan |= overflow;
    shared.ready.notify_all();
}

/// `path` relative to `notebook`, with `/` separators. The operating system
/// may spell the same folder with or without the Windows `\?\` prefix, and
/// in another case, so the comparison ignores both.
fn relative_to(notebook: &Path, path: &Path) -> Option<String> {
    let base = text(notebook);
    let full = text(path);
    let head = full.get(..base.len())?;
    let same = if cfg!(windows) {
        head.eq_ignore_ascii_case(&base)
    } else {
        head == base
    };
    if !same {
        return None;
    }
    full.get(base.len()..)?.strip_prefix('/').map(str::to_owned)
}

/// The path with `/` separators and without a Windows verbatim prefix.
fn text(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    text.strip_prefix("//?/").unwrap_or(&text).to_owned()
}
