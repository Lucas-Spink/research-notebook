//! Placeholder property test from S0-T08, proving the property-test suite
//! runs. Moved here from an inline `#[cfg(test)]` module in `src/lib.rs`:
//! once `desktop_lib` linked `tauri-specta`/`specta`/`schemars`, the inline
//! unit-test harness for this crate's `["staticlib", "cdylib", "rlib"]`
//! multi-crate-type lib failed to launch on Windows
//! (STATUS_ENTRYPOINT_NOT_FOUND) while the real application binary and
//! ordinary integration tests were unaffected. Filed as a spike finding for
//! S1-T11 rather than chased further here.
use proptest::prelude::*;

proptest! {
    #[test]
    fn reversing_twice_is_identity(s in "\\PC{0,50}") {
        let once: String = s.chars().rev().collect();
        let twice: String = once.chars().rev().collect();
        prop_assert_eq!(twice, s);
    }
}
