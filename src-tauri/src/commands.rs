//! Commandes Tauri minimales : authentification, compte démo, santé backend, ouverture d’URL.

use chrono::{Datelike, Local, Utc};
use serde_json::{json, Value};
use sqlx::any::Any;
use sqlx::Acquire;
use sqlx::Row;
use tauri_plugin_opener::OpenerExt;

use crate::db;
use crate::payload::{encrypt_response, parse_payload, ParsedPayload};

const DEMO_DOCTOR_LOGIN: &str = "doc01@01.com";
const DEMO_DOCTOR_ID: &str = "loggappro-demo-doc01";

/// Valeurs `nom` par défaut pour `tab_privilege` (green) — aligné sur l’ancienne base.
const PRIV_NOM_DEFAUT_DOCTEUR: &str = "acc01,act01,act02,apy01,asr01,asr02,aud01,cab01,cfg01,cfg02,col01,col02,crd02,crd03,crd04,crd05,crd06,crd07,crd08,crd09,edb01,gam01,gam02,gas01,gas02,gme01,gme02,gmt01,gmt02,gtc01,gtc02,exp01,iex01,iex02,iex03,imp01,mat01,mat02,mpr01,mpv01,nma01,nma02,oso01,pat01,pat02,pay01,pay02,pet01,pet02,pos01,prf01,prf02,prt01,prv01,prv02,qrc01,slf01,stt01,vac01,vac02,vna01,vns01,vpf01,vpr01,vpv01,vqr01";

fn sql_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn get_cript_key() -> String {
    crate::cript_key::resolve_cript_key()
}

fn hash_password(plain: &str) -> Result<String, String> {
    bcrypt::hash(plain, bcrypt::DEFAULT_COST).map_err(|e| format!("Hash mot de passe: {}", e))
}

fn verify_password(plain: &str, stored: &str) -> bool {
    if stored.starts_with("$2") {
        bcrypt::verify(plain, stored).unwrap_or(false)
    } else {
        plain == stored
    }
}

fn demo_doctor_replacement_id_path() -> std::path::PathBuf {
    db::get_databases_dir().join("demo_doctor_replaced_id.txt")
}

fn read_demo_doctor_replacement_id() -> Option<String> {
    let s = std::fs::read_to_string(demo_doctor_replacement_id_path()).ok()?;
    let id = s.trim().to_string();
    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}

fn resolve_legacy_demo_doctor_identifier(id_or_tab: &str) -> String {
    let t = id_or_tab.trim();
    if t.is_empty() {
        return id_or_tab.to_string();
    }
    let legacy_san = db::sanitize_tab_id(DEMO_DOCTOR_ID);
    let is_legacy = t == DEMO_DOCTOR_ID || db::sanitize_tab_id(t) == legacy_san;
    if !is_legacy {
        return id_or_tab.to_string();
    }
    read_demo_doctor_replacement_id().unwrap_or_else(|| id_or_tab.to_string())
}

async fn connect_db(pays: &str, tab_id: &str, color: &str) -> Result<sqlx::AnyConnection, String> {
    let resolved = resolve_legacy_demo_doctor_identifier(tab_id);
    crate::db_sqlx::connect_db_async(pays, &resolved, color).await
}

pub(crate) fn parse_or_empty(payload: &str) -> ParsedPayload {
    if let Ok(p) = parse_payload(payload, Some(&get_cript_key())) {
        return p;
    }
    if payload.trim().starts_with('{') {
        if let Ok(v) = serde_json::from_str::<Value>(payload.trim()) {
            if let Some(inner) = v.get("payload").and_then(|x| x.as_str()) {
                if inner.starts_with('/') {
                    if let Ok(p) = parse_payload(inner, Some(&get_cript_key())) {
                        return p;
                    }
                }
            }
            if v.get("loginOrTel").is_some() {
                return ParsedPayload {
                    body: Some(v),
                    ..Default::default()
                };
            }
            if let Some(b) = v.get("body").and_then(|x| x.as_str()) {
                if let Ok(dec) = crate::crypto::decrypt_data(b, &get_cript_key()) {
                    if let Ok(bv) = serde_json::from_str::<Value>(&dec) {
                        return ParsedPayload {
                            body: Some(bv),
                            ..Default::default()
                        };
                    }
                }
            }
            if let Some(b) = v.get("body").filter(|x| x.is_object()) {
                let obj = b.as_object().unwrap();
                return ParsedPayload {
                    body: Some(b.clone()),
                    tab_id: obj.get("tabId").and_then(|x| x.as_str()).map(String::from),
                    pays: obj.get("pays").and_then(|x| x.as_str()).map(String::from),
                    ..Default::default()
                };
            }
        }
    }
    ParsedPayload::default()
}

fn demo_doctor_flag_path() -> std::path::PathBuf {
    db::get_databases_dir().join("demo_doctor_disabled.flag")
}

/// Mot de passe sadmin « du jour » : préfixe par défaut `706` + JJMMYYYY (aligné sur `getDefaultSadminPassword` côté front).
fn sadmin_expected_password_today() -> String {
    let prefix = "706";
    let now = Local::now();
    let jj = format!("{:02}", now.day());
    let mm = format!("{:02}", now.month());
    let yyyy = format!("{}", now.year());
    format!("{}{}{}{}", prefix, jj, mm, yyyy)
}

/// Seul le super-admin peut déclencher une création de compte : login `sadmin` (insensible à la casse) + mot de passe du jour (`706` + JJMMYYYY), aligné sur le front.
fn verify_sadmin_can_create_user(login: &str, password: &str) -> bool {
    login.trim().eq_ignore_ascii_case("sadmin") && password == sadmin_expected_password_today()
}

#[tauri::command]
pub async fn auth_connection(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p
        .body
        .ok_or_else(|| "Corps de requête manquant ou illisible".to_string())?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let login_or_tel = obj.get("loginOrTel").and_then(|v| v.as_str()).unwrap_or("");
    let password = obj.get("password").and_then(|v| v.as_str()).unwrap_or("");

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    let row = sqlx::query::<Any>(
        "SELECT id, logg_id, login, telephone, role, password FROM tab_connection WHERE login = ?1 OR telephone = ?1",
    )
    .bind(login_or_tel)
    .fetch_optional(&mut conn)
    .await
    .map_err(sql_err)?;

    if let Some(row) = row {
        let stored_pwd: String = row.try_get(5).map_err(sql_err)?;
        if !verify_password(password, &stored_pwd) {
            return Err("Identifiants incorrects".to_string());
        }
        let id: String = row.try_get(0).map_err(sql_err)?;
        let logg_id: String = row.try_get::<String, _>(1).unwrap_or_default();
        let login: String = row.try_get(2).map_err(sql_err)?;
        let telephone: String = row.try_get(3).map_err(sql_err)?;
        let role: String = row.try_get(4).map_err(sql_err)?;
        let tab_id = "main";
        let user_table = "tab_user".to_string();

        let user_row = sqlx::query::<Any>(&format!(
            "SELECT id, nom, prenom, naissance, adresse FROM {} WHERE id = ?1",
            user_table
        ))
        .bind(&id)
        .fetch_optional(&mut conn)
        .await
        .map_err(sql_err)?;

        let mut user = if let Some(r) = user_row {
            json!({
                "id": r.try_get::<String, _>(0).unwrap_or_default(),
                "nom": r.try_get::<Option<String>, _>(1).ok().flatten(),
                "prenom": r.try_get::<Option<String>, _>(2).ok().flatten(),
                "naissance": r.try_get::<Option<String>, _>(3).ok().flatten(),
                "adresse": r.try_get::<Option<String>, _>(4).ok().flatten(),
                "login": login,
                "telephone": telephone,
                "role": role,
                "logg_id": logg_id,
            })
        } else {
            json!({ "id": id, "login": login, "telephone": telephone, "role": role, "logg_id": logg_id })
        };

        let must_change_basic = matches!(
            role.as_str(),
            "docteur" | "patient" | "assistant" | "comptable" | "secretaire" | "collaborateur"
        ) && (password == "1234" || password == "0000");

        let must_change = must_change_basic
            || if role != "docteur" && role != "patient" {
                let cab_tab = if logg_id.is_empty() { "main" } else { &logg_id };
                if let Ok(mut conn_green) = connect_db(pays, &tab_id, "green").await {
                    let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, cab_tab).await;
                    let cabinet_table = "tab_cabinet".to_string();
                    let cab_id = if logg_id.is_empty() { &id } else { &logg_id };
                    if let Ok(Some(r)) = sqlx::query::<Any>(&format!(
                        "SELECT COALESCE(password_defaut,'') FROM {} WHERE id = ?1",
                        cabinet_table
                    ))
                    .bind(cab_id)
                    .fetch_optional(&mut conn_green)
                    .await
                    {
                        let pwd_def: String = r.try_get(0).unwrap_or_default();
                        !pwd_def.is_empty() && password == pwd_def
                    } else {
                        false
                    }
                } else {
                    false
                }
            } else {
                false
            };

        if must_change || must_change_basic {
            user["mustChangePassword"] = serde_json::Value::Bool(true);
        }

        let login_lc = login.to_lowercase();
        let is_demo_docteur =
            role == "docteur" && (id == DEMO_DOCTOR_ID || login_lc == DEMO_DOCTOR_LOGIN);
        user["mustChangeDemoEmail"] = serde_json::Value::Bool(is_demo_docteur);

        encrypt_response(&user, Some(&get_cript_key()))
    } else {
        Err("Identifiants incorrects".to_string())
    }
}

#[tauri::command]
pub async fn auth_message(payload: String) -> Result<Value, String> {
    auth_connection(payload).await
}

#[tauri::command]
pub async fn ensure_default_demo_docteur(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.as_ref().and_then(|b| b.as_object());
    let sadmin_login = body
        .and_then(|o| o.get("sadminLogin").and_then(|v| v.as_str()))
        .unwrap_or("");
    let sadmin_password = body
        .and_then(|o| o.get("sadminPassword").and_then(|v| v.as_str()))
        .unwrap_or("");
    if !verify_sadmin_can_create_user(sadmin_login, sadmin_password) {
        return Err(
            "Seul le super-administrateur (sadmin) peut créer ou initialiser un compte utilisateur."
                .to_string(),
        );
    }
    let pays = p.pays.as_deref().unwrap_or("sn");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    if demo_doctor_flag_path().exists() {
        return Ok(json!({ "created": false, "reason": "disabled_by_sadmin" }));
    }
    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;
    let user_table = "tab_user".to_string();
    let cnt_row = sqlx::query::<Any>(&format!(
        "SELECT COUNT(*) FROM {} WHERE LOWER(TRIM(login)) = LOWER(?1)",
        user_table
    ))
    .bind(DEMO_DOCTOR_LOGIN)
    .fetch_one(&mut conn)
    .await
    .map_err(sql_err)?;
    let cnt: i64 = cnt_row.try_get::<i64, _>(0).unwrap_or(0);
    if cnt > 0 {
        if let Ok(mut conn_green) = connect_db(pays, &tab_id, "green").await {
            let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, &tab_id).await;
            let priv_table = "tab_privilege".to_string();
            let sql_nom = format!(
                "SELECT nom FROM {} WHERE id = ?1 OR logg_id = ?1 LIMIT 1",
                priv_table
            );
            let nom_opt: Option<String> = sqlx::query::<Any>(&sql_nom)
                .bind(DEMO_DOCTOR_ID)
                .fetch_optional(&mut conn_green)
                .await
                .ok()
                .flatten()
                .and_then(|r| r.try_get::<Option<String>, _>(0).ok().flatten());
            let need_priv_row = nom_opt.map(|s| s.trim().is_empty()).unwrap_or(true);
            if need_priv_row {
                let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
                let _ = sqlx::query::<Any>(&format!(
                    "INSERT OR REPLACE INTO {} (id, nom, logg_id, date_creation) VALUES (?1,?2,?3,?4)",
                    priv_table
                ))
                .bind(DEMO_DOCTOR_ID)
                .bind(PRIV_NOM_DEFAUT_DOCTEUR)
                .bind(DEMO_DOCTOR_ID)
                .bind(&now)
                .execute(&mut conn_green)
                .await;
            }
        }
        return Ok(json!({ "created": false, "reason": "already_exists" }));
    }
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let password = hash_password("1234").unwrap_or_else(|_| "1234".to_string());
    let phone = "770000001";
    let role = "docteur";
    let mut tx = conn.begin().await.map_err(sql_err)?;
    sqlx::query::<Any>(&format!(
        "INSERT INTO {} (id, nom, prenom, login, password, telephone, naissance, role, adresse, logg_id, date_creation) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        user_table
    ))
    .bind(DEMO_DOCTOR_ID)
    .bind("DOC01")
    .bind("Démo")
    .bind(DEMO_DOCTOR_LOGIN)
    .bind(&password)
    .bind(phone)
    .bind("")
    .bind(role)
    .bind("")
    .bind(DEMO_DOCTOR_ID)
    .bind(&now)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("demo tab_user: {}", e))?;
    sqlx::query::<Any>("INSERT INTO tab_docteur (id, date_creation, logg_id) VALUES (?1,?2,?3)")
        .bind(DEMO_DOCTOR_ID)
        .bind(&now)
        .bind(DEMO_DOCTOR_ID)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("demo tab_docteur: {}", e))?;
    sqlx::query::<Any>(
        "INSERT INTO tab_connection (id, logg_id, login, telephone, password, role) VALUES (?1,?2,?3,?4,?5,?6)",
    )
    .bind(DEMO_DOCTOR_ID)
    .bind(DEMO_DOCTOR_ID)
    .bind(DEMO_DOCTOR_LOGIN)
    .bind(phone)
    .bind(&password)
    .bind(role)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("demo tab_connection: {}", e))?;
    tx.commit().await.map_err(sql_err)?;
    if let Ok(mut conn_green) = connect_db(pays, &tab_id, "green").await {
        let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, &tab_id).await;
        let priv_table = "tab_privilege".to_string();
        let _ = sqlx::query::<Any>(&format!(
            "INSERT OR REPLACE INTO {} (id, nom, logg_id, date_creation) VALUES (?1,?2,?3,?4)",
            priv_table
        ))
        .bind(DEMO_DOCTOR_ID)
        .bind(PRIV_NOM_DEFAUT_DOCTEUR)
        .bind(DEMO_DOCTOR_ID)
        .bind(&now)
        .execute(&mut conn_green)
        .await;
    }
    Ok(json!({ "created": true, "id": DEMO_DOCTOR_ID }))
}

#[tauri::command]
pub async fn remove_demo_docteur_after_sadmin_login(payload: String) -> Result<Value, String> {
    let _p = parse_or_empty(&payload);
    let pays = _p.pays.as_deref().unwrap_or("sn");
    let tab_id = db::sanitize_tab_id(_p.tab_id.as_deref().unwrap_or("main"));
    let _ = std::fs::write(demo_doctor_flag_path(), b"1");
    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    let _ = crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;
    let user_table = "tab_user".to_string();
    let docteur_table = "tab_docteur".to_string();
    let _ = sqlx::query::<Any>(&format!("DELETE FROM {} WHERE id = ?1", docteur_table))
        .bind(DEMO_DOCTOR_ID)
        .execute(&mut conn)
        .await;
    let _ = sqlx::query::<Any>(&format!(
        "DELETE FROM {} WHERE LOWER(TRIM(login)) = LOWER(?1) OR id = ?2",
        user_table
    ))
    .bind(DEMO_DOCTOR_LOGIN)
    .bind(DEMO_DOCTOR_ID)
    .execute(&mut conn)
    .await;
    let _ = sqlx::query::<Any>(
        "DELETE FROM tab_connection WHERE LOWER(TRIM(login)) = LOWER(?1) OR id = ?2",
    )
    .bind(DEMO_DOCTOR_LOGIN)
    .bind(DEMO_DOCTOR_ID)
    .execute(&mut conn)
    .await;
    if let Ok(mut conn_green) = connect_db(pays, &tab_id, "green").await {
        let priv_table = "tab_privilege".to_string();
        let _ = sqlx::query::<Any>(&format!("DELETE FROM {} WHERE id = ?1", priv_table))
            .bind(DEMO_DOCTOR_ID)
            .execute(&mut conn_green)
            .await;
    }
    Ok(json!({ "removed": true }))
}

#[tauri::command]
pub async fn test_backend_rust(payload: String) -> Result<Value, String> {
    let key = get_cript_key();
    let p = parse_payload(&payload, Some(&key)).unwrap_or_default();

    let db_dir = db::get_databases_dir();
    let db_path = db::get_db_path("sn", "yellow", None);

    Ok(json!({
        "ok": true,
        "message": "Backend Rust opérationnel",
        "payload_parsed": !p.body.is_none() || !p.params.is_empty(),
        "tab_id": p.tab_id,
        "pays": p.pays,
        "db_dir": db_dir.to_string_lossy(),
        "db_yellow_path": db_path.to_string_lossy(),
    }))
}

fn is_allowed_external_url(url: &str) -> bool {
    let u = url.trim();
    if u.len() < 6 {
        return false;
    }
    let lower = u.to_ascii_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:")
}

#[cfg(target_os = "windows")]
fn try_open_url_with_edge_exe(url: &str) -> bool {
    use std::path::PathBuf;
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(pf) = std::env::var("ProgramW6432") {
        candidates.push(
            PathBuf::from(pf)
                .join("Microsoft")
                .join("Edge")
                .join("Application")
                .join("msedge.exe"),
        );
    }
    if let Ok(pf) = std::env::var("ProgramFiles") {
        candidates.push(
            PathBuf::from(pf)
                .join("Microsoft")
                .join("Edge")
                .join("Application")
                .join("msedge.exe"),
        );
    }
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        candidates.push(
            PathBuf::from(pf86)
                .join("Microsoft")
                .join("Edge")
                .join("Application")
                .join("msedge.exe"),
        );
    }
    if let Ok(la) = std::env::var("LocalAppData") {
        candidates.push(
            PathBuf::from(la)
                .join("Microsoft")
                .join("Edge")
                .join("Application")
                .join("msedge.exe"),
        );
    }
    for exe in candidates {
        if exe.is_file() {
            let mut cmd = std::process::Command::new(&exe);
            cmd.arg(url);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            if cmd.spawn().is_ok() {
                return true;
            }
        }
    }
    false
}

#[cfg(target_os = "windows")]
fn try_open_mailto_windows_shell(url: &str) -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let mut r = std::process::Command::new("rundll32.exe");
    r.args(["url.dll,FileProtocolHandler", url]);
    r.creation_flags(CREATE_NO_WINDOW);
    if r.status().map(|s| s.success()).unwrap_or(false) {
        return true;
    }

    let mut c = std::process::Command::new("cmd");
    c.args(["/C", "start", "", url]);
    c.creation_flags(CREATE_NO_WINDOW);
    c.status().map(|s| s.success()).unwrap_or(false)
}

#[tauri::command]
pub fn open_external_url_prefer_edge(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !is_allowed_external_url(&url) {
        return Err("URL non autorisée (http, https ou mailto uniquement).".to_string());
    }

    if url.trim().to_ascii_lowercase().starts_with("mailto:") {
        #[cfg(target_os = "windows")]
        {
            if try_open_mailto_windows_shell(&url) {
                return Ok(());
            }
        }
        return app
            .opener()
            .open_url(url, None::<&str>)
            .map_err(|e| e.to_string());
    }

    #[cfg(target_os = "windows")]
    {
        if app.opener().open_url(&url, Some("msedge")).is_ok() {
            return Ok(());
        }
        if try_open_url_with_edge_exe(&url) {
            return Ok(());
        }
    }

    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_local_ip() -> Result<Value, String> {
    let ip = local_ip_address::local_ip().map_err(|e| e.to_string())?;
    let ip_str = ip.to_string();
    let front_url = format!("http://{}:7061", ip_str);
    Ok(json!({
        "ip": ip_str,
        "frontUrl": front_url,
        "success": true
    }))
}
