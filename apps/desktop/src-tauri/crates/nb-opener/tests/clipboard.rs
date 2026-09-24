//! S3-T11 (FR-PRV-02, "Copy path"): the text is piped to the platform's own
//! clipboard helper (`clip` on Windows, `pbcopy` on macOS), so no clipboard
//! dependency is needed and the webview never handles the path itself.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::io;

use nb_opener::{copy_to_clipboard, Launcher};

#[derive(Debug, Default)]
struct Recording {
    calls: Vec<(String, Vec<String>, Vec<u8>)>,
    fail: bool,
}

impl Launcher for Recording {
    fn spawn(&mut self, _program: &str, _args: &[String]) -> io::Result<()> {
        panic!("copy_to_clipboard must write to stdin, not just spawn");
    }

    fn write_stdin(&mut self, program: &str, args: &[String], text: &str) -> io::Result<()> {
        self.calls
            .push((program.to_owned(), args.to_vec(), text.as_bytes().to_vec()));
        if self.fail {
            return Err(io::Error::other("boom"));
        }
        Ok(())
    }
}

#[cfg(windows)]
#[test]
fn windows_pipes_the_text_to_clip() {
    let mut launcher = Recording::default();
    copy_to_clipboard(&mut launcher, "C:\\proj\\evidence\\plot.png").unwrap();
    assert_eq!(
        launcher.calls,
        [(
            "clip".to_owned(),
            Vec::<String>::new(),
            b"C:\\proj\\evidence\\plot.png".to_vec()
        )]
    );
}

#[cfg(target_os = "macos")]
#[test]
fn macos_pipes_the_text_to_pbcopy() {
    let mut launcher = Recording::default();
    copy_to_clipboard(&mut launcher, "/proj/evidence/plot.png").unwrap();
    assert_eq!(
        launcher.calls,
        [(
            "pbcopy".to_owned(),
            Vec::<String>::new(),
            b"/proj/evidence/plot.png".to_vec()
        )]
    );
}

#[test]
fn a_launcher_failure_is_returned() {
    let mut launcher = Recording {
        fail: true,
        ..Recording::default()
    };
    assert!(copy_to_clipboard(&mut launcher, "x").is_err());
}
