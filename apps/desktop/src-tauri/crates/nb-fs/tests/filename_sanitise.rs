//! Gate S3-G10: `cargo test -p nb-fs -- filename_sanitise`
//! (docs/testing-guide.md, "Property tests (Rust)").

mod filename_sanitise {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn is_windows_safe_and_bounded(name in "\\PC{0,200}") {
            let out = nb_fs::names::sanitise(&name);
            prop_assert!(nb_fs::names::is_windows_safe(&out));
            prop_assert!(out.chars().count() <= 64);
            prop_assert_eq!(nb_fs::names::sanitise(&out), out.clone());
        }
    }
}
