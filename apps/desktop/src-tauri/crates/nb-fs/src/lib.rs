//! Safe filesystem access for the notebook (spec 6.3, 6.5, 9.3). The only
//! crate that may write, rename or delete project files: every write is
//! confined to a project's `_notebook/` folder and is atomic.
//!
//! The functions block; callers run them on a blocking thread.

// disallowed_methods: `clippy.toml` forbids the std::fs write calls
// everywhere except here, where they are wrapped with path confinement,
// atomic replacement and retry.
#![allow(clippy::disallowed_methods)]

mod atomic;
mod error;
mod names;
mod path;
mod project;

pub use atomic::{AtomicIo, RealIo, LOCK_RETRY_BUDGET};
pub use error::{OpenError, PathError, WriteError};
pub use path::ProjectRelPath;
pub use project::{ProjectRoot, NOTEBOOK_DIR};
