// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod admin_schema;
mod commands;
mod cript_key;
mod crypto;
mod pay_anchor;
mod db;
mod db_sqlx;
mod http_server;
mod last_payment_file;
mod payload;
mod paydunya_time_guard;

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
            commands::create_docteur,
            commands::auth_connection,
            commands::auth_message,
            commands::create_cabinet,
            commands::upsert_patient,
            commands::list_patients,
            commands::get_patient_detail,
            commands::update_patient_detail,
            commands::delete_patient,
            commands::add_acte,
            commands::list_actes_by_patient,
            commands::get_acte,
            commands::update_acte,
            commands::delete_acte,
            commands::get_qrcode_part,
            commands::get_photo_part,
            commands::save_photo,
            commands::get_radios_by_acte,
            commands::get_user_privileges,
            commands::get_privilege,
            commands::update_privilege,
            commands::search_patients,
            commands::ensure_default_demo_docteur,
            commands::remove_demo_docteur_after_sadmin_login,
            commands::finalize_demo_docteur_email,
            commands::add_nom_acte,
            commands::update_nom_acte,
            commands::list_nom_actes,
            commands::get_nom_acte,
            commands::delete_nom_acte,
            commands::add_nom_assurance,
            commands::update_nom_assurance,
            commands::list_nom_assurances,
            commands::get_nom_assurance,
            commands::delete_nom_assurance,
            commands::list_nom_materiels,
            commands::add_nom_materiel,
            commands::update_nom_materiel,
            commands::delete_nom_materiel,
            commands::get_materiels_by_acte,
            commands::update_acte_materiels,
            commands::get_docteur_qrcode,
            commands::get_docteur_profile,
            commands::update_docteur_profile,
            commands::get_assistant_qrcode,
            commands::get_assistant_profile,
            commands::update_assistant_profile,
            commands::change_user_password,
            commands::list_docteurs,
            commands::reset_docteur_password,
            commands::list_types_collaborateur,
            commands::create_type_collaborateur,
            commands::update_type_collaborateur_roles,
            commands::list_types_docteur,
            commands::update_type_docteur_roles,
            commands::list_collaborateurs_by_type,
            commands::create_collaborateur,
            commands::get_collaborateur_profile,
            commands::get_collaborateur_qrcode,
            commands::update_collaborateur_profile,
            commands::delete_collaborateur,
            commands::create_assistant,
            commands::list_assistants,
            commands::delete_assistant,
            commands::get_comptable_qrcode,
            commands::get_comptable_profile,
            commands::update_comptable_profile,
            commands::create_comptable,
            commands::list_comptables,
            commands::delete_comptable,
            commands::get_secretaire_qrcode,
            commands::get_secretaire_profile,
            commands::update_secretaire_profile,
            commands::create_secretaire,
            commands::list_secretaires,
            commands::delete_secretaire,
            commands::stats_list_nom_actes,
            commands::stats_get_info,
            commands::radios_list_pending,
            commands::radios_associer,
            commands::radios_download_preview,
            commands::trace_add,
            commands::trace_list_all,
            commands::trace_list_by_logg_id,
            commands::trace_list_pagination,
            commands::task_add,
            commands::task_list,
            commands::task_list_rappels_pending,
            commands::task_marquer_rappel_affiche,
            commands::task_update_statut,
            commands::task_delete,
            commands::data_export_list_tables,
            commands::data_export_table,
            commands::data_import_table,
            commands::data_list_custom_columns,
            commands::list_medicaments,
            commands::add_medicament,
            commands::delete_medicament,
            commands::list_actes_ids_in_posologie,
            commands::list_posologie_acte_colors,
            commands::get_posologie_lines_for_patient,
            commands::get_posologie_lines_for_acte,
            commands::save_posologie,
            commands::get_posologie_qrcode,
            commands::list_modeles_etat_posologie,
            commands::list_modeles_etat_ordonnance,
            commands::list_modeles_etat,
            commands::save_modele_etat,
            commands::delete_modele_etat,
            commands::test_backend_rust,
            commands::get_local_ip,
            commands::open_external_url_prefer_edge,
            commands::verifier_statut_paiement,
            commands::recuperer_date_paiement,
            commands::payer_paydunya,
            commands::payer_paydunya_mensuel,
            commands::paydunya_can_use,
            commands::paydunya_get_status,
            commands::paydunya_register_usage,
            commands::paydunya_sync_time,
            commands::get_default_databases_dir,
            commands::vider_bases_donnees,
            commands::execute_sql,
            commands::get_app_config,
            commands::set_app_config,
            commands::list_tutos,
            commands::add_tuto,
            commands::update_tuto,
            commands::delete_tuto,
            commands::check_corruption_status,
            commands::verify_sadmin_reset_paiement,
            commands::enregistrer_derniere_date_paiement,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
