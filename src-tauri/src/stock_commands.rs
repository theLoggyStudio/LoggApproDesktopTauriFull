//! Gestion de stock — SQLite `dbap_stock.db` (création automatique des tables).

use base64::engine::general_purpose::STANDARD as B64_ENGINE;
use base64::Engine;
use chrono::Utc;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::io::Cursor;
use std::path::PathBuf;
use sqlx::any::{Any, AnyConnectOptions};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Acquire, AnyConnection, ConnectOptions, Connection, Row};
use std::collections::HashSet;
use std::str::FromStr;
use uuid::Uuid;

use crate::commands::parse_or_empty;
use crate::cript_key::resolve_cript_key;
use crate::db;
use crate::payload::encrypt_response;

/// Mot de passe initial si aucun mot de passe n'est fourni à la création (à communiquer à l'utilisateur).
const STOCK_APP_DEFAULT_PASSWORD: &str = "LoggAppro2026!";

/// Clés d'écran autorisées pour les privilèges (le droit « Mon compte » est toujours ajouté côté serveur).
const STOCK_PRIVILEGE_KEYS: &[&str] = &[
    "dashboard",
    "articles",
    "warehouse",
    "movements",
    "fournisseurs",
    "clients",
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
    "documents",
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
            FOREIGN KEY (article_id) REFERENCES stock_article (id)
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("stock_movement: {}", e))?;

    ensure_stock_party_and_migration(conn).await?;
    ensure_stock_app_user_schema(conn).await?;
    ensure_stock_ref_schema(conn).await?;
    ensure_stock_document_schema(conn).await?;

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
    Ok(())
}

async fn ensure_stock_app_user_schema(conn: &mut AnyConnection) -> Result<(), String> {
    sqlx::query::<Any>(
        r#"CREATE TABLE IF NOT EXISTS stock_app_user (
            id TEXT PRIMARY KEY,
            login TEXT NOT NULL COLLATE NOCASE,
            display_name TEXT NOT NULL DEFAULT '',
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
            UNIQUE(warehouse_id, name),
            FOREIGN KEY (warehouse_id) REFERENCES stock_ref_warehouse (id)
        )"#,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query::<Any>(
        "INSERT INTO stock_ref_location_new (id, warehouse_id, name, code, created_at) SELECT id, ?1, name, code, created_at FROM stock_ref_location",
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
    Ok(())
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
        "warehouse" => Ok("stock_ref_warehouse"),
        _ => Err("kind doit être unit, location, category ou warehouse".to_string()),
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
            "SELECT id, sku, name, category, unit, qty, min_qty, location, notes, updated_at FROM stock_article ORDER BY name COLLATE NOCASE",
        )
        .fetch_all(&mut conn)
        .await
    } else {
        let pat = format!("%{}%", search.replace('%', "\\%"));
        sqlx::query::<Any>(
            "SELECT id, sku, name, category, unit, qty, min_qty, location, notes, updated_at FROM stock_article WHERE sku LIKE ?1 ESCAPE '\\' OR name LIKE ?1 ESCAPE '\\' OR category LIKE ?1 ESCAPE '\\' ORDER BY name COLLATE NOCASE",
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
            "location": r.try_get::<String, _>(7).unwrap_or_default(),
            "notes": r.try_get::<String, _>(8).unwrap_or_default(),
            "updatedAt": r.try_get::<String, _>(9).unwrap_or_default(),
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
            "UPDATE stock_article SET sku = ?1, name = ?2, category = ?3, unit = ?4, qty = ?5, min_qty = ?6, location = ?7, notes = ?8, updated_at = ?9 WHERE id = ?10",
        )
        .bind(sku)
        .bind(name)
        .bind(category)
        .bind(unit)
        .bind(qty)
        .bind(min_qty)
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
            "INSERT INTO stock_article (id, sku, name, category, unit, qty, min_qty, location, notes, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        )
        .bind(&id)
        .bind(sku)
        .bind(name)
        .bind(category)
        .bind(unit)
        .bind(qty)
        .bind(min_qty)
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

#[tauri::command]
pub async fn stock_list_movements(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let article_filter = p
        .body
        .as_ref()
        .and_then(|b| b.get("articleId"))
        .and_then(|v| v.as_str());

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;

    let rows = if let Some(aid) = article_filter {
        if aid.is_empty() {
            sqlx::query::<Any>(
                r#"SELECT m.id, m.article_id, a.sku, a.name, m.move_type, m.qty, m.reason, m.ref_doc,
                          IFNULL(m.supplier_name,''), IFNULL(m.client_name,''), m.created_at,
                          (SELECT COUNT(*) FROM stock_document d WHERE d.movement_id = m.id),
                          IFNULL((SELECT GROUP_CONCAT(d.id, ',') FROM stock_document d WHERE d.movement_id = m.id), '')
                   FROM stock_movement m JOIN stock_article a ON a.id = m.article_id
                   ORDER BY m.created_at DESC LIMIT 500"#,
            )
            .fetch_all(&mut conn)
            .await
        } else {
            sqlx::query::<Any>(
                r#"SELECT m.id, m.article_id, a.sku, a.name, m.move_type, m.qty, m.reason, m.ref_doc,
                          IFNULL(m.supplier_name,''), IFNULL(m.client_name,''), m.created_at,
                          (SELECT COUNT(*) FROM stock_document d WHERE d.movement_id = m.id),
                          IFNULL((SELECT GROUP_CONCAT(d.id, ',') FROM stock_document d WHERE d.movement_id = m.id), '')
                   FROM stock_movement m JOIN stock_article a ON a.id = m.article_id
                   WHERE m.article_id = ?1 ORDER BY m.created_at DESC LIMIT 200"#,
            )
            .bind(aid)
            .fetch_all(&mut conn)
            .await
        }
    } else {
        sqlx::query::<Any>(
            r#"SELECT m.id, m.article_id, a.sku, a.name, m.move_type, m.qty, m.reason, m.ref_doc,
                      IFNULL(m.supplier_name,''), IFNULL(m.client_name,''), m.created_at,
                      (SELECT COUNT(*) FROM stock_document d WHERE d.movement_id = m.id),
                      IFNULL((SELECT GROUP_CONCAT(d.id, ',') FROM stock_document d WHERE d.movement_id = m.id), '')
               FROM stock_movement m JOIN stock_article a ON a.id = m.article_id
               ORDER BY m.created_at DESC LIMIT 500"#,
        )
        .fetch_all(&mut conn)
        .await
    }
    .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        let receipt_count: i64 = r.try_get(11).unwrap_or(0);
        let receipt_ids_s: String = r.try_get(12).unwrap_or_default();
        let receipt_document_ids: Vec<Value> = receipt_ids_s
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| json!(s))
            .collect();
        list.push(json!({
            "id": r.try_get::<String, _>(0).unwrap_or_default(),
            "articleId": r.try_get::<String, _>(1).unwrap_or_default(),
            "sku": r.try_get::<String, _>(2).unwrap_or_default(),
            "articleName": r.try_get::<String, _>(3).unwrap_or_default(),
            "moveType": r.try_get::<String, _>(4).unwrap_or_default(),
            "qty": r.try_get::<f64, _>(5).unwrap_or(0.0),
            "reason": r.try_get::<String, _>(6).unwrap_or_default(),
            "refDoc": r.try_get::<String, _>(7).unwrap_or_default(),
            "supplierName": r.try_get::<String, _>(8).unwrap_or_default(),
            "clientName": r.try_get::<String, _>(9).unwrap_or_default(),
            "createdAt": r.try_get::<String, _>(10).unwrap_or_default(),
            "receiptCount": receipt_count,
            "receiptDocumentIds": receipt_document_ids,
        }));
    }
    enc(&json!({ "movements": list }))
}

#[tauri::command]
pub async fn stock_add_movement(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or("Corps manquant")?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let article_id = obj
        .get("articleId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("articleId requis")?;
    let move_type = obj
        .get("moveType")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_uppercase();
    if !matches!(move_type.as_str(), "IN" | "OUT" | "ADJ") {
        return Err("moveType doit être IN, OUT ou ADJ".to_string());
    }
    let qty = obj.get("qty").and_then(|v| v.as_f64()).ok_or("qty requis")?;
    if qty <= 0.0 && move_type != "ADJ" {
        return Err("Quantité doit être positive".to_string());
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

    let mut conn = stock_connect().await?;
    ensure_stock_schema(&mut conn).await?;

    let row = sqlx::query::<Any>("SELECT qty FROM stock_article WHERE id = ?1")
        .bind(article_id)
        .fetch_optional(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    let current = match row {
        Some(r) => r.try_get::<f64, _>(0).map_err(|e| e.to_string())?,
        None => return Err("Article introuvable".to_string()),
    };

    let new_qty = match move_type.as_str() {
        "IN" => current + qty,
        "OUT" => {
            let n = current - qty;
            if n < 0.0 {
                return Err("Stock insuffisant pour cette sortie".to_string());
            }
            n
        }
        "ADJ" => qty,
        _ => unreachable!(),
    };

    let mid = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut tx = Acquire::begin(&mut conn).await.map_err(|e| e.to_string())?;
    sqlx::query::<Any>(
        "INSERT INTO stock_movement (id, article_id, move_type, qty, reason, ref_doc, supplier_name, client_name, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
    )
    .bind(&mid)
    .bind(article_id)
    .bind(move_type.as_str())
    .bind(qty)
    .bind(reason)
    .bind(ref_doc)
    .bind(supplier_name)
    .bind(client_name)
    .bind(&now)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query::<Any>("UPDATE stock_article SET qty = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(new_qty)
        .bind(&now)
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

    enc(&json!({ "success": true, "movementId": mid, "newQty": new_qty }))
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
        "SELECT id, kind, name, IFNULL(address,'') FROM stock_party WHERE kind = ?1 ORDER BY name COLLATE NOCASE",
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
            "UPDATE stock_party SET name = ?1, address = ?2 WHERE id = ?3 AND kind = ?4",
        )
        .bind(name)
        .bind(address)
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
            "INSERT OR IGNORE INTO stock_party (id, kind, name, address, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(&id)
        .bind(&kind)
        .bind(name)
        .bind(address)
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
pub async fn stock_test_remote_db(payload: String) -> Result<Value, String> {
    let _ = parse_or_empty(&payload);
    enc(&json!({
        "ok": false,
        "message": "Connexion distante non encore activée. Utilisez la base locale SQLite (créée automatiquement). Les champs hôte / port serviront à une future synchronisation."
    }))
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
        "SELECT id, login, display_name, password_hash, privileges_json FROM stock_app_user WHERE login = ?1 COLLATE NOCASE",
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
    let hash: String = row.try_get(3).map_err(|e| e.to_string())?;
    let priv_json: String = row.try_get(4).unwrap_or_else(|_| "[]".to_string());
    if !verify_stock_password(password, &hash) {
        return Err("Identifiants incorrects".to_string());
    }
    let mut privileges: Vec<String> = serde_json::from_str(&priv_json).unwrap_or_default();
    if !privileges.iter().any(|s| s == "user") {
        privileges.push("user".to_string());
        privileges.sort();
    }
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
        "SELECT id, login, display_name, privileges_json, created_at FROM stock_app_user ORDER BY login COLLATE NOCASE",
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for r in rows {
        let priv_json: String = r.try_get::<String, _>(3).unwrap_or_else(|_| "[]".to_string());
        let privileges: Vec<String> = serde_json::from_str(&priv_json).unwrap_or_default();
        list.push(json!({
            "id": r.try_get::<String, _>(0).unwrap_or_default(),
            "login": r.try_get::<String, _>(1).unwrap_or_default(),
            "displayName": r.try_get::<String, _>(2).unwrap_or_default(),
            "privileges": privileges,
            "createdAt": r.try_get::<String, _>(4).unwrap_or_default(),
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
    let password_plain = obj.get("password").and_then(|v| v.as_str()).unwrap_or("").trim();
    let priv_vec = obj
        .get("privileges")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let privileges = normalize_stock_privileges(&priv_vec);

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
        let priv_json =
            serde_json::to_string(&privileges).map_err(|e| e.to_string())?;
        sqlx::query::<Any>(
            "INSERT INTO stock_app_user (id, login, display_name, password_hash, privileges_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(&id)
        .bind(login)
        .bind(display_name)
        .bind(&hash)
        .bind(&priv_json)
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
        let priv_json =
            serde_json::to_string(&privileges).map_err(|e| e.to_string())?;
        sqlx::query::<Any>(
            "UPDATE stock_app_user SET login = ?1, display_name = ?2, password_hash = ?3, privileges_json = ?4, updated_at = ?5 WHERE id = ?6",
        )
        .bind(login)
        .bind(display_name)
        .bind(&new_hash)
        .bind(&priv_json)
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
                r#"SELECT l.id, l.name, l.code, l.created_at, l.warehouse_id, w.name
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
                r#"SELECT l.id, l.name, l.code, l.created_at, l.warehouse_id, w.name
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
            sqlx::query::<Any>(
                "INSERT INTO stock_ref_location (id, warehouse_id, name, code, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(&id)
            .bind(wid)
            .bind(name)
            .bind(code)
            .bind(&now)
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
            "UPDATE stock_ref_location SET name = ?1, code = ?2 WHERE id = ?3".to_string()
        } else {
            format!("UPDATE {} SET name = ?1, code = ?2 WHERE id = ?3", table)
        };
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
                    "location".into(),
                    "notes".into(),
                    "updatedAt".into(),
                ],
            );
            let rows = sqlx::query::<Any>(
                "SELECT id, sku, name, category, unit, qty, min_qty, location, notes, updated_at FROM stock_article ORDER BY sku COLLATE NOCASE",
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
                        r.try_get::<String, _>(7).unwrap_or_default(),
                        r.try_get::<String, _>(8).unwrap_or_default(),
                        r.try_get::<String, _>(9).unwrap_or_default(),
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
                    "articleId".into(),
                    "sku".into(),
                    "articleName".into(),
                    "moveType".into(),
                    "qty".into(),
                    "reason".into(),
                    "refDoc".into(),
                    "supplierName".into(),
                    "clientName".into(),
                    "createdAt".into(),
                ],
            );
            let rows = sqlx::query::<Any>(
                r#"SELECT m.id, m.article_id, a.sku, a.name, m.move_type, m.qty, m.reason, m.ref_doc,
                          IFNULL(m.supplier_name,''), IFNULL(m.client_name,''), m.created_at
                   FROM stock_movement m JOIN stock_article a ON a.id = m.article_id
                   ORDER BY m.created_at DESC"#,
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
                        r.try_get::<String, _>(6).unwrap_or_default(),
                        r.try_get::<String, _>(7).unwrap_or_default(),
                        r.try_get::<String, _>(8).unwrap_or_default(),
                        r.try_get::<String, _>(9).unwrap_or_default(),
                        r.try_get::<String, _>(10).unwrap_or_default(),
                    ],
                );
            }
            "mouvements_export.csv"
        }
        "fournisseurs" => {
            csv_push_row(
                &mut w,
                &["id".into(), "name".into(), "address".into(), "createdAt".into()],
            );
            let rows = sqlx::query::<Any>(
                "SELECT id, name, IFNULL(address,''), created_at FROM stock_party WHERE kind = 'SUPPLIER' ORDER BY name COLLATE NOCASE",
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
            "fournisseurs_export.csv"
        }
        "clients" => {
            csv_push_row(
                &mut w,
                &["id".into(), "name".into(), "address".into(), "createdAt".into()],
            );
            let rows = sqlx::query::<Any>(
                "SELECT id, name, IFNULL(address,''), created_at FROM stock_party WHERE kind = 'CLIENT' ORDER BY name COLLATE NOCASE",
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
                ],
            );
            let rows = if let Some(ref wid) = export_wh {
                sqlx::query::<Any>(
                    "SELECT id, warehouse_id, name, code, created_at FROM stock_ref_location WHERE warehouse_id = ?1 ORDER BY name COLLATE NOCASE",
                )
                .bind(wid)
                .fetch_all(&mut conn)
                .await
            } else {
                sqlx::query::<Any>(
                    "SELECT id, warehouse_id, name, code, created_at FROM stock_ref_location ORDER BY warehouse_id, name COLLATE NOCASE",
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
                if row.len() < 10 {
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
                let location = row.get(7).unwrap_or("");
                let notes = row.get(8).unwrap_or("");
                let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

                let existing = sqlx::query::<Any>("SELECT id FROM stock_article WHERE sku = ?1 COLLATE NOCASE")
                    .bind(sku)
                    .fetch_optional(&mut conn)
                    .await
                    .map_err(|e| e.to_string())?;
                if let Some(er) = existing {
                    let id_up: String = er.try_get(0).map_err(|e| e.to_string())?;
                    sqlx::query::<Any>(
                        "UPDATE stock_article SET name = ?1, category = ?2, unit = ?3, qty = ?4, min_qty = ?5, location = ?6, notes = ?7, updated_at = ?8 WHERE id = ?9",
                    )
                    .bind(name)
                    .bind(category)
                    .bind(unit)
                    .bind(qty)
                    .bind(min_qty)
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
                    "INSERT INTO stock_article (id, sku, name, category, unit, qty, min_qty, location, notes, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                )
                .bind(&new_id)
                .bind(sku)
                .bind(name)
                .bind(category)
                .bind(unit)
                .bind(qty)
                .bind(min_qty)
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
                if row.len() < 2 {
                    errors.push(format!("ligne {}: name et address requis", line_no + 2));
                    continue;
                }
                let name = row.get(1).unwrap_or("").trim();
                let address = row.get(2).unwrap_or("").trim();
                if name.is_empty() || address.is_empty() {
                    errors.push(format!("ligne {}: nom et adresse requis", line_no + 2));
                    continue;
                }
                let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
                let id = Uuid::new_v4().to_string();
                let r = sqlx::query::<Any>(
                    "INSERT OR IGNORE INTO stock_party (id, kind, name, address, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                )
                .bind(&id)
                .bind(kind)
                .bind(name)
                .bind(address)
                .bind(&now)
                .execute(&mut conn)
                .await;
                match r {
                    Ok(x) if x.rows_affected() > 0 => inserted += 1,
                    Ok(_) => {
                        let _ = sqlx::query::<Any>(
                            "UPDATE stock_party SET address = ?1 WHERE kind = ?2 AND name = ?3 COLLATE NOCASE",
                        )
                        .bind(address)
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
                let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
                let r = sqlx::query::<Any>(
                    "INSERT OR IGNORE INTO stock_ref_location (id, warehouse_id, name, code, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                )
                .bind(&rid)
                .bind(&wid)
                .bind(&name)
                .bind(&code)
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
        "ref_unit" | "ref_category" => {
            let tbl = ref_items_table(if table == "ref_unit" { "unit" } else { "category" })?;
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
                    "INSERT INTO stock_movement (id, article_id, move_type, qty, reason, ref_doc, supplier_name, client_name, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
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
