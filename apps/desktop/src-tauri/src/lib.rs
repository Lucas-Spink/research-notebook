mod commands;

use tauri_specta::{collect_commands, Builder};

/// Builds the typed-command registry used by [`run`] to export
/// `apps/desktop/src/ipc/bindings.ts` and to wire up `invoke_handler`.
///
/// `pub` only so it can be exercised from outside this crate if needed
/// later — this crate is the application binary, not a published library.
pub fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![commands::preview::preview_thumbnail_png])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();

    // Regenerates apps/desktop/src/ipc/bindings.ts on every dev run, so it
    // never drifts from the commands above. Never edit that file by hand
    // (AGENTS.md section 5, "Generated files"). A failure here should not
    // stop the app from launching, so it is reported rather than unwound.
    #[cfg(debug_assertions)]
    if let Err(error) = builder.export(
        specta_typescript::Typescript::default(),
        "../src/ipc/bindings.ts",
    ) {
        eprintln!("failed to export typescript bindings: {error}");
    }

    if let Err(error) = tauri::Builder::default()
        .invoke_handler(builder.invoke_handler())
        .run(tauri::generate_context!())
    {
        eprintln!("error while running tauri application: {error}");
        std::process::exit(1);
    }
}
