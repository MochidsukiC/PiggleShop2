// Piggle Shop Desktop — a thin Tauri shell around the shared web UI (web/),
// mirroring desktop/apps/rein. The same client renders the desktop frame
// (window.PIGGLE_DEVICE = "desktop") and reaches the same in-world backend.

#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

fn main() {
    tracing_subscriber::fmt::init();
    tracing::info!("Starting Piggle Shop Desktop");

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Piggle Shop Desktop");
}
