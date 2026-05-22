//! Gestion de stock — SQLite `dbap_stock.db` (création automatique des tables).

use base64::engine::general_purpose::STANDARD as B64_ENGINE;
use base64::Engine;
use chrono::{NaiveDate, NaiveDateTime, Utc};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::io::Cursor;
use std::path::PathBuf;
use sqlx::any::{Any, AnyConnectOptions};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Acquire, AnyConnection, ConnectOptions, Connection, Row};
use std::collections::HashSet;
use std::str::FromStr;
use urlencoding::encode;
use uuid::Uuid;

use crate::commands::parse_or_empty;
use crate::cript_key::resolve_cript_key;
use crate::db;
use crate::payload::encrypt_response;

/// Mot de passe initial si aucun mot de passe n'est fourni à la création (à communiquer à l'utilisateur).
const STOCK_APP_DEFAULT_PASSWORD: &str = "LoggAppro2026!";

/// Rôle « Direction » (DIR), créé à l’installation (`ensure_stock_default_circuits_if_empty`).
const STOCK_ROLE_DIRECTION_ID: &str = "a0000001-0001-4001-8001-000000000004";

/// Clés d'écran autorisées pour les privilèges (le droit « Collaborateur » est toujours ajouté côté serveur).
const STOCK_PRIVILEGE_KEYS: &[&str] = &[
    "dashboard",
    "articles",
    "articles_units",
    "articles_categories",
    "articles_devises",
    "warehouse",
    "movements",
    "fournisseurs",
    "clients",
    "user",
    "settings",
    "dashboard_charts",
    "articles_import",
    "articles_export",
    "movements_import",
    "movements_export",
    "fournisseurs_import",
    "fournisseurs_export",
    "clients_import",
    "clients_export",
    "ref_units_import",
    "ref_units_export",
    "ref_locations_import",
    "ref_locations_export",
    "ref_locations_create",
    "ref_locations_delete",
    "ref_locations_edit",
    "ref_locations_view",
    "ref_categories_import",
    "ref_categories_export",
    "ref_currencies_import",
    "ref_currencies_export",
    "circuits",
    "circuits_forms",
    "circuits_manage",
    "roles",
    "roles_manage",
    "documents",
    "documents_models",
    "documents_view",
    "documents_import_png",
    "documents_export_png",
    "documents_delete_png",
    "documents_import_jpeg",
    "documents_export_jpeg",
    "documents_delete_jpeg",
    "documents_import_pdf",
    "documents_export_pdf",
    "documents_delete_pdf",
    "documents_print_models_manage",
];

fn hash_stock_password(plain: &str) -> Result<String, String> {
    bcrypt::hash(plain, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())
}

fn verify_stock_password(plain: &str, stored: &str) -> bool {
    bcrypt::verify(plain, stored).unwrap_or(false)
}

fn normalize_stock_privileges(input: &[Value]) -> Vec<String> {
    let mut out: Vec<String> = input
        .iter()
        .filter_map(|v| v.as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from))
        .filter(|k| STOCK_PRIVILEGE_KEYS.contains(&k.as_str()))
        .collect();
    out.push("user".to_string());
    out.sort();
    out.dedup();
    out
}

fn assert_requester_is_sadmin(obj: &Map<String, Value>) -> Result<(), String> {
    let role = obj
        .get("requesterRole")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if role.eq_ignore_ascii_case("sadmin") {
        Ok(())
    } else {
        Err("Action réservée au super-administrateur".to_string())
    }
}

async fn stock_connect() -> Result<AnyConnection, String> {
    let path = db::get_databases_dir().join(db::DBAP_STOCK_FILE);
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    let opts = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true);
    let url = opts.to_url_lossy();
    let any_opts =
        AnyConnectOptions::from_str(url.as_str()).map_err(|e| format!("stock DB: {}", e))?;
    AnyConnection::connect_with(&any_opts)
        .await
        .map_err(|e| format!("stock DB connexion: {}", e))
}

async fn ensure_stock_schema(conn: &mut AnyConnection) -> Result<(), String> {
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_article (
            id TEXT PRIMARY KEY,
            sku TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT '',
            unit TEXT NOT NULL DEFAULT 'pcs',
            qty REAL NOT NULL DEFAULT 0,
            min_qty REAL NOT NULL DEFAULT 0,
            price REAL NOT NULL DEFAULT 0,
            location TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_article: {}", e))?;

    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_movement (
            id TEXT PRIMARY KEY,
            article_id TEXT NOT NULL,
            move_type TEXT NOT NULL,
            qty REAL NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            ref_doc TEXT NOT NULL DEFAULT '',
            supplier_name TEXT NOT NULL DEFAULT '',
            client_name TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            batch_id TEXT NOT NULL DEFAULT '',
            line_no INTEGER NOT NULL DEFAULT 0,
            price_in REAL NOT NULL DEFAULT 0,
            price_out REAL NOT NULL DEFAULT 0,
            FOREIGN KEY (article_id) REFERENCES stock_article (id)
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_movement: {}", e))?;

    ensure_stock_party_and_migration(conn).await?;
    ensure_stock_article_price_column(conn).await?;
    ensure_stock_article_currency_column(conn).await?;
    ensure_stock_app_user_schema(conn).await?;
    ensure_stock_role_and_circuit_schema(conn).await?;
    ensure_stock_collab_task_schema(conn).await?;
    ensure_stock_form_template_schema(conn).await?;
    ensure_stock_ref_schema(conn).await?;
    ensure_stock_document_schema(conn).await?;
    ensure_stock_kv_schema(conn).await?;
    ensure_default_print_models(conn).await?;

    let _ = sqlx::query::<Any>("PRAGMA foreign_keys = ON")
        .execute(&mut *conn)
        .await;

    Ok(())
}

async fn ensure_stock_party_and_migration(conn: &mut AnyConnection) -> Result<(), String> {
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_party (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL CHECK (kind IN ('SUPPLIER', 'CLIENT')),
            name TEXT NOT NULL,
            address TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            UNIQUE(kind, name)
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_party: {}", e))?;

    let party_rows = sqlx::query::<Any>("PRAGMA table_info(stock_party)")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut party_cols = HashSet::new();
    for r in party_rows {
        let n: String = r.try_get::<String, _>(1).map_err(|e| e.to_string())?;
        party_cols.insert(n);
    }
    if !party_cols.contains("address") {
        sqlx::query::<Any>(
            "ALTER TABLE stock_party ADD COLUMN address TEXT NOT NULL DEFAULT ''",
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    }
    if !party_cols.contains("phone") {
        sqlx::query::<Any>("ALTER TABLE stock_party ADD COLUMN phone TEXT NOT NULL DEFAULT ''")
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    }
    if !party_cols.contains("email") {
        sqlx::query::<Any>("ALTER TABLE stock_party ADD COLUMN email TEXT NOT NULL DEFAULT ''")
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    }

    let rows = sqlx::query::<Any>("PRAGMA table_info(stock_movement)")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut cols = HashSet::new();
    for r in rows {
        let n: String = r.try_get::<String, _>(1).map_err(|e| e.to_string())?;
        cols.insert(n);
    }
    if !cols.contains("supplier_name") {
        sqlx::query::<Any>(
            "ALTER TABLE stock_movement ADD COLUMN supplier_name TEXT NOT NULL DEFAULT ''",
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    }
    if !cols.contains("client_name") {
        sqlx::query::<Any>(
            "ALTER TABLE stock_movement ADD COLUMN client_name TEXT NOT NULL DEFAULT ''",
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    }
    if !cols.contains("batch_id") {
        sqlx::query::<Any>("ALTER TABLE stock_movement ADD COLUMN batch_id TEXT NOT NULL DEFAULT ''")
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    }
    if !cols.contains("line_no") {
        sqlx::query::<Any>(
            "ALTER TABLE stock_movement ADD COLUMN line_no INTEGER NOT NULL DEFAULT 0",
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    }
    if !cols.contains("price_in") {
        sqlx::query::<Any>("ALTER TABLE stock_movement ADD COLUMN price_in REAL NOT NULL DEFAULT 0")
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    }
    if !cols.contains("price_out") {
        sqlx::query::<Any>("ALTER TABLE stock_movement ADD COLUMN price_out REAL NOT NULL DEFAULT 0")
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    }
    let _ = sqlx::query::<Any>(
        "UPDATE stock_movement SET batch_id = id WHERE batch_id = '' OR batch_id IS NULL",
    )
    .execute(&mut *conn)
    .await;
    Ok(())
}

async fn ensure_stock_app_user_schema(conn: &mut AnyConnection) -> Result<(), String> {
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_app_user (
            id TEXT PRIMARY KEY,
            login TEXT NOT NULL COLLATE NOCASE,
            display_name TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            address TEXT NOT NULL DEFAULT '',
            password_hash TEXT NOT NULL,
            privileges_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(login)
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_app_user: {}", e))?;

    let ucols = sqlx::query::<Any>("PRAGMA table_info(stock_app_user)")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut user_cols = HashSet::new();
    for r in ucols {
        let n: String = r.try_get::<String, _>(1).map_err(|e| e.to_string())?;
        user_cols.insert(n);
    }
    if !user_cols.contains("address") {
        sqlx::query::<Any>("ALTER TABLE stock_app_user ADD COLUMN address TEXT NOT NULL DEFAULT ''")
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    }
    if !user_cols.contains("role_id") {
        sqlx::query::<Any>("ALTER TABLE stock_app_user ADD COLUMN role_id TEXT NOT NULL DEFAULT ''")
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    }
    if !user_cols.contains("email") {
        sqlx::query::<Any>("ALTER TABLE stock_app_user ADD COLUMN email TEXT NOT NULL DEFAULT ''")
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn default_stock_role_privileges_value() -> Value {
    let keys: Vec<Value> = STOCK_PRIVILEGE_KEYS
        .iter()
        .copied()
        .filter(|k| !k.contains("_import") && !k.contains("_export") && !k.contains("_manage"))
        .map(|k| json!(k))
        .collect();
    Value::Array(keys)
}

fn default_stock_role_privileges_json() -> String {
    serde_json::to_string(&default_stock_role_privileges_value()).unwrap_or_else(|_| "[]".to_string())
}

async fn ensure_stock_role_privileges_json_column(conn: &mut AnyConnection) -> Result<(), String> {
    let cols = sqlx::query::<Any>("PRAGMA table_info(stock_role)")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut has = false;
    for r in cols {
        let n: String = r.try_get::<String, _>(1).unwrap_or_default();
        if n == "privileges_json" {
            has = true;
            break;
        }
    }
    if !has {
        sqlx::query::<Any>(
            "ALTER TABLE stock_role ADD COLUMN privileges_json TEXT NOT NULL DEFAULT '[]'",
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Ancienne config : privilèges sur `stock_app_user`. Les fusionne dans le rôle puis vide le JSON utilisateur.
async fn merge_stock_user_privileges_into_roles_once(conn: &mut AnyConnection) -> Result<(), String> {
    ensure_stock_kv_schema(conn).await?;
    let flag = stock_kv_get(conn, "stock_privileges_on_roles_v1").await?;
    if flag.trim() == "1" {
        return Ok(());
    }
    let users = sqlx::query::<Any>("SELECT id, role_id, privileges_json FROM stock_app_user")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    for u in users {
        let role_id: String = u.try_get::<String, _>(1).unwrap_or_default();
        let rid = role_id.trim();
        if rid.is_empty() {
            continue;
        }
        let user_priv: String = u.try_get::<String, _>(2).unwrap_or_else(|_| "[]".to_string());
        let u_arr: Vec<Value> = serde_json::from_str(&user_priv).unwrap_or_default();
        if u_arr.is_empty() {
            continue;
        }
        let row = sqlx::query::<Any>("SELECT privileges_json FROM stock_role WHERE id = ?1")
            .bind(rid)
            .fetch_optional(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
        let Some(rr) = row else {
            continue;
        };
        let r_json: String = rr.try_get::<String, _>(0).unwrap_or_else(|_| "[]".to_string());
        let mut r_arr: Vec<Value> = serde_json::from_str(&r_json).unwrap_or_default();
        r_arr.extend(u_arr);
        let merged = normalize_stock_privileges(&r_arr);
        let merged_v: Vec<Value> = merged.iter().map(|s| json!(s)).collect();
        let out = serde_json::to_string(&Value::Array(merged_v)).map_err(|e| e.to_string())?;
        sqlx::query::<Any>("UPDATE stock_role SET privileges_json = ?1 WHERE id = ?2")
            .bind(&out)
            .bind(rid)
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    }
    let _ = sqlx::query::<Any>("UPDATE stock_app_user SET privileges_json = '[]'")
        .execute(&mut *conn)
        .await;
    stock_kv_set(conn, "stock_privileges_on_roles_v1", "1").await?;
    Ok(())
}

/// Rôles « métier » livrés sans privilèges : même profil par défaut que l’UI (hors import/export/manage).
async fn ensure_stock_builtin_role_privileges_defaults(conn: &mut AnyConnection) -> Result<(), String> {
    const IDS: [&str; 4] = [
        "a0000001-0001-4001-8001-000000000001",
        "a0000001-0001-4001-8001-000000000002",
        "a0000001-0001-4001-8001-000000000003",
        "a0000001-0001-4001-8001-000000000004",
    ];
    let def = default_stock_role_privileges_json();
    for id in IDS {
        let _ = sqlx::query::<Any>(
            "UPDATE stock_role SET privileges_json = ?1 WHERE id = ?2 AND (trim(coalesce(privileges_json,'')) = '' OR privileges_json = '[]')",
        )
        .bind(&def)
        .bind(id)
        .execute(&mut *conn)
        .await;
    }
    Ok(())
}

/// Droits effectifs : rôle si `role_id` renseigné, sinon ancien JSON utilisateur (rétrocompat).
fn effective_stock_privileges_resolved(
    role_id: &str,
    legacy_user_privileges_json: &str,
    role_privileges_json: &str,
) -> Vec<String> {
    let rid = role_id.trim();
    let arr: Vec<Value> = if rid.is_empty() {
        serde_json::from_str(legacy_user_privileges_json).unwrap_or_default()
    } else {
        serde_json::from_str(role_privileges_json).unwrap_or_default()
    };
    normalize_stock_privileges(&arr)
}

async fn ensure_stock_role_and_circuit_schema(conn: &mut AnyConnection) -> Result<(), String> {
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_role (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            code TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            UNIQUE(name)
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_role: {}", e))?;

    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_circuit (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_circuit: {}", e))?;

    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_circuit_step (
            id TEXT PRIMARY KEY,
            circuit_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            title TEXT NOT NULL,
            fields_json TEXT NOT NULL DEFAULT '[]',
            validate_role_id TEXT NOT NULL DEFAULT '',
            fill_role_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (circuit_id) REFERENCES stock_circuit (id) ON DELETE CASCADE
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_circuit_step: {}", e))?;
    ensure_stock_circuit_step_fill_role_ids_json(conn).await?;
    ensure_circuit_steps_default_direction_role(conn).await?;
    ensure_stock_role_privileges_json_column(conn).await?;
    ensure_stock_default_circuits_if_empty(conn).await?;
    merge_stock_user_privileges_into_roles_once(conn).await?;
    ensure_stock_builtin_role_privileges_defaults(conn).await?;
    Ok(())
}

/// Circuits métier par défaut (hors catalogue / mouvements d’articles), insérés une seule fois si aucun circuit n’existe.
async fn ensure_stock_default_circuits_if_empty(conn: &mut AnyConnection) -> Result<(), String> {
    let cnt = sqlx::query::<Any>("SELECT COUNT(*) FROM stock_circuit")
        .fetch_one(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let n: i64 = cnt.try_get::<i64, _>(0).unwrap_or(0);
    if n > 0 {
        return Ok(());
    }

    const R_DEM: &str = "a0000001-0001-4001-8001-000000000001";
    const R_MAG: &str = "a0000001-0001-4001-8001-000000000002";
    const R_RES: &str = "a0000001-0001-4001-8001-000000000003";
    const R_DIR: &str = "a0000001-0001-4001-8001-000000000004";
    const C_ACHAT: &str = "b0000001-0001-4001-8001-000000000001";
    const C_CONS: &str = "b0000001-0001-4001-8001-000000000002";

    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let roles: [(&str, &str, &str, &str); 4] = [
        (
            R_DEM,
            "Demandeur",
            "DEM",
            "Initie une demande ou un constat (processus indépendant des articles).",
        ),
        (
            R_MAG,
            "Magasinier",
            "MAG",
            "Saisie côté entrepôt ou réception, sans obligation de lier à une fiche article.",
        ),
        (
            R_RES,
            "Responsable achats",
            "RACH",
            "Examine et arbitre les demandes avant accord éventuel de la direction.",
        ),
        (
            R_DIR,
            "Direction",
            "DIR",
            "Donne l’accord final lorsque le circuit l’exige.",
        ),
    ];
    for (id, name, code, desc) in roles {
        sqlx::query::<Any>(
            "INSERT OR IGNORE INTO stock_role (id, name, code, description, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(id)
        .bind(name)
        .bind(code)
        .bind(desc)
        .bind(&now)
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    }

    sqlx::query::<Any>(
        "INSERT OR IGNORE INTO stock_circuit (id, name, description, active, created_at, updated_at) VALUES (?1, ?2, ?3, 1, ?4, ?5)",
    )
    .bind(C_ACHAT)
    .bind("Demande interne — arbitrage")
    .bind(
        "Approbation d’une demande interne (budget, achat ponctuel, prestation, etc.) sans passage par le catalogue articles.",
    )
    .bind(&now)
    .bind(&now)
    .execute(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query::<Any>(
        "INSERT OR IGNORE INTO stock_circuit (id, name, description, active, created_at, updated_at) VALUES (?1, ?2, ?3, 1, ?4, ?5)",
    )
    .bind(C_CONS)
    .bind("Réception / consigne (hors article)")
    .bind(
        "Constat à l’arrivée ou consigne interne (litige transport, inventaire ponctuel, etc.) sans mouvement de stock article obligatoire.",
    )
    .bind(&now)
    .bind(&now)
    .execute(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;

    let fj_demande = serde_json::to_string(&json!([
        {"label": "Objet de la demande", "type": "text", "required": true},
        {"label": "Montant estimé (TTC)", "type": "number", "required": false},
        {"label": "Commentaire", "type": "textarea", "required": false},
    ]))
    .map_err(|e| e.to_string())?;
    let fj_examen = serde_json::to_string(&json!([
        {"label": "Avis et arbitrage", "type": "textarea", "required": true},
        {"label": "Montant retenu (TTC)", "type": "number", "required": false},
    ]))
    .map_err(|e| e.to_string())?;
    let fj_direction = serde_json::to_string(&json!([
        {"label": "Décision", "type": "textarea", "required": true},
        {"label": "Référence interne", "type": "text", "required": false},
    ]))
    .map_err(|e| e.to_string())?;
    let fj_constat = serde_json::to_string(&json!([
        {"label": "Nature du constat", "type": "text", "required": true},
        {"label": "Détails", "type": "textarea", "required": false},
    ]))
    .map_err(|e| e.to_string())?;
    let fj_validation = serde_json::to_string(&json!([
        {"label": "Validation", "type": "textarea", "required": true},
    ]))
    .map_err(|e| e.to_string())?;

    let j_dem = serde_json::to_string(&json!([R_DEM])).map_err(|e| e.to_string())?;
    let j_res = serde_json::to_string(&json!([R_RES])).map_err(|e| e.to_string())?;
    let j_dir = serde_json::to_string(&json!([R_DIR])).map_err(|e| e.to_string())?;
    let j_mag_dem = serde_json::to_string(&json!([R_MAG, R_DEM])).map_err(|e| e.to_string())?;

    let steps_achat: [(&str, i64, &str, &str, &str, &str, &str); 3] = [
        (
            "c0000001-0001-4001-8001-000000001001",
            0,
            "Expression du besoin",
            &fj_demande,
            "",
            R_DEM,
            &j_dem,
        ),
        (
            "c0000001-0001-4001-8001-000000001002",
            1,
            "Examen par les achats",
            &fj_examen,
            R_RES,
            R_RES,
            &j_res,
        ),
        (
            "c0000001-0001-4001-8001-000000001003",
            2,
            "Avis direction",
            &fj_direction,
            R_DIR,
            R_DIR,
            &j_dir,
        ),
    ];
    for (sid, pos, title, fields, validate, fill_one, fill_json) in steps_achat {
        sqlx::query::<Any>(
            "INSERT OR IGNORE INTO stock_circuit_step (id, circuit_id, position, title, fields_json, validate_role_id, fill_role_id, fill_role_ids_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        )
        .bind(sid)
        .bind(C_ACHAT)
        .bind(pos)
        .bind(title)
        .bind(fields)
        .bind(validate)
        .bind(fill_one)
        .bind(fill_json)
        .bind(&now)
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    }

    let steps_cons: [(&str, i64, &str, &str, &str, &str, &str); 2] = [
        (
            "c0000001-0001-4001-8001-000000002001",
            0,
            "Constat à l’arrivée",
            &fj_constat,
            "",
            R_MAG,
            &j_mag_dem,
        ),
        (
            "c0000001-0001-4001-8001-000000002002",
            1,
            "Validation responsable",
            &fj_validation,
            R_RES,
            R_RES,
            &j_res,
        ),
    ];
    for (sid, pos, title, fields, validate, fill_one, fill_json) in steps_cons {
        sqlx::query::<Any>(
            "INSERT OR IGNORE INTO stock_circuit_step (id, circuit_id, position, title, fields_json, validate_role_id, fill_role_id, fill_role_ids_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        )
        .bind(sid)
        .bind(C_CONS)
        .bind(pos)
        .bind(title)
        .bind(fields)
        .bind(validate)
        .bind(fill_one)
        .bind(fill_json)
        .bind(&now)
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Si une étape n’a aucun rôle de remplissage (ou pas de validateur après la 1ʳᵉ), applique Direction.
fn ensure_circuit_step_interaction_roles(
    fill_ids: &mut Vec<String>,
    validate_role_id: &mut String,
    position: usize,
) {
    if fill_ids.is_empty() {
        fill_ids.push(STOCK_ROLE_DIRECTION_ID.to_string());
    }
    if position > 0 && validate_role_id.trim().is_empty() {
        *validate_role_id = STOCK_ROLE_DIRECTION_ID.to_string();
    }
}

async fn ensure_circuit_steps_default_direction_role(conn: &mut AnyConnection) -> Result<(), String> {
    let steps = sqlx::query::<Any>(
        "SELECT id, position, validate_role_id, fill_role_id, fill_role_ids_json FROM stock_circuit_step",
    )
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;
    for r in steps {
        let sid: String = r.try_get(0).unwrap_or_default();
        let pos: i64 = r.try_get(1).unwrap_or(0);
        let mut validate: String = r.try_get(2).unwrap_or_default();
        let fill_one: String = r.try_get(3).unwrap_or_default();
        let fill_json: String = r.try_get(4).unwrap_or_default();
        let mut fill_ids = parse_fill_role_ids_json(&fill_json, &fill_one);
        let before_fill = fill_ids.clone();
        let before_validate = validate.clone();
        ensure_circuit_step_interaction_roles(&mut fill_ids, &mut validate, pos as usize);
        if fill_ids == before_fill && validate == before_validate {
            continue;
        }
        let fill_role_id = fill_ids.first().cloned().unwrap_or_default();
        let fill_role_ids_json = serde_json::to_string(&Value::Array(
            fill_ids.iter().cloned().map(|s| json!(s)).collect(),
        ))
        .unwrap_or_else(|_| "[]".to_string());
        sqlx::query::<Any>(
            "UPDATE stock_circuit_step SET validate_role_id = ?1, fill_role_id = ?2, fill_role_ids_json = ?3 WHERE id = ?4",
        )
        .bind(&validate)
        .bind(&fill_role_id)
        .bind(&fill_role_ids_json)
        .bind(&sid)
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Plusieurs rôles peuvent remplir une étape : `fill_role_ids_json` (JSON `["id",…]`), `fill_role_id` = premier id (rétrocompat).
async fn ensure_stock_circuit_step_fill_role_ids_json(conn: &mut AnyConnection) -> Result<(), String> {
    let cols = sqlx::query::<Any>("PRAGMA table_info(stock_circuit_step)")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut has_json = false;
    for r in cols {
        let n: String = r.try_get::<String, _>(1).unwrap_or_default();
        if n == "fill_role_ids_json" {
            has_json = true;
            break;
        }
    }
    if !has_json {
        sqlx::query::<Any>(
            "ALTER TABLE stock_circuit_step ADD COLUMN fill_role_ids_json TEXT NOT NULL DEFAULT '[]'",
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    }
    let steps = sqlx::query::<Any>("SELECT id, fill_role_id, fill_role_ids_json FROM stock_circuit_step")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    for s in steps {
        let id: String = s.try_get(0).unwrap_or_default();
        let fill: String = s.try_get(1).unwrap_or_default();
        let json_col: String = s.try_get(2).unwrap_or_default();
        let trimmed = json_col.trim();
        let need_backfill = !fill.trim().is_empty()
            && (trimmed.is_empty() || trimmed == "[]" || trimmed == "null");
        if need_backfill {
            let arr = json!([fill.trim()]);
            let js = serde_json::to_string(&arr).unwrap_or_else(|_| "[]".to_string());
            sqlx::query::<Any>("UPDATE stock_circuit_step SET fill_role_ids_json = ?1 WHERE id = ?2")
                .bind(&js)
                .bind(&id)
                .execute(&mut *conn)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn parse_fill_role_ids_json(raw: &str, legacy_fill_role_id: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Ok(Value::Array(a)) = serde_json::from_str::<Value>(raw.trim()) {
        for v in a {
            if let Some(s) = v.as_str() {
                let t = s.trim();
                if !t.is_empty() && !out.iter().any(|x| x == t) {
                    out.push(t.to_string());
                }
            }
        }
    }
    if out.is_empty() {
        let t = legacy_fill_role_id.trim();
        if !t.is_empty() {
            out.push(t.to_string());
        }
    }
    out
}

fn circuit_step_references_role_id(
    validate_role_id: &str,
    fill_role_id: &str,
    fill_role_ids_json: &str,
    role_id: &str,
) -> bool {
    if validate_role_id.trim() == role_id || fill_role_id.trim() == role_id {
        return true;
    }
    parse_fill_role_ids_json(fill_role_ids_json, "").iter().any(|x| x == role_id)
}

async fn ensure_stock_collab_task_schema(conn: &mut AnyConnection) -> Result<(), String> {
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_collab_task (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            kind TEXT NOT NULL DEFAULT 'reminder',
            visibility TEXT NOT NULL DEFAULT 'public',
            created_by_user_id TEXT NOT NULL DEFAULT '',
            visible_role_id TEXT NOT NULL DEFAULT '',
            circuit_id TEXT NOT NULL DEFAULT '',
            circuit_step_index INTEGER NOT NULL DEFAULT -1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_collab_task: {}", e))?;
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_collab_task_history (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL DEFAULT '',
            circuit_id TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL,
            actor_user_id TEXT NOT NULL DEFAULT '',
            actor_role_id TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_collab_task_history: {}", e))?;
    Ok(())
}

async fn collab_task_log_action(
    conn: &mut AnyConnection,
    task_id: &str,
    circuit_id: &str,
    action: &str,
    actor_user_id: &str,
    actor_role_id: &str,
    note: &str,
) -> Result<(), String> {
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let hid = Uuid::new_v4().to_string();
    sqlx::query::<Any>(
        "INSERT INTO stock_collab_task_history (id, task_id, circuit_id, action, actor_user_id, actor_role_id, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )
    .bind(&hid)
    .bind(task_id)
    .bind(circuit_id)
    .bind(action)
    .bind(actor_user_id)
    .bind(actor_role_id)
    .bind(note)
    .bind(&now)
    .execute(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Modèles de formulaire réutilisables (sous-écran Circuits → Formulaires).
pub(crate) const STOCK_SYSTEM_MOVEMENT_FORM_TEMPLATE_ID: &str = "f0000001-0001-4001-8001-000000000001";

/// Clés d’écran pour les modèles de formulaires (alignées sur le menu stock principal).
const FORM_TEMPLATE_SCREEN_KEYS: &[&str] = &[
    "dashboard",
    "articles",
    "warehouse",
    "movements",
    "fournisseurs",
    "clients",
    "documents",
    "circuits",
    "general",
];

fn form_template_screen_label(screen: &str) -> &'static str {
    match screen {
        "dashboard" => "Tableau de bord",
        "articles" => "Articles",
        "warehouse" => "Entrepôt",
        "movements" => "Mouvements",
        "fournisseurs" => "Fournisseurs",
        "clients" => "Clients",
        "documents" => "Documents",
        "circuits" => "Circuits",
        "general" => "Générique (circuit / autre)",
        _ => "Générique",
    }
}

fn normalize_form_template_screen_type(raw: &str) -> String {
    let s = raw.trim();
    if FORM_TEMPLATE_SCREEN_KEYS.iter().any(|k| *k == s) {
        return s.to_string();
    }
    "general".to_string()
}

fn default_form_fields_json_for_screen(screen: &str) -> String {
    let arr = match screen {
        "dashboard" => json!([
            {"label": "Objet", "type": "text", "required": true},
            {"label": "Commentaire", "type": "textarea", "required": false},
        ]),
        "articles" => json!([
            {"label": "Article", "type": "article", "required": true},
            {"label": "Catégorie", "type": "text", "required": false},
            {"label": "Quantité", "type": "number", "required": false},
        ]),
        "warehouse" => json!([
            {"label": "Entrepôt", "type": "warehouse", "required": true},
            {"label": "Emplacement", "type": "location", "required": false},
            {"label": "Notes", "type": "textarea", "required": false},
        ]),
        "movements" => json!([
            {"id":"sys-mvt-article","label":"Article","type":"article","required":true,"locked":true},
            {"id":"sys-mvt-type","label":"Type de mouvement","type":"text","required":true,"locked":true},
            {"id":"sys-mvt-qty","label":"Quantité","type":"number","required":true,"locked":true},
            {"id":"sys-mvt-reason","label":"Motif","type":"textarea","required":false,"locked":true},
            {"id":"sys-mvt-ref","label":"Réf. document", "type": "text", "required": false, "locked": true},
            {"id":"sys-mvt-supplier","label":"Fournisseur","type":"fournisseur","required":false,"locked":true},
            {"id":"sys-mvt-client","label":"Client","type":"client","required":false,"locked":true},
        ]),
        "fournisseurs" => json!([
            {"label": "Fournisseur", "type": "fournisseur", "required": true},
            {"label": "Adresse", "type": "textarea", "required": false},
            {"label": "Téléphone", "type": "text", "required": false},
            {"label": "E-mail", "type": "text", "required": false},
        ]),
        "clients" => json!([
            {"label": "Client", "type": "client", "required": true},
            {"label": "Adresse", "type": "textarea", "required": false},
            {"label": "Téléphone", "type": "text", "required": false},
            {"label": "E-mail", "type": "text", "required": false},
        ]),
        "documents" => json!([
            {"label": "Document", "type": "document", "required": true},
            {"label": "Notes", "type": "textarea", "required": false},
        ]),
        "circuits" => json!([
            {"label": "Circuit", "type": "circuit", "required": true},
            {"label": "Détail", "type": "textarea", "required": false},
        ]),
        _ => json!([
            {"label": "Libellé", "type": "text", "required": false},
        ]),
    };
    serde_json::to_string(&arr).unwrap_or_else(|_| "[]".to_string())
}

async fn ensure_stock_form_template_screen_type_column(conn: &mut AnyConnection) -> Result<(), String> {
    let cols = sqlx::query::<Any>("PRAGMA table_info(stock_form_template)")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let has = cols.iter().any(|r| {
        r.try_get::<String, _>(1)
            .map(|n| n.eq_ignore_ascii_case("screen_type"))
            .unwrap_or(false)
    });
    if !has {
        sqlx::query::<Any>(
            "ALTER TABLE stock_form_template ADD COLUMN screen_type TEXT NOT NULL DEFAULT 'general'",
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Un modèle par écran du menu (INSERT OR IGNORE) + modèle système mouvements.
async fn ensure_default_form_templates_per_screen(conn: &mut AnyConnection) -> Result<(), String> {
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    const TPL_DASHBOARD: &str = "f0000002-0001-4002-8002-000000000001";
    const TPL_ARTICLES: &str = "f0000002-0001-4002-8002-000000000002";
    const TPL_WAREHOUSE: &str = "f0000002-0001-4002-8002-000000000003";
    const TPL_FOURNISSEURS: &str = "f0000002-0001-4002-8002-000000000005";
    const TPL_CLIENTS: &str = "f0000002-0001-4002-8002-000000000006";
    const TPL_DOCUMENTS: &str = "f0000002-0001-4002-8002-000000000007";
    const TPL_CIRCUITS: &str = "f0000002-0001-4002-8002-000000000008";
    const TPL_GENERAL: &str = "f0000002-0001-4002-8002-000000000009";

    let seeds: [(&str, &str, &str, i64); 9] = [
        (TPL_DASHBOARD, "dashboard", "Formulaire — Tableau de bord", 0),
        (TPL_ARTICLES, "articles", "Formulaire — Articles", 0),
        (TPL_WAREHOUSE, "warehouse", "Formulaire — Entrepôt", 0),
        (
            STOCK_SYSTEM_MOVEMENT_FORM_TEMPLATE_ID,
            "movements",
            "Mouvement de stock",
            1,
        ),
        (TPL_FOURNISSEURS, "fournisseurs", "Formulaire — Fournisseurs", 0),
        (TPL_CLIENTS, "clients", "Formulaire — Clients", 0),
        (TPL_DOCUMENTS, "documents", "Formulaire — Documents", 0),
        (TPL_CIRCUITS, "circuits", "Formulaire — Circuits", 0),
        (TPL_GENERAL, "general", "Formulaire — Générique", 0),
    ];

    for (id, screen, name, is_system) in seeds {
        let fields_json = default_form_fields_json_for_screen(screen);
        let desc = format!(
            "Modèle de champs pour l’écran « {} ».",
            form_template_screen_label(screen)
        );
        sqlx::query::<Any>(
            "INSERT OR IGNORE INTO stock_form_template (id, name, description, fields_json, is_system, screen_type, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(id)
        .bind(name)
        .bind(&desc)
        .bind(&fields_json)
        .bind(is_system)
        .bind(screen)
        .bind(&now)
        .bind(&now)
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;

        sqlx::query::<Any>(
            "UPDATE stock_form_template SET screen_type = ?1 WHERE id = ?2 AND (trim(coalesce(screen_type,'')) = '' OR screen_type = 'general')",
        )
        .bind(screen)
        .bind(id)
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    }

    let movement_json = default_form_fields_json_for_screen("movements");
    sqlx::query::<Any>(
        "UPDATE stock_form_template SET screen_type = 'movements', fields_json = ?1 WHERE id = ?2 AND is_system = 1",
    )
    .bind(&movement_json)
    .bind(STOCK_SYSTEM_MOVEMENT_FORM_TEMPLATE_ID)
    .execute(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

async fn ensure_stock_form_template_schema(conn: &mut AnyConnection) -> Result<(), String> {
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_form_template (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            description TEXT NOT NULL DEFAULT '',
            fields_json TEXT NOT NULL DEFAULT '[]',
            is_system INTEGER NOT NULL DEFAULT 0,
            screen_type TEXT NOT NULL DEFAULT 'general',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(name)
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_form_template: {}", e))?;

    ensure_stock_form_template_screen_type_column(conn).await?;
    ensure_default_form_templates_per_screen(conn).await?;
    Ok(())
}

async fn stock_user_role_id(conn: &mut AnyConnection, user_id: &str) -> Result<String, String> {
    if user_id.eq_ignore_ascii_case("sadmin") {
        return Ok(String::new());
    }
    let row = sqlx::query::<Any>("SELECT role_id FROM stock_app_user WHERE id = ?1")
        .bind(user_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row
        .and_then(|r| r.try_get::<String, _>(0).ok())
        .unwrap_or_default()
        .trim()
        .to_string())
}

fn collab_task_visible_to(
    requester_is_sadmin: bool,
    requester_user_id: &str,
    requester_role_id: &str,
    created_by: &str,
    visibility: &str,
    visible_role_id: &str,
    kind: &str,
) -> bool {
    if requester_is_sadmin {
        return true;
    }
    let vr = visible_role_id.trim();
    let rid = requester_role_id.trim();
    match kind {
        "circuit_validate" | "circuit_fill" => !vr.is_empty() && vr == rid,
        _ => match visibility {
            "private" => created_by == requester_user_id,
            "role" => !vr.is_empty() && vr == rid,
            _ => true,
        },
    }
}

async fn ensure_stock_article_price_column(conn: &mut AnyConnection) -> Result<(), String> {
    let rows = sqlx::query::<Any>("PRAGMA table_info(stock_article)")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut has_price = false;
    for r in rows {
        let n: String = r.try_get::<String, _>(1).unwrap_or_default();
        if n == "price" {
            has_price = true;
            break;
        }
    }
    if !has_price {
        sqlx::query::<Any>("ALTER TABLE stock_article ADD COLUMN price REAL NOT NULL DEFAULT 0")
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn ensure_stock_article_currency_column(conn: &mut AnyConnection) -> Result<(), String> {
    let rows = sqlx::query::<Any>("PRAGMA table_info(stock_article)")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut has = false;
    for r in rows {
        let n: String = r.try_get::<String, _>(1).unwrap_or_default();
        if n == "currency" {
            has = true;
            break;
        }
    }
    if !has {
        sqlx::query::<Any>("ALTER TABLE stock_article ADD COLUMN currency TEXT NOT NULL DEFAULT ''")
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn ensure_stock_ref_location_fee_columns(conn: &mut AnyConnection) -> Result<(), String> {
    let rows = sqlx::query::<Any>("PRAGMA table_info(stock_ref_location)")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut cols = HashSet::new();
    for r in rows {
        cols.insert(r.try_get::<String, _>(1).unwrap_or_default());
    }
    if !cols.contains("housing_fee") {
        sqlx::query::<Any>("ALTER TABLE stock_ref_location ADD COLUMN housing_fee REAL NOT NULL DEFAULT 0")
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    }
    if !cols.contains("payment_period") {
        sqlx::query::<Any>(
            "ALTER TABLE stock_ref_location ADD COLUMN payment_period TEXT NOT NULL DEFAULT ''",
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn ensure_stock_ref_schema(conn: &mut AnyConnection) -> Result<(), String> {
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_ref_unit (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            code TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            UNIQUE(name)
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_ref_unit: {}", e))?;
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_ref_warehouse (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            code TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            UNIQUE(name)
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_ref_warehouse: {}", e))?;
    migrate_stock_ref_location_schema(conn).await?;
    ensure_stock_ref_location_fee_columns(conn).await?;
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_ref_category (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            code TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            UNIQUE(name)
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_ref_category: {}", e))?;
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_ref_currency (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            code TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            UNIQUE(name)
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_ref_currency: {}", e))?;
    let _ = ensure_default_warehouse_row(conn).await?;
    Ok(())
}

/// Crée la table `stock_ref_location` (schéma avec entrepôt) ou migre l’ancienne table sans `warehouse_id`.
async fn migrate_stock_ref_location_schema(conn: &mut AnyConnection) -> Result<(), String> {
    let exists_row = sqlx::query::<Any>(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='stock_ref_location'",
    )
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;
    let exists: i64 = exists_row.try_get::<i64, _>(0).unwrap_or(0);

    if exists == 0 {
        sqlx::query::<Any>(
            r#"CREATE TABLE stock_ref_location (
                id TEXT PRIMARY KEY,
                warehouse_id TEXT NOT NULL,
                name TEXT NOT NULL COLLATE NOCASE,
                code TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                housing_fee REAL NOT NULL DEFAULT 0,
                payment_period TEXT NOT NULL DEFAULT '',
                UNIQUE(warehouse_id, name),
                FOREIGN KEY (warehouse_id) REFERENCES stock_ref_warehouse (id)
            )"#,
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("stock_ref_location init: {}", e))?;
        return Ok(());
    }

    let cols = sqlx::query::<Any>("PRAGMA table_info(stock_ref_location)")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut has_wh = false;
    for r in &cols {
        let n: String = r.try_get::<String, _>(1).unwrap_or_default();
        if n == "warehouse_id" {
            has_wh = true;
            break;
        }
    }
    if has_wh {
        return Ok(());
    }

    let default_wh = ensure_default_warehouse_row(conn).await?;

    sqlx::query::<Any>(
        r#"CREATE TABLE stock_ref_location_new (
            id TEXT PRIMARY KEY,
            warehouse_id TEXT NOT NULL,
            name TEXT NOT NULL COLLATE NOCASE,
            code TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            housing_fee REAL NOT NULL DEFAULT 0,
            payment_period TEXT NOT NULL DEFAULT '',
            UNIQUE(warehouse_id, name),
            FOREIGN KEY (warehouse_id) REFERENCES stock_ref_warehouse (id)
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query::<Any>(
        "INSERT INTO stock_ref_location_new (id, warehouse_id, name, code, created_at, housing_fee, payment_period) SELECT id, ?1, name, code, created_at, 0, '' FROM stock_ref_location",
    )
    .bind(&default_wh)
    .execute(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query::<Any>("DROP TABLE stock_ref_location")
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query::<Any>("ALTER TABLE stock_ref_location_new RENAME TO stock_ref_location")
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;

    let loc_rows = sqlx::query::<Any>("SELECT id, name FROM stock_ref_location WHERE warehouse_id = ?1")
        .bind(&default_wh)
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    for r in loc_rows {
        let lid: String = r.try_get(0).unwrap_or_default();
        let lname: String = r.try_get(1).unwrap_or_default();
        if lname.is_empty() {
            continue;
        }
        let _ = sqlx::query::<Any>(
            "UPDATE stock_article SET location = ?1 WHERE location = ?2 COLLATE NOCASE AND TRIM(location) != ''",
        )
        .bind(&lid)
        .bind(&lname)
        .execute(&mut *conn)
        .await;
    }

    Ok(())
}

/// Garantit au moins un entrepôt (pour rattacher les emplacements et les créations rapides).
async fn ensure_default_warehouse_row(conn: &mut AnyConnection) -> Result<String, String> {
    let cnt_row = sqlx::query::<Any>("SELECT COUNT(*) FROM stock_ref_warehouse")
        .fetch_one(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let count: i64 = cnt_row.try_get::<i64, _>(0).unwrap_or(0);
    if count > 0 {
        let id_row = sqlx::query::<Any>(
            "SELECT id FROM stock_ref_warehouse ORDER BY name COLLATE NOCASE LIMIT 1",
        )
        .fetch_one(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
        return id_row.try_get::<String, _>(0).map_err(|e| e.to_string());
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    sqlx::query::<Any>(
        "INSERT INTO stock_ref_warehouse (id, name, code, created_at) VALUES (?1, ?2, '', ?3)",
    )
    .bind(&id)
    .bind("Entrepôt principal")
    .bind(&now)
    .execute(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;
    Ok(id)
}

async fn ensure_stock_document_schema(conn: &mut AnyConnection) -> Result<(), String> {
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_document (
            id TEXT PRIMARY KEY,
            original_name TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('png','jpeg','pdf')),
            bytes INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            movement_id TEXT,
            movement_caption TEXT NOT NULL DEFAULT ''
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_document: {}", e))?;
    migrate_stock_document_movement_cols(conn).await?;
    ensure_stock_document_print_model_schema(conn).await?;
    Ok(())
}

/// Modèles d’impression HTML/CSS (variables `{{ cle }}`).
async fn ensure_stock_document_print_model_schema(conn: &mut AnyConnection) -> Result<(), String> {
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_document_print_model (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            description TEXT NOT NULL DEFAULT '',
            html_content TEXT NOT NULL DEFAULT '',
            css_content TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(name)
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_document_print_model: {}", e))?;
    Ok(())
}

async fn ensure_stock_kv_schema(conn: &mut AnyConnection) -> Result<(), String> {
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_kv (
            entry_key TEXT PRIMARY KEY,
            entry_value TEXT NOT NULL DEFAULT ''
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_kv: {}", e))?;
    Ok(())
}

async fn stock_kv_get(conn: &mut AnyConnection, key: &str) -> Result<String, String> {
    let row = sqlx::query::<Any>("SELECT entry_value FROM stock_kv WHERE entry_key = ?1")
        .bind(key)
        .fetch_optional(conn)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row
        .and_then(|r| r.try_get::<String, _>(0).ok())
        .unwrap_or_default())
}

async fn stock_kv_set(conn: &mut AnyConnection, key: &str, val: &str) -> Result<(), String> {
    sqlx::query::<Any>("INSERT OR REPLACE INTO stock_kv (entry_key, entry_value) VALUES (?1, ?2)")
        .bind(key)
        .bind(val)
        .execute(conn)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn stock_kv_delete(conn: &mut AnyConnection, key: &str) -> Result<(), String> {
    sqlx::query::<Any>("DELETE FROM stock_kv WHERE entry_key = ?1")
        .bind(key)
        .execute(conn)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

const DOC_PRINT_SCREEN_KV: &[&str] = &[
    "movements",
    "articles",
    "docs",
    "parties",
    "ref",
    "wh",
    "dashboard_recent",
    "dashboard_categories",
];

fn doc_print_screen_key_kv(screen: &str) -> String {
    format!("doc_print_screen_{}", screen)
}

fn split_csv_ids(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

fn join_csv_ids(ids: &[String]) -> String {
    ids.join(",")
}

/// Retourne la clé écran affectée à un modèle (au plus une).
async fn get_doc_print_model_screen(
    conn: &mut AnyConnection,
    model_id: &str,
) -> Result<String, String> {
    for sk in DOC_PRINT_SCREEN_KV {
        let k = doc_print_screen_key_kv(sk);
        let ids = split_csv_ids(&stock_kv_get(conn, &k).await?);
        if ids.iter().any(|id| id == model_id) {
            return Ok((*sk).to_string());
        }
    }
    Ok(String::new())
}

/// Affecte un modèle à un écran (un écran par modèle, plusieurs modèles par écran).
async fn set_doc_print_model_screen(
    conn: &mut AnyConnection,
    model_id: &str,
    screen_opt: Option<&str>,
) -> Result<(), String> {
    // Retire le modèle de tous les écrans.
    for sk in DOC_PRINT_SCREEN_KV {
        let k = doc_print_screen_key_kv(sk);
        let mut ids = split_csv_ids(&stock_kv_get(conn, &k).await?);
        let before = ids.len();
        ids.retain(|id| id != model_id);
        if ids.is_empty() {
            if before > 0 {
                stock_kv_delete(conn, &k).await?;
            }
        } else if ids.len() != before {
            stock_kv_set(conn, &k, &join_csv_ids(&ids)).await?;
        }
    }

    // Ajoute le modèle sur l'écran demandé.
    if let Some(screen) = screen_opt {
        let s = screen.trim();
        if !s.is_empty() {
            if !DOC_PRINT_SCREEN_KV.iter().any(|x| *x == s) {
                return Err("screenKey inconnu".to_string());
            }
            let k = doc_print_screen_key_kv(s);
            let mut ids = split_csv_ids(&stock_kv_get(conn, &k).await?);
            if !ids.iter().any(|id| id == model_id) {
                ids.push(model_id.to_string());
                stock_kv_set(conn, &k, &join_csv_ids(&ids)).await?;
            }
        }
    }
    Ok(())
}

/// Retire toute affectation d’impression listant vers ce modèle.
async fn clear_doc_print_screen_bindings_for_model(
    conn: &mut AnyConnection,
    model_id: &str,
) -> Result<(), String> {
    set_doc_print_model_screen(conn, model_id, None).await
}

fn doc_print_screen_label(screen: &str) -> &'static str {
    match screen {
        "movements" => "Mouvements de stock",
        "articles" => "Articles",
        "docs" => "Documents",
        "parties" => "Tiers",
        "ref" => "Références",
        "wh" => "Entrepôt",
        "dashboard_recent" => "Tableau de bord — mouvements récents",
        "dashboard_categories" => "Tableau de bord — stocks par catégorie",
        _ => "Impression",
    }
}

fn default_model_template_for_screen(screen: &str) -> (&'static str, &'static str) {
    let css = r#"
.page { font-family: Arial, sans-serif; color: #1f2937; background: #fff; border: 1px solid #d6e4c8; width: 754px; box-sizing: border-box; }
.head { background: #8BC34A; color: #fff; padding: 18px 20px; display: flex; justify-content: space-between; align-items: center; }
.logo { background: #fff; color: #4b7f23; border-radius: 20px; padding: 8px 14px; font-weight: 700; font-size: 12px; }
.meta { text-align: right; font-size: 12px; line-height: 1.5; }
.body { padding: 18px 20px 12px; }
.title { font-size: 24px; margin: 0 0 8px; color: #4b7f23; text-transform: uppercase; }
.sub { color: #6b7280; margin: 0 0 14px; font-size: 12px; }
.kpi { display: grid; grid-template-columns: 244px 244px 244px; gap: 10px; margin-bottom: 12px; }
.kpi .box { border: 1px solid #d1d5db; padding: 8px; border-radius: 6px; font-size: 12px; }
.kpi .label { color: #6b7280; font-size: 11px; display: block; }
.kpi .value { font-weight: 700; font-size: 13px; margin-top: 4px; display: block; }
.tbl { width: 754px; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
.tbl th { background: #8BC34A; color: #fff; text-align: left; padding: 7px 8px; }
.tbl td { border: 1px solid #e5e7eb; padding: 7px 8px; }
.tot { margin-top: 12px; width: 260px; margin-left: 494px; font-size: 12px; }
.tot .row { display: flex; justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding: 6px 0; }
.foot { border-top: 2px solid #8BC34A; margin-top: 16px; padding: 10px 20px; font-size: 11px; color: #6b7280; }
"#;

    let html = match screen {
        "movements" => r#"
<div class="page">
  <div class="head">
    <div class="logo">{{ societe.nom }}</div>
    <div class="meta"><strong>{{ titre }}</strong><br/>{{ date.aujourdhui }} {{ date.heure }}<br/>{{ sousTitre }}</div>
  </div>
  <div class="body">
    <h1 class="title">Mouvement</h1>
    <p class="sub">Document synthétique des mouvements</p>
    <div class="kpi">
      <div class="box"><span class="label">Type</span><span class="value">{{ mouvement.type }}</span></div>
      <div class="box"><span class="label">Quantité</span><span class="value">{{ mouvement.qte }}</span></div>
      <div class="box"><span class="label">Date</span><span class="value">{{ mouvement.date }}</span></div>
    </div>
    <table class="tbl">
      <thead><tr><th>Article</th><th>SKU</th><th>Motif</th><th>Référence</th><th>Fournisseur</th><th>Client</th></tr></thead>
      <tbody><tr><td>{{ article.nom }}</td><td>{{ article.sku }}</td><td>{{ mouvement.motif }}</td><td>{{ mouvement.refDoc }}</td><td>{{ fournisseur.nom }}</td><td>{{ client.nom }}</td></tr></tbody>
    </table>
    <div style="margin-top:12px">{{ liste.contenu }}</div>
  </div>
  <div class="foot">Généré automatiquement par LoggAppro.</div>
</div>
"#,
        "articles" => r#"
<div class="page">
  <div class="head"><div class="logo">{{ societe.nom }}</div><div class="meta"><strong>{{ titre }}</strong><br/>{{ date.aujourdhui }} {{ date.heure }}</div></div>
  <div class="body">
    <h1 class="title">Article</h1>
    <div class="kpi">
      <div class="box"><span class="label">Nom</span><span class="value">{{ article.nom }}</span></div>
      <div class="box"><span class="label">SKU</span><span class="value">{{ article.sku }}</span></div>
      <div class="box"><span class="label">Catégorie</span><span class="value">{{ article.categorie }}</span></div>
    </div>
    <table class="tbl">
      <thead><tr><th>Quantité</th><th>Unité</th><th>Total stock</th></tr></thead>
      <tbody><tr><td>{{ article.qte }}</td><td>{{ article.unite }}</td><td>{{ article.qte }}</td></tr></tbody>
    </table>
    <div style="margin-top:12px">{{ liste.contenu }}</div>
  </div>
  <div class="foot">Généré automatiquement par LoggAppro.</div>
</div>
"#,
        "docs" => r#"
<div class="page">
  <div class="head"><div class="logo">{{ societe.nom }}</div><div class="meta"><strong>{{ titre }}</strong><br/>{{ date.aujourdhui }} {{ date.heure }}</div></div>
  <div class="body">
    <h1 class="title">Documents</h1>
    <table class="tbl">
      <thead><tr><th>Nom</th><th>Type</th></tr></thead>
      <tbody><tr><td>{{ document.nom }}</td><td>{{ document.type }}</td></tr></tbody>
    </table>
    <div style="margin-top:12px">{{ liste.contenu }}</div>
  </div>
  <div class="foot">Généré automatiquement par LoggAppro.</div>
</div>
"#,
        "parties" => r#"
<div class="page">
  <div class="head"><div class="logo">{{ societe.nom }}</div><div class="meta"><strong>{{ titre }}</strong><br/>{{ date.aujourdhui }} {{ date.heure }}</div></div>
  <div class="body">
    <h1 class="title">Tiers</h1>
    <table class="tbl">
      <thead><tr><th>Fournisseur</th><th>Client</th></tr></thead>
      <tbody><tr><td>{{ fournisseur.nom }}</td><td>{{ client.nom }}</td></tr></tbody>
    </table>
    <div style="margin-top:12px">{{ liste.contenu }}</div>
  </div>
  <div class="foot">Généré automatiquement par LoggAppro.</div>
</div>
"#,
        _ => r#"
<div class="page">
  <div class="head"><div class="logo">{{ societe.nom }}</div><div class="meta"><strong>{{ titre }}</strong><br/>{{ date.aujourdhui }} {{ date.heure }}</div></div>
  <div class="body">
    <h1 class="title">{{ titre }}</h1>
    <p class="sub">{{ sousTitre }}</p>
    <div>{{ liste.contenu }}</div>
  </div>
  <div class="foot">Généré automatiquement par LoggAppro.</div>
</div>
"#,
    };
    (html, css)
}

async fn ensure_default_print_models(conn: &mut AnyConnection) -> Result<(), String> {
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    for screen in DOC_PRINT_SCREEN_KV {
        let k = doc_print_screen_key_kv(screen);
        let mut ids = split_csv_ids(&stock_kv_get(conn, &k).await?);
        let (default_html, default_css) = default_model_template_for_screen(screen);
        let name = format!("Modèle par défaut [{}]", screen);
        let existing = sqlx::query::<Any>("SELECT id FROM stock_document_print_model WHERE name = ?1")
            .bind(&name)
            .fetch_optional(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
        let id = if let Some(r) = existing {
            r.try_get::<String, _>(0).unwrap_or_default()
        } else {
            let id = Uuid::new_v4().to_string();
            let description = format!("Modèle créé automatiquement pour l’écran « {} ».", doc_print_screen_label(screen));
            sqlx::query::<Any>(
                "INSERT INTO stock_document_print_model (id, name, description, html_content, css_content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .bind(&id)
            .bind(&name)
            .bind(description)
            .bind(default_html)
            .bind(default_css)
            .bind(&now)
            .bind(&now)
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
            id
        };
        if !id.is_empty() {
            let description = format!("Modèle créé automatiquement pour l’écran « {} ».", doc_print_screen_label(screen));
            sqlx::query::<Any>(
                "UPDATE stock_document_print_model SET description = ?1, html_content = ?2, css_content = ?3, updated_at = ?4 WHERE id = ?5",
            )
            .bind(description)
            .bind(default_html)
            .bind(default_css)
            .bind(&now)
            .bind(&id)
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
            if !ids.iter().any(|x| x == &id) {
                ids.push(id);
            }
            stock_kv_set(conn, &k, &join_csv_ids(&ids)).await?;
        }
    }
    Ok(())
}

fn normalize_remote_driver(d: &str) -> &'static str {
    match d.trim().to_lowercase().as_str() {
        "postgres" | "postgresql" => "postgres",
        _ => "mysql",
    }
}

fn build_remote_database_url(
    driver: &str,
    host: &str,
    port: &str,
    database: &str,
    user: &str,
    password: &str,
    ssl: bool,
    schema: &str,
    extra: &str,
) -> Result<String, String> {
    let host = host.trim();
    if host.is_empty() {
        return Err("Hôte requis pour tester la connexion.".to_string());
    }
    let db = database.trim();
    if db.is_empty() {
        return Err("Nom de la base requis pour tester la connexion.".to_string());
    }
    let driver = normalize_remote_driver(driver);
    let port = if port.trim().is_empty() {
        if driver == "postgres" {
            "5432"
        } else {
            "3306"
        }
    } else {
        port.trim()
    };
    let u = encode(user.trim());
    let p = encode(password);
    let dbe = encode(db);
    let mut url = if driver == "postgres" {
        format!("postgresql://{u}:{p}@{host}:{port}/{dbe}")
    } else {
        format!("mysql://{u}:{p}@{host}:{port}/{dbe}")
    };
    let mut params: Vec<String> = Vec::new();
    if driver == "postgres" {
        if ssl {
            params.push("sslmode=require".to_string());
        } else {
            params.push("sslmode=disable".to_string());
        }
        let sch = schema.trim();
        if !sch.is_empty() {
            params.push(format!("options=-csearch_path%3D{}", encode(sch)));
        }
    } else {
        if ssl {
            params.push("ssl-mode=REQUIRED".to_string());
        } else {
            params.push("ssl-mode=DISABLED".to_string());
        }
        params.push("connect_timeout=15".to_string());
    }
    for part in extra.split('&') {
        let s = part.trim();
        if !s.is_empty() && !s.starts_with('#') {
            params.push(s.to_string());
        }
    }
    if !params.is_empty() {
        url.push('?');
        url.push_str(&params.join("&"));
    }
    Ok(url)
}

async fn migrate_stock_document_movement_cols(conn: &mut AnyConnection) -> Result<(), String> {
    let cols = sqlx::query::<Any>("PRAGMA table_info(stock_document)")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut has_mid = false;
    for r in &cols {
        let n: String = r.try_get::<String, _>(1).unwrap_or_default();
        if n == "movement_id" {
            has_mid = true;
            break;
        }
    }
    if has_mid {
        return Ok(());
    }
    sqlx::query::<Any>("ALTER TABLE stock_document ADD COLUMN movement_id TEXT")
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query::<Any>("ALTER TABLE stock_document ADD COLUMN movement_caption TEXT NOT NULL DEFAULT ''")
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn stock_documents_store_dir() -> PathBuf {
    db::get_databases_dir().join("stock_documents_store")
}

async fn ensure_document_store_dir() -> Result<(), String> {
    let p = stock_documents_store_dir();
    if let Some(parent) = p.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    tokio::fs::create_dir_all(&p)
        .await
        .map_err(|e| format!("dossier documents: {}", e))?;
    Ok(())
}

fn document_disk_ext(kind: &str) -> &'static str {
    match kind {
        "jpeg" => "jpg",
        "png" => "png",
        "pdf" => "pdf",
        _ => "bin",
    }
}

fn document_path(id: &str, kind: &str) -> PathBuf {
    stock_documents_store_dir().join(format!("{}.{}", id, document_disk_ext(kind)))
}

fn sniff_document_kind(data: &[u8]) -> Option<&'static str> {
    if data.len() >= 4 && data[..4] == [0x89, b'P', b'N', b'G'] {
        return Some("png");
    }
    if data.len() >= 3 && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff {
        return Some("jpeg");
    }
    if data.len() >= 4 && &data[..4] == b"%PDF" {
        return Some("pdf");
    }
    None
}

const MAX_DOCUMENT_BYTES: usize = 12 * 1024 * 1024;

fn ref_items_table(kind: &str) -> Result<&'static str, String> {
    match kind {
        "unit" => Ok("stock_ref_unit"),
        "location" => Ok("stock_ref_location"),
        "category" => Ok("stock_ref_category"),
        "currency" => Ok("stock_ref_currency"),
        "warehouse" => Ok("stock_ref_warehouse"),
        _ => Err("kind doit être unit, location, category, currency ou warehouse".to_string()),
    }
}

fn normalize_location_payment_period(s: &str) -> String {
    let t = s.trim().to_lowercase();
    match t.as_str() {
        "" => String::new(),
        "monthly" | "mensuel" | "mensuelle" => "monthly".into(),
        "quarterly" | "trimestriel" | "trimestrielle" => "quarterly".into(),
        "semiannual" | "semestriel" | "semestrielle" => "semiannual".into(),
        "yearly" | "annual" | "annuel" | "annuelle" => "yearly".into(),
        "one_time" | "ponctuel" | "unique" | "once" => "one_time".into(),
        _ => String::new(),
    }
}

fn enc(data: &Value) -> Result<Value, String> {
    encrypt_response(data, Some(&resolve_cript_key()))
}

#[tauri::command]
pub async fn stock_list_articles(payload: String) -> Result<Value, String> {
    let _p = parse_or_empty(&payload);
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;

    let search = _p
        .body
        .as_ref()
        .and_then(|b| b.get("search"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    let rows = if search.is_empty() {
        sqlx::query::<Any>(
            "SELECT id, sku, name, category, unit, qty, min_qty, price, currency, location, notes, updated_at FROM stock_article ORDER BY name COLLATE NOCASE",
        )
        .fetch_all(&mut conn)
        .await
    } else {
        let pat = format!("%{}%", search.replace('%', "\\%"));
        sqlx::query::<Any>(
            "SELECT id, sku, name, category, unit, qty, min_qty, price, currency, location, notes, updated_at FROM stock_article WHERE sku LIKE ?1 ESCAPE '\\' OR name LIKE ?1 ESCAPE '\\' OR category LIKE ?1 ESCAPE '\\' OR IFNULL(currency,'') LIKE ?1 ESCAPE '\\' ORDER BY name COLLATE NOCASE",
        )
        .bind(&pat)
        .fetch_all(&mut conn)
        .await
    }
    .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        list.push(json!({
            "id": r.try_get::<String, _>(0).unwrap_or_default(),
            "sku": r.try_get::<String, _>(1).unwrap_or_default(),
            "name": r.try_get::<String, _>(2).unwrap_or_default(),
            "category": r.try_get::<String, _>(3).unwrap_or_default(),
            "unit": r.try_get::<String, _>(4).unwrap_or_default(),
            "qty": r.try_get::<f64, _>(5).unwrap_or(0.0),
            "minQty": r.try_get::<f64, _>(6).unwrap_or(0.0),
            "price": r.try_get::<f64, _>(7).unwrap_or(0.0),
            "currency": r.try_get::<String, _>(8).unwrap_or_default(),
            "location": r.try_get::<String, _>(9).unwrap_or_default(),
            "notes": r.try_get::<String, _>(10).unwrap_or_default(),
            "updatedAt": r.try_get::<String, _>(11).unwrap_or_default(),
        }));
    }
    enc(&json!({ "articles": list }))
}

#[tauri::command]
pub async fn stock_upsert_article(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;

    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let sku = obj.get("sku").and_then(|v| v.as_str()).unwrap_or("").trim();
    if sku.is_empty() {
        return Err("SKU requis".to_string());
    }
    let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
    if name.is_empty() {
        return Err("Libellé requis".to_string());
    }
    let category = obj.get("category").and_then(|v| v.as_str()).unwrap_or("");
    let unit = obj.get("unit").and_then(|v| v.as_str()).unwrap_or("pcs");
    let qty = obj.get("qty").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let min_qty = obj.get("minQty").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let price = obj.get("price").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let currency = obj.get("currency").and_then(|v| v.as_str()).unwrap_or("");
    let location = obj.get("location").and_then(|v| v.as_str()).unwrap_or("");
    let notes = obj.get("notes").and_then(|v| v.as_str()).unwrap_or("");
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let exists = sqlx::query::<Any>("SELECT id FROM stock_article WHERE id = ?1")
        .bind(&id)
        .fetch_optional(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    if exists.is_some() {
        sqlx::query::<Any>(
            "UPDATE stock_article SET sku = ?1, name = ?2, category = ?3, unit = ?4, qty = ?5, min_qty = ?6, price = ?7, currency = ?8, location = ?9, notes = ?10, updated_at = ?11 WHERE id = ?12",
        )
        .bind(sku)
        .bind(name)
        .bind(category)
        .bind(unit)
        .bind(qty)
        .bind(min_qty)
        .bind(price)
        .bind(currency)
        .bind(location)
        .bind(notes)
        .bind(&now)
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "SKU déjà utilisé".to_string()
            } else {
                e.to_string()
            }
        })?;
    } else {
        sqlx::query::<Any>(
            "INSERT INTO stock_article (id, sku, name, category, unit, qty, min_qty, price, currency, location, notes, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        )
        .bind(&id)
        .bind(sku)
        .bind(name)
        .bind(category)
        .bind(unit)
        .bind(qty)
        .bind(min_qty)
        .bind(price)
        .bind(currency)
        .bind(location)
        .bind(notes)
        .bind(&now)
        .execute(&mut conn)
        .await
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "SKU déjà utilisé".to_string()
            } else {
                e.to_string()
            }
        })?;
    }

    enc(&json!({ "success": true, "id": id }))
}

#[tauri::command]
pub async fn stock_delete_article(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let id = body
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("id requis")?;

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;

    let cnt_row = sqlx::query::<Any>("SELECT COUNT(*) FROM stock_movement WHERE article_id = ?1")
        .bind(id)
        .fetch_one(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    let cnt: i64 = cnt_row.try_get(0).map_err(|e| e.to_string())?;

    if cnt > 0 {
        return Err(
            "Impossible de supprimer : des mouvements existent (privilégier mise à jour ou ajustement)."
                .to_string(),
        );
    }

    let r = sqlx::query::<Any>("DELETE FROM stock_article WHERE id = ?1")
        .bind(id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    enc(&json!({ "success": r.rows_affected() > 0 }))
}

fn is_iso_date_ymd(s: &str) -> bool {
    let t = s.trim();
    if t.len() != 10 {
        return false;
    }
    let b = t.as_bytes();
    b[4] == b'-' && b[7] == b'-'
        && b[..4].iter().all(|x| x.is_ascii_digit())
        && b[5..7].iter().all(|x| x.is_ascii_digit())
        && b[8..10].iter().all(|x| x.is_ascii_digit())
}

#[tauri::command]
pub async fn stock_list_movements(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let article_filter = p
        .body
        .as_ref()
        .and_then(|b| b.get("articleId"))
        .and_then(|v| v.as_str());
    let date_from = p
        .body
        .as_ref()
        .and_then(|b| b.get("dateFrom"))
        .and_then(|v| v.as_str())
        .filter(|s| is_iso_date_ymd(s))
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let date_to = p
        .body
        .as_ref()
        .and_then(|b| b.get("dateTo"))
        .and_then(|v| v.as_str())
        .filter(|s| is_iso_date_ymd(s))
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let move_type_filter = p
        .body
        .as_ref()
        .and_then(|b| b.get("moveType"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_uppercase())
        .filter(|s| s == "IN" || s == "OUT" || s == "ADJ");

    let limit_n = if article_filter.map(|a| !a.trim().is_empty()).unwrap_or(false)
        && date_from.is_none()
        && date_to.is_none()
        && move_type_filter.is_none()
    {
        200
    } else {
        500
    };

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;

    let receipt_subcount = r#"(SELECT COUNT(*) FROM stock_document d WHERE d.movement_id IN (SELECT smx.id FROM stock_movement smx WHERE smx.batch_id = m.batch_id))"#;
    let receipt_subids = r#"IFNULL((SELECT GROUP_CONCAT(d.id, ',') FROM stock_document d WHERE d.movement_id IN (SELECT smx.id FROM stock_movement smx WHERE smx.batch_id = m.batch_id)), '')"#;

    let mut where_sql = String::from("WHERE 1=1");
    let mut bind_vals: Vec<String> = Vec::new();

    if let Some(aid) = article_filter.map(str::trim).filter(|s| !s.is_empty()) {
        where_sql.push_str(" AND m.article_id = ?");
        bind_vals.push(aid.to_string());
    }
    if let Some(df) = date_from {
        where_sql.push_str(" AND m.created_at >= ?");
        bind_vals.push(format!("{} 00:00:00", df));
    }
    if let Some(dt) = date_to {
        where_sql.push_str(" AND m.created_at <= ?");
        bind_vals.push(format!("{} 23:59:59", dt));
    }
    if let Some(mt) = move_type_filter {
        where_sql.push_str(" AND m.move_type = ?");
        bind_vals.push(mt);
    }

    let qstr = format!(
        r#"SELECT m.id, IFNULL(m.batch_id,''), m.line_no, m.article_id, a.sku, a.name, m.move_type, m.qty, m.reason, m.ref_doc,
                      IFNULL(m.supplier_name,''), IFNULL(m.client_name,''), m.created_at, IFNULL(m.price_in,0), IFNULL(m.price_out,0),
                      {},
                      {}
               FROM stock_movement m JOIN stock_article a ON a.id = m.article_id
               {} ORDER BY m.created_at DESC, m.batch_id, m.line_no LIMIT {}"#,
        receipt_subcount, receipt_subids, where_sql, limit_n
    );

    let mut q = sqlx::query::<Any>(&qstr);
    for b in bind_vals {
        q = q.bind(b);
    }

    let rows = q.fetch_all(&mut conn).await.map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        let receipt_count: i64 = r.try_get(15).unwrap_or(0);
        let receipt_ids_s: String = r.try_get(16).unwrap_or_default();
        let receipt_document_ids: Vec<Value> = receipt_ids_s
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| json!(s))
            .collect();
        list.push(json!({
            "id": r.try_get::<String, _>(0).unwrap_or_default(),
            "batchId": r.try_get::<String, _>(1).unwrap_or_default(),
            "lineNo": r.try_get::<i64, _>(2).unwrap_or(0),
            "articleId": r.try_get::<String, _>(3).unwrap_or_default(),
            "sku": r.try_get::<String, _>(4).unwrap_or_default(),
            "articleName": r.try_get::<String, _>(5).unwrap_or_default(),
            "moveType": r.try_get::<String, _>(6).unwrap_or_default(),
            "qty": r.try_get::<f64, _>(7).unwrap_or(0.0),
            "reason": r.try_get::<String, _>(8).unwrap_or_default(),
            "refDoc": r.try_get::<String, _>(9).unwrap_or_default(),
            "supplierName": r.try_get::<String, _>(10).unwrap_or_default(),
            "clientName": r.try_get::<String, _>(11).unwrap_or_default(),
            "createdAt": r.try_get::<String, _>(12).unwrap_or_default(),
            "priceIn": r.try_get::<f64, _>(13).unwrap_or(0.0),
            "priceOut": r.try_get::<f64, _>(14).unwrap_or(0.0),
            "receiptCount": receipt_count,
            "receiptDocumentIds": receipt_document_ids,
        }));
    }
    enc(&json!({ "movements": list }))
}

/// Normalise la date/heure du mouvement (`YYYY-MM-DD HH:mm:ss` pour SQLite). Si absente ou vide → maintenant UTC.
fn resolve_movement_created_at(raw: Option<&str>) -> Result<String, String> {
    let s = raw.map(str::trim).filter(|s| !s.is_empty());
    let Some(s) = s else {
        return Ok(Utc::now().format("%Y-%m-%d %H:%M:%S").to_string());
    };
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Ok(dt.naive_utc().format("%Y-%m-%d %H:%M:%S").to_string());
    }
    let no_frac = s.split('.').next().unwrap_or(s).trim_end_matches('Z').trim();
    let normalized = no_frac.replace('T', " ");
    if let Ok(naive) = NaiveDateTime::parse_from_str(&normalized, "%Y-%m-%d %H:%M:%S") {
        return Ok(naive.format("%Y-%m-%d %H:%M:%S").to_string());
    }
    if let Ok(d) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        let Some(naive) = d.and_hms_opt(0, 0, 0) else {
            return Err("createdAt invalide".to_string());
        };
        return Ok(naive.format("%Y-%m-%d %H:%M:%S").to_string());
    }
    Err("createdAt invalide".to_string())
}

#[tauri::command]
pub async fn stock_add_movement(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let move_type = obj
        .get("moveType")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_uppercase();
    if !matches!(move_type.as_str(), "IN" | "OUT" | "ADJ") {
        return Err("moveType doit être IN, OUT ou ADJ".to_string());
    }
    let reason = obj.get("reason").and_then(|v| v.as_str()).unwrap_or("");
    let ref_doc = obj.get("refDoc").and_then(|v| v.as_str()).unwrap_or("");
    let supplier_in = obj
        .get("supplierName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let client_in = obj
        .get("clientName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let (supplier_name, client_name) = match move_type.as_str() {
        "IN" => (supplier_in, ""),
        "OUT" => ("", client_in),
        _ => ("", ""),
    };
    let price_in_root = obj.get("priceIn").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let price_out_root = obj.get("priceOut").and_then(|v| v.as_f64()).unwrap_or(0.0);

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let movement_ts =
        resolve_movement_created_at(obj.get("createdAt").and_then(|v| v.as_str()))?;
    let party_now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    fn apply_qty_change(
        move_type: &str,
        current: f64,
        qty: f64,
    ) -> Result<f64, String> {
        match move_type {
            "IN" => Ok(current + qty),
            "OUT" => {
                let n = current - qty;
                if n < 0.0 {
                    return Err("Stock insuffisant pour cette sortie".to_string());
                }
                Ok(n)
            }
            "ADJ" => Ok(qty),
            _ => unreachable!(),
        }
    }

    if let Some(lines_arr) = obj.get("lines").and_then(|v| v.as_array()) {
        if lines_arr.is_empty() {
            return Err("Au moins une ligne article est requise".to_string());
        }
        let batch_id = Uuid::new_v4().to_string();
        let mut tx = Acquire::begin(&mut conn).await.map_err(|e| e.to_string())?;
        let mut first_movement_id: Option<String> = None;
        let mut last_new_qty: f64 = 0.0;

        for (line_no, line_v) in lines_arr.iter().enumerate() {
            let lo = line_v.as_object().ok_or("Ligne de mouvement invalide")?;
            let article_id = lo
                .get("articleId")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .ok_or("articleId requis pour chaque ligne")?;
            let qty = lo.get("qty").and_then(|v| v.as_f64()).ok_or("qty requis pour chaque ligne")?;
            if qty <= 0.0 && move_type != "ADJ" {
                return Err("Quantité doit être positive sur chaque ligne".to_string());
            }
            let price_in = lo
                .get("priceIn")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let price_out = lo
                .get("priceOut")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);

            let row = sqlx::query::<Any>("SELECT qty FROM stock_article WHERE id = ?1")
                .bind(article_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            let current = match row {
                Some(r) => r.try_get::<f64, _>(0).map_err(|e| e.to_string())?,
                None => {
                    let _ = tx.rollback().await;
                    return Err("Article introuvable".to_string());
                }
            };
            let new_qty = match apply_qty_change(move_type.as_str(), current, qty) {
                Ok(n) => n,
                Err(e) => {
                    let _ = tx.rollback().await;
                    return Err(e);
                }
            };
            last_new_qty = new_qty;

            let mid = Uuid::new_v4().to_string();
            if line_no == 0 {
                first_movement_id = Some(mid.clone());
            }
            sqlx::query::<Any>(
                r#"INSERT INTO stock_movement (id, article_id, move_type, qty, reason, ref_doc, supplier_name, client_name, created_at, batch_id, line_no, price_in, price_out)
                   VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)"#,
            )
            .bind(&mid)
            .bind(article_id)
            .bind(move_type.as_str())
            .bind(qty)
            .bind(reason)
            .bind(ref_doc)
            .bind(supplier_name)
            .bind(client_name)
            .bind(&movement_ts)
            .bind(&batch_id)
            .bind(line_no as i64)
            .bind(price_in)
            .bind(price_out)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            sqlx::query::<Any>("UPDATE stock_article SET qty = ?1, updated_at = ?2 WHERE id = ?3")
                .bind(new_qty)
                .bind(&movement_ts)
                .bind(article_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }

        tx.commit().await.map_err(|e| e.to_string())?;

        if !supplier_name.is_empty() {
            let pid = Uuid::new_v4().to_string();
            let _ = sqlx::query::<Any>(
                "INSERT OR IGNORE INTO stock_party (id, kind, name, address, created_at) VALUES (?1, 'SUPPLIER', ?2, '', ?3)",
            )
            .bind(&pid)
            .bind(supplier_name)
            .bind(&party_now)
            .execute(&mut conn)
            .await;
        }
        if !client_name.is_empty() {
            let pid = Uuid::new_v4().to_string();
            let _ = sqlx::query::<Any>(
                "INSERT OR IGNORE INTO stock_party (id, kind, name, address, created_at) VALUES (?1, 'CLIENT', ?2, '', ?3)",
            )
            .bind(&pid)
            .bind(client_name)
            .bind(&party_now)
            .execute(&mut conn)
            .await;
        }

        let fid = first_movement_id.unwrap_or_default();
        return enc(&json!({
            "success": true,
            "movementId": fid,
            "batchId": batch_id,
            "newQty": last_new_qty,
        }));
    }

    let article_id = obj
        .get("articleId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("articleId requis")?;
    let qty = obj.get("qty").and_then(|v| v.as_f64()).ok_or("qty requis")?;
    if qty <= 0.0 && move_type != "ADJ" {
        return Err("Quantité doit être positive".to_string());
    }

    let row = sqlx::query::<Any>("SELECT qty FROM stock_article WHERE id = ?1")
        .bind(article_id)
        .fetch_optional(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    let current = match row {
        Some(r) => r.try_get::<f64, _>(0).map_err(|e| e.to_string())?,
        None => return Err("Article introuvable".to_string()),
    };

    let new_qty = apply_qty_change(move_type.as_str(), current, qty)?;

    let mid = Uuid::new_v4().to_string();

    let mut tx = Acquire::begin(&mut conn).await.map_err(|e| e.to_string())?;
    sqlx::query::<Any>(
        r#"INSERT INTO stock_movement (id, article_id, move_type, qty, reason, ref_doc, supplier_name, client_name, created_at, batch_id, line_no, price_in, price_out)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)"#,
    )
    .bind(&mid)
    .bind(article_id)
    .bind(move_type.as_str())
    .bind(qty)
    .bind(reason)
    .bind(ref_doc)
    .bind(supplier_name)
    .bind(client_name)
    .bind(&movement_ts)
    .bind(&mid)
    .bind(0_i64)
    .bind(price_in_root)
    .bind(price_out_root)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query::<Any>("UPDATE stock_article SET qty = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(new_qty)
        .bind(&movement_ts)
        .bind(article_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    if !supplier_name.is_empty() {
        let pid = Uuid::new_v4().to_string();
        let _ = sqlx::query::<Any>(
            "INSERT OR IGNORE INTO stock_party (id, kind, name, address, created_at) VALUES (?1, 'SUPPLIER', ?2, '', ?3)",
        )
        .bind(&pid)
        .bind(supplier_name)
        .bind(&party_now)
        .execute(&mut conn)
        .await;
    }
    if !client_name.is_empty() {
        let pid = Uuid::new_v4().to_string();
        let _ = sqlx::query::<Any>(
            "INSERT OR IGNORE INTO stock_party (id, kind, name, address, created_at) VALUES (?1, 'CLIENT', ?2, '', ?3)",
        )
        .bind(&pid)
        .bind(client_name)
        .bind(&party_now)
        .execute(&mut conn)
        .await;
    }

    enc(&json!({ "success": true, "movementId": mid, "batchId": mid, "newQty": new_qty }))
}

#[tauri::command]
pub async fn stock_dashboard_stats(payload: String) -> Result<Value, String> {
    let _p = parse_or_empty(&payload);
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;

    let total_row = sqlx::query::<Any>("SELECT COUNT(*) FROM stock_article")
        .fetch_one(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    let total_articles: i64 = total_row.try_get(0).map_err(|e| e.to_string())?;

    let low_row = sqlx::query::<Any>(
        "SELECT COUNT(*) FROM stock_article WHERE qty <= min_qty AND min_qty > 0",
    )
    .fetch_one(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let low_stock: i64 = low_row.try_get(0).map_err(|e| e.to_string())?;

    let sum_row = sqlx::query::<Any>("SELECT COALESCE(SUM(qty), 0) FROM stock_article")
        .fetch_one(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    let total_qty: f64 = sum_row.try_get(0).map_err(|e| e.to_string())?;

    let recent = sqlx::query::<Any>(
        r#"SELECT m.id, m.article_id, a.sku, a.name, m.move_type, m.qty,
                  IFNULL(m.supplier_name,''), IFNULL(m.client_name,''), m.created_at
           FROM stock_movement m JOIN stock_article a ON a.id = m.article_id
           ORDER BY m.created_at DESC LIMIT 8"#,
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;

    let mut recent_list = Vec::new();
    for r in recent {
        recent_list.push(json!({
            "id": r.try_get::<String, _>(0).unwrap_or_default(),
            "articleId": r.try_get::<String, _>(1).unwrap_or_default(),
            "sku": r.try_get::<String, _>(2).unwrap_or_default(),
            "articleName": r.try_get::<String, _>(3).unwrap_or_default(),
            "moveType": r.try_get::<String, _>(4).unwrap_or_default(),
            "qty": r.try_get::<f64, _>(5).unwrap_or(0.0),
            "supplierName": r.try_get::<String, _>(6).unwrap_or_default(),
            "clientName": r.try_get::<String, _>(7).unwrap_or_default(),
            "createdAt": r.try_get::<String, _>(8).unwrap_or_default(),
        }));
    }

    let mv_chart_rows = sqlx::query::<Any>(
        r#"SELECT date(created_at) as d, move_type, COALESCE(SUM(qty), 0) as s
           FROM stock_movement
           WHERE date(created_at) >= date('now', '-14 days')
           GROUP BY date(created_at), move_type
           ORDER BY d"#,
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let mut day_map: BTreeMap<String, (f64, f64, f64)> = BTreeMap::new();
    for r in mv_chart_rows {
        let d: String = r.try_get::<String, _>(0).unwrap_or_default();
        let mt: String = r.try_get::<String, _>(1).unwrap_or_default();
        let s: f64 = r.try_get::<f64, _>(2).unwrap_or(0.0);
        let e = day_map.entry(d).or_insert((0.0, 0.0, 0.0));
        match mt.to_uppercase().as_str() {
            "IN" => e.0 += s,
            "OUT" => e.1 += s,
            "ADJ" => e.2 += s,
            _ => {}
        }
    }
    let chart_movements_14d: Vec<Value> = day_map
        .into_iter()
        .map(|(date, (inq, outq, adjq))| {
            json!({
                "date": date,
                "inQty": inq,
                "outQty": outq,
                "adjQty": adjq,
            })
        })
        .collect();

    let cat_rows = sqlx::query::<Any>(
        r#"SELECT COALESCE(NULLIF(TRIM(category), ''), '(Sans catégorie)'), COALESCE(SUM(qty), 0)
           FROM stock_article
           GROUP BY 1
           ORDER BY 2 DESC
           LIMIT 12"#,
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let mut chart_category_qty: Vec<Value> = Vec::new();
    for r in cat_rows {
        chart_category_qty.push(json!({
            "name": r.try_get::<String, _>(0).unwrap_or_default(),
            "qty": r.try_get::<f64, _>(1).unwrap_or(0.0),
        }));
    }

    enc(&json!({
        "totalArticles": total_articles,
        "lowStockCount": low_stock,
        "totalQty": total_qty,
        "recentMovements": recent_list,
        "chartMovements14d": chart_movements_14d,
        "chartCategoryQty": chart_category_qty,
    }))
}

#[tauri::command]
pub async fn stock_list_parties(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let kind = p
        .body
        .as_ref()
        .and_then(|b| b.get("kind"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_uppercase();
    if kind != "SUPPLIER" && kind != "CLIENT" {
        return Err("kind doit être SUPPLIER ou CLIENT".to_string());
    }
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let rows = sqlx::query::<Any>(
        "SELECT id, kind, name, IFNULL(address,''), IFNULL(phone,''), IFNULL(email,''), IFNULL(created_at,'') FROM stock_party WHERE kind = ?1 ORDER BY name COLLATE NOCASE",
    )
    .bind(&kind)
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for r in rows {
        list.push(json!({
            "id": r.try_get::<String, _>(0).unwrap_or_default(),
            "kind": r.try_get::<String, _>(1).unwrap_or_default(),
            "name": r.try_get::<String, _>(2).unwrap_or_default(),
            "address": r.try_get::<String, _>(3).unwrap_or_default(),
            "phone": r.try_get::<String, _>(4).unwrap_or_default(),
            "email": r.try_get::<String, _>(5).unwrap_or_default(),
            "createdAt": r.try_get::<String, _>(6).unwrap_or_default(),
        }));
    }
    enc(&json!({ "parties": list }))
}

#[tauri::command]
pub async fn stock_upsert_party(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let kind = obj
        .get("kind")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_uppercase();
    if kind != "SUPPLIER" && kind != "CLIENT" {
        return Err("kind doit être SUPPLIER ou CLIENT".to_string());
    }
    let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
    if name.is_empty() {
        return Err("Nom requis".to_string());
    }
    let address = obj.get("address").and_then(|v| v.as_str()).unwrap_or("").trim();
    if address.is_empty() {
        return Err("Adresse requise".to_string());
    }
    let phone = obj.get("phone").and_then(|v| v.as_str()).unwrap_or("").trim();
    let email = obj.get("email").and_then(|v| v.as_str()).unwrap_or("").trim();
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let existing_id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(pid) = existing_id {
        let exists = sqlx::query::<Any>("SELECT 1 FROM stock_party WHERE id = ?1 AND kind = ?2")
            .bind(pid)
            .bind(&kind)
            .fetch_optional(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
        if exists.is_none() {
            return Err("Enregistrement introuvable".to_string());
        }
        sqlx::query::<Any>(
            "UPDATE stock_party SET name = ?1, address = ?2, phone = ?3, email = ?4 WHERE id = ?5 AND kind = ?6",
        )
        .bind(name)
        .bind(address)
        .bind(phone)
        .bind(email)
        .bind(pid)
        .bind(&kind)
        .execute(&mut conn)
        .await
        .map_err(|e| {
            let s = e.to_string();
            if s.contains("UNIQUE") {
                "Ce nom existe déjà pour ce type".to_string()
            } else {
                s
            }
        })?;
    } else {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        sqlx::query::<Any>(
            "INSERT OR IGNORE INTO stock_party (id, kind, name, address, phone, email, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(&id)
        .bind(&kind)
        .bind(name)
        .bind(address)
        .bind(phone)
        .bind(email)
        .bind(&now)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    }
    enc(&json!({ "success": true }))
}

#[tauri::command]
pub async fn stock_delete_party(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("id requis")?;
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let r = sqlx::query::<Any>("DELETE FROM stock_party WHERE id = ?1")
        .bind(id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    enc(&json!({ "success": r.rows_affected() > 0 }))
}

#[tauri::command]
pub async fn stock_get_remote_db_settings(payload: String) -> Result<Value, String> {
    let _p = parse_or_empty(&payload);
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let driver = stock_kv_get(&mut conn, "remote_db.driver").await?;
    let host = stock_kv_get(&mut conn, "remote_db.host").await?;
    let port = stock_kv_get(&mut conn, "remote_db.port").await?;
    let database = stock_kv_get(&mut conn, "remote_db.database").await?;
    let user = stock_kv_get(&mut conn, "remote_db.user").await?;
    let password = stock_kv_get(&mut conn, "remote_db.password").await?;
    let ssl_s = stock_kv_get(&mut conn, "remote_db.ssl").await?;
    let schema = stock_kv_get(&mut conn, "remote_db.schema").await?;
    let extra = stock_kv_get(&mut conn, "remote_db.extra").await?;
    let ssl = ssl_s.eq_ignore_ascii_case("true") || ssl_s == "1";
    let driver_norm = normalize_remote_driver(&driver).to_string();
    let default_port = if driver_norm == "postgres" {
        "5432"
    } else {
        "3306"
    };
    enc(&json!({
        "driver": if driver.trim().is_empty() { "mysql".to_string() } else { driver_norm },
        "host": host,
        "port": if port.is_empty() {
            default_port.to_string()
        } else {
            port
        },
        "database": database,
        "user": user,
        "password": password,
        "ssl": ssl,
        "schema": schema,
        "extraParams": extra,
    }))
}

#[tauri::command]
pub async fn stock_save_remote_db_settings(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let driver = obj.get("driver").and_then(|v| v.as_str()).unwrap_or("mysql");
    let host = obj.get("host").and_then(|v| v.as_str()).unwrap_or("");
    let port = obj.get("port").and_then(|v| v.as_str()).unwrap_or("");
    let database = obj.get("database").and_then(|v| v.as_str()).unwrap_or("");
    let user = obj.get("user").and_then(|v| v.as_str()).unwrap_or("");
    let password = obj.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let ssl = obj.get("ssl").and_then(|v| v.as_bool()).unwrap_or(false);
    let schema = obj.get("schema").and_then(|v| v.as_str()).unwrap_or("");
    let extra = obj
        .get("extraParams")
        .or_else(|| obj.get("extra"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    stock_kv_set(&mut conn, "remote_db.driver", driver).await?;
    stock_kv_set(&mut conn, "remote_db.host", host).await?;
    stock_kv_set(&mut conn, "remote_db.port", port).await?;
    stock_kv_set(&mut conn, "remote_db.database", database).await?;
    stock_kv_set(&mut conn, "remote_db.user", user).await?;
    stock_kv_set(&mut conn, "remote_db.password", password).await?;
    stock_kv_set(&mut conn, "remote_db.ssl", if ssl { "true" } else { "false" }).await?;
    stock_kv_set(&mut conn, "remote_db.schema", schema).await?;
    stock_kv_set(&mut conn, "remote_db.extra", extra).await?;
    enc(&json!({ "success": true }))
}

#[tauri::command]
pub async fn stock_test_remote_db(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let driver = obj.get("driver").and_then(|v| v.as_str()).unwrap_or("mysql");
    let host = obj.get("host").and_then(|v| v.as_str()).unwrap_or("");
    let port = obj.get("port").and_then(|v| v.as_str()).unwrap_or("");
    let database = obj.get("database").and_then(|v| v.as_str()).unwrap_or("");
    let user = obj.get("user").and_then(|v| v.as_str()).unwrap_or("");
    let password = obj.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let ssl = obj.get("ssl").and_then(|v| v.as_bool()).unwrap_or(false);
    let schema = obj.get("schema").and_then(|v| v.as_str()).unwrap_or("");
    let extra = obj
        .get("extraParams")
        .or_else(|| obj.get("extra"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let url = match build_remote_database_url(driver, host, port, database, user, password, ssl, schema, extra) {
        Ok(u) => u,
        Err(m) => {
            return enc(&json!({
                "ok": false,
                "message": m,
            }));
        }
    };
    let opts = match AnyConnectOptions::from_str(url.as_str()) {
        Ok(o) => o,
        Err(e) => {
            return enc(&json!({
                "ok": false,
                "message": format!("URL de connexion invalide: {}", e),
            }));
        }
    };
    match AnyConnection::connect_with(&opts).await {
        Ok(mut c) => {
            let ping = sqlx::query::<Any>("SELECT 1").execute(&mut c).await;
            let _ = c.close().await;
            match ping {
                Ok(_) => enc(&json!({
                    "ok": true,
                    "message": "Connexion réussie au serveur distant.",
                })),
                Err(e) => enc(&json!({
                    "ok": false,
                    "message": format!("Connexion ouverte mais requête de test échouée: {}", e),
                })),
            }
        }
        Err(e) => enc(&json!({
            "ok": false,
            "message": format!("Impossible de se connecter: {}", e),
        })),
    }
}

#[tauri::command]
pub async fn stock_app_user_login(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let login_raw = obj
        .get("loginOrTel")
        .or_else(|| obj.get("login"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let password = obj.get("password").and_then(|v| v.as_str()).unwrap_or("");
    if login_raw.is_empty() || password.is_empty() {
        return Err("Identifiants incomplets".to_string());
    }
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let row = sqlx::query::<Any>(
        "SELECT id, login, display_name, email, address, password_hash, privileges_json, role_id FROM stock_app_user WHERE login = ?1 COLLATE NOCASE",
    )
    .bind(login_raw)
    .fetch_optional(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let Some(row) = row else {
        return Err("STOCK_USER_NOT_FOUND".to_string());
    };
    let id: String = row.try_get(0).map_err(|e| e.to_string())?;
    let login: String = row.try_get(1).map_err(|e| e.to_string())?;
    let display_name: String = row.try_get(2).unwrap_or_default();
    let email: String = row.try_get(3).unwrap_or_default();
    let address: String = row.try_get(4).unwrap_or_default();
    let hash: String = row.try_get(5).map_err(|e| e.to_string())?;
    let priv_json: String = row.try_get(6).unwrap_or_else(|_| "[]".to_string());
    let role_id: String = row.try_get(7).unwrap_or_default();
    if !verify_stock_password(password, &hash) {
        return Err("Identifiants incorrects".to_string());
    }
    let role_pj = if role_id.trim().is_empty() {
        "[]".to_string()
    } else {
        let row = sqlx::query::<Any>("SELECT privileges_json FROM stock_role WHERE id = ?1")
            .bind(role_id.trim())
            .fetch_optional(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
        row.and_then(|r| r.try_get::<String, _>(0).ok())
            .unwrap_or_else(|| "[]".to_string())
    };
    let privileges = effective_stock_privileges_resolved(&role_id, &priv_json, &role_pj);
    let label = if display_name.trim().is_empty() {
        login.clone()
    } else {
        display_name
    };
    enc(&json!({
        "id": id,
        "loginOrLabel": label,
        "role": "stock_user",
        "stockPrivileges": privileges,
        "email": email,
        "address": address,
        "stockRoleId": role_id,
    }))
}

#[tauri::command]
pub async fn stock_list_app_users(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    assert_requester_is_sadmin(obj)?;
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let rows = sqlx::query::<Any>(
        r#"SELECT u.id, u.login, u.display_name, u.email, u.address, u.privileges_json, u.created_at, u.role_id,
            COALESCE(NULLIF(trim(r.privileges_json), ''), '[]') AS role_privileges_json
            FROM stock_app_user u
            LEFT JOIN stock_role r ON r.id = u.role_id
            ORDER BY u.login COLLATE NOCASE"#,
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for r in rows {
        let legacy_user_priv: String = r.try_get::<String, _>(5).unwrap_or_else(|_| "[]".to_string());
        let role_id: String = r.try_get::<String, _>(7).unwrap_or_default();
        let role_priv_json: String = r.try_get::<String, _>(8).unwrap_or_else(|_| "[]".to_string());
        let privileges = effective_stock_privileges_resolved(&role_id, &legacy_user_priv, &role_priv_json);
        list.push(json!({
            "id": r.try_get::<String, _>(0).unwrap_or_default(),
            "login": r.try_get::<String, _>(1).unwrap_or_default(),
            "displayName": r.try_get::<String, _>(2).unwrap_or_default(),
            "email": r.try_get::<String, _>(3).unwrap_or_default(),
            "address": r.try_get::<String, _>(4).unwrap_or_default(),
            "privileges": privileges,
            "createdAt": r.try_get::<String, _>(6).unwrap_or_default(),
            "roleId": role_id,
        }));
    }
    enc(&json!({ "users": list }))
}

#[tauri::command]
pub async fn stock_upsert_app_user(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    assert_requester_is_sadmin(obj)?;

    let id_in = obj.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
    let login = obj.get("login").and_then(|v| v.as_str()).unwrap_or("").trim();
    if login.is_empty() {
        return Err("Identifiant requis".to_string());
    }
    let display_name = obj
        .get("displayName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let email = obj.get("email").and_then(|v| v.as_str()).unwrap_or("").trim();
    let address = obj.get("address").and_then(|v| v.as_str()).unwrap_or("").trim();
    let role_id = obj.get("roleId").and_then(|v| v.as_str()).unwrap_or("").trim();
    let password_plain = obj.get("password").and_then(|v| v.as_str()).unwrap_or("").trim();
    // Les droits se résolvent via le rôle (`stock_role.privileges_json`) ; on ne persiste plus sur l’utilisateur.
    let priv_json = "[]".to_string();

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if id_in.is_empty() {
        let id = Uuid::new_v4().to_string();
        let use_default = password_plain.is_empty();
        let plain = if use_default {
            STOCK_APP_DEFAULT_PASSWORD
        } else {
            password_plain
        };
        let hash = hash_stock_password(plain)?;
        sqlx::query::<Any>(
            "INSERT INTO stock_app_user (id, login, display_name, email, address, password_hash, privileges_json, role_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        )
        .bind(&id)
        .bind(login)
        .bind(display_name)
        .bind(email)
        .bind(address)
        .bind(&hash)
        .bind(&priv_json)
        .bind(role_id)
        .bind(&now)
        .bind(&now)
        .execute(&mut conn)
        .await
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "Cet identifiant de connexion existe déjà".to_string()
            } else {
                e.to_string()
            }
        })?;
        let mut data = json!({ "success": true, "id": id });
        if use_default {
            if let Some(m) = data.as_object_mut() {
                m.insert(
                    "defaultPassword".to_string(),
                    json!(STOCK_APP_DEFAULT_PASSWORD),
                );
            }
        }
        enc(&data)
    } else {
        let existing = sqlx::query::<Any>("SELECT password_hash FROM stock_app_user WHERE id = ?1")
            .bind(id_in)
            .fetch_optional(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
        let Some(ex_row) = existing else {
            return Err("Utilisateur introuvable".to_string());
        };
        let old_hash: String = ex_row.try_get(0).map_err(|e| e.to_string())?;
        let new_hash = if password_plain.is_empty() {
            old_hash
        } else {
            hash_stock_password(password_plain)?
        };
        sqlx::query::<Any>(
            "UPDATE stock_app_user SET login = ?1, display_name = ?2, email = ?3, address = ?4, password_hash = ?5, privileges_json = ?6, role_id = ?7, updated_at = ?8 WHERE id = ?9",
        )
        .bind(login)
        .bind(display_name)
        .bind(email)
        .bind(address)
        .bind(&new_hash)
        .bind(&priv_json)
        .bind(role_id)
        .bind(&now)
        .bind(id_in)
        .execute(&mut conn)
        .await
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "Cet identifiant de connexion existe déjà".to_string()
            } else {
                e.to_string()
            }
        })?;
        enc(&json!({ "success": true, "id": id_in }))
    }
}

#[tauri::command]
pub async fn stock_delete_app_user(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    assert_requester_is_sadmin(obj)?;
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("id requis")?;
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let r = sqlx::query::<Any>("DELETE FROM stock_app_user WHERE id = ?1")
        .bind(id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    enc(&json!({ "success": r.rows_affected() > 0 }))
}

/// Mise à jour du profil par l'utilisateur stock lui-même (nom affiché, adresse, mot de passe).
#[tauri::command]
pub async fn stock_update_own_profile(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let requester_id = obj
        .get("requesterUserId")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or("");
    let requester_role = obj
        .get("requesterRole")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or("");
    if requester_role != "stock_user" || requester_id.is_empty() {
        return Err("Action réservée aux utilisateurs collaborateurs stock".to_string());
    }
    let target_id = obj.get("id").and_then(|v| v.as_str()).map(str::trim).unwrap_or("");
    if target_id != requester_id {
        return Err("Identifiant incorrect".to_string());
    }
    let current_password = obj
        .get("currentPassword")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if current_password.is_empty() {
        return Err("Mot de passe actuel requis".to_string());
    }
    let display_name = obj
        .get("displayName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let email = obj.get("email").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let address = obj.get("address").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let new_password = obj
        .get("newPassword")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;

    let row = sqlx::query::<Any>(
        "SELECT password_hash, login FROM stock_app_user WHERE id = ?1",
    )
    .bind(target_id)
    .fetch_optional(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let Some(ex_row) = row else {
        return Err("Utilisateur introuvable".to_string());
    };
    let old_hash: String = ex_row.try_get(0).map_err(|e| e.to_string())?;
    let login_keep: String = ex_row.try_get(1).map_err(|e| e.to_string())?;
    if !verify_stock_password(current_password, &old_hash) {
        return Err("Mot de passe actuel incorrect".to_string());
    }

    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let new_hash = if new_password.is_empty() {
        old_hash
    } else if new_password.len() < 8 {
        return Err("Le nouveau mot de passe doit contenir au moins 8 caractères".to_string());
    } else {
        hash_stock_password(new_password)?
    };

    sqlx::query::<Any>(
        "UPDATE stock_app_user SET display_name = ?1, email = ?2, address = ?3, password_hash = ?4, updated_at = ?5 WHERE id = ?6",
    )
    .bind(&display_name)
    .bind(&email)
    .bind(&address)
    .bind(&new_hash)
    .bind(&now)
    .bind(target_id)
    .execute(&mut conn)
    .await
    .map_err(|e| e.to_string())?;

    enc(&json!({
        "success": true,
        "loginOrLabel": if display_name.is_empty() { login_keep } else { display_name },
        "email": email,
        "address": address,
    }))
}

#[tauri::command]
pub async fn stock_list_ref_items(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.as_ref();
    let kind = body
        .and_then(|b| b.get("kind"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();
    let wh_filter = body
        .and_then(|b| b.get("warehouseId"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;

    if kind == "location" {
        let rows = if let Some(wid) = wh_filter {
            sqlx::query::<Any>(
                r#"SELECT l.id, l.name, l.code, l.created_at, l.warehouse_id, w.name, l.housing_fee, l.payment_period
                   FROM stock_ref_location l
                   JOIN stock_ref_warehouse w ON w.id = l.warehouse_id
                   WHERE l.warehouse_id = ?1
                   ORDER BY l.name COLLATE NOCASE"#,
            )
            .bind(wid)
            .fetch_all(&mut conn)
            .await
        } else {
            sqlx::query::<Any>(
                r#"SELECT l.id, l.name, l.code, l.created_at, l.warehouse_id, w.name, l.housing_fee, l.payment_period
                   FROM stock_ref_location l
                   JOIN stock_ref_warehouse w ON w.id = l.warehouse_id
                   ORDER BY w.name COLLATE NOCASE, l.name COLLATE NOCASE"#,
            )
            .fetch_all(&mut conn)
            .await
        }
        .map_err(|e| e.to_string())?;
        let mut list = Vec::new();
        for r in rows {
            list.push(json!({
                "id": r.try_get::<String, _>(0).unwrap_or_default(),
                "name": r.try_get::<String, _>(1).unwrap_or_default(),
                "code": r.try_get::<String, _>(2).unwrap_or_default(),
                "createdAt": r.try_get::<String, _>(3).unwrap_or_default(),
                "warehouseId": r.try_get::<String, _>(4).unwrap_or_default(),
                "warehouseName": r.try_get::<String, _>(5).unwrap_or_default(),
                "housingFee": r.try_get::<f64, _>(6).unwrap_or(0.0),
                "paymentPeriod": r.try_get::<String, _>(7).unwrap_or_default(),
            }));
        }
        return enc(&json!({ "items": list }));
    }

    let table = ref_items_table(&kind)?;
    let sql = format!(
        "SELECT id, name, code, created_at FROM {} ORDER BY name COLLATE NOCASE",
        table
    );
    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for r in rows {
        list.push(json!({
            "id": r.try_get::<String, _>(0).unwrap_or_default(),
            "name": r.try_get::<String, _>(1).unwrap_or_default(),
            "code": r.try_get::<String, _>(2).unwrap_or_default(),
            "createdAt": r.try_get::<String, _>(3).unwrap_or_default(),
        }));
    }
    enc(&json!({ "items": list }))
}

#[tauri::command]
pub async fn stock_upsert_ref_item(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let kind = obj
        .get("kind")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();
    let table = ref_items_table(&kind)?;
    let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
    if name.is_empty() {
        return Err("Libellé requis".to_string());
    }
    let code = obj.get("code").and_then(|v| v.as_str()).unwrap_or("").trim();
    let id_in = obj.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if id_in.is_empty() {
        let id = Uuid::new_v4().to_string();
        if kind == "location" {
            let wid = obj
                .get("warehouseId")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "Entrepôt requis pour créer un emplacement".to_string())?;
            let housing_fee = obj
                .get("housingFee")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0)
                .max(0.0);
            let payment_period = normalize_location_payment_period(
                obj.get("paymentPeriod").and_then(|v| v.as_str()).unwrap_or(""),
            );
            sqlx::query::<Any>(
                "INSERT INTO stock_ref_location (id, warehouse_id, name, code, created_at, housing_fee, payment_period) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .bind(&id)
            .bind(wid)
            .bind(name)
            .bind(code)
            .bind(&now)
            .bind(housing_fee)
            .bind(&payment_period)
            .execute(&mut conn)
            .await
            .map_err(|e| {
                if e.to_string().contains("UNIQUE") {
                    "Ce libellé existe déjà pour cet entrepôt".to_string()
                } else {
                    e.to_string()
                }
            })?;
        } else {
            let sql = format!(
                "INSERT INTO {} (id, name, code, created_at) VALUES (?1, ?2, ?3, ?4)",
                table
            );
            sqlx::query::<Any>(&sql)
                .bind(&id)
                .bind(name)
                .bind(code)
                .bind(&now)
                .execute(&mut conn)
                .await
                .map_err(|e| {
                    if e.to_string().contains("UNIQUE") {
                        "Ce libellé existe déjà".to_string()
                    } else {
                        e.to_string()
                    }
                })?;
        }
        enc(&json!({ "success": true, "id": id }))
    } else {
        let sql = if kind == "location" {
            "UPDATE stock_ref_location SET name = ?1, code = ?2, housing_fee = ?3, payment_period = ?4 WHERE id = ?5".to_string()
        } else {
            format!("UPDATE {} SET name = ?1, code = ?2 WHERE id = ?3", table)
        };
        if kind == "location" {
            let housing_fee = obj
                .get("housingFee")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0)
                .max(0.0);
            let payment_period = normalize_location_payment_period(
                obj.get("paymentPeriod").and_then(|v| v.as_str()).unwrap_or(""),
            );
            sqlx::query::<Any>(&sql)
                .bind(name)
                .bind(code)
                .bind(housing_fee)
                .bind(&payment_period)
                .bind(id_in)
                .execute(&mut conn)
                .await
                .map_err(|e| {
                    if e.to_string().contains("UNIQUE") {
                        "Ce libellé existe déjà".to_string()
                    } else {
                        e.to_string()
                    }
                })?;
        } else {
            sqlx::query::<Any>(&sql)
                .bind(name)
                .bind(code)
                .bind(id_in)
                .execute(&mut conn)
                .await
                .map_err(|e| {
                    if e.to_string().contains("UNIQUE") {
                        "Ce libellé existe déjà".to_string()
                    } else {
                        e.to_string()
                    }
                })?;
        }
        enc(&json!({ "success": true, "id": id_in }))
    }
}

#[tauri::command]
pub async fn stock_delete_ref_item(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let kind = obj
        .get("kind")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();
    let table = ref_items_table(&kind)?;
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("id requis")?;
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    if kind == "warehouse" {
        let cnt_row = sqlx::query::<Any>("SELECT COUNT(*) FROM stock_ref_location WHERE warehouse_id = ?1")
            .bind(id)
            .fetch_one(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
        let n: i64 = cnt_row.try_get::<i64, _>(0).unwrap_or(0);
        if n > 0 {
            return Err("Supprimez d'abord les emplacements de cet entrepôt.".to_string());
        }
    }
    let sql = format!("DELETE FROM {} WHERE id = ?1", table);
    let r = sqlx::query::<Any>(&sql)
        .bind(id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    enc(&json!({ "success": r.rows_affected() > 0 }))
}

fn csv_escape_field(s: &str) -> String {
    if s.contains(',') || s.contains('\n') || s.contains('\r') || s.contains('"') {
        format!("\"{}\"", s.replace('\"', "\"\""))
    } else {
        s.to_string()
    }
}

fn csv_push_row(w: &mut String, cells: &[String]) {
    let line = cells
        .iter()
        .map(|c| csv_escape_field(c))
        .collect::<Vec<_>>()
        .join(",");
    w.push_str(&line);
    w.push('\n');
}

#[tauri::command]
pub async fn stock_export_csv(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let table = p
        .body
        .as_ref()
        .and_then(|b| b.get("table"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let export_wh = p
        .body
        .as_ref()
        .and_then(|b| b.get("warehouseId"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let mut w = String::new();
    let file_name: &'static str = match table {
        "articles" => {
            csv_push_row(
                &mut w,
                &[
                    "id".into(),
                    "sku".into(),
                    "name".into(),
                    "category".into(),
                    "unit".into(),
                    "qty".into(),
                    "minQty".into(),
                    "price".into(),
                    "currency".into(),
                    "location".into(),
                    "notes".into(),
                    "updatedAt".into(),
                ],
            );
            let rows = sqlx::query::<Any>(
                "SELECT id, sku, name, category, unit, qty, min_qty, price, currency, location, notes, updated_at FROM stock_article ORDER BY sku COLLATE NOCASE",
            )
            .fetch_all(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
            for r in rows {
                csv_push_row(
                    &mut w,
                    &[
                        r.try_get::<String, _>(0).unwrap_or_default(),
                        r.try_get::<String, _>(1).unwrap_or_default(),
                        r.try_get::<String, _>(2).unwrap_or_default(),
                        r.try_get::<String, _>(3).unwrap_or_default(),
                        r.try_get::<String, _>(4).unwrap_or_default(),
                        format!("{}", r.try_get::<f64, _>(5).unwrap_or(0.0)),
                        format!("{}", r.try_get::<f64, _>(6).unwrap_or(0.0)),
                        format!("{}", r.try_get::<f64, _>(7).unwrap_or(0.0)),
                        r.try_get::<String, _>(8).unwrap_or_default(),
                        r.try_get::<String, _>(9).unwrap_or_default(),
                        r.try_get::<String, _>(10).unwrap_or_default(),
                        r.try_get::<String, _>(11).unwrap_or_default(),
                    ],
                );
            }
            "articles_export.csv"
        }
        "movements" => {
            csv_push_row(
                &mut w,
                &[
                    "id".into(),
                    "batchId".into(),
                    "lineNo".into(),
                    "articleId".into(),
                    "sku".into(),
                    "articleName".into(),
                    "moveType".into(),
                    "qty".into(),
                    "priceIn".into(),
                    "priceOut".into(),
                    "reason".into(),
                    "refDoc".into(),
                    "supplierName".into(),
                    "clientName".into(),
                    "createdAt".into(),
                ],
            );
            let rows = sqlx::query::<Any>(
                r#"SELECT m.id, IFNULL(m.batch_id,''), m.line_no, m.article_id, a.sku, a.name, m.move_type, m.qty,
                          IFNULL(m.price_in,0), IFNULL(m.price_out,0), m.reason, m.ref_doc,
                          IFNULL(m.supplier_name,''), IFNULL(m.client_name,''), m.created_at
                   FROM stock_movement m JOIN stock_article a ON a.id = m.article_id
                   ORDER BY m.created_at DESC, m.batch_id, m.line_no"#,
            )
            .fetch_all(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
            for r in rows {
                csv_push_row(
                    &mut w,
                    &[
                        r.try_get::<String, _>(0).unwrap_or_default(),
                        r.try_get::<String, _>(1).unwrap_or_default(),
                        format!("{}", r.try_get::<i64, _>(2).unwrap_or(0)),
                        r.try_get::<String, _>(3).unwrap_or_default(),
                        r.try_get::<String, _>(4).unwrap_or_default(),
                        r.try_get::<String, _>(5).unwrap_or_default(),
                        r.try_get::<String, _>(6).unwrap_or_default(),
                        format!("{}", r.try_get::<f64, _>(7).unwrap_or(0.0)),
                        format!("{}", r.try_get::<f64, _>(8).unwrap_or(0.0)),
                        format!("{}", r.try_get::<f64, _>(9).unwrap_or(0.0)),
                        r.try_get::<String, _>(10).unwrap_or_default(),
                        r.try_get::<String, _>(11).unwrap_or_default(),
                        r.try_get::<String, _>(12).unwrap_or_default(),
                        r.try_get::<String, _>(13).unwrap_or_default(),
                        r.try_get::<String, _>(14).unwrap_or_default(),
                    ],
                );
            }
            "mouvements_export.csv"
        }
        "fournisseurs" => {
            csv_push_row(
                &mut w,
                &[
                    "id".into(),
                    "name".into(),
                    "address".into(),
                    "phone".into(),
                    "email".into(),
                    "createdAt".into(),
                ],
            );
            let rows = sqlx::query::<Any>(
                "SELECT id, name, IFNULL(address,''), IFNULL(phone,''), IFNULL(email,''), created_at FROM stock_party WHERE kind = 'SUPPLIER' ORDER BY name COLLATE NOCASE",
            )
            .fetch_all(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
            for r in rows {
                csv_push_row(
                    &mut w,
                    &[
                        r.try_get::<String, _>(0).unwrap_or_default(),
                        r.try_get::<String, _>(1).unwrap_or_default(),
                        r.try_get::<String, _>(2).unwrap_or_default(),
                        r.try_get::<String, _>(3).unwrap_or_default(),
                        r.try_get::<String, _>(4).unwrap_or_default(),
                        r.try_get::<String, _>(5).unwrap_or_default(),
                    ],
                );
            }
            "fournisseurs_export.csv"
        }
        "clients" => {
            csv_push_row(
                &mut w,
                &[
                    "id".into(),
                    "name".into(),
                    "address".into(),
                    "phone".into(),
                    "email".into(),
                    "createdAt".into(),
                ],
            );
            let rows = sqlx::query::<Any>(
                "SELECT id, name, IFNULL(address,''), IFNULL(phone,''), IFNULL(email,''), created_at FROM stock_party WHERE kind = 'CLIENT' ORDER BY name COLLATE NOCASE",
            )
            .fetch_all(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
            for r in rows {
                csv_push_row(
                    &mut w,
                    &[
                        r.try_get::<String, _>(0).unwrap_or_default(),
                        r.try_get::<String, _>(1).unwrap_or_default(),
                        r.try_get::<String, _>(2).unwrap_or_default(),
                        r.try_get::<String, _>(3).unwrap_or_default(),
                        r.try_get::<String, _>(4).unwrap_or_default(),
                        r.try_get::<String, _>(5).unwrap_or_default(),
                    ],
                );
            }
            "clients_export.csv"
        }
        "ref_unit" => {
            csv_push_row(&mut w, &["id".into(), "name".into(), "code".into(), "createdAt".into()]);
            let rows = sqlx::query::<Any>(
                "SELECT id, name, code, created_at FROM stock_ref_unit ORDER BY name COLLATE NOCASE",
            )
            .fetch_all(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
            for r in rows {
                csv_push_row(
                    &mut w,
                    &[
                        r.try_get::<String, _>(0).unwrap_or_default(),
                        r.try_get::<String, _>(1).unwrap_or_default(),
                        r.try_get::<String, _>(2).unwrap_or_default(),
                        r.try_get::<String, _>(3).unwrap_or_default(),
                    ],
                );
            }
            "unites_export.csv"
        }
        "ref_location" => {
            csv_push_row(
                &mut w,
                &[
                    "id".into(),
                    "warehouseId".into(),
                    "name".into(),
                    "code".into(),
                    "createdAt".into(),
                    "housingFee".into(),
                    "paymentPeriod".into(),
                ],
            );
            let rows = if let Some(ref wid) = export_wh {
                sqlx::query::<Any>(
                    "SELECT id, warehouse_id, name, code, created_at, housing_fee, payment_period FROM stock_ref_location WHERE warehouse_id = ?1 ORDER BY name COLLATE NOCASE",
                )
                .bind(wid)
                .fetch_all(&mut conn)
                .await
            } else {
                sqlx::query::<Any>(
                    "SELECT id, warehouse_id, name, code, created_at, housing_fee, payment_period FROM stock_ref_location ORDER BY warehouse_id, name COLLATE NOCASE",
                )
                .fetch_all(&mut conn)
                .await
            }
            .map_err(|e| e.to_string())?;
            for r in rows {
                csv_push_row(
                    &mut w,
                    &[
                        r.try_get::<String, _>(0).unwrap_or_default(),
                        r.try_get::<String, _>(1).unwrap_or_default(),
                        r.try_get::<String, _>(2).unwrap_or_default(),
                        r.try_get::<String, _>(3).unwrap_or_default(),
                        r.try_get::<String, _>(4).unwrap_or_default(),
                        format!("{}", r.try_get::<f64, _>(5).unwrap_or(0.0)),
                        r.try_get::<String, _>(6).unwrap_or_default(),
                    ],
                );
            }
            "emplacements_export.csv"
        }
        "ref_category" => {
            csv_push_row(&mut w, &["id".into(), "name".into(), "code".into(), "createdAt".into()]);
            let rows = sqlx::query::<Any>(
                "SELECT id, name, code, created_at FROM stock_ref_category ORDER BY name COLLATE NOCASE",
            )
            .fetch_all(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
            for r in rows {
                csv_push_row(
                    &mut w,
                    &[
                        r.try_get::<String, _>(0).unwrap_or_default(),
                        r.try_get::<String, _>(1).unwrap_or_default(),
                        r.try_get::<String, _>(2).unwrap_or_default(),
                        r.try_get::<String, _>(3).unwrap_or_default(),
                    ],
                );
            }
            "categories_articles_export.csv"
        }
        "ref_currency" => {
            csv_push_row(&mut w, &["id".into(), "name".into(), "code".into(), "createdAt".into()]);
            let rows = sqlx::query::<Any>(
                "SELECT id, name, code, created_at FROM stock_ref_currency ORDER BY name COLLATE NOCASE",
            )
            .fetch_all(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
            for r in rows {
                csv_push_row(
                    &mut w,
                    &[
                        r.try_get::<String, _>(0).unwrap_or_default(),
                        r.try_get::<String, _>(1).unwrap_or_default(),
                        r.try_get::<String, _>(2).unwrap_or_default(),
                        r.try_get::<String, _>(3).unwrap_or_default(),
                    ],
                );
            }
            "devises_export.csv"
        }
        _ => return Err("table inconnue pour export".to_string()),
    };
    enc(&json!({ "csv": w, "fileName": file_name }))
}

#[tauri::command]
pub async fn stock_import_csv(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let table = obj.get("table").and_then(|v| v.as_str()).unwrap_or("").trim();
    let csv_text = obj.get("csv").and_then(|v| v.as_str()).unwrap_or("");
    if csv_text.trim().is_empty() {
        return Err("CSV vide".to_string());
    }
    let trimmed = csv_text.trim_start_matches('\u{feff}');
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(Cursor::new(trimmed.as_bytes()));
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let mut inserted = 0i64;
    let mut updated = 0i64;
    let mut errors: Vec<String> = Vec::new();

    match table {
        "articles" => {
            for (line_no, result) in rdr.records().enumerate() {
                let row = match result {
                    Ok(r) => r,
                    Err(e) => {
                        errors.push(format!("ligne {}: {}", line_no + 2, e));
                        continue;
                    }
                };
                if row.len() < 9 {
                    errors.push(format!("ligne {}: colonnes insuffisantes", line_no + 2));
                    continue;
                }
                let sku = row.get(1).unwrap_or("").trim();
                if sku.is_empty() {
                    continue;
                }
                let name = row.get(2).unwrap_or("").trim();
                if name.is_empty() {
                    errors.push(format!("ligne {}: nom requis", line_no + 2));
                    continue;
                }
                let id_csv = row.get(0).unwrap_or("").trim();
                let category = row.get(3).unwrap_or("");
                let unit = row.get(4).unwrap_or("pcs");
                let qty: f64 = row.get(5).unwrap_or("0").parse().unwrap_or(0.0);
                let min_qty: f64 = row.get(6).unwrap_or("0").parse().unwrap_or(0.0);
                let ncol = row.len();
                let (price, currency, location, notes) = if ncol >= 12 {
                    let p: f64 = row.get(7).unwrap_or("0").parse().unwrap_or(0.0);
                    let cur = row.get(8).unwrap_or("").trim();
                    let loc = row.get(9).unwrap_or("");
                    let n = row.get(10).unwrap_or("");
                    (p, cur, loc, n)
                } else if ncol >= 11 {
                    let p: f64 = row.get(7).unwrap_or("0").parse().unwrap_or(0.0);
                    let loc = row.get(8).unwrap_or("");
                    let n = row.get(9).unwrap_or("");
                    (p, "", loc, n)
                } else {
                    let loc = row.get(7).unwrap_or("");
                    let n = row.get(8).unwrap_or("");
                    (0.0, "", loc, n)
                };
                let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

                let existing = sqlx::query::<Any>("SELECT id FROM stock_article WHERE sku = ?1 COLLATE NOCASE")
                    .bind(sku)
                    .fetch_optional(&mut conn)
                    .await
                    .map_err(|e| e.to_string())?;
                if let Some(er) = existing {
                    let id_up: String = er.try_get(0).map_err(|e| e.to_string())?;
                    sqlx::query::<Any>(
                        "UPDATE stock_article SET name = ?1, category = ?2, unit = ?3, qty = ?4, min_qty = ?5, price = ?6, currency = ?7, location = ?8, notes = ?9, updated_at = ?10 WHERE id = ?11",
                    )
                    .bind(name)
                    .bind(category)
                    .bind(unit)
                    .bind(qty)
                    .bind(min_qty)
                    .bind(price)
                    .bind(currency)
                    .bind(location)
                    .bind(notes)
                    .bind(&now)
                    .bind(&id_up)
                    .execute(&mut conn)
                    .await
                    .map_err(|e| e.to_string())?;
                    updated += 1;
                    continue;
                }
                let new_id = if !id_csv.is_empty() {
                    let exists_id = sqlx::query::<Any>("SELECT 1 FROM stock_article WHERE id = ?1")
                        .bind(id_csv)
                        .fetch_optional(&mut conn)
                        .await
                        .map_err(|e| e.to_string())?;
                    if exists_id.is_some() {
                        errors.push(format!("ligne {}: id ou sku en conflit", line_no + 2));
                        continue;
                    }
                    id_csv.to_string()
                } else {
                    Uuid::new_v4().to_string()
                };
                let res = sqlx::query::<Any>(
                    "INSERT INTO stock_article (id, sku, name, category, unit, qty, min_qty, price, currency, location, notes, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
                )
                .bind(&new_id)
                .bind(sku)
                .bind(name)
                .bind(category)
                .bind(unit)
                .bind(qty)
                .bind(min_qty)
                .bind(price)
                .bind(currency)
                .bind(location)
                .bind(notes)
                .bind(&now)
                .execute(&mut conn)
                .await;
                match res {
                    Ok(_) => inserted += 1,
                    Err(e) => errors.push(format!("ligne {}: {}", line_no + 2, e)),
                }
            }
        }
        "fournisseurs" | "clients" => {
            let kind = if table == "fournisseurs" {
                "SUPPLIER"
            } else {
                "CLIENT"
            };
            for (line_no, result) in rdr.records().enumerate() {
                let row = match result {
                    Ok(r) => r,
                    Err(e) => {
                        errors.push(format!("ligne {}: {}", line_no + 2, e));
                        continue;
                    }
                };
                let ncol = row.len();
                if ncol < 3 {
                    errors.push(format!(
                        "ligne {}: colonnes insuffisantes (attendu au minimum id, nom, adresse)",
                        line_no + 2
                    ));
                    continue;
                }
                let (name, address, phone, email) = if ncol >= 5 {
                    (
                        row.get(1).unwrap_or("").trim(),
                        row.get(2).unwrap_or("").trim(),
                        row.get(3).unwrap_or("").trim(),
                        row.get(4).unwrap_or("").trim(),
                    )
                } else {
                    (
                        row.get(1).unwrap_or("").trim(),
                        row.get(2).unwrap_or("").trim(),
                        "",
                        "",
                    )
                };
                if name.is_empty() || address.is_empty() {
                    errors.push(format!("ligne {}: nom et adresse requis", line_no + 2));
                    continue;
                }
                let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
                let id = Uuid::new_v4().to_string();
                let r = sqlx::query::<Any>(
                    "INSERT OR IGNORE INTO stock_party (id, kind, name, address, phone, email, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                )
                .bind(&id)
                .bind(kind)
                .bind(name)
                .bind(address)
                .bind(phone)
                .bind(email)
                .bind(&now)
                .execute(&mut conn)
                .await;
                match r {
                    Ok(x) if x.rows_affected() > 0 => inserted += 1,
                    Ok(_) => {
                        let _ = sqlx::query::<Any>(
                            "UPDATE stock_party SET address = ?1, phone = ?2, email = ?3 WHERE kind = ?4 AND name = ?5 COLLATE NOCASE",
                        )
                        .bind(address)
                        .bind(phone)
                        .bind(email)
                        .bind(kind)
                        .bind(name)
                        .execute(&mut conn)
                        .await;
                        updated += 1;
                    }
                    Err(e) => errors.push(format!("ligne {}: {}", line_no + 2, e)),
                }
            }
        }
        "ref_location" => {
            let body_wh = obj
                .get("warehouseId")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            for (line_no, result) in rdr.records().enumerate() {
                let row = match result {
                    Ok(r) => r,
                    Err(e) => {
                        errors.push(format!("ligne {}: {}", line_no + 2, e));
                        continue;
                    }
                };
                let (rid, wid, name, code): (String, String, String, String) = if row.len() >= 5 {
                    let id_csv = row.get(0).unwrap_or("").trim();
                    let w = row.get(1).unwrap_or("").trim().to_string();
                    let n = row.get(2).unwrap_or("").trim().to_string();
                    let c = row.get(3).unwrap_or("").trim().to_string();
                    if w.is_empty() {
                        errors.push(format!("ligne {}: warehouseId requis", line_no + 2));
                        continue;
                    }
                    let rid = if id_csv.is_empty() {
                        Uuid::new_v4().to_string()
                    } else {
                        id_csv.to_string()
                    };
                    (rid, w, n, c)
                } else if row.len() >= 3 {
                    let w = match &body_wh {
                        Some(x) => x.clone(),
                        None => {
                            errors.push(format!(
                                "ligne {}: format court CSV — renseignez warehouseId dans la requête d'import",
                                line_no + 2
                            ));
                            continue;
                        }
                    };
                    (
                        Uuid::new_v4().to_string(),
                        w,
                        row.get(1).unwrap_or("").trim().to_string(),
                        row.get(2).unwrap_or("").trim().to_string(),
                    )
                } else {
                    errors.push(format!("ligne {}: colonnes insuffisantes", line_no + 2));
                    continue;
                };
                if name.is_empty() {
                    errors.push(format!("ligne {}: libellé requis", line_no + 2));
                    continue;
                }
                let housing_fee: f64 = if row.len() > 5 {
                    row
                        .get(5)
                        .unwrap_or("0")
                        .parse::<f64>()
                        .unwrap_or(0.0)
                        .max(0.0)
                } else {
                    0.0
                };
                let payment_period = if row.len() > 6 {
                    normalize_location_payment_period(row.get(6).unwrap_or(""))
                } else {
                    String::new()
                };
                let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
                let r = sqlx::query::<Any>(
                    "INSERT OR IGNORE INTO stock_ref_location (id, warehouse_id, name, code, created_at, housing_fee, payment_period) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                )
                .bind(&rid)
                .bind(&wid)
                .bind(&name)
                .bind(&code)
                .bind(&now)
                .bind(housing_fee)
                .bind(&payment_period)
                .execute(&mut conn)
                .await;
                match r {
                    Ok(x) if x.rows_affected() > 0 => inserted += 1,
                    Ok(_) => updated += 1,
                    Err(e) => errors.push(format!("ligne {}: {}", line_no + 2, e)),
                }
            }
        }
        "ref_unit" | "ref_category" | "ref_currency" => {
            let kind = if table == "ref_unit" {
                "unit"
            } else if table == "ref_category" {
                "category"
            } else {
                "currency"
            };
            let tbl = ref_items_table(kind)?;
            for (line_no, result) in rdr.records().enumerate() {
                let row = match result {
                    Ok(r) => r,
                    Err(e) => {
                        errors.push(format!("ligne {}: {}", line_no + 2, e));
                        continue;
                    }
                };
                if row.len() < 3 {
                    errors.push(format!("ligne {}: colonnes insuffisantes", line_no + 2));
                    continue;
                }
                let name = row.get(1).unwrap_or("").trim();
                let code = row.get(2).unwrap_or("").trim();
                if name.is_empty() {
                    errors.push(format!("ligne {}: libellé requis", line_no + 2));
                    continue;
                }
                let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
                let id = Uuid::new_v4().to_string();
                let sql = format!(
                    "INSERT OR IGNORE INTO {} (id, name, code, created_at) VALUES (?1, ?2, ?3, ?4)",
                    tbl
                );
                let r = sqlx::query::<Any>(&sql)
                    .bind(&id)
                    .bind(name)
                    .bind(code)
                    .bind(&now)
                    .execute(&mut conn)
                    .await;
                match r {
                    Ok(x) if x.rows_affected() > 0 => inserted += 1,
                    Ok(_) => updated += 1,
                    Err(e) => errors.push(format!("ligne {}: {}", line_no + 2, e)),
                }
            }
        }
        "movements" => {
            for (line_no, result) in rdr.records().enumerate() {
                let row = match result {
                    Ok(r) => r,
                    Err(e) => {
                        errors.push(format!("ligne {}: {}", line_no + 2, e));
                        continue;
                    }
                };
                // Format export (11+ colonnes) : id, articleId, sku, articleName, moveType, qty, …
                // Format court hérité : sku, moveType, qty, reason, refDoc, supplier, client, date
                let (sku, move_type, qty, reason, ref_doc, supplier_in, client_in, created_override) =
                    if row.len() >= 11 {
                        (
                            row.get(2).unwrap_or("").trim(),
                            row.get(4).unwrap_or("").trim().to_uppercase(),
                            row.get(5).unwrap_or("0").parse().unwrap_or(0.0),
                            row.get(6).unwrap_or(""),
                            row.get(7).unwrap_or(""),
                            row.get(8).unwrap_or("").trim(),
                            row.get(9).unwrap_or("").trim(),
                            row.get(10).unwrap_or("").trim(),
                        )
                    } else if row.len() >= 4 {
                        (
                            row.get(0).unwrap_or("").trim(),
                            row.get(1).unwrap_or("").trim().to_uppercase(),
                            row.get(2).unwrap_or("0").parse().unwrap_or(0.0),
                            row.get(3).unwrap_or(""),
                            row.get(4).unwrap_or(""),
                            row.get(5).unwrap_or("").trim(),
                            row.get(6).unwrap_or("").trim(),
                            row.get(7).unwrap_or("").trim(),
                        )
                    } else {
                        errors.push(format!(
                            "ligne {}: colonnes insuffisantes (export CSV ou format court attendu)",
                            line_no + 2
                        ));
                        continue;
                    };
                if sku.is_empty() || !matches!(move_type.as_str(), "IN" | "OUT" | "ADJ") {
                    errors.push(format!("ligne {}: sku ou type invalide", line_no + 2));
                    continue;
                }
                if qty <= 0.0 && move_type != "ADJ" {
                    errors.push(format!("ligne {}: qty invalide", line_no + 2));
                    continue;
                }
                let row_a = sqlx::query::<Any>("SELECT id, qty FROM stock_article WHERE sku = ?1 COLLATE NOCASE")
                    .bind(sku)
                    .fetch_optional(&mut conn)
                    .await
                    .map_err(|e| e.to_string())?;
                let Some(ar) = row_a else {
                    errors.push(format!("ligne {}: article SKU inconnu {}", line_no + 2, sku));
                    continue;
                };
                let article_id: String = ar.try_get(0).map_err(|e| e.to_string())?;
                let current: f64 = ar.try_get(1).map_err(|e| e.to_string())?;
                let (supplier_name, client_name) = match move_type.as_str() {
                    "IN" => (supplier_in, ""),
                    "OUT" => ("", client_in),
                    _ => ("", ""),
                };
                let new_qty = match move_type.as_str() {
                    "IN" => current + qty,
                    "OUT" => {
                        let n = current - qty;
                        if n < 0.0 {
                            errors.push(format!(
                                "ligne {}: stock insuffisant pour {}",
                                line_no + 2,
                                sku
                            ));
                            continue;
                        }
                        n
                    }
                    "ADJ" => qty,
                    _ => current,
                };
                let mid = Uuid::new_v4().to_string();
                let now = if created_override.is_empty() {
                    Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
                } else {
                    created_override.to_string()
                };
                let mut tx = Acquire::begin(&mut conn).await.map_err(|e| e.to_string())?;
                let mv = sqlx::query::<Any>(
                    r#"INSERT INTO stock_movement (id, article_id, move_type, qty, reason, ref_doc, supplier_name, client_name, created_at, batch_id, line_no, price_in, price_out)
                       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)"#,
                )
                .bind(&mid)
                .bind(&article_id)
                .bind(move_type.as_str())
                .bind(qty)
                .bind(reason)
                .bind(ref_doc)
                .bind(supplier_name)
                .bind(client_name)
                .bind(&now)
                .bind(&mid)
                .bind(0_i64)
                .bind(0_f64)
                .bind(0_f64)
                .execute(&mut *tx)
                .await;
                if let Err(e) = mv {
                    errors.push(format!("ligne {}: {}", line_no + 2, e));
                    let _ = tx.rollback().await;
                    continue;
                }
                let up = sqlx::query::<Any>("UPDATE stock_article SET qty = ?1, updated_at = ?2 WHERE id = ?3")
                    .bind(new_qty)
                    .bind(&now)
                    .bind(&article_id)
                    .execute(&mut *tx)
                    .await;
                if let Err(e) = up {
                    errors.push(format!("ligne {}: {}", line_no + 2, e));
                    let _ = tx.rollback().await;
                    continue;
                }
                if tx.commit().await.is_ok() {
                    inserted += 1;
                }
                if !supplier_name.is_empty() {
                    let pid = Uuid::new_v4().to_string();
                    let _ = sqlx::query::<Any>(
                        "INSERT OR IGNORE INTO stock_party (id, kind, name, address, created_at) VALUES (?1, 'SUPPLIER', ?2, '', ?3)",
                    )
                    .bind(&pid)
                    .bind(supplier_name)
                    .bind(&now)
                    .execute(&mut conn)
                    .await;
                }
                if !client_name.is_empty() {
                    let pid = Uuid::new_v4().to_string();
                    let _ = sqlx::query::<Any>(
                        "INSERT OR IGNORE INTO stock_party (id, kind, name, address, created_at) VALUES (?1, 'CLIENT', ?2, '', ?3)",
                    )
                    .bind(&pid)
                    .bind(client_name)
                    .bind(&now)
                    .execute(&mut conn)
                    .await;
                }
            }
        }
        _ => return Err("table inconnue pour import".to_string()),
    }

    enc(&json!({
        "success": errors.is_empty() || inserted > 0 || updated > 0,
        "inserted": inserted,
        "updated": updated,
        "errorCount": errors.len(),
        "errors": errors.into_iter().take(25).collect::<Vec<_>>(),
    }))
}

#[tauri::command]
pub async fn stock_list_documents(payload: String) -> Result<Value, String> {
    let _p = parse_or_empty(&payload);
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let rows = sqlx::query::<Any>(
        "SELECT id, original_name, kind, bytes, created_at, IFNULL(movement_id,''), IFNULL(movement_caption,'') FROM stock_document ORDER BY created_at DESC",
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for r in rows {
        list.push(json!({
            "id": r.try_get::<String, _>(0).unwrap_or_default(),
            "originalName": r.try_get::<String, _>(1).unwrap_or_default(),
            "kind": r.try_get::<String, _>(2).unwrap_or_default(),
            "bytes": r.try_get::<i64, _>(3).unwrap_or(0),
            "createdAt": r.try_get::<String, _>(4).unwrap_or_default(),
            "movementId": r.try_get::<String, _>(5).unwrap_or_default(),
            "movementCaption": r.try_get::<String, _>(6).unwrap_or_default(),
        }));
    }
    enc(&json!({ "documents": list }))
}

#[tauri::command]
pub async fn stock_import_document(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let original_name = obj
        .get("originalName")
        .and_then(|v| v.as_str())
        .unwrap_or("document")
        .trim();
    let b64 = obj.get("dataBase64").and_then(|v| v.as_str()).unwrap_or("").trim();
    if b64.is_empty() {
        return Err("Fichier vide".to_string());
    }
    let raw = B64_ENGINE
        .decode(b64.as_bytes())
        .map_err(|e| format!("Base64: {}", e))?;
    if raw.len() > MAX_DOCUMENT_BYTES {
        return Err(format!("Fichier trop volumineux (max {} Mo)", MAX_DOCUMENT_BYTES / (1024 * 1024)));
    }
    let kind = sniff_document_kind(&raw).ok_or("Format non reconnu (PNG, JPEG ou PDF requis)")?;
    ensure_document_store_dir().await?;
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;

    let movement_id_opt = obj
        .get("movementId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let (movement_id_val, movement_caption_val): (Option<String>, String) =
        if let Some(ref mid) = movement_id_opt {
            if kind != "png" && kind != "jpeg" {
                return Err("Reçu lié à un mouvement : uniquement PNG ou JPEG.".to_string());
            }
            let exists = sqlx::query::<Any>("SELECT 1 FROM stock_movement WHERE id = ?1")
                .bind(mid.as_str())
                .fetch_optional(&mut conn)
                .await
                .map_err(|e| e.to_string())?;
            if exists.is_none() {
                return Err("Mouvement introuvable".to_string());
            }
            let cnt_row = sqlx::query::<Any>("SELECT COUNT(*) FROM stock_document WHERE movement_id = ?1")
                .bind(mid.as_str())
                .fetch_one(&mut conn)
                .await
                .map_err(|e| e.to_string())?;
            let cnt: i64 = cnt_row.try_get(0).map_err(|e| e.to_string())?;
            if cnt >= 3 {
                return Err("Maximum 3 fichiers par mouvement".to_string());
            }
            let cap_row = sqlx::query::<Any>(
                "SELECT m.created_at, m.move_type, a.sku FROM stock_movement m JOIN stock_article a ON a.id = m.article_id WHERE m.id = ?1",
            )
            .bind(mid.as_str())
            .fetch_optional(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
            let caption = if let Some(cr) = cap_row {
                let ca: String = cr.try_get(0).unwrap_or_default();
                let mt: String = cr.try_get(1).unwrap_or_default();
                let sk: String = cr.try_get(2).unwrap_or_default();
                let short = if mid.len() >= 8 { &mid[..8] } else { mid.as_str() };
                format!("Reçu — mouvement {short} — {ca} — {mt} — {sk}")
            } else {
                format!("Reçu — mouvement {}", mid)
            };
            (Some(mid.clone()), caption)
        } else {
            (None, String::new())
        };

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let path = document_path(&id, kind);
    tokio::fs::write(&path, &raw)
        .await
        .map_err(|e| format!("Écriture fichier: {}", e))?;
    let res = sqlx::query::<Any>(
        "INSERT INTO stock_document (id, original_name, kind, bytes, created_at, movement_id, movement_caption) VALUES (?1,?2,?3,?4,?5,?6,?7)",
    )
    .bind(&id)
    .bind(original_name)
    .bind(kind)
    .bind(raw.len() as i64)
    .bind(&now)
    .bind(movement_id_val.as_ref())
    .bind(movement_caption_val.as_str())
    .execute(&mut conn)
    .await;
    if let Err(e) = res {
        let _ = tokio::fs::remove_file(&path).await;
        return Err(e.to_string());
    }
    enc(&json!({
        "success": true,
        "id": id,
        "kind": kind,
        "originalName": original_name,
        "bytes": raw.len(),
    }))
}

#[tauri::command]
pub async fn stock_export_document(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("id requis")?;
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let row = sqlx::query::<Any>("SELECT original_name, kind FROM stock_document WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    let Some(r) = row else {
        return Err("Document introuvable".to_string());
    };
    let original_name: String = r.try_get(0).map_err(|e| e.to_string())?;
    let kind: String = r.try_get(1).map_err(|e| e.to_string())?;
    let path = document_path(id, &kind);
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Lecture fichier: {}", e))?;
    let mime = match kind.as_str() {
        "png" => "image/png",
        "jpeg" => "image/jpeg",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    };
    let b64 = B64_ENGINE.encode(&bytes);
    enc(&json!({
        "base64": b64,
        "mime": mime,
        "fileName": original_name,
        "kind": kind,
    }))
}

#[tauri::command]
pub async fn stock_delete_document(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("id requis")?;
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let row = sqlx::query::<Any>("SELECT kind FROM stock_document WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    let Some(r) = row else {
        return enc(&json!({ "success": false }));
    };
    let kind: String = r.try_get(0).map_err(|e| e.to_string())?;
    let path = document_path(id, &kind);
    let _ = tokio::fs::remove_file(&path).await;
    let del = sqlx::query::<Any>("DELETE FROM stock_document WHERE id = ?1")
        .bind(id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    enc(&json!({ "success": del.rows_affected() > 0 }))
}

#[tauri::command]
pub async fn stock_list_document_print_models(_payload: String) -> Result<Value, String> {
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let rows = sqlx::query::<Any>(
        "SELECT id, name, description, created_at, updated_at FROM stock_document_print_model ORDER BY name COLLATE NOCASE",
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for r in rows {
        let id = r.try_get::<String, _>(0).unwrap_or_default();
        let screen_key = get_doc_print_model_screen(&mut conn, &id).await?;
        list.push(json!({
            "id": id,
            "name": r.try_get::<String, _>(1).unwrap_or_default(),
            "description": r.try_get::<String, _>(2).unwrap_or_default(),
            "createdAt": r.try_get::<String, _>(3).unwrap_or_default(),
            "updatedAt": r.try_get::<String, _>(4).unwrap_or_default(),
            "screenKey": screen_key,
        }));
    }
    enc(&json!({ "models": list }))
}

#[tauri::command]
pub async fn stock_get_document_print_model(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p
        .body
        .as_ref()
        .and_then(|b| b.get("id"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("id requis")?;
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let row = sqlx::query::<Any>(
        "SELECT id, name, description, html_content, css_content, created_at, updated_at FROM stock_document_print_model WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let Some(r) = row else {
        return Err("Modèle introuvable".to_string());
    };
    let id = r.try_get::<String, _>(0).unwrap_or_default();
    let screen_key = get_doc_print_model_screen(&mut conn, &id).await?;
    enc(&json!({
        "model": {
            "id": id,
            "name": r.try_get::<String, _>(1).unwrap_or_default(),
            "description": r.try_get::<String, _>(2).unwrap_or_default(),
            "htmlContent": r.try_get::<String, _>(3).unwrap_or_default(),
            "cssContent": r.try_get::<String, _>(4).unwrap_or_default(),
            "createdAt": r.try_get::<String, _>(5).unwrap_or_default(),
            "updatedAt": r.try_get::<String, _>(6).unwrap_or_default(),
            "screenKey": screen_key,
        }
    }))
}

#[tauri::command]
pub async fn stock_upsert_document_print_model(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let id_in = obj.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
    let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
    if name.is_empty() {
        return Err("Nom du modèle requis".to_string());
    }
    let description = obj.get("description").and_then(|v| v.as_str()).unwrap_or("").trim();
    let html_content = obj.get("htmlContent").and_then(|v| v.as_str()).unwrap_or("");
    let css_content = obj.get("cssContent").and_then(|v| v.as_str()).unwrap_or("");
    let screen_key = obj.get("screenKey").and_then(|v| v.as_str()).unwrap_or("").trim();

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if !id_in.is_empty() {
        sqlx::query::<Any>(
            "UPDATE stock_document_print_model SET name = ?1, description = ?2, html_content = ?3, css_content = ?4, updated_at = ?5 WHERE id = ?6",
        )
        .bind(name)
        .bind(description)
        .bind(html_content)
        .bind(css_content)
        .bind(&now)
        .bind(id_in)
        .execute(&mut conn)
        .await
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "Ce nom de modèle existe déjà".to_string()
            } else {
                e.to_string()
            }
        })?;
        set_doc_print_model_screen(
            &mut conn,
            id_in,
            if screen_key.is_empty() { None } else { Some(screen_key) },
        )
        .await?;
        return enc(&json!({ "success": true, "id": id_in }));
    }

    let new_id = Uuid::new_v4().to_string();
    sqlx::query::<Any>(
        "INSERT INTO stock_document_print_model (id, name, description, html_content, css_content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(&new_id)
    .bind(name)
    .bind(description)
    .bind(html_content)
    .bind(css_content)
    .bind(&now)
    .bind(&now)
    .execute(&mut conn)
    .await
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            "Ce nom de modèle existe déjà".to_string()
        } else {
            e.to_string()
        }
    })?;
    set_doc_print_model_screen(
        &mut conn,
        &new_id,
        if screen_key.is_empty() { None } else { Some(screen_key) },
    )
    .await?;
    enc(&json!({ "success": true, "id": new_id }))
}

#[tauri::command]
pub async fn stock_delete_document_print_model(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("id requis")?;
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    clear_doc_print_screen_bindings_for_model(&mut conn, id).await?;
    let r = sqlx::query::<Any>("DELETE FROM stock_document_print_model WHERE id = ?1")
        .bind(id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    enc(&json!({ "success": r.rows_affected() > 0 }))
}

#[tauri::command]
pub async fn stock_get_document_print_screen_bindings(_payload: String) -> Result<Value, String> {
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let mut map = Map::new();
    for sk in DOC_PRINT_SCREEN_KV {
        let k = doc_print_screen_key_kv(sk);
        let v = stock_kv_get(&mut conn, &k).await?;
        map.insert((*sk).to_string(), json!(v));
    }
    enc(&json!({ "bindings": map }))
}

#[tauri::command]
pub async fn stock_set_document_print_screen_binding(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let screen = obj
        .get("screenKey")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .ok_or("screenKey requis")?;
    if !DOC_PRINT_SCREEN_KV.iter().any(|s| *s == screen) {
        return Err("screenKey inconnu".to_string());
    }
    let k = doc_print_screen_key_kv(screen);
    let model_in = obj.get("modelId").and_then(|v| v.as_str()).unwrap_or("").trim();
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    if model_in.is_empty() {
        stock_kv_delete(&mut conn, &k).await?;
        return enc(&json!({ "success": true }));
    }
    let exists = sqlx::query::<Any>("SELECT 1 FROM stock_document_print_model WHERE id = ?1")
        .bind(model_in)
        .fetch_optional(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err("Modèle d’impression introuvable".to_string());
    }
    stock_kv_set(&mut conn, &k, model_in).await?;
    enc(&json!({ "success": true }))
}

#[tauri::command]
pub async fn stock_list_roles(_payload: String) -> Result<Value, String> {
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let rows = sqlx::query::<Any>(
        "SELECT id, name, code, description, privileges_json, created_at FROM stock_role ORDER BY name COLLATE NOCASE",
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for r in rows {
        let pj: String = r.try_get::<String, _>(4).unwrap_or_else(|_| "[]".to_string());
        let arr: Vec<Value> = serde_json::from_str(&pj).unwrap_or_default();
        let privileges = normalize_stock_privileges(&arr);
        list.push(json!({
            "id": r.try_get::<String, _>(0).unwrap_or_default(),
            "name": r.try_get::<String, _>(1).unwrap_or_default(),
            "code": r.try_get::<String, _>(2).unwrap_or_default(),
            "description": r.try_get::<String, _>(3).unwrap_or_default(),
            "privileges": privileges,
            "createdAt": r.try_get::<String, _>(5).unwrap_or_default(),
        }));
    }
    enc(&json!({ "roles": list }))
}

#[tauri::command]
pub async fn stock_upsert_role(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
    if name.is_empty() {
        return Err("Nom du rôle requis".to_string());
    }
    let code = obj.get("code").and_then(|v| v.as_str()).unwrap_or("").trim();
    let description = obj.get("description").and_then(|v| v.as_str()).unwrap_or("").trim();
    let id_in = obj.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
    let priv_vec = obj
        .get("privileges")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if id_in.is_empty() {
        let id = Uuid::new_v4().to_string();
        let priv_json = if priv_vec.is_empty() {
            default_stock_role_privileges_json()
        } else {
            let merged = normalize_stock_privileges(&priv_vec);
            let arr: Vec<Value> = merged.iter().map(|s| json!(s)).collect();
            serde_json::to_string(&Value::Array(arr)).map_err(|e| e.to_string())?
        };
        sqlx::query::<Any>(
            "INSERT INTO stock_role (id, name, code, description, privileges_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(&id)
        .bind(name)
        .bind(code)
        .bind(description)
        .bind(&priv_json)
        .bind(&now)
        .execute(&mut conn)
        .await
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "Ce nom de rôle existe déjà".to_string()
            } else {
                e.to_string()
            }
        })?;
        enc(&json!({ "success": true, "id": id }))
    } else {
        let priv_json = if priv_vec.is_empty() {
            let cur = sqlx::query::<Any>("SELECT privileges_json FROM stock_role WHERE id = ?1")
                .bind(id_in)
                .fetch_optional(&mut conn)
                .await
                .map_err(|e| e.to_string())?;
            cur.and_then(|r| r.try_get::<String, _>(0).ok())
                .unwrap_or_else(|| default_stock_role_privileges_json())
        } else {
            let merged = normalize_stock_privileges(&priv_vec);
            let arr: Vec<Value> = merged.iter().map(|s| json!(s)).collect();
            serde_json::to_string(&Value::Array(arr)).map_err(|e| e.to_string())?
        };
        sqlx::query::<Any>(
            "UPDATE stock_role SET name = ?1, code = ?2, description = ?3, privileges_json = ?4 WHERE id = ?5",
        )
        .bind(name)
        .bind(code)
        .bind(description)
        .bind(&priv_json)
        .bind(id_in)
        .execute(&mut conn)
        .await
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "Ce nom de rôle existe déjà".to_string()
            } else {
                e.to_string()
            }
        })?;
        enc(&json!({ "success": true, "id": id_in }))
    }
}

#[tauri::command]
pub async fn stock_delete_role(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("id requis")?;
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let steps_chk = sqlx::query::<Any>(
        "SELECT validate_role_id, fill_role_id, fill_role_ids_json FROM stock_circuit_step",
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    for row in steps_chk {
        let v: String = row.try_get(0).unwrap_or_default();
        let f: String = row.try_get(1).unwrap_or_default();
        let j: String = row.try_get(2).unwrap_or_default();
        if circuit_step_references_role_id(&v, &f, &j, id) {
            return Err("Ce rôle est référencé dans un circuit.".to_string());
        }
    }
    let _ = sqlx::query::<Any>("UPDATE stock_app_user SET role_id = '' WHERE role_id = ?1")
        .bind(id)
        .execute(&mut conn)
        .await;
    let r = sqlx::query::<Any>("DELETE FROM stock_role WHERE id = ?1")
        .bind(id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    enc(&json!({ "success": r.rows_affected() > 0 }))
}

#[tauri::command]
pub async fn stock_list_circuits(_payload: String) -> Result<Value, String> {
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let rows = sqlx::query::<Any>(
        "SELECT id, name, description, active, created_at, updated_at FROM stock_circuit ORDER BY name COLLATE NOCASE",
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for r in rows {
        list.push(json!({
            "id": r.try_get::<String, _>(0).unwrap_or_default(),
            "name": r.try_get::<String, _>(1).unwrap_or_default(),
            "description": r.try_get::<String, _>(2).unwrap_or_default(),
            "active": r.try_get::<i64, _>(3).unwrap_or(1) != 0,
            "createdAt": r.try_get::<String, _>(4).unwrap_or_default(),
            "updatedAt": r.try_get::<String, _>(5).unwrap_or_default(),
        }));
    }
    enc(&json!({ "circuits": list }))
}

#[tauri::command]
pub async fn stock_list_role_circuit_entries(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let requester_user_id = obj
        .get("requesterUserId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if requester_user_id.is_empty() {
        return Err("requesterUserId requis".to_string());
    }
    let requester_is_sadmin = obj
        .get("requesterRole")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .eq_ignore_ascii_case("sadmin");
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let requester_role_id = stock_user_role_id(&mut conn, requester_user_id).await?;

    let rows = sqlx::query::<Any>(
        "SELECT c.id, c.name, c.active, s.position, s.fill_role_id, s.fill_role_ids_json, s.validate_role_id
         FROM stock_circuit c
         JOIN stock_circuit_step s ON s.circuit_id = c.id
         ORDER BY c.name COLLATE NOCASE, s.position ASC",
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let mut best: BTreeMap<String, Value> = BTreeMap::new();
    for r in rows {
        let cid: String = r.try_get(0).unwrap_or_default();
        let cname: String = r.try_get(1).unwrap_or_default();
        let active: bool = r.try_get::<i64, _>(2).unwrap_or(1) != 0;
        let pos: i64 = r.try_get(3).unwrap_or(0);
        let fill_legacy: String = r.try_get(4).unwrap_or_default();
        let fill_json: String = r.try_get(5).unwrap_or_else(|_| "[]".to_string());
        let validate_role_id: String = r.try_get(6).unwrap_or_default();
        let fill_ids = parse_fill_role_ids_json(&fill_json, &fill_legacy);
        let can_do = if requester_is_sadmin {
            true
        } else {
            let rid = requester_role_id.trim();
            (!rid.is_empty() && fill_ids.iter().any(|x| x == rid))
                || (!rid.is_empty() && validate_role_id.trim() == rid)
        };
        if !can_do {
            continue;
        }
        if !best.contains_key(&cid) {
            best.insert(
                cid.clone(),
                json!({
                    "circuitId": cid,
                    "circuitName": cname,
                    "active": active,
                    "firstStepIndex": pos,
                    "canStart": pos == 0,
                }),
            );
        }
    }
    enc(&json!({ "entries": best.into_values().collect::<Vec<_>>() }))
}

#[tauri::command]
pub async fn stock_set_circuit_active(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or("id requis")?;
    let active = obj.get("active").and_then(|v| v.as_bool()).unwrap_or(true);
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let r = sqlx::query::<Any>(
        "UPDATE stock_circuit SET active = ?1, updated_at = ?2 WHERE id = ?3",
    )
    .bind(if active { 1i64 } else { 0i64 })
    .bind(&now)
    .bind(id)
    .execute(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    enc(&json!({ "success": r.rows_affected() > 0 }))
}

#[tauri::command]
pub async fn stock_get_circuit(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p
        .body
        .as_ref()
        .and_then(|b| b.get("id"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("id requis")?;
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let row = sqlx::query::<Any>(
        "SELECT id, name, description, active, created_at, updated_at FROM stock_circuit WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let Some(r) = row else {
        return Err("Circuit introuvable".to_string());
    };
    let circuit = json!({
        "id": r.try_get::<String, _>(0).unwrap_or_default(),
        "name": r.try_get::<String, _>(1).unwrap_or_default(),
        "description": r.try_get::<String, _>(2).unwrap_or_default(),
        "active": r.try_get::<i64, _>(3).unwrap_or(1) != 0,
        "createdAt": r.try_get::<String, _>(4).unwrap_or_default(),
        "updatedAt": r.try_get::<String, _>(5).unwrap_or_default(),
    });
    let step_rows = sqlx::query::<Any>(
        "SELECT id, position, title, fields_json, validate_role_id, fill_role_id, created_at, fill_role_ids_json FROM stock_circuit_step WHERE circuit_id = ?1 ORDER BY position ASC, created_at ASC",
    )
    .bind(id)
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let mut steps = Vec::new();
    for s in step_rows {
        let fill_legacy: String = s.try_get::<String, _>(5).unwrap_or_default();
        let fill_json: String = s.try_get::<String, _>(7).unwrap_or_else(|_| "[]".to_string());
        let fill_ids = parse_fill_role_ids_json(&fill_json, &fill_legacy);
        let fill_first = fill_ids.get(0).cloned().unwrap_or_default();
        steps.push(json!({
            "id": s.try_get::<String, _>(0).unwrap_or_default(),
            "position": s.try_get::<i64, _>(1).unwrap_or(0),
            "title": s.try_get::<String, _>(2).unwrap_or_default(),
            "fieldsJson": s.try_get::<String, _>(3).unwrap_or_else(|_| "[]".to_string()),
            "validateRoleId": s.try_get::<String, _>(4).unwrap_or_default(),
            "fillRoleId": fill_first,
            "fillRoleIds": fill_ids,
            "createdAt": s.try_get::<String, _>(6).unwrap_or_default(),
        }));
    }
    enc(&json!({ "circuit": circuit, "steps": steps }))
}

#[tauri::command]
pub async fn stock_upsert_circuit(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let id_in = obj.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
    let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
    if name.is_empty() {
        return Err("Nom du circuit requis".to_string());
    }
    let description = obj.get("description").and_then(|v| v.as_str()).unwrap_or("").trim();
    let active = obj.get("active").and_then(|v| v.as_bool()).unwrap_or(true);
    let steps_val = obj.get("steps").cloned().unwrap_or(Value::Array(vec![]));
    let steps_arr = steps_val.as_array().cloned().unwrap_or_default();

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut tx = Acquire::begin(&mut conn).await.map_err(|e| e.to_string())?;

    let circuit_id = if id_in.is_empty() {
        let new_id = Uuid::new_v4().to_string();
        sqlx::query::<Any>(
            "INSERT INTO stock_circuit (id, name, description, active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(&new_id)
        .bind(name)
        .bind(description)
        .bind(if active { 1i64 } else { 0i64 })
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        new_id
    } else {
        sqlx::query::<Any>(
            "UPDATE stock_circuit SET name = ?1, description = ?2, active = ?3, updated_at = ?4 WHERE id = ?5",
        )
        .bind(name)
        .bind(description)
        .bind(if active { 1i64 } else { 0i64 })
        .bind(&now)
        .bind(id_in)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        sqlx::query::<Any>("DELETE FROM stock_circuit_step WHERE circuit_id = ?1")
            .bind(id_in)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        id_in.to_string()
    };

    for (pos, step_v) in steps_arr.iter().enumerate() {
        let so = step_v.as_object().ok_or("Étape invalide")?;
        let title = so.get("title").and_then(|v| v.as_str()).unwrap_or("").trim();
        if title.is_empty() {
            return Err(format!("Étape {} : titre requis", pos + 1));
        }
        let fields_json = match so.get("fieldsJson") {
            Some(Value::String(s)) => s.clone(),
            Some(v) => serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()),
            None => "[]".to_string(),
        };
        let mut validate_role_id = so
            .get("validateRoleId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let mut fill_ids: Vec<String> = Vec::new();
        if let Some(Value::Array(arr)) = so.get("fillRoleIds") {
            for v in arr {
                if let Some(s) = v.as_str() {
                    let t = s.trim();
                    if !t.is_empty() && !fill_ids.iter().any(|x| x == t) {
                        fill_ids.push(t.to_string());
                    }
                }
            }
        }
        if fill_ids.is_empty() {
            if let Some(s) = so.get("fillRoleId").and_then(|v| v.as_str()) {
                let t = s.trim();
                if !t.is_empty() {
                    fill_ids.push(t.to_string());
                }
            }
        }
        ensure_circuit_step_interaction_roles(&mut fill_ids, &mut validate_role_id, pos);
        let fill_role_id = fill_ids.get(0).cloned().unwrap_or_default();
        let fill_role_ids_json = serde_json::to_string(&Value::Array(
            fill_ids.iter().cloned().map(|s| json!(s)).collect(),
        ))
        .unwrap_or_else(|_| "[]".to_string());
        let sid = Uuid::new_v4().to_string();
        sqlx::query::<Any>(
            "INSERT INTO stock_circuit_step (id, circuit_id, position, title, fields_json, validate_role_id, fill_role_id, fill_role_ids_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        )
        .bind(&sid)
        .bind(&circuit_id)
        .bind(pos as i64)
        .bind(title)
        .bind(&fields_json)
        .bind(&validate_role_id)
        .bind(&fill_role_id)
        .bind(&fill_role_ids_json)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    enc(&json!({ "success": true, "id": circuit_id }))
}

#[tauri::command]
pub async fn stock_delete_circuit(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("id requis")?;
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let _ = sqlx::query::<Any>("DELETE FROM stock_collab_task WHERE circuit_id = ?1")
        .bind(id)
        .execute(&mut conn)
        .await;
    let r = sqlx::query::<Any>("DELETE FROM stock_circuit WHERE id = ?1")
        .bind(id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    enc(&json!({ "success": r.rows_affected() > 0 }))
}

#[tauri::command]
pub async fn stock_list_collab_tasks(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let requester_user_id = obj
        .get("requesterUserId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if requester_user_id.is_empty() {
        return Err("requesterUserId requis".to_string());
    }
    let requester_is_sadmin = obj
        .get("requesterRole")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .eq_ignore_ascii_case("sadmin");

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let requester_role_id = stock_user_role_id(&mut conn, requester_user_id).await?;

    let rows = sqlx::query::<Any>(
        "SELECT id, title, description, at, status, kind, visibility, created_by_user_id, visible_role_id, circuit_id, circuit_step_index, created_at, updated_at FROM stock_collab_task WHERE status = 'pending' ORDER BY at ASC",
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        let id: String = r.try_get(0).unwrap_or_default();
        let title: String = r.try_get(1).unwrap_or_default();
        let description: String = r.try_get(2).unwrap_or_default();
        let at: String = r.try_get(3).unwrap_or_default();
        let status: String = r.try_get(4).unwrap_or_default();
        let kind: String = r.try_get(5).unwrap_or_else(|_| "reminder".to_string());
        let visibility: String = r.try_get(6).unwrap_or_else(|_| "public".to_string());
        let created_by: String = r.try_get(7).unwrap_or_default();
        let visible_role_id: String = r.try_get(8).unwrap_or_default();
        let circuit_id: String = r.try_get(9).unwrap_or_default();
        let circuit_step_index: i64 = r.try_get(10).unwrap_or(-1);
        let created_at: String = r.try_get(11).unwrap_or_default();
        let updated_at: String = r.try_get(12).unwrap_or_default();
        if !collab_task_visible_to(
            requester_is_sadmin,
            requester_user_id,
            &requester_role_id,
            &created_by,
            &visibility,
            &visible_role_id,
            &kind,
        ) {
            continue;
        }
        let hrows = sqlx::query::<Any>(
            "SELECT action, note, actor_user_id, actor_role_id, created_at FROM stock_collab_task_history WHERE task_id = ?1 ORDER BY created_at ASC",
        )
        .bind(&id)
        .fetch_all(&mut conn)
        .await
        .unwrap_or_default();
        let history: Vec<Value> = hrows
            .into_iter()
            .map(|hr| {
                json!({
                    "action": hr.try_get::<String, _>(0).unwrap_or_default(),
                    "note": hr.try_get::<String, _>(1).unwrap_or_default(),
                    "actorUserId": hr.try_get::<String, _>(2).unwrap_or_default(),
                    "actorRoleId": hr.try_get::<String, _>(3).unwrap_or_default(),
                    "at": hr.try_get::<String, _>(4).unwrap_or_default(),
                })
            })
            .collect();
        list.push(json!({
            "id": id,
            "title": title,
            "description": description,
            "at": at,
            "status": status,
            "kind": kind,
            "visibility": visibility,
            "createdByUserId": created_by,
            "visibleRoleId": visible_role_id,
            "circuitId": circuit_id,
            "circuitStepIndex": circuit_step_index,
            "createdAt": created_at,
            "updatedAt": updated_at,
            "history": history,
        }));
    }
    enc(&json!({ "tasks": list }))
}

#[tauri::command]
pub async fn stock_upsert_collab_task(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let requester_user_id = obj
        .get("requesterUserId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if requester_user_id.is_empty() {
        return Err("requesterUserId requis".to_string());
    }
    let requester_is_sadmin = obj
        .get("requesterRole")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .eq_ignore_ascii_case("sadmin");
    let id_in = obj.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
    let title = obj.get("title").and_then(|v| v.as_str()).unwrap_or("").trim();
    if title.is_empty() {
        return Err("Titre requis".to_string());
    }
    let description = obj.get("description").and_then(|v| v.as_str()).unwrap_or("").trim();
    let at = obj.get("at").and_then(|v| v.as_str()).unwrap_or("").trim();
    if at.is_empty() {
        return Err("Date requise".to_string());
    }
    let visibility = obj
        .get("visibility")
        .and_then(|v| v.as_str())
        .unwrap_or("public")
        .trim()
        .to_lowercase();
    if !matches!(visibility.as_str(), "public" | "private" | "role") {
        return Err("Visibilité invalide".to_string());
    }
    let visible_role_id = obj
        .get("visibleRoleId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if visibility == "role" && visible_role_id.is_empty() {
        return Err("Rôle visible requis pour une tâche restreinte par rôle".to_string());
    }
    let visible_role_store = if visibility == "role" {
        visible_role_id.clone()
    } else {
        String::new()
    };

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let task_id = if id_in.is_empty() {
        let new_id = Uuid::new_v4().to_string();
        sqlx::query::<Any>(
            "INSERT INTO stock_collab_task (id, title, description, at, status, kind, visibility, created_by_user_id, visible_role_id, circuit_id, circuit_step_index, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'pending', 'reminder', ?5, ?6, ?7, '', -1, ?8, ?9)",
        )
        .bind(&new_id)
        .bind(title)
        .bind(description)
        .bind(at)
        .bind(&visibility)
        .bind(requester_user_id)
        .bind(&visible_role_store)
        .bind(&now)
        .bind(&now)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
        new_id
    } else {
        let own = sqlx::query::<Any>(
            "SELECT created_by_user_id FROM stock_collab_task WHERE id = ?1 AND kind = 'reminder'",
        )
        .bind(id_in)
        .fetch_optional(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
        let Some(row) = own else {
            return Err("Rappel introuvable".to_string());
        };
        let creator: String = row.try_get(0).unwrap_or_default();
        if creator != requester_user_id && !requester_is_sadmin {
            return Err("Modification non autorisée".to_string());
        }
        sqlx::query::<Any>(
            "UPDATE stock_collab_task SET title = ?1, description = ?2, at = ?3, visibility = ?4, visible_role_id = ?5, updated_at = ?6 WHERE id = ?7 AND kind = 'reminder'",
        )
        .bind(title)
        .bind(description)
        .bind(at)
        .bind(&visibility)
        .bind(&visible_role_store)
        .bind(&now)
        .bind(id_in)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
        id_in.to_string()
    };

    enc(&json!({ "success": true, "id": task_id }))
}

#[tauri::command]
pub async fn stock_complete_collab_task(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let id = obj.get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).ok_or("id requis")?;
    let requester_user_id = obj
        .get("requesterUserId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if requester_user_id.is_empty() {
        return Err("requesterUserId requis".to_string());
    }
    let requester_is_sadmin = obj
        .get("requesterRole")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .eq_ignore_ascii_case("sadmin");

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let requester_role_id = stock_user_role_id(&mut conn, requester_user_id).await?;

    let row = sqlx::query::<Any>(
        "SELECT created_by_user_id, visibility, visible_role_id, kind, circuit_id, circuit_step_index FROM stock_collab_task WHERE id = ?1 AND status = 'pending'",
    )
    .bind(id)
    .fetch_optional(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let Some(r) = row else {
        return Err("Tâche introuvable ou déjà traitée".to_string());
    };
    let created_by: String = r.try_get(0).unwrap_or_default();
    let visibility: String = r.try_get(1).unwrap_or_default();
    let visible_role_id: String = r.try_get(2).unwrap_or_default();
    let kind: String = r.try_get(3).unwrap_or_default();
    let circuit_id: String = r.try_get(4).unwrap_or_default();
    let circuit_step_index: i64 = r.try_get(5).unwrap_or(-1);
    if !collab_task_visible_to(
        requester_is_sadmin,
        requester_user_id,
        &requester_role_id,
        &created_by,
        &visibility,
        &visible_role_id,
        &kind,
    ) {
        return Err("Action non autorisée".to_string());
    }

    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let u = sqlx::query::<Any>("UPDATE stock_collab_task SET status = 'done', updated_at = ?1 WHERE id = ?2")
        .bind(&now)
        .bind(id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    let _ = collab_task_log_action(
        &mut conn,
        id,
        &circuit_id,
        "completed",
        requester_user_id,
        &requester_role_id,
        "Tâche complétée",
    )
    .await;

    if u.rows_affected() > 0 && (kind == "circuit_fill" || kind == "circuit_validate") && !circuit_id.trim().is_empty() && circuit_step_index >= 0 {
        if kind == "circuit_fill" {
            let srow = sqlx::query::<Any>(
                "SELECT title, validate_role_id FROM stock_circuit_step WHERE circuit_id = ?1 AND position = ?2",
            )
            .bind(&circuit_id)
            .bind(circuit_step_index)
            .fetch_optional(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
            if let Some(sr) = srow {
                let step_title: String = sr.try_get(0).unwrap_or_default();
                let validate_role_id: String = sr.try_get(1).unwrap_or_default();
                if !validate_role_id.trim().is_empty() {
                    let cname: String = sqlx::query::<Any>("SELECT name FROM stock_circuit WHERE id = ?1")
                        .bind(&circuit_id)
                        .fetch_optional(&mut conn)
                        .await
                        .map_err(|e| e.to_string())?
                        .and_then(|r| r.try_get::<String, _>(0).ok())
                        .unwrap_or_default();
                    let title = format!("En attente de validation : {} — {}", cname.trim(), step_title.trim());
                    let new_id = Uuid::new_v4().to_string();
                    let at = Utc::now().to_rfc3339();
                    sqlx::query::<Any>(
                        r#"INSERT INTO stock_collab_task (id, title, description, at, status, kind, visibility, created_by_user_id, visible_role_id, circuit_id, circuit_step_index, created_at, updated_at)
                           VALUES (?1, ?2, '', ?3, 'pending', 'circuit_validate', 'role', ?4, ?5, ?6, ?7, ?8, ?9)"#,
                    )
                    .bind(&new_id)
                    .bind(&title)
                    .bind(&at)
                    .bind(requester_user_id)
                    .bind(validate_role_id.trim())
                    .bind(&circuit_id)
                    .bind(circuit_step_index)
                    .bind(&now)
                    .bind(&now)
                    .execute(&mut conn)
                    .await
                    .map_err(|e| e.to_string())?;
                    let _ = collab_task_log_action(
                        &mut conn,
                        &new_id,
                        &circuit_id,
                        "created",
                        requester_user_id,
                        &requester_role_id,
                        "Tâche de validation créée automatiquement",
                    )
                    .await;
                } else {
                    let _ = create_circuit_fill_tasks_for_step(
                        &mut conn,
                        &circuit_id,
                        circuit_step_index + 1,
                        requester_user_id,
                        &requester_role_id,
                    )
                    .await?;
                }
            }
        } else if kind == "circuit_validate" {
            let next_created = create_circuit_fill_tasks_for_step(
                &mut conn,
                &circuit_id,
                circuit_step_index + 1,
                requester_user_id,
                &requester_role_id,
            )
            .await?;
            if next_created.is_empty() {
                let _ = collab_task_log_action(
                    &mut conn,
                    id,
                    &circuit_id,
                    "circuit_completed",
                    requester_user_id,
                    &requester_role_id,
                    "Circuit terminé",
                )
                .await;
            }
        }
    }
    enc(&json!({ "success": u.rows_affected() > 0 }))
}

async fn create_circuit_fill_tasks_for_step(
    conn: &mut AnyConnection,
    circuit_id: &str,
    step_index: i64,
    created_by_user_id: &str,
    actor_role_id: &str,
) -> Result<Vec<String>, String> {
    let crow = sqlx::query::<Any>("SELECT name FROM stock_circuit WHERE id = ?1")
        .bind(circuit_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let Some(cr) = crow else {
        return Ok(vec![]);
    };
    let circuit_name: String = cr.try_get(0).unwrap_or_default();
    let srow = sqlx::query::<Any>(
        "SELECT title, fill_role_id, fill_role_ids_json FROM stock_circuit_step WHERE circuit_id = ?1 AND position = ?2",
    )
    .bind(circuit_id)
    .bind(step_index)
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;
    let Some(sr) = srow else {
        return Ok(vec![]);
    };
    let step_title: String = sr.try_get(0).unwrap_or_default();
    let fill_role_id: String = sr.try_get(1).unwrap_or_default();
    let fill_role_ids_json: String = sr.try_get(2).unwrap_or_else(|_| "[]".to_string());
    let fill_ids = parse_fill_role_ids_json(&fill_role_ids_json, &fill_role_id);
    if fill_ids.is_empty() {
        return Ok(vec![]);
    }
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let at = Utc::now().to_rfc3339();
    let mut ids: Vec<String> = Vec::new();
    for rid in &fill_ids {
        let role_label: String = sqlx::query::<Any>("SELECT name FROM stock_role WHERE id = ?1")
            .bind(rid)
            .fetch_optional(&mut *conn)
            .await
            .map_err(|e| e.to_string())?
            .and_then(|r| r.try_get::<String, _>(0).ok())
            .unwrap_or_else(|| rid.clone());
        let title = format!(
            "En attente de complétion du circuit par {} : {} — {}",
            role_label.trim(),
            circuit_name.trim(),
            step_title.trim()
        );
        let new_id = Uuid::new_v4().to_string();
        sqlx::query::<Any>(
            r#"INSERT INTO stock_collab_task (id, title, description, at, status, kind, visibility, created_by_user_id, visible_role_id, circuit_id, circuit_step_index, created_at, updated_at)
               VALUES (?1, ?2, '', ?3, 'pending', 'circuit_fill', 'role', ?4, ?5, ?6, ?7, ?8, ?9)"#,
        )
        .bind(&new_id)
        .bind(&title)
        .bind(&at)
        .bind(created_by_user_id)
        .bind(rid)
        .bind(circuit_id)
        .bind(step_index)
        .bind(&now)
        .bind(&now)
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
        collab_task_log_action(
            conn,
            &new_id,
            circuit_id,
            "created",
            created_by_user_id,
            actor_role_id,
            "Tâche de remplissage créée automatiquement",
        )
        .await?;
        ids.push(new_id);
    }
    Ok(ids)
}

#[tauri::command]
pub async fn stock_create_circuit_step_collab_task(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let requester_user_id = obj
        .get("requesterUserId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if requester_user_id.is_empty() {
        return Err("requesterUserId requis".to_string());
    }
    let circuit_id = obj
        .get("circuitId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("circuitId requis")?;
    let step_index = obj
        .get("stepIndex")
        .and_then(|v| v.as_i64())
        .or_else(|| obj.get("stepIndex").and_then(|v| v.as_f64()).map(|f| f as i64))
        .unwrap_or(-1);
    if step_index < 0 {
        return Err("stepIndex requis".to_string());
    }
    let variant = obj
        .get("variant")
        .and_then(|v| v.as_str())
        .unwrap_or("fill")
        .trim()
        .to_lowercase();
    if !matches!(variant.as_str(), "fill" | "validate") {
        return Err("variant doit être fill ou validate".to_string());
    }
    if variant == "validate" && step_index < 1 {
        return Err("Pas de validation pour la première étape".to_string());
    }

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let requester_role_id = stock_user_role_id(&mut conn, requester_user_id).await?;

    let crow = sqlx::query::<Any>("SELECT name FROM stock_circuit WHERE id = ?1")
        .bind(circuit_id)
        .fetch_optional(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    let Some(cr) = crow else {
        return Err("Circuit introuvable".to_string());
    };
    let circuit_name: String = cr.try_get(0).unwrap_or_default();

    let srow = sqlx::query::<Any>(
        "SELECT title, validate_role_id, fill_role_id, fill_role_ids_json FROM stock_circuit_step WHERE circuit_id = ?1 AND position = ?2",
    )
    .bind(circuit_id)
    .bind(step_index)
    .fetch_optional(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let Some(sr) = srow else {
        return Err("Étape introuvable".to_string());
    };
    let step_title: String = sr.try_get(0).unwrap_or_default();
    let validate_role_id: String = sr.try_get(1).unwrap_or_default();
    let fill_role_id: String = sr.try_get(2).unwrap_or_default();
    let fill_role_ids_json: String = sr.try_get(3).unwrap_or_else(|_| "[]".to_string());
    let fill_ids = parse_fill_role_ids_json(&fill_role_ids_json, &fill_role_id);

    let kind = if variant == "fill" {
        "circuit_fill"
    } else {
        "circuit_validate"
    };

    if variant == "fill" && fill_ids.is_empty() {
        return Err("Rôle de remplissage manquant sur cette étape".to_string());
    }
    if variant == "validate" && validate_role_id.trim().is_empty() {
        return Err("Rôle validateur manquant sur cette étape".to_string());
    }

    let _ = sqlx::query::<Any>(
        "DELETE FROM stock_collab_task WHERE circuit_id = ?1 AND circuit_step_index = ?2 AND kind = ?3 AND status = 'pending'",
    )
    .bind(circuit_id)
    .bind(step_index)
    .bind(kind)
    .execute(&mut conn)
    .await;

    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let at = Utc::now().to_rfc3339();
    let mut last_new_id = String::new();

    if variant == "fill" {
        for rid in &fill_ids {
            let role_label: String = sqlx::query::<Any>("SELECT name FROM stock_role WHERE id = ?1")
                .bind(rid)
                .fetch_optional(&mut conn)
                .await
                .map_err(|e| e.to_string())?
                .and_then(|r| r.try_get::<String, _>(0).ok())
                .unwrap_or_else(|| rid.clone());
            let title = format!(
                "À remplir : {} — {} ({})",
                circuit_name.trim(),
                step_title.trim(),
                role_label.trim()
            );
            let new_id = Uuid::new_v4().to_string();
            sqlx::query::<Any>(
                r#"INSERT INTO stock_collab_task (id, title, description, at, status, kind, visibility, created_by_user_id, visible_role_id, circuit_id, circuit_step_index, created_at, updated_at)
                   VALUES (?1, ?2, '', ?3, 'pending', ?4, 'role', ?5, ?6, ?7, ?8, ?9, ?10)"#,
            )
            .bind(&new_id)
            .bind(&title)
            .bind(&at)
            .bind(kind)
            .bind(requester_user_id)
            .bind(rid)
            .bind(circuit_id)
            .bind(step_index)
            .bind(&now)
            .bind(&now)
            .execute(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
            let _ = collab_task_log_action(
                &mut conn,
                &new_id,
                circuit_id,
                "created",
                requester_user_id,
                &requester_role_id,
                "Tâche de remplissage créée",
            )
            .await;
            last_new_id = new_id;
        }
    } else {
        let title = format!("À valider : {} — {}", circuit_name.trim(), step_title.trim());
        let new_id = Uuid::new_v4().to_string();
        sqlx::query::<Any>(
            r#"INSERT INTO stock_collab_task (id, title, description, at, status, kind, visibility, created_by_user_id, visible_role_id, circuit_id, circuit_step_index, created_at, updated_at)
               VALUES (?1, ?2, '', ?3, 'pending', ?4, 'role', ?5, ?6, ?7, ?8, ?9, ?10)"#,
        )
        .bind(&new_id)
        .bind(&title)
        .bind(&at)
        .bind(kind)
        .bind(requester_user_id)
        .bind(validate_role_id.trim())
        .bind(circuit_id)
        .bind(step_index)
        .bind(&now)
        .bind(&now)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
        let _ = collab_task_log_action(
            &mut conn,
            &new_id,
            circuit_id,
            "created",
            requester_user_id,
            &requester_role_id,
            "Tâche de validation créée",
        )
        .await;
        last_new_id = new_id;
    }

    enc(&json!({ "success": true, "id": last_new_id }))
}

#[tauri::command]
pub async fn stock_list_form_templates(_payload: String) -> Result<Value, String> {
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let rows = sqlx::query::<Any>(
        "SELECT id, name, description, fields_json, is_system, screen_type, created_at, updated_at FROM stock_form_template ORDER BY screen_type COLLATE NOCASE, is_system DESC, name COLLATE NOCASE",
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for r in rows {
        list.push(json!({
            "id": r.try_get::<String, _>(0).unwrap_or_default(),
            "name": r.try_get::<String, _>(1).unwrap_or_default(),
            "description": r.try_get::<String, _>(2).unwrap_or_default(),
            "fieldsJson": r.try_get::<String, _>(3).unwrap_or_else(|_| "[]".to_string()),
            "isSystem": r.try_get::<i64, _>(4).unwrap_or(0) != 0,
            "screenType": normalize_form_template_screen_type(&r.try_get::<String, _>(5).unwrap_or_default()),
            "createdAt": r.try_get::<String, _>(6).unwrap_or_default(),
            "updatedAt": r.try_get::<String, _>(7).unwrap_or_default(),
        }));
    }
    enc(&json!({ "templates": list }))
}

#[tauri::command]
pub async fn stock_get_form_template(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p
        .body
        .as_ref()
        .and_then(|b| b.get("id"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("id requis")?;
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let row = sqlx::query::<Any>(
        "SELECT id, name, description, fields_json, is_system, screen_type, created_at, updated_at FROM stock_form_template WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let Some(r) = row else {
        return Err("Modèle introuvable".to_string());
    };
    enc(&json!({
        "template": {
            "id": r.try_get::<String, _>(0).unwrap_or_default(),
            "name": r.try_get::<String, _>(1).unwrap_or_default(),
            "description": r.try_get::<String, _>(2).unwrap_or_default(),
            "fieldsJson": r.try_get::<String, _>(3).unwrap_or_else(|_| "[]".to_string()),
            "isSystem": r.try_get::<i64, _>(4).unwrap_or(0) != 0,
            "screenType": normalize_form_template_screen_type(&r.try_get::<String, _>(5).unwrap_or_default()),
            "createdAt": r.try_get::<String, _>(6).unwrap_or_default(),
            "updatedAt": r.try_get::<String, _>(7).unwrap_or_default(),
        }
    }))
}

#[tauri::command]
pub async fn stock_upsert_form_template(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let id_in = obj.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
    let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
    if name.is_empty() {
        return Err("Nom du modèle requis".to_string());
    }
    let description = obj.get("description").and_then(|v| v.as_str()).unwrap_or("").trim();
    let screen_type = normalize_form_template_screen_type(
        obj.get("screenType")
            .or_else(|| obj.get("screen_type"))
            .and_then(|v| v.as_str())
            .unwrap_or("general"),
    );
    let fields_val = obj.get("fieldsJson").cloned().unwrap_or(Value::Array(vec![]));
    let fields_arr = fields_val.as_array().cloned().unwrap_or_default();
    let fields_json = serde_json::to_string(&Value::Array(fields_arr)).map_err(|e| e.to_string())?;

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if !id_in.is_empty() {
        let sys = sqlx::query::<Any>("SELECT is_system FROM stock_form_template WHERE id = ?1")
            .bind(id_in)
            .fetch_optional(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
        let is_system = sys.and_then(|r| r.try_get::<i64, _>(0).ok()).unwrap_or(0) != 0;
        if is_system {
            return Err("Le modèle « Mouvement de stock » est fourni par l’application et ne peut pas être modifié.".to_string());
        }
        sqlx::query::<Any>(
            "UPDATE stock_form_template SET name = ?1, description = ?2, fields_json = ?3, screen_type = ?4, updated_at = ?5 WHERE id = ?6",
        )
        .bind(name)
        .bind(description)
        .bind(&fields_json)
        .bind(&screen_type)
        .bind(&now)
        .bind(id_in)
        .execute(&mut conn)
        .await
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "Ce nom de modèle existe déjà".to_string()
            } else {
                e.to_string()
            }
        })?;
        return enc(&json!({ "success": true, "id": id_in }));
    }

    let new_id = Uuid::new_v4().to_string();
    sqlx::query::<Any>(
        "INSERT INTO stock_form_template (id, name, description, fields_json, is_system, screen_type, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7)",
    )
    .bind(&new_id)
    .bind(name)
    .bind(description)
    .bind(&fields_json)
    .bind(&screen_type)
    .bind(&now)
    .bind(&now)
    .execute(&mut conn)
    .await
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            "Ce nom de modèle existe déjà".to_string()
        } else {
            e.to_string()
        }
    })?;
    enc(&json!({ "success": true, "id": new_id }))
}

#[tauri::command]
pub async fn stock_delete_form_template(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("id requis")?;
    if id == STOCK_SYSTEM_MOVEMENT_FORM_TEMPLATE_ID {
        return Err("Le modèle système « Mouvement de stock » ne peut pas être supprimé.".to_string());
    }
    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;
    let sys = sqlx::query::<Any>("SELECT is_system FROM stock_form_template WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    let is_system = sys.and_then(|r| r.try_get::<i64, _>(0).ok()).unwrap_or(0) != 0;
    if is_system {
        return Err("Ce modèle système ne peut pas être supprimé.".to_string());
    }
    let r = sqlx::query::<Any>("DELETE FROM stock_form_template WHERE id = ?1")
        .bind(id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    enc(&json!({ "success": r.rows_affected() > 0 }))
}
