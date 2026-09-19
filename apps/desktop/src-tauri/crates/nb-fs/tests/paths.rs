//! Path validation and normalisation (spec 5.2, 6.5, 9.3; format-v1.md `path`).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::path::{Component, Path};

use nb_fs::{PathError, ProjectRelPath};
use proptest::prelude::*;
use unicode_normalization::is_nfc;

fn parse(input: &str) -> Result<String, PathError> {
    ProjectRelPath::parse(input).map(|path| path.as_str().to_owned())
}

#[test]
fn accepts_a_plain_relative_path() {
    assert_eq!(
        parse("_notebook/experiments/EXP-042/experiment.md").unwrap(),
        "_notebook/experiments/EXP-042/experiment.md"
    );
}

#[test]
fn converts_backslashes_to_forward_slashes() {
    assert_eq!(parse("_notebook\\a\\b.md").unwrap(), "_notebook/a/b.md");
    assert_eq!(parse("_notebook/a\\b.md").unwrap(), "_notebook/a/b.md");
}

#[test]
fn converts_to_nfc() {
    // "e" followed by a combining acute accent becomes the single character.
    assert_eq!(
        parse("_notebook/e\u{301}.md").unwrap(),
        "_notebook/\u{e9}.md"
    );
    assert_eq!(
        parse("_notebook/e\u{301}.md").unwrap(),
        parse("_notebook/\u{e9}.md").unwrap()
    );
}

#[test]
fn rejects_the_empty_path() {
    assert_eq!(parse(""), Err(PathError::Empty));
}

#[test]
fn rejects_absolute_paths_drive_letters_and_unc() {
    for input in [
        "/etc/passwd",
        "\\Windows\\win.ini",
        "C:/x",
        "c:\\x",
        "C:x",
        "C:",
        "//server/share/x",
        "\\\\server\\share\\x",
        "\\\\?\\C:\\x",
    ] {
        assert_eq!(parse(input), Err(PathError::Absolute), "{input}");
    }
}

#[test]
fn rejects_dot_and_dot_dot_segments() {
    for input in [
        ".",
        "..",
        "../x",
        "a/../x",
        "a/..",
        "a/./b",
        "_notebook/../scripts/run.R",
        "_notebook\\..\\scripts\\run.R",
    ] {
        assert_eq!(parse(input), Err(PathError::Traversal), "{input}");
    }
}

#[test]
fn rejects_segments_windows_would_read_as_dot_or_dot_dot() {
    // Windows drops trailing dots and spaces, so these name "." or "..".
    for input in ["a/.. /b", "a/... /b", "a/. /b", "a/.../b", "a/ /b"] {
        assert_eq!(parse(input), Err(PathError::Traversal), "{input}");
    }
}

#[test]
fn rejects_empty_segments() {
    for input in ["a//b", "a/b/", "a\\\\b"] {
        assert_eq!(parse(input), Err(PathError::EmptySegment), "{input}");
    }
}

#[test]
fn rejects_control_characters() {
    for input in [
        "a/\u{0}b", "a/b\n", "a/\u{1f}", "a/\u{7f}", "a/\u{85}", "a/\u{9f}",
    ] {
        assert_eq!(parse(input), Err(PathError::ControlCharacter), "{input}");
    }
}

#[test]
fn keeps_hidden_names_and_dots_inside_names() {
    for input in [
        "_notebook/.history/x.md",
        "_notebook/.lock",
        "a/b.c.d",
        "a/..b",
        "a/b..",
    ] {
        assert!(parse(input).is_ok(), "{input}");
    }
}

#[test]
fn segments_lists_each_component() {
    let path = ProjectRelPath::parse("_notebook/a/b.md").unwrap();
    assert_eq!(
        path.segments().collect::<Vec<_>>(),
        ["_notebook", "a", "b.md"]
    );
}

// Segments that stress the rules: separators of both kinds, dots, spaces,
// colons, combining characters, control characters and device names.
fn segment() -> impl Strategy<Value = String> {
    prop_oneof![
        Just("..".to_owned()),
        Just(".".to_owned()),
        Just(" ".to_owned()),
        Just("...".to_owned()),
        Just("a".to_owned()),
        Just("e\u{301}".to_owned()),
        Just("\u{e9}".to_owned()),
        Just("C:".to_owned()),
        Just("CON".to_owned()),
        Just("\u{0}".to_owned()),
        Just("x\\y".to_owned()),
        "\\PC{0,6}",
    ]
}

fn candidate() -> impl Strategy<Value = String> {
    prop::collection::vec(segment(), 0..5).prop_flat_map(|segments| {
        prop_oneof![
            Just(segments.join("/")),
            Just(segments.join("\\")),
            Just(format!("/{}", segments.join("/"))),
        ]
    })
}

proptest! {
    #[test]
    fn parse_never_panics(input in "\\PC{0,40}") {
        let _ = ProjectRelPath::parse(&input);
    }

    #[test]
    fn normalisation_is_idempotent(input in candidate()) {
        if let Ok(path) = ProjectRelPath::parse(&input) {
            prop_assert_eq!(ProjectRelPath::parse(path.as_str()), Ok(path));
        }
    }

    #[test]
    fn accepted_paths_are_confined_and_normalised(input in candidate()) {
        if let Ok(path) = ProjectRelPath::parse(&input) {
            let text = path.as_str();
            prop_assert!(!text.contains('\\'));
            prop_assert!(!text.starts_with('/'));
            prop_assert!(is_nfc(text));
            for segment in text.split('/') {
                prop_assert!(!segment.is_empty());
                prop_assert!(!segment.trim_end_matches(['.', ' ']).is_empty());
                prop_assert!(!segment.chars().any(char::is_control));
            }
            // Joined onto any root, only ordinary names are added.
            prop_assert!(Path::new(text).components().all(|c| matches!(c, Component::Normal(_))));
        }
    }
}
