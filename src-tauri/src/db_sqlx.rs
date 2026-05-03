//! Couche SQLx - connexions multi-SGBD (SQLite, MySQL, PostgreSQL)
//! Remplace rusqlite pour une base commune et extensible.
//! Si dbapadmin semble corrompu, il est supprimé et recréé de zéro.

use crate::admin_schema;
use crate::crypto;
use sqlx::any::{Any, AnyConnectOptions};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{AnyConnection, ConnectOptions, Connection, Row};
use std::str::FromStr;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::fs;

use crate::db;

/// Configuration d'une base (lue depuis tab_config)
#[derive(Clone, Debug)]
pub struct DbConfig {
    pub db_type: String,
    pub path: String,
    pub host: String,
    pub port: String,
    pub name: String,
    pub user: String,
    pub password: String,
    pub ssl: String,
    pub schema: String,
}

impl Default for DbConfig {
    fn default() -> Self {
        Self {
            db_type: "sqlite".to_string(),
            path: String::new(),
            host: String::new(),
            port: String::new(),
            name: String::new(),
            user: String::new(),
            password: String::new(),
            ssl: "false".to_string(),
            schema: "public".to_string(),
        }
    }
}

fn url_encode(s: &str) -> String {
    urlencoding::encode(s).to_string()
}

/// Construit l'URL de connexion à partir de la config
pub fn build_connection_url(config: &DbConfig, color: &str) -> Result<String, String> {
    let db_type = config.db_type.to_lowercase();
    match db_type.as_str() {
        "sqlite" => {
            let path = if config.path.is_empty() {
                let dir = db::get_databases_dir();
                let db_name = crate::db::dbap_color_db_filename(color);
                dir.join(db_name)
            } else {
                let p = Path::new(&config.path);
                if p.is_dir() {
                    p.join(crate::db::dbap_color_db_filename(color))
                } else {
                    p.to_path_buf()
                }
            };
            let path_str = path.to_string_lossy().replace('\\', "/");
            Ok(format!("sqlite://{}", path_str))
        }
        "mysql" => {
            let host = if config.host.is_empty() { "localhost" } else { &config.host };
            let port = if config.port.is_empty() { "3306" } else { &config.port };
            let ssl = config.ssl == "true" || config.ssl == "require";
            let ssl_param = if ssl { "?ssl-mode=REQUIRED" } else { "" };
            Ok(format!(
                "mysql://{}:{}@{}:{}/{}{}",
                url_encode(&config.user),
                url_encode(&config.password),
                host,
                port,
                if config.name.is_empty() { "loggappro" } else { &config.name },
                ssl_param
            ))
        }
        "postgres" | "postgresql" => {
            let host = if config.host.is_empty() { "localhost" } else { &config.host };
            let port = if config.port.is_empty() { "5432" } else { &config.port };
            let ssl_mode = match config.ssl.as_str() {
                "true" | "require" => "require",
                _ => "prefer",
            };
            let schema = if config.schema.is_empty() { "public" } else { &config.schema };
            Ok(format!(
                "postgres://{}:{}@{}:{}/{}?sslmode={}&options=-c%20search_path%3D{}",
                url_encode(&config.user),
                url_encode(&config.password),
                host,
                port,
                if config.name.is_empty() { "loggappro" } else { &config.name },
                ssl_mode,
                schema
            ))
        }
        "sqlserver" => Err("SQL Server non supporté par SQLx (utilisez SQLite, MySQL ou PostgreSQL)".to_string()),
        _ => Err(format!("Type de base non supporté: {}", db_type)),
    }
}

/// Indique si une erreur SQLite suggère une base corrompue
fn is_corruption_error(err: &str) -> bool {
    let lower = err.to_lowercase();
    lower.contains("corrupt")
        || lower.contains("malformed")
        || lower.contains("not a database")
        || lower.contains("file is not a database")
        || lower.contains("database disk image is malformed")
        || lower.contains("sqlite_corrupt")
        || lower.contains("unable to open database")
        || lower.contains("disk i/o error")
        || lower.contains("database or disk is full")
}

/// Données d'un paiement pour backup avant recréation (conserver la dernière date)
#[derive(Clone, Debug, Default)]
pub struct PaymentBackup {
    pub id: String,
    pub cabinet_id: String,
    pub url_pdf: String,
    pub logg_id: String,
    pub date_creation: String,
    pub nombre_mois: i64,
    pub montant: f64,
    pub type_paiement: String,
    pub tab_id: String,
}

/// Tente de sauvegarder les paiements depuis tab_admin (table unique).
/// Retourne les paiements lisibles pour préserver au moins la dernière date de paiement.
pub async fn backup_admin_payments(conn: &mut AnyConnection) -> Vec<PaymentBackup> {
    let mut out = Vec::new();
    // Vérifier si tab_admin existe
    let exists: Result<(i64,), _> = sqlx::query_as::<Any, (i64,)>(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='tab_admin'",
    )
    .fetch_one(&mut *conn)
    .await;
    if exists.is_err() || exists.unwrap_or((0,)).0 == 0 {
        return out;
    }

    let schema = match admin_schema::load_schema() {
        Ok(s) => s,
        Err(_) => return out,
    };
    let cols = admin_schema::TAB_ADMIN_COLS;
    let sel = schema.select_cols_cast_datetime("tab_admin", cols, &["date_creation"]);
    let sql = format!("SELECT {} FROM tab_admin", sel);
    if let Ok(rows) = sqlx::query::<Any>(&sql).fetch_all(&mut *conn).await {
        for row in rows {
            let mut vals: Vec<String> = Vec::new();
            let mut ok = true;
            for i in 0..cols.len() {
                let v: String = match row.try_get(i) {
                    Ok(x) => x,
                    Err(_) => {
                        ok = false;
                        break;
                    }
                };
                let dec = schema.decrypt_value("tab_admin", cols[i], &v);
                match dec {
                    Ok(d) => vals.push(d),
                    Err(_) => {
                        ok = false;
                        break;
                    }
                }
            }
            if ok && vals.len() >= 8 {
                let tab_id = vals.get(3).map(|s| s.as_str()).unwrap_or("main").to_string();
                out.push(PaymentBackup {
                    id: vals[0].clone(),
                    cabinet_id: vals[1].clone(),
                    url_pdf: vals[2].clone(),
                    logg_id: vals[3].clone(),
                    date_creation: vals[4].clone(),
                    nombre_mois: vals[5].parse().unwrap_or(1),
                    montant: vals[6].parse().unwrap_or(0.0),
                    type_paiement: vals[7].clone(),
                    tab_id,
                });
            }
        }
    }
    out
}

/// Restaure les paiements sauvegardés dans la base admin recréée.
pub async fn restore_admin_payments(conn: &mut AnyConnection, backup: &[PaymentBackup], pays: &str) -> Result<(), String> {
    if backup.is_empty() {
        return Ok(());
    }
    ensure_tables_admin_sqlx(conn, pays, "main").await?;
    let schema = admin_schema::load_or_init_schema(conn).await?;
    let cols = admin_schema::TAB_ADMIN_COLS;
    let ins = schema.insert_cols("tab_admin", cols);

    for p in backup {
        let enc_id = schema.encrypt_value("tab_admin", "id", &p.id)?;
        let enc_cab = schema.encrypt_value("tab_admin", "cabinet_id", &p.cabinet_id)?;
        let enc_url = schema.encrypt_value("tab_admin", "url_pdf", &p.url_pdf)?;
        let enc_logg = schema.encrypt_value("tab_admin", "logg_id", &p.logg_id)?;
        let enc_dc = schema.encrypt_value("tab_admin", "date_creation", &p.date_creation)?;
        let enc_n = schema.encrypt_value("tab_admin", "nombre_mois", &p.nombre_mois.to_string())?;
        let enc_m = schema.encrypt_value("tab_admin", "montant", &p.montant.to_string())?;
        let enc_tp = schema.encrypt_value("tab_admin", "type_paiement", &p.type_paiement)?;

        let sql = format!(
            "INSERT OR REPLACE INTO tab_admin ({}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            ins
        );
        sqlx::query::<Any>(&sql)
            .bind(&enc_id)
            .bind(&enc_cab)
            .bind(&enc_url)
            .bind(&enc_logg)
            .bind(&enc_dc)
            .bind(&enc_n)
            .bind(&enc_m)
            .bind(&enc_tp)
            .execute(&mut *conn)
            .await
            .map_err(|e| format!("Restore paiement: {}", e))?;
        let _ = crate::last_payment_file::save_last_payment_date(&p.cabinet_id, &p.tab_id, &p.date_creation);
    }
    Ok(())
}

/// Recrée dbapadmin en préservant les paiements (dernière date de paiement).
/// À appeler quand le déchiffrement échoue (clé incorrecte).
/// Prend la connexion en entrée pour le backup, retourne une nouvelle connexion.
pub async fn recreate_admin_preserving_payments(conn: AnyConnection) -> Result<AnyConnection, String> {
    let mut conn = conn;
    let backup = backup_admin_payments(&mut conn).await;
    drop(conn);
    delete_admin_db_and_schema();
    let mut new_conn = connect_admin_fresh().await?;
    ensure_tables_admin_sqlx(&mut new_conn, "sn", "main").await?;
    restore_admin_payments(&mut new_conn, &backup, "sn").await?;
    Ok(new_conn)
}

/// Supprime uniquement dbapadmin.db et le fichier schéma associé.
/// Utilisé quand la base admin semble corrompue pour la recréer de zéro.
pub fn delete_admin_db_and_schema() {
    let admin_path = admin_db_path();
    let schema_path = db::get_databases_dir().join("lpd_admin_schema.dat");
    let _ = fs::remove_file(&admin_path);
    let _ = fs::remove_file(&schema_path);
    // Supprimer aussi les fichiers WAL et SHM de SQLite si présents
    let _ = fs::remove_file(admin_path.with_extension("db-wal"));
    let _ = fs::remove_file(admin_path.with_extension("db-shm"));
}

/// Préfixe pour distinguer les configs par tab dans la table unique tab_config.
fn config_key_with_tab(tab_id: &str, key: &str) -> String {
    format!("{}__{}", tab_id, key)
}

/// Résout les noms **physiques** de `tab_config` : (clé, valeur, date_creation).
///
/// 1. Mapping du fichier `lpd_admin_schema.dat` si les colonnes existent dans la table.
/// 2. Sinon noms logiques `config_key` / `config_value` / `date_creation`.
/// 3. Sinon les colonnes dans l’ordre PRAGMA `cid` : la table a été créée avec d’**autres** noms obfusqués
///    alors que `lpd_admin_schema.dat` a été régénéré (`CREATE IF NOT EXISTS` ne recrée pas la table).
pub async fn resolve_tab_config_phys_cols_full(
    conn: &mut AnyConnection,
    schema: &admin_schema::AdminSchema,
) -> Result<(String, String, String), String> {
    let key_mapped = schema.col_or_logical("tab_config", "config_key");
    let val_mapped = schema.col_or_logical("tab_config", "config_value");
    let dt_mapped = schema.col_or_logical("tab_config", "date_creation");

    let rows = sqlx::query::<Any>("PRAGMA table_info(tab_config)")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| format!("PRAGMA tab_config: {}", e))?;

    let names: HashSet<String> = rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>(1).ok())
        .collect();

    let mut cols: Vec<(i64, String)> = rows
        .iter()
        .filter_map(|r| {
            let cid: i64 = r.try_get(0).ok()?;
            let name: String = r.try_get(1).ok()?;
            Some((cid, name))
        })
        .collect();
    cols.sort_by_key(|(cid, _)| *cid);

    if names.contains(&key_mapped) && names.contains(&val_mapped) {
        let dt = if names.contains(&dt_mapped) {
            dt_mapped
        } else if cols.len() >= 3 {
            cols[2].1.clone()
        } else {
            return Err("tab_config: colonne date absente.".to_string());
        };
        return Ok((key_mapped, val_mapped, dt));
    }
    if names.contains("config_key") && names.contains("config_value") {
        let dt = if names.contains("date_creation") {
            "date_creation".to_string()
        } else if cols.len() >= 3 {
            cols[2].1.clone()
        } else {
            return Err("tab_config (legacy): colonne date absente.".to_string());
        };
        return Ok((
            "config_key".to_string(),
            "config_value".to_string(),
            dt,
        ));
    }

    if cols.len() >= 3 {
        return Ok((cols[0].1.clone(), cols[1].1.clone(), cols[2].1.clone()));
    }

    Err(format!(
        "tab_config: colonnes non reconnues (attendu ≥3 colonnes ou mapping connu). Colonnes : {:?}.",
        names
    ))
}

/// Identifiant SQL sûr (obfusqué alphanum + `_`).
pub(crate) fn quote_sql_ident(name: &str) -> String {
    if name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        name.to_string()
    } else {
        format!("\"{}\"", name.replace('"', "\"\""))
    }
}

/// Colonnes physiques d’une table admin (`tab_task`, `tab_trace`, …) dans l’ordre des noms logiques,
/// lorsque `lpd_admin_schema.dat` ne correspond plus à la table SQLite (même principe que `tab_config`).
pub async fn resolve_admin_table_phys_cols_ordered(
    conn: &mut AnyConnection,
    schema: &admin_schema::AdminSchema,
    sqlite_table: &str,
    logical_cols: &[&str],
) -> Result<Vec<String>, String> {
    let pragma = format!("PRAGMA table_info({})", sqlite_table);
    let rows = sqlx::query::<Any>(&pragma)
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| format!("PRAGMA {}: {}", sqlite_table, e))?;

    let names: HashSet<String> = rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>(1).ok())
        .collect();

    let mut sorted: Vec<(i64, String)> = rows
        .iter()
        .filter_map(|r| {
            let cid: i64 = r.try_get(0).ok()?;
            let name: String = r.try_get(1).ok()?;
            Some((cid, name))
        })
        .collect();
    sorted.sort_by_key(|(cid, _)| *cid);

    let mut mapped: Vec<String> = Vec::new();
    let mut ok_mapped = true;
    for &log in logical_cols {
        let Some(phys) = schema.col(sqlite_table, log) else {
            ok_mapped = false;
            break;
        };
        if !names.contains(phys) {
            ok_mapped = false;
            break;
        }
        mapped.push(phys.to_string());
    }
    if ok_mapped && mapped.len() == logical_cols.len() {
        return Ok(mapped);
    }

    let mut ok_legacy = true;
    for &log in logical_cols {
        if !names.contains(log) {
            ok_legacy = false;
            break;
        }
    }
    if ok_legacy {
        return Ok(logical_cols.iter().map(|s| (*s).to_string()).collect());
    }

    if sorted.len() == logical_cols.len() {
        return Ok(sorted.into_iter().map(|(_, n)| n).collect());
    }

    Err(format!(
        "{}: nombre ou noms de colonnes incompatibles avec le schéma (attendu {} colonnes, PRAGMA en a {}).",
        sqlite_table,
        logical_cols.len(),
        sorted.len()
    ))
}

/// Liste SELECT avec `CAST(... AS TEXT)` sur les colonnes datetime (évite soucis SQLx Any + SQLite DATETIME).
pub fn admin_select_cols_cast_datetime(
    phys_in_logical_order: &[String],
    logical_cols: &[&str],
    datetime_logical: &[&str],
) -> String {
    phys_in_logical_order
        .iter()
        .zip(logical_cols.iter())
        .map(|(phys, log)| {
            let q = quote_sql_ident(phys);
            if datetime_logical.contains(log) {
                format!("CAST({} AS TEXT)", q)
            } else {
                q
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn admin_insert_cols_list(phys_in_logical_order: &[String]) -> String {
    phys_in_logical_order
        .iter()
        .map(|p| quote_sql_ident(p))
        .collect::<Vec<_>>()
        .join(", ")
}

/// Lit la config d'une base depuis tab_config (admin)
/// Utilise le schéma obfusqué et déchiffre les valeurs.
pub async fn get_db_config_from_admin(
    conn: &mut AnyConnection,
    tab_id: &str,
    color: &str,
) -> Result<DbConfig, String> {
    let tab_id = db::sanitize_tab_id(tab_id);
    let schema = admin_schema::load_schema().map_err(|e| format!("Schéma admin: {}", e))?;
    let (key_col, val_col, _) = resolve_tab_config_phys_cols_full(conn, &schema).await?;

    let keys = [
        format!("db_type_{}", color),
        format!("db_path_{}", color),
        format!("db_host_{}", color),
        format!("db_port_{}", color),
        format!("db_name_{}", color),
        format!("db_user_{}", color),
        format!("db_password_{}", color),
        format!("db_ssl_{}", color),
        format!("db_schema_{}", color),
        "db_path".to_string(),
    ];
    let full_keys: Vec<String> = keys.iter().map(|k| config_key_with_tab(&tab_id, k)).collect();

    let enc_keys: Vec<String> = full_keys
        .iter()
        .filter_map(|k| schema.encrypt_value("tab_config", "config_key", k).ok())
        .collect();
    let in_clause = enc_keys
        .iter()
        .map(|k| format!("'{}'", k.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT {}, {} FROM tab_config WHERE {} IN ({})",
        key_col, val_col, key_col, in_clause
    );

    let rows = sqlx::query::<Any>(&sql).fetch_all(&mut *conn).await.map_err(|e| format!("Lecture config: {}", e))?;
    let mut map: HashMap<String, String> = HashMap::new();
    let prefix = format!("{}__", tab_id);
    for row in rows {
        let k_enc: String = row.try_get(0).map_err(|e| format!("Col config_key: {}", e))?;
        let v_enc: Option<String> = row.try_get(1).ok();
        let k_full = schema.decrypt_value_or_fail("tab_config", "config_key", &k_enc)?;
        let k = k_full.strip_prefix(&prefix).unwrap_or(&k_full).to_string();
        let v = schema.decrypt_value_or_fail("tab_config", "config_value", &v_enc.unwrap_or_default())?;
        map.insert(k, v);
    }

    let mut cfg = DbConfig::default();
    cfg.db_type = map.get(&format!("db_type_{}", color)).cloned().unwrap_or_else(|| "sqlite".to_string());
    cfg.path = map.get("db_path").or_else(|| map.get(&format!("db_path_{}", color))).cloned().unwrap_or_default();
    cfg.host = map.get(&format!("db_host_{}", color)).cloned().unwrap_or_default();
    cfg.port = map.get(&format!("db_port_{}", color)).cloned().unwrap_or_default();
    cfg.name = map.get(&format!("db_name_{}", color)).cloned().unwrap_or_default();
    cfg.user = map.get(&format!("db_user_{}", color)).cloned().unwrap_or_default();
    cfg.password = map.get(&format!("db_password_{}", color)).cloned().unwrap_or_default();
    cfg.ssl = map.get(&format!("db_ssl_{}", color)).cloned().unwrap_or_else(|| "false".to_string());
    cfg.schema = map.get(&format!("db_schema_{}", color)).cloned().unwrap_or_else(|| "public".to_string());

    Ok(cfg)
}

/// Chemin du fichier admin (dbapadmin.db)
pub fn admin_db_path() -> std::path::PathBuf {
    db::get_db_path("", "admin", None)
}

/// Ouvre une connexion à la base admin (SQLite).
/// Si dbapadmin semble corrompu, le supprime et le recrée de zéro.
pub async fn connect_admin() -> Result<AnyConnection, String> {
    let path = admin_db_path();
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Création répertoire admin: {}", e))?;
    }

    let opts = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true);

    let url = opts.to_url_lossy();
    let any_opts = AnyConnectOptions::from_str(url.as_str())
        .map_err(|e| format!("Options admin: {}", e))?;

    match AnyConnection::connect_with(&any_opts).await {
        Ok(mut conn) => {
            // Vérification d'intégrité : SELECT 1 et PRAGMA integrity_check
            if let Err(e) = sqlx::query::<Any>("SELECT 1").fetch_one(&mut conn).await {
                let err_str = e.to_string();
                if is_corruption_error(&err_str) {
                    drop(conn);
                    delete_admin_db_and_schema();
                    return connect_admin_fresh().await;
                }
                return Err(format!("Vérification admin: {}", err_str));
            }
            // PRAGMA integrity_check : détecte la corruption même si SELECT 1 réussit
            if let Ok(rows) = sqlx::query::<Any>("PRAGMA integrity_check").fetch_all(&mut conn).await {
                if let Some(row) = rows.first() {
                    if let Ok(val) = row.try_get::<String, _>(0) {
                        if val.to_lowercase() != "ok" {
                            drop(conn);
                            delete_admin_db_and_schema();
                            return connect_admin_fresh().await;
                        }
                    }
                }
            }
            Ok(conn)
        }
        Err(e) => {
            let err_str = e.to_string();
            if is_corruption_error(&err_str) && path.exists() {
                delete_admin_db_and_schema();
                connect_admin_fresh().await
            } else {
                Err(format!("Connexion admin: {}", err_str))
            }
        }
    }
}

/// Connexion admin sans vérification préalable (utilisé après suppression)
pub async fn connect_admin_fresh() -> Result<AnyConnection, String> {
    let path = admin_db_path();
    let opts = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true);
    let url = opts.to_url_lossy();
    let any_opts = AnyConnectOptions::from_str(url.as_str())
        .map_err(|e| format!("Options admin: {}", e))?;
    AnyConnection::connect_with(&any_opts)
        .await
        .map_err(|e| format!("Connexion admin (recréation): {}", e))
}

/// Chemin du fichier pour une base SQLite colorée (yellow, green, blue, etc.)
fn sqlite_path_from_config(config: &DbConfig, color: &str) -> std::path::PathBuf {
    if config.path.is_empty() {
        db::get_databases_dir().join(db::dbap_color_db_filename(color))
    } else {
        let p = Path::new(&config.path);
        if p.is_dir() {
            p.join(db::dbap_color_db_filename(color))
        } else {
            p.to_path_buf()
        }
    }
}

/// Connexion à une base colorée (yellow, green, blue, etc.) en lisant la config depuis admin
pub async fn connect_db_async(
    pays: &str,
    tab_id: &str,
    color: &str,
) -> Result<AnyConnection, String> {
    if color == "admin" {
        return connect_admin().await;
    }

    let mut admin = connect_admin().await?;
    let config = loop {
        match ensure_tables_admin_sqlx(&mut admin, pays, tab_id).await {
            Ok(()) => {}
            Err(e) if e.contains("Déchiffrement") => {
                admin = recreate_admin_preserving_payments(admin).await?;
                continue;
            }
            Err(e) => return Err(e),
        }
        match get_db_config_from_admin(&mut admin, tab_id, color).await {
            Ok(cfg) => break cfg,
            Err(e) if e == admin_schema::ADMIN_DECRYPT_FAILED => {
                admin = recreate_admin_preserving_payments(admin).await?;
            }
            Err(e) => return Err(e),
        }
    };

    if config.db_type.to_lowercase() == "sqlite" {
        let db_path = sqlite_path_from_config(&config, color);
        if let Some(parent) = db_path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        let opts = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);
        let url = opts.to_url_lossy();
        let any_opts = AnyConnectOptions::from_str(url.as_str())
            .map_err(|e| format!("Options {}: {}", color, e))?;
        AnyConnection::connect_with(&any_opts)
            .await
            .map_err(|e| format!("Connexion {}: {}", color, e))
    } else {
        let conn_url = build_connection_url(&config, color)?;
        let opts = AnyConnectOptions::from_str(&conn_url).map_err(|e| format!("URL {}: {}", color, e))?;
        AnyConnection::connect_with(&opts).await.map_err(|e| format!("Connexion {}: {}", color, e))
    }
}

/// Crée les tables admin (tab_trace, tab_task, tab_config, tab_admin, tab_tuto) - version SQLx
/// Tables uniques pour tout le projet : dbapadmin = base centrale partagée par tous les utilisateurs.
pub async fn ensure_tables_admin_sqlx(
    conn: &mut AnyConnection,
    _pays: &str,
    _tab_id: &str,
) -> Result<(), String> {
    let schema = admin_schema::load_or_init_schema(conn).await?;

    let c = |t: &str, l: &str| schema.col_or_logical(t, l);

    let trace_sql = format!(
        r#"CREATE TABLE IF NOT EXISTS tab_trace (
            {} TEXT PRIMARY KEY,
            {} TEXT,
            {} TEXT,
            {} TEXT,
            {} TEXT,
            {} DATETIME,
            {} TEXT,
            {} TEXT,
            {} TEXT,
            {} TEXT,
            {} TEXT
        )"#,
        c("tab_trace", "id"),
        c("tab_trace", "action"),
        c("tab_trace", "type_entite"),
        c("tab_trace", "nom_entite"),
        c("tab_trace", "id_entite"),
        c("tab_trace", "date_action"),
        c("tab_trace", "user_id"),
        c("tab_trace", "user_nom"),
        c("tab_trace", "user_role"),
        c("tab_trace", "details"),
        c("tab_trace", "logg_id"),
    );
    sqlx::query::<Any>(&trace_sql).execute(&mut *conn).await.map_err(|e| format!("Create tab_trace: {}", e))?;

    let task_sql = format!(
        r#"CREATE TABLE IF NOT EXISTS tab_task (
            {} TEXT PRIMARY KEY,
            {} TEXT NOT NULL,
            {} TEXT,
            {} DATETIME,
            {} DATETIME,
            {} TEXT,
            {} TEXT,
            {} TEXT,
            {} TEXT DEFAULT 'pending'
        )"#,
        c("tab_task", "id"),
        c("tab_task", "titre"),
        c("tab_task", "description"),
        c("tab_task", "date_rappel"),
        c("tab_task", "date_creation"),
        c("tab_task", "user_id"),
        c("tab_task", "user_nom"),
        c("tab_task", "logg_id"),
        c("tab_task", "statut"),
    );
    sqlx::query::<Any>(&task_sql).execute(&mut *conn).await.map_err(|e| format!("Create tab_task: {}", e))?;

    let admin_sql = format!(
        r#"CREATE TABLE IF NOT EXISTS tab_admin (
            {} TEXT PRIMARY KEY,
            {} TEXT,
            {} TEXT,
            {} TEXT,
            {} DATETIME DEFAULT CURRENT_TIMESTAMP,
            {} INTEGER DEFAULT 1,
            {} REAL,
            {} TEXT
        )"#,
        c("tab_admin", "id"),
        c("tab_admin", "cabinet_id"),
        c("tab_admin", "url_pdf"),
        c("tab_admin", "logg_id"),
        c("tab_admin", "date_creation"),
        c("tab_admin", "nombre_mois"),
        c("tab_admin", "montant"),
        c("tab_admin", "type_paiement"),
    );
    sqlx::query::<Any>(&admin_sql).execute(&mut *conn).await.map_err(|e| format!("Create tab_admin: {}", e))?;

    let pay_anchor_sql = format!(
        r#"CREATE TABLE IF NOT EXISTS tab_pay_anchor (
            {} TEXT PRIMARY KEY,
            {} TEXT, {} TEXT, {} TEXT, {} TEXT, {} TEXT,
            {} TEXT, {} TEXT, {} TEXT, {} TEXT, {} TEXT
        )"#,
        c("tab_pay_anchor", "cabinet_id"),
        c("tab_pay_anchor", "anchor_0"),
        c("tab_pay_anchor", "anchor_1"),
        c("tab_pay_anchor", "anchor_2"),
        c("tab_pay_anchor", "anchor_3"),
        c("tab_pay_anchor", "anchor_4"),
        c("tab_pay_anchor", "anchor_5"),
        c("tab_pay_anchor", "anchor_6"),
        c("tab_pay_anchor", "anchor_7"),
        c("tab_pay_anchor", "anchor_8"),
        c("tab_pay_anchor", "anchor_9"),
    );
    sqlx::query::<Any>(&pay_anchor_sql)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Create tab_pay_anchor: {}", e))?;

    let config_sql = format!(
        r#"CREATE TABLE IF NOT EXISTS tab_config (
            {} TEXT PRIMARY KEY,
            {} TEXT,
            {} DATETIME DEFAULT CURRENT_TIMESTAMP
        )"#,
        c("tab_config", "config_key"),
        c("tab_config", "config_value"),
        c("tab_config", "date_creation"),
    );
    sqlx::query::<Any>(&config_sql).execute(&mut *conn).await.map_err(|e| format!("Create tab_config: {}", e))?;

    let tuto_sql = format!(
        r#"CREATE TABLE IF NOT EXISTS tab_tuto (
            {} TEXT PRIMARY KEY,
            {} TEXT NOT NULL,
            {} TEXT NOT NULL,
            {} DATETIME DEFAULT CURRENT_TIMESTAMP
        )"#,
        c("tab_tuto", "id"),
        c("tab_tuto", "titre"),
        c("tab_tuto", "url"),
        c("tab_tuto", "date_creation"),
    );
    sqlx::query::<Any>(&tuto_sql)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Create tab_tuto: {}", e))?;

    let pk_col = c("tab_tuto", "id");
    let count_sql = "SELECT COUNT(*) FROM tab_tuto";
    let count: (i64,) = sqlx::query_as::<Any, (i64,)>(count_sql)
        .fetch_one(&mut *conn)
        .await
        .map_err(|e| format!("Count tuto: {}", e))?;
    if count.0 == 0 {
        let defaults = [
            ("1", "Comment s'authentifier?", "8SRSFLnAnsQ"),
            ("2", "Comment manipuler un Patient ?", "d6AjoZgDqLc"),
            ("3", "Comment manipuler un Assistant, un Comptable(e) ou un(e) Secretaire ?", "YowYEQEshRc"),
            ("4", "Comment modifier son profile ?", "4ac_nbBV0_E"),
            ("5", "Comment manipuler un acte effectuer sur un patient ?", "r9CPy8ynJ80"),
            ("6", "Comment manipuler une nouvelle assurance ou un nouvel acte ?", "8oqW-_T0LKQ"),
            ("7", "Comment effectuer le payement d'un nouveau mois ?", "BHMe8S6B1fw"),
            ("8", "Comment fonctionne les qr code ?", "5BPGZxImZGc"),
        ];
        let tit_col = c("tab_tuto", "titre");
        let url_col = c("tab_tuto", "url");
        let dt_col = c("tab_tuto", "date_creation");
        for (id, titre, url) in defaults {
            let enc_id = schema.encrypt_value("tab_tuto", "id", id)?;
            let enc_titre = schema.encrypt_value("tab_tuto", "titre", titre)?;
            let enc_url = schema.encrypt_value("tab_tuto", "url", url)?;
            let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let enc_now = schema.encrypt_value("tab_tuto", "date_creation", &now)?;
            let sql = format!(
                "INSERT OR IGNORE INTO tab_tuto ({}, {}, {}, {}) VALUES (?1, ?2, ?3, ?4)",
                pk_col, tit_col, url_col, dt_col
            );
            let _ = sqlx::query::<Any>(&sql)
                .bind(&enc_id)
                .bind(&enc_titre)
                .bind(&enc_url)
                .bind(&enc_now)
                .execute(&mut *conn)
                .await;
        }
    }

    let tab_id = db::sanitize_tab_id(_tab_id);
    let (key_col, val_col, dt_col) = resolve_tab_config_phys_cols_full(conn, &schema).await?;
    let default_dir = db::get_databases_dir().to_string_lossy().to_string();
    let default_keys: Vec<(&str, String)> = vec![
        ("db_path", default_dir.clone()),
        ("db_path_yellow", String::new()),
        ("db_path_green", String::new()),
        ("db_path_blue", String::new()),
        ("db_path_orange", String::new()),
        ("db_path_pink", String::new()),
        ("db_type_yellow", "sqlite".to_string()),
        ("db_type_green", "sqlite".to_string()),
        ("db_type_blue", "sqlite".to_string()),
        ("db_type_orange", "sqlite".to_string()),
        ("db_type_pink", "sqlite".to_string()),
    ];
    for (k, v) in default_keys {
        let k_full = config_key_with_tab(&tab_id, k);
        let enc_k = schema.encrypt_value("tab_config", "config_key", &k_full)?;
        let enc_v = schema.encrypt_value("tab_config", "config_value", &v)?;
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let enc_now = schema.encrypt_value("tab_config", "date_creation", &now)?;
        let sql = format!(
            "INSERT OR IGNORE INTO tab_config ({}, {}, {}) VALUES (?1, ?2, ?3)",
            key_col, val_col, dt_col
        );
        let _ = sqlx::query::<Any>(&sql)
            .bind(&enc_k)
            .bind(&enc_v)
            .bind(&enc_now)
            .execute(&mut *conn)
            .await;
    }

    // Clés Paydunya par défaut : pré-remplies à la création de la base admin.
    // Chiffrées en base (schema + crypto paydunya). Colonnes obfusquées via admin_schema.
    const PAYDUNYA_TAB: &str = "main";
    let paydunya_defaults: Vec<(&str, &str, bool)> = vec![
        ("paydunya_mode", "live", false),
        ("paydunya_cle_principale", "8jDTnfR6-25sS-94kF-fBuh-a5s6C5UJbdtm", true),
        ("paydunya_test_cle_publique", "test_public_UzE0PqlVqhjf7bzmStRpmChXgKI", true),
        ("paydunya_test_cle_privee", "test_private_74LEmZgM65BJLVzuZ5s2ODCoa7M", true),
        ("paydunya_test_token", "7aILsd4vEPOrKU7qu064", true),
        ("paydunya_live_cle_publique", "live_public_h4ug6k8gw19vlgBLyIkxpcgf71t", true),
        ("paydunya_live_cle_privee", "live_private_lSDpGBMTTSd9VXD4z2NDjfpquNl", true),
        ("paydunya_live_token", "xFThh2NhJIWIzfI66ltt", true),
    ];
    let now_pay = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let enc_now_pay = schema.encrypt_value("tab_config", "date_creation", &now_pay)?;
    for (k, v, encrypt_val) in paydunya_defaults {
        let k_full = config_key_with_tab(PAYDUNYA_TAB, k);
        let enc_k = schema.encrypt_value("tab_config", "config_key", &k_full)?;
        let to_store = if encrypt_val && !v.is_empty() {
            crypto::encrypt_paydunya_key(v).unwrap_or_else(|_| v.to_string())
        } else {
            v.to_string()
        };
        let enc_v = schema.encrypt_value("tab_config", "config_value", &to_store)?;
        let sql_pay = format!(
            "INSERT OR IGNORE INTO tab_config ({}, {}, {}) VALUES (?1, ?2, ?3)",
            key_col, val_col, dt_col
        );
        let _ = sqlx::query::<Any>(&sql_pay)
            .bind(&enc_k)
            .bind(&enc_v)
            .bind(&enc_now_pay)
            .execute(&mut *conn)
            .await;
    }

    Ok(())
}

/// Supprime les anciennes tables `tab_<nom><suffixe>` (main, uuid, etc.) — aligné sur `db::drop_legacy_suffixed_tables`.
async fn drop_legacy_suffixed_tables_any(conn: &mut AnyConnection) -> Result<(), String> {
    let rows = sqlx::query_scalar::<_, String>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;
    const PREFIXES: &[&str] = &[
        "tab_acte_materiel",
        "tab_type_collaborateur",
        "tab_type_docteur",
        "tab_posologie",
        "tab_medicament",
        "tab_nom_materiel",
        "tab_nom_assurance",
        "tab_nom_acte",
        "tab_modele_etat",
        "tab_collaborateur",
        "tab_secretaire",
        "tab_comptable",
        "tab_assistant",
        "tab_docteur",
        "tab_patient",
        "tab_privilege",
        "tab_cabinet",
        "tab_facture",
        "tab_assurance",
        "tab_acte",
        "tab_photo",
        "tab_trace",
        "tab_task",
        "tab_admin",
        "tab_config",
        "tab_user",
    ];
    const KEEP: &[&str] = &[
        "tab_connection",
        "tab_tuto",
        "tab_pay_anchor",
        "tab_user",
        "tab_patient",
        "tab_docteur",
        "tab_assistant",
        "tab_comptable",
        "tab_secretaire",
        "tab_collaborateur",
        "tab_cabinet",
        "tab_privilege",
        "tab_type_collaborateur",
        "tab_type_docteur",
        "tab_nom_acte",
        "tab_nom_assurance",
        "tab_nom_materiel",
        "tab_modele_etat",
        "tab_posologie",
        "tab_medicament",
        "tab_acte",
        "tab_assurance",
        "tab_facture",
        "tab_acte_materiel",
        "tab_photo",
        "tab_trace",
        "tab_task",
        "tab_admin",
        "tab_config",
    ];
    for t in rows {
        if KEEP.iter().any(|&k| k == t.as_str()) {
            continue;
        }
        for prefix in PREFIXES {
            if t.starts_with(prefix) && t.len() > prefix.len() {
                let vt = db::validate_table_name(&t)?;
                let _ = sqlx::query::<Any>(&format!("DROP TABLE IF EXISTS {}", vt))
                    .execute(&mut *conn)
                    .await;
                break;
            }
        }
    }
    Ok(())
}

/// Crée les tables dynamiques yellow (users, patients, docteurs, etc.)
pub async fn ensure_tables_sqlx(conn: &mut AnyConnection, tab_id: &str) -> Result<(), String> {
    let _ = db::sanitize_tab_id(tab_id);
    drop_legacy_suffixed_tables_any(conn).await?;
    let tables = [
        r#"CREATE TABLE IF NOT EXISTS tab_user (
                id TEXT PRIMARY KEY,
                nom TEXT, prenom TEXT, login TEXT UNIQUE, password TEXT,
                telephone TEXT UNIQUE, naissance TEXT, role TEXT, adresse TEXT,
                logg_id TEXT, date_creation DATETIME
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_patient (
                id TEXT PRIMARY KEY,
                nom_de_jeune_fille TEXT, profession TEXT, adresserPar TEXT,
                observation TEXT, date_creation DATETIME, avoir_annuelle TEXT DEFAULT '0'
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_docteur (
                id TEXT PRIMARY KEY, date_creation DATETIME, logg_id TEXT
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_assistant (
                id TEXT PRIMARY KEY, date_creation DATETIME, logg_id TEXT
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_comptable (
                id TEXT PRIMARY KEY, date_creation DATETIME, logg_id TEXT
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_secretaire (
                id TEXT PRIMARY KEY, date_creation DATETIME, logg_id TEXT
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_collaborateur (
                id TEXT PRIMARY KEY, type_id TEXT NOT NULL, date_creation DATETIME, logg_id TEXT
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_connection (
            id TEXT PRIMARY KEY, logg_id TEXT, telephone TEXT UNIQUE,
            login TEXT UNIQUE, password TEXT, role TEXT
        )"#,
    ];
    for sql in &tables {
        sqlx::query::<Any>(*sql).execute(&mut *conn).await.map_err(|e| format!("Create table: {}", e))?;
    }
    let _ = sqlx::query::<Any>("CREATE INDEX IF NOT EXISTS idx_tab_connection_login ON tab_connection(login)")
        .execute(&mut *conn)
        .await;
    let _ = sqlx::query::<Any>("CREATE INDEX IF NOT EXISTS idx_tab_connection_telephone ON tab_connection(telephone)")
        .execute(&mut *conn)
        .await;
    Ok(())
}

/// Crée les tables green (cabinet, privilege, nom_acte, nom_assurance, etc.)
pub async fn ensure_tables_green_sqlx(conn: &mut AnyConnection, tab_id: &str) -> Result<(), String> {
    let _ = db::sanitize_tab_id(tab_id);
    drop_legacy_suffixed_tables_any(conn).await?;
    let tables = [
        r#"CREATE TABLE IF NOT EXISTS tab_cabinet (
                id TEXT PRIMARY KEY, nom TEXT, adresse TEXT, pays TEXT, logg_id TEXT, date_creation DATETIME
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_privilege (
                id TEXT PRIMARY KEY, nom TEXT, logg_id TEXT, date_creation DATETIME
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_type_collaborateur (
                id TEXT PRIMARY KEY, nom TEXT NOT NULL, roles_par_defaut TEXT, date_creation DATETIME
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_type_docteur (
                id TEXT PRIMARY KEY, nom TEXT NOT NULL, roles_par_defaut TEXT, date_creation DATETIME
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_nom_acte (
                id TEXT PRIMARY KEY, nom TEXT UNIQUE, prix INTEGER, logg_id TEXT, date_creation DATETIME
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_nom_assurance (
                id TEXT PRIMARY KEY, nom TEXT UNIQUE, pourcentage INTEGER, logg_id TEXT, date_creation DATETIME
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_nom_materiel (
                id TEXT PRIMARY KEY, nom TEXT UNIQUE, quantite_defaut INTEGER DEFAULT 0, prix_defaut INTEGER DEFAULT 0,
                unite_stock TEXT DEFAULT 'unité', logg_id TEXT, date_creation DATETIME
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_modele_etat (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT DEFAULT '📄',
                description TEXT,
                category TEXT DEFAULT 'administratif',
                elements_json TEXT NOT NULL,
                logg_id TEXT,
                date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_medicament (
                id TEXT PRIMARY KEY,
                nom TEXT NOT NULL,
                forme TEXT,
                logg_id TEXT,
                date_creation DATETIME
            )"#,
    ];
    for sql in &tables {
        sqlx::query::<Any>(*sql).execute(&mut *conn).await.map_err(|e| format!("Create table green: {}", e))?;
    }
    let cabinet_table = "tab_cabinet";
    let _ = sqlx::query::<Any>(&format!(
        "ALTER TABLE {} ADD COLUMN date_creation DATETIME",
        cabinet_table
    ))
    .execute(&mut *conn)
    .await;
    let _ = sqlx::query::<Any>(&format!(
        "ALTER TABLE {} ADD COLUMN password_defaut TEXT DEFAULT ''",
        cabinet_table
    ))
    .execute(&mut *conn)
    .await;
    let _ = sqlx::query::<Any>("CREATE INDEX IF NOT EXISTS idx_tab_privilege_logg ON tab_privilege(logg_id)")
        .execute(&mut *conn)
        .await;
    let nm_table = "tab_nom_materiel";
    let _ = sqlx::query::<Any>(&format!(
        "ALTER TABLE {} ADD COLUMN unite_stock TEXT DEFAULT 'unité'",
        nm_table
    ))
    .execute(&mut *conn)
    .await;
    Ok(())
}

/// Crée les tables blue (acte, assurance, facture)
pub async fn ensure_tables_blue_sqlx(conn: &mut AnyConnection, tab_id: &str) -> Result<(), String> {
    let _ = db::sanitize_tab_id(tab_id);
    drop_legacy_suffixed_tables_any(conn).await?;
    let tables = [
        r#"CREATE TABLE IF NOT EXISTS tab_acte (
                id TEXT PRIMARY KEY, nom TEXT, description TEXT, date TEXT,
                prix INTEGER, argentRecu INTEGER, argentRestant INTEGER,
                logg_id TEXT, date_creation DATETIME
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_assurance (
                id TEXT PRIMARY KEY, nom TEXT, pourcentage INTEGER, logg_id TEXT, date_creation DATETIME
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_facture (
                id TEXT PRIMARY KEY, prix_acte INTEGER, argent_recu_acte INTEGER,
                argent_restant_acte INTEGER, argent_assurance INTEGER,
                logg_id TEXT, date_creation DATETIME
            )"#,
        r#"CREATE TABLE IF NOT EXISTS tab_acte_materiel (
                id TEXT PRIMARY KEY, acte_id TEXT, materiel_id TEXT,
                quantite_utilisee INTEGER DEFAULT 1, date_creation DATETIME
            )"#,
    ];
    for sql in &tables {
        sqlx::query::<Any>(*sql).execute(&mut *conn).await.map_err(|e| format!("Create table blue: {}", e))?;
    }
    let _ = sqlx::query::<Any>("CREATE INDEX IF NOT EXISTS idx_tab_acte_logg ON tab_acte(logg_id)")
        .execute(&mut *conn)
        .await;
    let poso_table = "tab_posologie";
    let poso_sql = format!(
        r#"CREATE TABLE IF NOT EXISTS {} (
            id TEXT PRIMARY KEY,
            posologie_id TEXT NOT NULL,
            color_hex TEXT NOT NULL,
            acte_id TEXT NOT NULL,
            medicament_id TEXT NOT NULL,
            quantite INTEGER NOT NULL DEFAULT 1,
            matin INTEGER NOT NULL DEFAULT 0,
            midi INTEGER NOT NULL DEFAULT 0,
            soir INTEGER NOT NULL DEFAULT 0,
            date_creation DATETIME
        )"#,
        poso_table
    );
    sqlx::query::<Any>(&poso_sql)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Create tab_posologie: {}", e))?;
    let _ = sqlx::query::<Any>(&format!(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_posologie_acte_unique ON {}(acte_id)",
        poso_table
    ))
    .execute(&mut *conn)
    .await;
    let _ = sqlx::query::<Any>(&format!(
        "ALTER TABLE {} ADD COLUMN heures_json TEXT DEFAULT '[]'",
        poso_table
    ))
    .execute(&mut *conn)
    .await;
    let acte_table = "tab_acte";
    let _ = sqlx::query::<Any>(&format!(
        "ALTER TABLE {} ADD COLUMN posologie_id TEXT",
        acte_table
    ))
    .execute(&mut *conn)
    .await;
    let _ = sqlx::query::<Any>(&format!(
        "ALTER TABLE {} ADD COLUMN mouvement_type TEXT DEFAULT 'vente'",
        acte_table
    ))
    .execute(&mut *conn)
    .await;
    let _ = sqlx::query::<Any>(&format!(
        "ALTER TABLE {} ADD COLUMN quantite INTEGER DEFAULT 1",
        acte_table
    ))
    .execute(&mut *conn)
    .await;
    Ok(())
}

/// Crée les tables orange (photos, radios)
pub async fn ensure_tables_orange_sqlx(conn: &mut AnyConnection, tab_id: &str) -> Result<(), String> {
    let _ = db::sanitize_tab_id(tab_id);
    drop_legacy_suffixed_tables_any(conn).await?;
    let tables = [r#"CREATE TABLE IF NOT EXISTS tab_photo (
                id TEXT PRIMARY KEY,
                logg_id TEXT,
                part1 TEXT, part2 TEXT, part3 TEXT, part4 TEXT, part5 TEXT,
                part6 TEXT, part7 TEXT, part8 TEXT, part9 TEXT, part10 TEXT,
                date_creation DATETIME
            )"#];
    for sql in &tables {
        sqlx::query::<Any>(*sql).execute(&mut *conn).await.map_err(|e| format!("Create table orange: {}", e))?;
    }
    let _ = sqlx::query::<Any>("CREATE INDEX IF NOT EXISTS idx_tab_photo_logg ON tab_photo(logg_id)")
        .execute(&mut *conn)
        .await;
    Ok(())
}
