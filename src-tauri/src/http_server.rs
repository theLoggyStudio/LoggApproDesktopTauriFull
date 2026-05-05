//! Serveur HTTP pour exposer les commandes Tauri sur le réseau (ports 7061 frontend, 7062 backend).
//! Permet d'accéder à l'app depuis un navigateur sur http://<ip>:7061

use axum::{
    extract::Json,
    http::{header, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Router,
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

/// Extrait la chaîne payload pour les commandes.
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
        "auth_connection" | "auth_message" => crate::commands::auth_connection(payload_str).await,
        "ensure_default_demo_docteur" => crate::commands::ensure_default_demo_docteur(payload_str).await,
        "remove_demo_docteur_after_sadmin_login" => {
            crate::commands::remove_demo_docteur_after_sadmin_login(payload_str).await
        }
        "test_backend_rust" => crate::commands::test_backend_rust(payload_str).await,
        "get_local_ip" => crate::commands::get_local_ip().await,
        "stock_list_articles" => crate::stock_commands::stock_list_articles(payload_str).await,
        "stock_upsert_article" => crate::stock_commands::stock_upsert_article(payload_str).await,
        "stock_delete_article" => crate::stock_commands::stock_delete_article(payload_str).await,
        "stock_list_movements" => crate::stock_commands::stock_list_movements(payload_str).await,
        "stock_add_movement" => crate::stock_commands::stock_add_movement(payload_str).await,
        "stock_dashboard_stats" => crate::stock_commands::stock_dashboard_stats(payload_str).await,
        "stock_export_csv" => crate::stock_commands::stock_export_csv(payload_str).await,
        "stock_import_csv" => crate::stock_commands::stock_import_csv(payload_str).await,
        "stock_list_parties" => crate::stock_commands::stock_list_parties(payload_str).await,
        "stock_upsert_party" => crate::stock_commands::stock_upsert_party(payload_str).await,
        "stock_delete_party" => crate::stock_commands::stock_delete_party(payload_str).await,
        "stock_test_remote_db" => crate::stock_commands::stock_test_remote_db(payload_str).await,
        "stock_get_remote_db_settings" => crate::stock_commands::stock_get_remote_db_settings(payload_str).await,
        "stock_save_remote_db_settings" => crate::stock_commands::stock_save_remote_db_settings(payload_str).await,
        "stock_app_user_login" => crate::stock_commands::stock_app_user_login(payload_str).await,
        "stock_list_app_users" => crate::stock_commands::stock_list_app_users(payload_str).await,
        "stock_upsert_app_user" => crate::stock_commands::stock_upsert_app_user(payload_str).await,
        "stock_delete_app_user" => crate::stock_commands::stock_delete_app_user(payload_str).await,
        "stock_list_ref_items" => crate::stock_commands::stock_list_ref_items(payload_str).await,
        "stock_upsert_ref_item" => crate::stock_commands::stock_upsert_ref_item(payload_str).await,
        "stock_delete_ref_item" => crate::stock_commands::stock_delete_ref_item(payload_str).await,
        "stock_list_documents" => crate::stock_commands::stock_list_documents(payload_str).await,
        "stock_import_document" => crate::stock_commands::stock_import_document(payload_str).await,
        "stock_export_document" => crate::stock_commands::stock_export_document(payload_str).await,
        "stock_delete_document" => crate::stock_commands::stock_delete_document(payload_str).await,
        "stock_list_document_print_models" => crate::stock_commands::stock_list_document_print_models(payload_str).await,
        "stock_get_document_print_model" => crate::stock_commands::stock_get_document_print_model(payload_str).await,
        "stock_upsert_document_print_model" => crate::stock_commands::stock_upsert_document_print_model(payload_str).await,
        "stock_delete_document_print_model" => crate::stock_commands::stock_delete_document_print_model(payload_str).await,
        "stock_get_document_print_screen_bindings" => {
            crate::stock_commands::stock_get_document_print_screen_bindings(payload_str).await
        },
        "stock_set_document_print_screen_binding" => {
            crate::stock_commands::stock_set_document_print_screen_binding(payload_str).await
        },
        "stock_list_roles" => crate::stock_commands::stock_list_roles(payload_str).await,
        "stock_upsert_role" => crate::stock_commands::stock_upsert_role(payload_str).await,
        "stock_delete_role" => crate::stock_commands::stock_delete_role(payload_str).await,
        "stock_list_circuits" => crate::stock_commands::stock_list_circuits(payload_str).await,
        "stock_get_circuit" => crate::stock_commands::stock_get_circuit(payload_str).await,
        "stock_upsert_circuit" => crate::stock_commands::stock_upsert_circuit(payload_str).await,
        "stock_delete_circuit" => crate::stock_commands::stock_delete_circuit(payload_str).await,
        "stock_list_collab_tasks" => crate::stock_commands::stock_list_collab_tasks(payload_str).await,
        "stock_upsert_collab_task" => crate::stock_commands::stock_upsert_collab_task(payload_str).await,
        "stock_complete_collab_task" => crate::stock_commands::stock_complete_collab_task(payload_str).await,
        "stock_create_circuit_step_collab_task" => {
            crate::stock_commands::stock_create_circuit_step_collab_task(payload_str).await
        },
        "stock_list_form_templates" => crate::stock_commands::stock_list_form_templates(payload_str).await,
        "stock_get_form_template" => crate::stock_commands::stock_get_form_template(payload_str).await,
        "stock_upsert_form_template" => crate::stock_commands::stock_upsert_form_template(payload_str).await,
        "stock_delete_form_template" => crate::stock_commands::stock_delete_form_template(payload_str).await,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                [(header::CONTENT_TYPE, "application/json")],
                format!(r#"{{"error":"Commande inconnue: {}"}}"#, req.command),
            )
                .into_response();
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
                    front_url, ip
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
        .layer(cors)
}

pub fn spawn_http_server(frontend_path: Option<PathBuf>) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        rt.block_on(run_servers(frontend_path))
    });
}

async fn run_servers(frontend_path: Option<PathBuf>) {
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

    if let Some(ref dist_path) = frontend_path {
        if dist_path.exists() {
            let frontend = async {
                let serve_dir = ServeDir::new(dist_path).append_index_html_on_directories(true);
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
            println!(
                "⚠ Fichiers frontend non trouvés dans {:?} - accès web désactivé",
                dist_path
            );
            backend.await;
        }
    } else {
        println!("   (Frontend non servi - mode dev uniquement)");
        backend.await;
    }
}

fn find_frontend_path() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .and_then(|exe_dir| {
            let dist_up = exe_dir.join("_up_").join("dist");
            if dist_up.exists() {
                return Some(dist_up);
            }
            let dist_res = exe_dir.join("resources").join("dist");
            if dist_res.exists() {
                return Some(dist_res);
            }
            let dist_next = exe_dir.join("dist");
            if dist_next.exists() {
                return Some(dist_next);
            }
            None
        })
}

pub async fn run_server() {
    let frontend_path = find_frontend_path();
    run_servers(frontend_path).await;
}
