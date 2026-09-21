//! Snapshots before overwrite and their retention (spec 5.11, FR-HIS-01,
//! FR-HIS-02, ADR-0025). The stamp, the retention plan and the scope are pure;
//! the writes that use them are in [`snapshot`].

mod retention;
mod scope;
mod snapshot;
mod stamp;

pub use retention::plan_retention;
pub use scope::is_snapshot_scope;
pub use snapshot::{Expected, SaveOutcome};
pub use stamp::{format_stamp, parse_stamp, Snapshot};
