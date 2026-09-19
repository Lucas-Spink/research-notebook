//! Application settings (FR-PRJ-03, FR-PRJ-07): the recent projects and,
//! per machine, the folders of external roots. They live in the
//! application's settings folder, not in any project.

mod model;
mod store;

pub use model::{RecentProject, Settings, MAX_RECENT_PROJECTS};
pub use store::{SettingsError, SettingsStore, SETTINGS_FILE};
