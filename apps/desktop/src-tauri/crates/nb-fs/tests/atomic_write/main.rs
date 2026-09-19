//! Gate S2-G05: atomic writes survive a crash. A reader sees the old file or
//! the complete new one, never a partial file (spec 6.5, 9.3, risk "Crash
//! during save corrupts notes").
// disallowed_methods: the tests read and inspect files in throwaway temporary
// projects, and spawn this test binary as the writer to be killed.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

#[path = "../common/mod.rs"]
mod common;

mod basics;
mod faults;
mod kill;
mod retry;

const TARGET: &str = "_notebook/notes.md";
const OLD: &[u8] = b"old contents";
const NEW: &[u8] = b"new contents"; // 12 bytes: three chunks of four

fn injected() -> std::io::Error {
    std::io::Error::other("injected fault")
}

/// The name of a temporary file nb-fs may leave behind if a writer dies.
fn is_temp_name(name: &str) -> bool {
    name.starts_with('.') && name.ends_with(".tmp")
}
