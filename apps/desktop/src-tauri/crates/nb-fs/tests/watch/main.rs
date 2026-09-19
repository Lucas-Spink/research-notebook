//! Gate S2-G08 (spec 6.4 step 5, FR-HIS-05, ADR-0024): the watcher reports
//! changes made outside the application to notebook data files, once each,
//! and never writes anything.
// disallowed_methods: the tests build and inspect files in throwaway
// temporary projects, outside any real project.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::disallowed_methods
)]

#[path = "../common/mod.rs"]
mod common;

mod coalesce;
mod filter;
mod live;
mod registry;
