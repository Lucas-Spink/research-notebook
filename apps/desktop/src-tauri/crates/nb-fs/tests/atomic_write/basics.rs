use proptest::prelude::*;

use crate::common::{rel, TestProject};
use crate::TARGET;

#[test]
fn writes_a_new_file_and_creates_missing_folders() {
    let project = TestProject::new();
    let path = "_notebook/experiments/EXP-001/experiment.md";
    project.open().write_atomic(&rel(path), b"hello\n").unwrap();
    assert_eq!(project.read(path), b"hello\n");
    assert!(project.temp_files().is_empty());
}

#[test]
fn replaces_an_existing_file_completely() {
    let project = TestProject::new();
    let root = project.open();
    root.write_atomic(&rel(TARGET), &vec![b'a'; 100_000])
        .unwrap();
    root.write_atomic(&rel(TARGET), b"short").unwrap();
    assert_eq!(project.read(TARGET), b"short");
    assert!(project.temp_files().is_empty());
}

#[test]
fn writes_empty_content() {
    let project = TestProject::new();
    let root = project.open();
    root.write_atomic(&rel(TARGET), b"something").unwrap();
    root.write_atomic(&rel(TARGET), b"").unwrap();
    assert_eq!(project.read(TARGET), b"");
}

proptest! {
    #[test]
    fn any_bytes_round_trip_and_leave_no_temp_file(
        first in prop::collection::vec(any::<u8>(), 0..150_000),
        second in prop::collection::vec(any::<u8>(), 0..150_000),
    ) {
        let project = TestProject::new();
        let root = project.open();
        root.write_atomic(&rel(TARGET), &first).unwrap();
        prop_assert_eq!(project.read(TARGET), first);
        root.write_atomic(&rel(TARGET), &second).unwrap();
        prop_assert_eq!(project.read(TARGET), second);
        prop_assert!(project.temp_files().is_empty());
    }
}
