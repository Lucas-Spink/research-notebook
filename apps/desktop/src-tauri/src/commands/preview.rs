/// Generates a 256px-bounded PNG thumbnail for a PNG or JPEG image (spec
/// section 8). Spike for S1-T05: the first typed command in the app,
/// establishing the `apps/desktop/src/ipc/` generated-bindings boundary
/// that all future commands reuse (AGENTS.md section 4).
#[tauri::command]
#[specta::specta]
pub fn preview_thumbnail_png(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    nb_preview::thumbnail_png(&bytes).map_err(|error| error.to_string())
}
