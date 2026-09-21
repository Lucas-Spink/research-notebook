mod commands;

use std::sync::Arc;

use nb_fs::lock::{LockRegistry, SystemEnv};
use nb_fs::settings::SettingsStore;
use nb_fs::watch::WatchRegistry;
use tauri::Manager;
use tauri_specta::{collect_commands, Builder};

/// Builds the typed-command registry used by [`run`] to export
/// `apps/desktop/src/ipc/bindings.ts` and to wire up `invoke_handler`.
///
/// `pub` only so it can be exercised from outside this crate if needed
/// later — this crate is the application binary, not a published library.
pub fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        commands::app::app_version,
        commands::preview::preview_thumbnail_png,
        commands::projects::create_project,
        commands::projects::open_project,
        commands::projects::open_recent_project,
        commands::projects::locate_project,
        commands::projects::remember_project,
        commands::projects::list_recent_projects,
        commands::projects::set_external_root,
        commands::projects::external_root_status,
        commands::projects::lock::acquire_project_lock,
        commands::projects::lock::project_lock_state,
        commands::projects::lock::release_project_lock,
        commands::projects::files::list_notebook_files,
        commands::projects::files::read_notebook_file,
        commands::projects::history::write_notebook_file,
        commands::projects::history::move_to_trash,
        commands::projects::history::backup_for_version_change,
        commands::projects::watch::start_project_watch,
        commands::projects::watch::poll_project_changes,
        commands::projects::watch::stop_project_watch,
    ])
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

    let built = tauri::Builder::default()
        // Only the Rust API is used, to open folder dialogs from commands. No
        // capability grants the webview the plugin's own commands.
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::projects::PickedFolders::default())
        // The locks this run holds, released when it exits.
        .manage(LockRegistry::new(Arc::new(SystemEnv::new(env!(
            "CARGO_PKG_VERSION"
        )))))
        // The watchers this run holds, stopped when it exits.
        .manage(WatchRegistry::new())
        .setup(|app| {
            // Recent projects and external root paths belong to this machine
            // (spec 9.4: %APPDATA%\<app id> or ~/Library/Application Support/<app id>).
            app.manage(SettingsStore::new(app.path().app_config_dir()?));
            Ok(())
        })
        .invoke_handler(builder.invoke_handler())
        .build(tauri::generate_context!());
    let app = match built {
        Ok(app) => app,
        Err(error) => {
            eprintln!("error while building tauri application: {error}");
            std::process::exit(1);
        }
    };
    app.run(|app, event| {
        // Remove the project locks this run holds. A crash skips this, and the
        // lock goes stale after five minutes instead.
        if let tauri::RunEvent::Exit = event {
            app.state::<LockRegistry>().release_all();
            app.state::<WatchRegistry>().stop_all();
        }
    });
}
