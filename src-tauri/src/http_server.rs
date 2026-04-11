//! Serveur HTTP pour exposer les commandes Tauri sur le réseau (ports 7061 frontend, 7062 backend).
//! Permet d'accéder à l'app depuis un navigateur sur http://<ip>:7061

use axum::{
    extract::{Json, Query},
    http::{header, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Form, Router,
};
use serde::Deserialize;
use serde_json::Value;
use std::net::SocketAddr;
use std::path::PathBuf;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

#[derive(Deserialize)]
struct InvokeRequest {
    command: String,
    #[serde(default)]
    payload: Option<Value>,
}

#[derive(Deserialize)]
struct PayDunyaReturnQuery {
    token: Option<String>,
}

#[derive(Deserialize)]
struct PayDunyaCallbackForm {
    data: Option<String>,
}

/// Extrait la chaîne payload pour les commandes.
/// Si le payload est un objet avec clé "payload" contenant une URL/path, l'extraire (compatibilité HTTP).
fn payload_to_string(p: Option<&Value>) -> String {
    match p {
        None => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(v) => {
            if let Some(inner) = v.get("payload").and_then(|x| x.as_str()) {
                return inner.to_string();
            }
            serde_json::to_string(v).unwrap_or_default()
        }
    }
}

async fn invoke_handler(Json(req): Json<InvokeRequest>) -> impl IntoResponse {
    let payload_str = payload_to_string(req.payload.as_ref());

    let result = match req.command.as_str() {
        "create_docteur" => crate::commands::create_docteur(payload_str).await,
        "create_cabinet" => crate::commands::create_cabinet(payload_str).await,
        "auth_connection" | "auth_message" => crate::commands::auth_connection(payload_str).await,
        "upsert_patient" => crate::commands::upsert_patient(payload_str).await,
        "list_patients" => crate::commands::list_patients(payload_str).await,
        "get_patient_detail" => crate::commands::get_patient_detail(payload_str).await,
        "update_patient_detail" => crate::commands::update_patient_detail(payload_str).await,
        "delete_patient" => crate::commands::delete_patient(payload_str).await,
        "search_patients" => crate::commands::search_patients(payload_str).await,
        "ensure_default_demo_docteur" => crate::commands::ensure_default_demo_docteur(payload_str).await,
        "remove_demo_docteur_after_sadmin_login" => {
            crate::commands::remove_demo_docteur_after_sadmin_login(payload_str).await
        },
        "finalize_demo_docteur_email" => crate::commands::finalize_demo_docteur_email(payload_str).await,
        "add_acte" => crate::commands::add_acte(payload_str).await,
        "list_actes_by_patient" => crate::commands::list_actes_by_patient(payload_str).await,
        "get_acte" => crate::commands::get_acte(payload_str).await,
        "update_acte" => crate::commands::update_acte(payload_str).await,
        "delete_acte" => crate::commands::delete_acte(payload_str).await,
        "get_qrcode_part" => crate::commands::get_qrcode_part(payload_str).await,
        "get_photo_part" => crate::commands::get_photo_part(payload_str).await,
        "save_photo" => crate::commands::save_photo(payload_str).await,
        "get_radios_by_acte" => crate::commands::get_radios_by_acte(payload_str).await,
        "get_user_privileges" => crate::commands::get_user_privileges(payload_str).await,
        "get_privilege" => crate::commands::get_privilege(payload_str).await,
        "update_privilege" => crate::commands::update_privilege(payload_str).await,
        "add_nom_acte" => crate::commands::add_nom_acte(payload_str).await,
        "update_nom_acte" => crate::commands::update_nom_acte(payload_str).await,
        "list_nom_actes" => crate::commands::list_nom_actes(payload_str).await,
        "get_nom_acte" => crate::commands::get_nom_acte(payload_str).await,
        "delete_nom_acte" => crate::commands::delete_nom_acte(payload_str).await,
        "add_nom_assurance" => crate::commands::add_nom_assurance(payload_str).await,
        "update_nom_assurance" => crate::commands::update_nom_assurance(payload_str).await,
        "list_nom_assurances" => crate::commands::list_nom_assurances(payload_str).await,
        "get_nom_assurance" => crate::commands::get_nom_assurance(payload_str).await,
        "delete_nom_assurance" => crate::commands::delete_nom_assurance(payload_str).await,
        "list_nom_materiels" => crate::commands::list_nom_materiels(payload_str).await,
        "add_nom_materiel" => crate::commands::add_nom_materiel(payload_str).await,
        "update_nom_materiel" => crate::commands::update_nom_materiel(payload_str).await,
        "delete_nom_materiel" => crate::commands::delete_nom_materiel(payload_str).await,
        "get_materiels_by_acte" => crate::commands::get_materiels_by_acte(payload_str).await,
        "update_acte_materiels" => crate::commands::update_acte_materiels(payload_str).await,
        "get_docteur_qrcode" => crate::commands::get_docteur_qrcode(payload_str).await,
        "get_docteur_profile" => crate::commands::get_docteur_profile(payload_str).await,
        "update_docteur_profile" => crate::commands::update_docteur_profile(payload_str).await,
        "get_assistant_qrcode" => crate::commands::get_assistant_qrcode(payload_str).await,
        "get_assistant_profile" => crate::commands::get_assistant_profile(payload_str).await,
        "update_assistant_profile" => crate::commands::update_assistant_profile(payload_str).await,
        "change_user_password" => crate::commands::change_user_password(payload_str).await,
        "list_types_collaborateur" => crate::commands::list_types_collaborateur(payload_str).await,
        "create_type_collaborateur" => crate::commands::create_type_collaborateur(payload_str).await,
        "update_type_collaborateur_roles" => crate::commands::update_type_collaborateur_roles(payload_str).await,
        "list_types_docteur" => crate::commands::list_types_docteur(payload_str).await,
        "update_type_docteur_roles" => crate::commands::update_type_docteur_roles(payload_str).await,
        "list_collaborateurs_by_type" => crate::commands::list_collaborateurs_by_type(payload_str).await,
        "create_collaborateur" => crate::commands::create_collaborateur(payload_str).await,
        "get_collaborateur_profile" => crate::commands::get_collaborateur_profile(payload_str).await,
        "get_collaborateur_qrcode" => crate::commands::get_collaborateur_qrcode(payload_str).await,
        "update_collaborateur_profile" => crate::commands::update_collaborateur_profile(payload_str).await,
        "delete_collaborateur" => crate::commands::delete_collaborateur(payload_str).await,
        "create_assistant" => crate::commands::create_assistant(payload_str).await,
        "list_assistants" => crate::commands::list_assistants(payload_str).await,
        "delete_assistant" => crate::commands::delete_assistant(payload_str).await,
        "get_comptable_qrcode" => crate::commands::get_comptable_qrcode(payload_str).await,
        "get_comptable_profile" => crate::commands::get_comptable_profile(payload_str).await,
        "update_comptable_profile" => crate::commands::update_comptable_profile(payload_str).await,
        "create_comptable" => crate::commands::create_comptable(payload_str).await,
        "list_comptables" => crate::commands::list_comptables(payload_str).await,
        "delete_comptable" => crate::commands::delete_comptable(payload_str).await,
        "get_secretaire_qrcode" => crate::commands::get_secretaire_qrcode(payload_str).await,
        "get_secretaire_profile" => crate::commands::get_secretaire_profile(payload_str).await,
        "update_secretaire_profile" => crate::commands::update_secretaire_profile(payload_str).await,
        "create_secretaire" => crate::commands::create_secretaire(payload_str).await,
        "list_secretaires" => crate::commands::list_secretaires(payload_str).await,
        "delete_secretaire" => crate::commands::delete_secretaire(payload_str).await,
        "stats_list_nom_actes" => crate::commands::stats_list_nom_actes(payload_str).await,
        "stats_get_info" => crate::commands::stats_get_info(payload_str).await,
        "radios_list_pending" => crate::commands::radios_list_pending(payload_str).await,
        "radios_associer" => crate::commands::radios_associer(payload_str).await,
        "radios_download_preview" => crate::commands::radios_download_preview(payload_str).await,
        "trace_add" => crate::commands::trace_add(payload_str).await,
        "trace_list_all" => crate::commands::trace_list_all(payload_str).await,
        "trace_list_by_logg_id" => crate::commands::trace_list_by_logg_id(payload_str).await,
        "trace_list_pagination" => crate::commands::trace_list_pagination(payload_str).await,
        "task_add" => crate::commands::task_add(payload_str).await,
        "task_list" => crate::commands::task_list(payload_str).await,
        "task_list_rappels_pending" => crate::commands::task_list_rappels_pending(payload_str).await,
        "task_marquer_rappel_affiche" => crate::commands::task_marquer_rappel_affiche(payload_str).await,
        "task_update_statut" => crate::commands::task_update_statut(payload_str).await,
        "task_delete" => crate::commands::task_delete(payload_str).await,
        "data_export_list_tables" => crate::commands::data_export_list_tables(payload_str).await,
        "data_export_table" => crate::commands::data_export_table(payload_str).await,
        "data_import_table" => crate::commands::data_import_table(payload_str).await,
        "data_list_custom_columns" => crate::commands::data_list_custom_columns(payload_str).await,
        "list_medicaments" => crate::commands::list_medicaments(payload_str).await,
        "add_medicament" => crate::commands::add_medicament(payload_str).await,
        "delete_medicament" => crate::commands::delete_medicament(payload_str).await,
        "list_actes_ids_in_posologie" => crate::commands::list_actes_ids_in_posologie(payload_str).await,
        "list_posologie_acte_colors" => crate::commands::list_posologie_acte_colors(payload_str).await,
        "get_posologie_lines_for_patient" => crate::commands::get_posologie_lines_for_patient(payload_str).await,
        "get_posologie_lines_for_acte" => crate::commands::get_posologie_lines_for_acte(payload_str).await,
        "save_posologie" => crate::commands::save_posologie(payload_str).await,
        "get_posologie_qrcode" => crate::commands::get_posologie_qrcode(payload_str).await,
        "list_modeles_etat_posologie" => crate::commands::list_modeles_etat_posologie(payload_str).await,
        "list_modeles_etat_ordonnance" => crate::commands::list_modeles_etat_ordonnance(payload_str).await,
        "list_modeles_etat" => crate::commands::list_modeles_etat(payload_str).await,
        "save_modele_etat" => crate::commands::save_modele_etat(payload_str).await,
        "delete_modele_etat" => crate::commands::delete_modele_etat(payload_str).await,
        "test_backend_rust" => crate::commands::test_backend_rust(payload_str).await,
        "get_local_ip" => crate::commands::get_local_ip().await,
        "verifier_statut_paiement" => crate::commands::verifier_statut_paiement(payload_str).await,
        "recuperer_date_paiement" => crate::commands::recuperer_date_paiement(payload_str).await,
        "payer_paydunya" => crate::commands::payer_paydunya(payload_str).await,
        "payer_paydunya_mensuel" => crate::commands::payer_paydunya_mensuel(payload_str).await,
        "paydunya_can_use" => crate::commands::paydunya_can_use().await,
        "paydunya_get_status" => crate::commands::paydunya_get_status().map_err(|e| e),
        "paydunya_register_usage" => crate::commands::paydunya_register_usage().map(|_| serde_json::Value::Null),
        "paydunya_sync_time" => crate::commands::paydunya_sync_time().await,
        "get_default_databases_dir" => crate::commands::get_default_databases_dir().map(|s| serde_json::json!(s)),
        "get_app_config" => crate::commands::get_app_config(payload_str).await,
        "set_app_config" => crate::commands::set_app_config(payload_str).await,
        "list_tutos" => crate::commands::list_tutos(payload_str).await,
        "add_tuto" => crate::commands::add_tuto(payload_str).await,
        "update_tuto" => crate::commands::update_tuto(payload_str).await,
        "delete_tuto" => crate::commands::delete_tuto(payload_str).await,
        "check_corruption_status" => crate::commands::check_corruption_status(payload_str).await,
        "verify_sadmin_reset_paiement" => crate::commands::verify_sadmin_reset_paiement(payload_str).await,
        "enregistrer_derniere_date_paiement" => crate::commands::enregistrer_derniere_date_paiement(payload_str).await,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                [(header::CONTENT_TYPE, "application/json")],
                format!(r#"{{"error":"Commande inconnue: {}"}}"#, req.command),
            )
                .into_response()
        }
    };

    match result {
        Ok(v) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "application/json")],
            serde_json::to_string(&v).unwrap_or_else(|_| "{}".to_string()),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "application/json")],
            format!(r#"{{"error":"{}"}}"#, e.replace('"', "\\\"")),
        )
            .into_response(),
    }
}

async fn paydunya_time_handler() -> impl IntoResponse {
    let now = chrono::Utc::now();
    let unix_ts = now.timestamp();
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/json")],
        format!(
            r#"{{"success":true,"serverTimeUtc":"{}","unixTimestamp":{}}}"#,
            now.to_rfc3339(),
            unix_ts
        ),
    )
        .into_response()
}

async fn health_handler() -> impl IntoResponse {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/json")],
        r#"{"ok":true}"#,
    )
        .into_response()
}

async fn ipv4_handler() -> impl IntoResponse {
    match local_ip_address::local_ip() {
        Ok(ip) => {
            let front_url = format!("http://{}:7061", ip);
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/json")],
                format!(
                    r#"{{"success":true,"frontUrl":"{}","ip":"{}"}}"#,
                    front_url,
                    ip
                ),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "application/json")],
            format!(r#"{{"success":false,"error":"{}"}}"#, e),
        )
            .into_response(),
    }
}

async fn root_handler() -> impl IntoResponse {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/json")],
        r#"{"message":"LoggAppro Backend API","frontend":"http://<votre-ip>:7061","routes":["/invoke","/health","/api/network/ipv4"]}"#,
    )
        .into_response()
}

/// Retour PayDunya après paiement : vérifie le statut et enregistre si completed.
async fn paydunya_return_handler(Query(params): Query<PayDunyaReturnQuery>) -> impl IntoResponse {
    let token = match &params.token {
        Some(t) if !t.is_empty() => t.clone(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
                r#"<html><body><h1>Token manquant</h1><p>Redirection PayDunya invalide.</p></body></html>"#.to_string(),
            )
                .into_response()
        }
    };

    match crate::commands::paydunya_handle_return_or_callback(&token, None).await {
        Ok(true) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            r#"<html><body style="font-family:sans-serif;text-align:center;padding:40px">
<h1 style="color:green">Paiement réussi</h1>
<p>Votre paiement a été enregistré. Le mode lecture seule est désactivé. Vous pouvez fermer cette fenêtre.</p>
<script>
(function(){
  if (window.opener && !window.opener.closed) {
    try { window.opener.postMessage({ type: 'PAYDUNYA_PAYMENT_SUCCESS' }, '*'); } catch(e) {}
  }
  setTimeout(function(){ window.close(); }, 3000);
})();
</script>
</body></html>"#.to_string(),
        )
            .into_response(),
        Ok(false) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            r#"<html><body style="font-family:sans-serif;text-align:center;padding:40px">
<h1>Paiement en attente</h1>
<p>Si vous avez payé, cliquez sur "J'ai payé" dans LoggAppro pour actualiser.</p>
</body></html>"#.to_string(),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            format!(r#"<html><body><h1>Erreur</h1><p>{}</p></body></html>"#, html_escape(&e)),
        )
            .into_response(),
    }
}

/// Callback IPN PayDunya : reçoit la confirmation de paiement en POST.
async fn paydunya_callback_handler(Form(form): Form<PayDunyaCallbackForm>) -> impl IntoResponse {
    let data_str = match &form.data {
        Some(d) if !d.is_empty() => d.clone(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                [(header::CONTENT_TYPE, "text/plain")],
                "data manquant".to_string(),
            )
                .into_response()
        }
    };

    let token = serde_json::from_str::<Value>(&data_str)
        .ok()
        .and_then(|v| {
            v.get("invoice")
                .and_then(|i| i.get("token"))
                .and_then(|t| t.as_str())
                .map(String::from)
        })
        .unwrap_or_default();

    if token.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            [(header::CONTENT_TYPE, "text/plain")],
            "token introuvable".to_string(),
        )
            .into_response();
    }

    match crate::commands::paydunya_handle_return_or_callback(&token, Some(&data_str)).await {
        Ok(_) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/plain")],
            "OK".to_string(),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "text/plain")],
            e,
        )
            .into_response(),
    }
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn build_router() -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE]);

    Router::new()
        .route("/", get(root_handler))
        .route("/invoke", post(invoke_handler))
        .route("/health", get(health_handler))
        .route("/api/network/ipv4", get(ipv4_handler))
        .route("/api/paydunya/time", get(paydunya_time_handler))
        .route("/api/paydunya/return", get(paydunya_return_handler))
        .route("/api/paydunya/callback", post(paydunya_callback_handler))
        .layer(cors)
}

/// Démarre les serveurs HTTP (frontend 7061 + backend 7062).
/// `frontend_path`: chemin direct vers le dossier dist. Si None, seul le backend tourne.
pub fn spawn_http_server(frontend_path: Option<PathBuf>) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        rt.block_on(run_servers(frontend_path))
    });
}

/// Exécute les serveurs HTTP (frontend + backend).
async fn run_servers(frontend_path: Option<PathBuf>) {
    // Backend API sur 7062 (toujours actif)
    let backend = async {
        let app = build_router();
        let addr = SocketAddr::from(([0, 0, 0, 0], 7062));
        println!("🌐 Backend API sur http://0.0.0.0:7062");
        if let Err(e) = axum::serve(
            tokio::net::TcpListener::bind(addr).await.unwrap(),
            app,
        )
        .await
        {
            eprintln!("Erreur serveur backend: {}", e);
        }
    };

    // Frontend sur 7061 (frontend_path = chemin direct vers le dossier dist)
    if let Some(ref dist_path) = frontend_path {
        if dist_path.exists() {
            let frontend = async {
                let serve_dir = ServeDir::new(dist_path)
                    .append_index_html_on_directories(true);
                let app = Router::new()
                    .fallback_service(serve_dir)
                    .layer(CorsLayer::new().allow_origin(Any).allow_methods([Method::GET]));
                let addr = SocketAddr::from(([0, 0, 0, 0], 7061));
                println!("🌐 Frontend web sur http://0.0.0.0:7061");
                println!("   Accès réseau : http://<votre-ip>:7061");
                if let Err(e) = axum::serve(
                    tokio::net::TcpListener::bind(addr).await.unwrap(),
                    app,
                )
                .await
                {
                    eprintln!("Erreur serveur frontend: {}", e);
                }
            };
            tokio::join!(backend, frontend);
        } else {
            println!("⚠ Fichiers frontend non trouvés dans {:?} - accès web désactivé", dist_path);
            backend.await;
        }
    } else {
        println!("   (Frontend non servi - mode dev uniquement)");
        backend.await;
    }
}

/// Trouve le chemin du dossier dist (pour mode --server sans Tauri).
fn find_frontend_path() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .and_then(|exe_dir| {
            // Structure Tauri avec "resources": ["../dist"] -> exe_dir/_up_/dist
            let dist_up = exe_dir.join("_up_").join("dist");
            if dist_up.exists() {
                return Some(dist_up);
            }
            // Fallback: exe_dir/resources/dist
            let dist_res = exe_dir.join("resources").join("dist");
            if dist_res.exists() {
                return Some(dist_res);
            }
            // Fallback: dist à côté de l'exe (développement)
            let dist_next = exe_dir.join("dist");
            if dist_next.exists() {
                return Some(dist_next);
            }
            None
        })
}

/// Exécute le serveur backend (et frontend si disponible) en mode standalone (--server).
pub async fn run_server() {
    let frontend_path = find_frontend_path();
    run_servers(frontend_path).await;
}
