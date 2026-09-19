/// The version of this build, recorded in `project.yaml` as
/// `last_written_by` (spec 5.3) so the frontend need not read it from
/// anywhere it could disagree with the Rust crate.
#[tauri::command]
#[specta::specta]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}
