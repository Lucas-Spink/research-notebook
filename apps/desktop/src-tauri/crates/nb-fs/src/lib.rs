//! Safe filesystem access for the notebook (spec 6.3, 6.5, 9.3). The only
//! crate that may write, rename or delete project files: every write is
//! confined to a project's `_notebook/` folder and is atomic.
//!
//! The functions block; callers run them on a blocking thread.
//!
//! Two kinds of write fall outside the rule that everything stays in
//! `_notebook/`, each narrow and named: the repository hygiene entries in
//! the project root's `.gitignore` and `.gitattributes` ([`hygiene`]), and
//! the application's own settings file ([`settings`]), which is not part of
//! any project. See ADR-0021.

// disallowed_methods: `clippy.toml` forbids the std::fs write calls
// everywhere except here, where they are wrapped with path confinement,
// atomic replacement and retry.
#![allow(clippy::disallowed_methods)]

mod atomic;
mod create;
mod error;
pub mod hygiene;
mod names;
mod path;
mod project;
mod read;
mod readme;
pub mod settings;
mod target;

pub use atomic::{AtomicIo, RealIo, LOCK_RETRY_BUDGET};
pub use create::{Created, NewProject};
pub use error::{CreateError, OpenError, PathError, ReadError, WriteError};
pub use path::ProjectRelPath;
pub use project::{ProjectRoot, NOTEBOOK_DIR};
