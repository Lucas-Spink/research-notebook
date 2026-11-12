//! Windows hands back paths in the verbatim form `\\?\C:\...` once they have
//! been canonicalised, which `vscode://file/` URIs, the clipboard and `cmd`
//! all mishandle. `plain_path` turns them back into the form a person types.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::path::Path;

use nb_opener::plain_path;

fn plain(text: &str) -> String {
    plain_path(Path::new(text)).to_string_lossy().into_owned()
}

#[test]
fn a_verbatim_drive_path_loses_its_prefix() {
    assert_eq!(
        plain(r"\\?\C:\Users\lucas\University\PhD\Rotation 1\_notebook\SUMMARY.md"),
        r"C:\Users\lucas\University\PhD\Rotation 1\_notebook\SUMMARY.md"
    );
}

#[test]
fn a_verbatim_unc_path_becomes_an_ordinary_one() {
    assert_eq!(
        plain(r"\\?\UNC\server\share\results\plot.png"),
        r"\\server\share\results\plot.png"
    );
}

#[test]
fn an_ordinary_path_is_unchanged() {
    assert_eq!(
        plain(r"C:\Users\lucas\plot.png"),
        r"C:\Users\lucas\plot.png"
    );
    assert_eq!(plain("/home/lucas/plot.png"), "/home/lucas/plot.png");
    assert_eq!(
        plain(r"\\server\share\plot.png"),
        r"\\server\share\plot.png"
    );
}

#[test]
fn a_verbatim_path_that_is_not_a_drive_is_left_alone() {
    // A volume GUID has no drive letter to fall back to, so stripping the
    // prefix would change which file it names.
    let volume = r"\\?\Volume{01234567-89ab-cdef-0123-456789abcdef}\plot.png";
    assert_eq!(plain(volume), volume);
}

#[cfg(windows)]
mod windows {
    use std::io;

    use nb_opener::{perform, FileAction, Launcher};

    use super::*;

    #[derive(Default)]
    struct Recording {
        calls: Vec<(String, Vec<String>)>,
    }

    impl Launcher for Recording {
        fn spawn(&mut self, program: &str, args: &[String]) -> io::Result<()> {
            self.calls.push((program.to_owned(), args.to_vec()));
            Ok(())
        }

        fn write_stdin(&mut self, _: &str, _: &[String], _: &str) -> io::Result<()> {
            panic!("not exercised by these tests");
        }
    }

    #[test]
    fn open_in_vs_code_uses_the_plain_path_for_a_verbatim_one() {
        let mut launcher = Recording::default();
        perform(
            &mut launcher,
            Path::new(r"\\?\C:\Users\lucas\Rotation 1\SUMMARY.md"),
            FileAction::OpenInVsCode,
        )
        .unwrap();
        assert_eq!(
            launcher.calls,
            vec![(
                "cmd".to_owned(),
                vec![
                    "/C".to_owned(),
                    "start".to_owned(),
                    String::new(),
                    "vscode://file/C:/Users/lucas/Rotation 1/SUMMARY.md".to_owned(),
                ],
            )]
        );
    }

    #[test]
    fn reveal_and_open_use_the_plain_path_for_a_verbatim_one() {
        let mut launcher = Recording::default();
        let path = Path::new(r"\\?\C:\Users\lucas\plot.png");
        perform(&mut launcher, path, FileAction::Reveal).unwrap();
        perform(&mut launcher, path, FileAction::OpenFile).unwrap();
        assert_eq!(
            launcher.calls[0].1,
            vec![r"/select,C:\Users\lucas\plot.png".to_owned()]
        );
        assert_eq!(launcher.calls[1].1[3], r"C:\Users\lucas\plot.png");
    }
}
