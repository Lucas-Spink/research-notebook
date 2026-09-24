//! S3-T11 (FR-PRV-02): Open file, Reveal in Finder or Explorer, and Open in
//! VS Code each launch one external process, built here and run through an
//! injected [`Launcher`] so no test ever spawns a real one (spec 9.4).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::io;
use std::path::Path;

use nb_opener::{open_folder, open_uri, perform, FileAction, Launcher};

/// Records every call instead of spawning anything.
#[derive(Debug, Default)]
struct Recording {
    calls: Vec<(String, Vec<String>)>,
    fail: bool,
}

impl Launcher for Recording {
    fn spawn(&mut self, program: &str, args: &[String]) -> io::Result<()> {
        self.calls.push((program.to_owned(), args.to_vec()));
        if self.fail {
            return Err(io::Error::other("boom"));
        }
        Ok(())
    }

    fn write_stdin(&mut self, _program: &str, _args: &[String], _text: &str) -> io::Result<()> {
        panic!("not exercised by these tests");
    }
}

#[cfg(windows)]
mod windows {
    use super::*;

    #[test]
    fn open_file_starts_it_with_the_default_application() {
        let mut launcher = Recording::default();
        perform(
            &mut launcher,
            Path::new(r"C:\proj\evidence\plot.png"),
            FileAction::OpenFile,
        )
        .unwrap();
        assert_eq!(
            launcher.calls,
            [(
                "cmd".to_owned(),
                vec![
                    "/C".to_owned(),
                    "start".to_owned(),
                    String::new(),
                    r"C:\proj\evidence\plot.png".to_owned(),
                ]
            )]
        );
    }

    #[test]
    fn reveal_selects_the_file_in_explorer() {
        let mut launcher = Recording::default();
        perform(
            &mut launcher,
            Path::new(r"C:\proj\evidence\plot.png"),
            FileAction::Reveal,
        )
        .unwrap();
        assert_eq!(
            launcher.calls,
            [(
                "explorer".to_owned(),
                vec![format!("/select,{}", r"C:\proj\evidence\plot.png")]
            )]
        );
    }

    #[test]
    fn open_in_vs_code_starts_the_vscode_file_uri() {
        let mut launcher = Recording::default();
        perform(
            &mut launcher,
            Path::new(r"C:\proj\evidence\plot.png"),
            FileAction::OpenInVsCode,
        )
        .unwrap();
        assert_eq!(
            launcher.calls,
            [(
                "cmd".to_owned(),
                vec![
                    "/C".to_owned(),
                    "start".to_owned(),
                    String::new(),
                    "vscode://file/C:/proj/evidence/plot.png".to_owned(),
                ]
            )]
        );
    }

    #[test]
    fn open_folder_opens_it_in_explorer() {
        let mut launcher = Recording::default();
        open_folder(&mut launcher, Path::new(r"C:\proj")).unwrap();
        assert_eq!(
            launcher.calls,
            [("explorer".to_owned(), vec![r"C:\proj".to_owned()])]
        );
    }

    #[test]
    fn open_uri_starts_an_arbitrary_uri() {
        let mut launcher = Recording::default();
        open_uri(&mut launcher, "vscode://file/C:/x").unwrap();
        assert_eq!(
            launcher.calls,
            [(
                "cmd".to_owned(),
                vec![
                    "/C".to_owned(),
                    "start".to_owned(),
                    String::new(),
                    "vscode://file/C:/x".to_owned(),
                ]
            )]
        );
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;

    #[test]
    fn open_file_opens_it_with_the_default_application() {
        let mut launcher = Recording::default();
        perform(
            &mut launcher,
            Path::new("/proj/evidence/plot.png"),
            FileAction::OpenFile,
        )
        .unwrap();
        assert_eq!(
            launcher.calls,
            [(
                "open".to_owned(),
                vec!["/proj/evidence/plot.png".to_owned()]
            )]
        );
    }

    #[test]
    fn reveal_selects_the_file_in_finder() {
        let mut launcher = Recording::default();
        perform(
            &mut launcher,
            Path::new("/proj/evidence/plot.png"),
            FileAction::Reveal,
        )
        .unwrap();
        assert_eq!(
            launcher.calls,
            [(
                "open".to_owned(),
                vec!["-R".to_owned(), "/proj/evidence/plot.png".to_owned()]
            )]
        );
    }

    #[test]
    fn open_in_vs_code_opens_the_vscode_file_uri() {
        let mut launcher = Recording::default();
        perform(
            &mut launcher,
            Path::new("/proj/evidence/plot.png"),
            FileAction::OpenInVsCode,
        )
        .unwrap();
        assert_eq!(
            launcher.calls,
            [(
                "open".to_owned(),
                vec!["vscode://file/proj/evidence/plot.png".to_owned()]
            )]
        );
    }

    #[test]
    fn open_folder_opens_it_in_finder() {
        let mut launcher = Recording::default();
        open_folder(&mut launcher, Path::new("/proj")).unwrap();
        assert_eq!(
            launcher.calls,
            [("open".to_owned(), vec!["/proj".to_owned()])]
        );
    }
}

// Runs on every platform: the launcher's own failure is reported, not swallowed.
#[test]
fn a_launcher_failure_is_returned() {
    let mut launcher = Recording {
        fail: true,
        ..Recording::default()
    };
    assert!(perform(&mut launcher, Path::new("x"), FileAction::OpenFile).is_err());
}
