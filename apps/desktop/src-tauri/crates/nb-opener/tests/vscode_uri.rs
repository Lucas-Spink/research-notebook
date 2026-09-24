//! S3-T11 (spec 9.4): the `vscode://file/...` URI, built exactly as the spec's
//! literal examples show it for each platform: no doubled slash for a POSIX
//! path that already starts with one, an inserted slash before a Windows
//! drive letter, and backslashes turned to forward slashes.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::path::Path;

use nb_opener::vscode_uri;

#[test]
fn a_posix_absolute_path_is_not_doubly_slashed() {
    assert_eq!(
        vscode_uri(Path::new("/Users/ana/project/plot.png")),
        "vscode://file/Users/ana/project/plot.png"
    );
}

#[cfg(windows)]
#[test]
fn a_windows_path_gets_forward_slashes_and_an_inserted_slash_before_the_drive() {
    assert_eq!(
        vscode_uri(Path::new(r"C:\Users\Ana María\plot.png")),
        "vscode://file/C:/Users/Ana María/plot.png"
    );
}
