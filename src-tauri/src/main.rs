// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod admin_schema;
mod commands;
mod cript_key;
mod crypto;
mod db;
mod db_sqlx;
mod http_server;
mod last_payment_file;
mod payload;
mod stock_commands;

fn main() {
    sqlx::any::install_default_drivers();
    // Mode serveur seul : pour l'accès web sans fenêtre Tauri
    // Usage: app.exe --server ou app.exe server
    let args: Vec<String> = std::env::args().collect();
    let server_only = args.len() > 1 && (args[1] == "--server" || args[1] == "server");
    if server_only {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        rt.block_on(http_server::run_server());
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let frontend_path = app.path().resource_dir().ok().and_then(|res_dir| {
                let dist_up = res_dir.join("_up_").join("dist");
                if dist_up.exists() {
                    Some(dist_up)
                } else {
                    let dist = res_dir.join("dist");
                    if dist.exists() {
                        Some(dist)
                    } else {
                        None
                    }
                }
            });
            http_server::spawn_http_server(frontend_path);
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth_connection,
            commands::auth_message,
            commands::ensure_default_demo_docteur,
            commands::remove_demo_docteur_after_sadmin_login,
            commands::test_backend_rust,
            commands::get_local_ip,
            commands::open_external_url_prefer_edge,
            stock_commands::stock_list_articles,
            stock_commands::stock_upsert_article,
            stock_commands::stock_delete_article,
            stock_commands::stock_list_movements,
            stock_commands::stock_add_movement,
            stock_commands::stock_dashboard_stats,
            stock_commands::stock_export_csv,
            stock_commands::stock_import_csv,
            stock_commands::stock_list_parties,
            stock_commands::stock_upsert_party,
            stock_commands::stock_delete_party,
            stock_commands::stock_test_remote_db,
            stock_commands::stock_app_user_login,
            stock_commands::stock_list_app_users,
            stock_commands::stock_upsert_app_user,
            stock_commands::stock_delete_app_user,
            stock_commands::stock_list_ref_items,
            stock_commands::stock_upsert_ref_item,
            stock_commands::stock_delete_ref_item,
            stock_commands::stock_list_documents,
            stock_commands::stock_import_document,
            stock_commands::stock_export_document,
            stock_commands::stock_delete_document,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
