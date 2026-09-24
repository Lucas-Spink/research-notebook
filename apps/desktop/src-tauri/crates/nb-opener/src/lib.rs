//! Launches one external process to act on a file or folder (FR-PRV-02):
//! open it with the default application, reveal it in Explorer or Finder, or
//! open it in VS Code by its `vscode://file/` URI (spec 9.4).
//!
//! `clippy.toml` reserves `std::process::Command::new` for `nb-fs` and "the
//! opener module" (AGENTS.md section 4); this is that module. Nothing here
//! reads or writes any file — it only starts another program pointed at a
//! path the caller has already resolved and checked.
//!
//! Every action takes a [`Launcher`], so tests never spawn a real process:
//! [`RealLauncher`] is the only implementation that does.
// disallowed_methods: this crate exists to wrap std::process::Command::new,
// behind the `Launcher` trait so every call is injectable in tests.
#![forbid(unsafe_code)]
#![allow(clippy::disallowed_methods)]

use std::io::{self, Write};
use std::path::Path;
use std::process::{Command, Stdio};

/// Starts one process. Tests supply a fake that records the call instead of
/// running anything.
pub trait Launcher {
    /// Starts `program` and does not wait for it.
    fn spawn(&mut self, program: &str, args: &[String]) -> io::Result<()>;

    /// Starts `program`, writes `text` to its standard input, then waits for
    /// it to exit. Used for the clipboard helpers, which read stdin, act,
    /// and exit; unlike [`Launcher::spawn`], this waits so a caller knows
    /// the text was handed over before reporting success.
    fn write_stdin(&mut self, program: &str, args: &[String], text: &str) -> io::Result<()>;
}

/// Spawns the real process. [`Launcher::spawn`] does not wait for it: the
/// action has succeeded once the program starts, whatever it goes on to do.
#[derive(Debug, Default)]
pub struct RealLauncher;

impl Launcher for RealLauncher {
    fn spawn(&mut self, program: &str, args: &[String]) -> io::Result<()> {
        Command::new(program).args(args).spawn().map(|_child| ())
    }

    fn write_stdin(&mut self, program: &str, args: &[String], text: &str) -> io::Result<()> {
        let mut child = Command::new(program)
            .args(args)
            .stdin(Stdio::piped())
            .spawn()?;
        // Closed by dropping it, before waiting: the child sees end of input
        // and reads the rest, matching how a shell pipe closes it.
        let mut stdin = child.stdin.take().ok_or_else(|| {
            io::Error::other("the child process gave no standard input to write to")
        })?;
        stdin.write_all(text.as_bytes())?;
        drop(stdin);
        let status = child.wait()?;
        if status.success() {
            Ok(())
        } else {
            Err(io::Error::other(format!(
                "{program} exited with status {status}"
            )))
        }
    }
}

/// One of FR-PRV-02's distinct actions on a file. `CopyPath` is not here: it
/// writes to the clipboard rather than launching a process.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileAction {
    OpenFile,
    Reveal,
    OpenInVsCode,
}

/// Carries out `action` on `path` through `launcher`.
pub fn perform<L: Launcher>(launcher: &mut L, path: &Path, action: FileAction) -> io::Result<()> {
    match action {
        FileAction::OpenFile => open_file(launcher, path),
        FileAction::Reveal => reveal_file(launcher, path),
        FileAction::OpenInVsCode => open_uri(launcher, &vscode_uri(path)),
    }
}

/// Opens `path` with the system's default application for it, as a double
/// click would (spec 9.4).
#[cfg(windows)]
pub fn open_file<L: Launcher>(launcher: &mut L, path: &Path) -> io::Result<()> {
    start(launcher, &path.to_string_lossy())
}

#[cfg(not(windows))]
pub fn open_file<L: Launcher>(launcher: &mut L, path: &Path) -> io::Result<()> {
    launcher.spawn("open", &[path.to_string_lossy().into_owned()])
}

/// Opens the file manager with `path` selected: Explorer on Windows, Finder
/// on macOS (spec 9.4).
#[cfg(windows)]
pub fn reveal_file<L: Launcher>(launcher: &mut L, path: &Path) -> io::Result<()> {
    launcher.spawn("explorer", &[format!("/select,{}", path.to_string_lossy())])
}

#[cfg(not(windows))]
pub fn reveal_file<L: Launcher>(launcher: &mut L, path: &Path) -> io::Result<()> {
    launcher.spawn(
        "open",
        &["-R".to_owned(), path.to_string_lossy().into_owned()],
    )
}

/// Opens `path` itself (a folder) in the file manager.
#[cfg(windows)]
pub fn open_folder<L: Launcher>(launcher: &mut L, path: &Path) -> io::Result<()> {
    launcher.spawn("explorer", &[path.to_string_lossy().into_owned()])
}

#[cfg(not(windows))]
pub fn open_folder<L: Launcher>(launcher: &mut L, path: &Path) -> io::Result<()> {
    launcher.spawn("open", &[path.to_string_lossy().into_owned()])
}

/// Opens `uri` with whatever program is registered to handle its scheme,
/// such as `vscode:`.
#[cfg(windows)]
pub fn open_uri<L: Launcher>(launcher: &mut L, uri: &str) -> io::Result<()> {
    start(launcher, uri)
}

#[cfg(not(windows))]
pub fn open_uri<L: Launcher>(launcher: &mut L, uri: &str) -> io::Result<()> {
    launcher.spawn("open", &[uri.to_owned()])
}

/// `cmd /C start "" <target>`: the empty quoted title is required, or `cmd`
/// takes a quoted target for the title instead of opening it.
#[cfg(windows)]
fn start<L: Launcher>(launcher: &mut L, target: &str) -> io::Result<()> {
    launcher.spawn(
        "cmd",
        &[
            "/C".to_owned(),
            "start".to_owned(),
            String::new(),
            target.to_owned(),
        ],
    )
}

/// Puts `text` on the system clipboard (FR-PRV-02, "Copy path"), by piping
/// it into the platform's own clipboard helper: `clip` on Windows, `pbcopy`
/// on macOS. Neither reads or echoes its input, so nothing here needs a
/// clipboard dependency or `unsafe` platform API calls.
#[cfg(windows)]
pub fn copy_to_clipboard<L: Launcher>(launcher: &mut L, text: &str) -> io::Result<()> {
    launcher.write_stdin("clip", &[], text)
}

#[cfg(not(windows))]
pub fn copy_to_clipboard<L: Launcher>(launcher: &mut L, text: &str) -> io::Result<()> {
    launcher.write_stdin("pbcopy", &[], text)
}

/// The `vscode://file/...` URI for `path` (spec 9.4): backslashes become
/// forward slashes, and the path is joined without doubling the slash a
/// POSIX absolute path already starts with.
pub fn vscode_uri(path: &Path) -> String {
    #[cfg(windows)]
    let text = path.to_string_lossy().replace('\\', "/");
    #[cfg(not(windows))]
    let text = path.to_string_lossy().into_owned();
    if text.starts_with('/') {
        format!("vscode://file{text}")
    } else {
        format!("vscode://file/{text}")
    }
}

#[cfg(all(test, windows))]
#[allow(clippy::unwrap_used)]
mod real_clipboard_tests {
    use super::*;

    /// The only test here that spawns a real process: `clip.exe` is a
    /// headless Windows built-in, safe to run in CI (no window, no user
    /// interaction), and proves `RealLauncher::write_stdin` truly pipes the
    /// text rather than only building the right command line.
    #[test]
    fn real_launcher_pipes_text_through_clip() {
        let mut launcher = RealLauncher;
        copy_to_clipboard(&mut launcher, "nb-opener smoke test").unwrap();
    }
}
