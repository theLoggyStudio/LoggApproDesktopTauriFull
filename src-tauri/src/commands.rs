//! Commandes Tauri - backend LoggAppro

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chrono::Utc;
use qrcodegen_image::draw_base64;
use regex::Regex;
use serde_json::{json, Value};
use sqlx::any::Any;
use sqlx::Connection;
use sqlx::Row;
use uuid::Uuid;
use rand_core::{OsRng, RngCore};

use crate::admin_schema;
use crate::crypto;
use crate::db;
use crate::pay_anchor;
use crate::paydunya_time_guard;
use crate::payload::{encrypt_response, parse_payload, ParsedPayload};
use tauri_plugin_opener::OpenerExt;

fn sql_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Compte démo (référencé par `auth_connection` et commandes démo).
/// ID **fixe** à la création (`ensure_default_demo_docteur`) ; au passage en compte réel,
/// `finalize_demo_docteur_email` crée un **nouveau** docteur (UUID), migre les données, supprime le démo
/// et renvoie `reconnect: true` pour forcer une nouvelle connexion.
const DEMO_DOCTOR_LOGIN: &str = "doc01@01.com";
const DEMO_DOCTOR_ID: &str = "loggappro-demo-doc01";

/// Après `finalize_demo_docteur_email`, l’ancien id démo peut encore apparaître dans des favoris / URLs :
/// `demo_doctor_replaced_id.txt` redirige vers le nouvel id pour `connect_db` et la résolution des privilèges.
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

fn write_demo_doctor_replacement_id(new_id: &str) {
    let _ = std::fs::create_dir_all(db::get_databases_dir());
    let _ = std::fs::write(demo_doctor_replacement_id_path(), new_id.trim().as_bytes());
}

/// Remplace l’id démo historique par l’id définitif (timestamp) si la migration a eu lieu.
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

/// Chaîne de `tab_id` pour retrouver `tab_privilege*` / `tab_user*` : la session met souvent **l’id docteur**
/// comme `tabId` (routes `/patient/:userId/:tabId/...`) alors que les données cabinet sont sous **`main`**.
fn admin_tab_lookup_chain(tab_id: &str) -> Vec<String> {
    let t = tab_id.trim();
    if t.is_empty() {
        return vec!["main".to_string()];
    }
    if t == "main" {
        return vec!["main".to_string()];
    }
    vec![t.to_string(), "main".to_string()]
}

/// Hash bcrypt pour stockage sécurisé des mots de passe.
fn hash_password(plain: &str) -> Result<String, String> {
    bcrypt::hash(plain, bcrypt::DEFAULT_COST).map_err(|e| format!("Hash mot de passe: {}", e))
}

/// Vérifie un mot de passe : bcrypt si stocké hashé, sinon comparaison en clair (rétrocompat).
fn verify_password(plain: &str, stored: &str) -> bool {
    if stored.starts_with("$2") {
        bcrypt::verify(plain, stored).unwrap_or(false)
    } else {
        plain == stored
    }
}

/// Vérification des credentials désactivée : accès libre sans mot de passe ni identifiant.
pub async fn verify_db_credentials(_obj: &serde_json::Map<String, Value>, _tab_id: &str, _pays: &str) -> Result<(), String> {
    Ok(())
}

/// Vérification Sadmin désactivée : accès libre à toutes les fonctionnalités.
pub async fn verify_sadmin_only(_obj: &serde_json::Map<String, Value>, _tab_id: &str, _pays: &str) -> Result<(), String> {
    Ok(())
}

fn get_cript_key() -> String {
    crate::cript_key::resolve_cript_key()
}

/// Connexion à une base via SQLx (lit config depuis admin).
/// Redirige l’ancien id démo vers le nouvel id après changement d’e-mail (session / URL obsolètes).
async fn connect_db(pays: &str, tab_id: &str, color: &str) -> Result<sqlx::AnyConnection, String> {
    let resolved = resolve_legacy_demo_doctor_identifier(tab_id);
    crate::db_sqlx::connect_db_async(pays, &resolved, color).await
}

/// Date d'inscription de référence pour paiements / période de grâce : `tab_pay_anchor` (dblaadmin), sinon lecture `tab_docteur` + écriture ancrage.
async fn resolve_inscription_date_for_payment(cabinet_id: &str, pays: &str, tab_id: &str) -> Option<String> {
    let mut ca = crate::db_sqlx::connect_admin().await.ok()?;
    if crate::db_sqlx::ensure_tables_admin_sqlx(&mut ca, pays, tab_id).await.is_err() {
        return None;
    }
    let schema = admin_schema::load_schema().ok()?;
    match pay_anchor::read_inscription_anchor_date(&mut ca, &schema, cabinet_id).await {
        Ok(Some(d)) => return Some(d),
        Ok(None) => {}
        Err(_) => {}
    }
    if let Ok(mut cy) = connect_db(pays, tab_id, "yellow").await {
        let docteur_table = "tab_docteur".to_string();
        let sql_doc = format!("SELECT CAST(date_creation AS TEXT) FROM {} WHERE id = ?1", docteur_table);
        if let Ok(Some(r)) = sqlx::query::<Any>(&sql_doc)
            .bind(cabinet_id)
            .fetch_optional(&mut cy)
            .await
        {
            if let Ok(dc) = r.try_get::<String, _>(0) {
                if !dc.is_empty() {
                    let _ = pay_anchor::upsert_inscription_anchor(&mut ca, &schema, cabinet_id, &dc).await;
                    return Some(dc);
                }
            }
        }
    }
    None
}

async fn upsert_pay_inscription_silent(pays: &str, tab_id: &str, cabinet_id: &str, inscription_iso: &str) {
    if let Ok(mut ca) = crate::db_sqlx::connect_admin().await {
        if crate::db_sqlx::ensure_tables_admin_sqlx(&mut ca, pays, tab_id).await.is_err() {
            return;
        }
        if let Ok(schema) = admin_schema::load_schema() {
            let _ = pay_anchor::upsert_inscription_anchor(&mut ca, &schema, cabinet_id, inscription_iso).await;
        }
    }
}

/// Valeurs `nom` par défaut pour `tab_privilege` (green) — alignées sur `migrate_old_collaborateurs_to_types`.
const PRIV_NOM_DEFAUT_ASSISTANT_COMPTABLE: &str =
    "slf01,crd02,crd03,crd04,crd05,stt01,imp01,exp01,vpr01,vac01,vna01,vns01";
const PRIV_NOM_DEFAUT_SECRETAIRE: &str = "slf01,vac01";

/// Docteur : jeu **complet** par défaut (union ancien défaut métier + codes écran / démo utilisés par le client).
/// Doit inclure **tous** les codes de `PRIVILEGES` côté client (`privileges.constants.ts`) + codes legacy (crd, vna, …).
const PRIV_NOM_DEFAUT_DOCTEUR: &str = "acc01,act01,act02,apy01,asr01,asr02,aud01,cab01,cfg01,cfg02,col01,col02,crd02,crd03,crd04,crd05,crd06,crd07,crd08,crd09,edb01,gam01,gam02,gas01,gas02,gme01,gme02,gmt01,gmt02,gtc01,gtc02,exp01,iex01,iex02,iex03,imp01,mat01,mat02,mpr01,mpv01,nma01,nma02,oso01,pat01,pat02,pay01,pay02,pet01,pet02,pos01,prf01,prf02,prt01,prv01,prv02,qrc01,slf01,stt01,vac01,vac02,vna01,vns01,vpf01,vpr01,vpv01,vqr01";

/// Union de deux listes de codes (séparateurs `,` ou `;`), dédupliquée, ordre lexicographique stable.
fn union_privilege_nom_csv(a: &str, b: &str) -> String {
    let mut set: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for raw in [a, b] {
        for part in raw.split(|c| c == ',' || c == ';') {
            let s = part.trim();
            if !s.is_empty() {
                set.insert(s.to_lowercase());
            }
        }
    }
    set.into_iter().collect::<Vec<_>>().join(",")
}

/// Crée ou remplace la ligne de privilèges (base green) pour un utilisateur collaborateur.
async fn insert_default_privilege_row_green(
    pays: &str,
    tab_id: &str,
    user_id: &str,
    nom_priv: &str,
) -> Result<(), String> {
    if user_id.is_empty() || nom_priv.trim().is_empty() {
        return Ok(());
    }
    let mut conn_green = connect_db(pays, tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, tab_id).await?;
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let priv_table = "tab_privilege".to_string();
    sqlx::query::<Any>(&format!(
        "INSERT OR REPLACE INTO {} (id, nom, logg_id, date_creation) VALUES (?1, ?2, ?3, ?4)",
        priv_table
    ))
    .bind(user_id)
    .bind(nom_priv.trim())
    .bind(user_id)
    .bind(&now)
    .execute(&mut conn_green)
    .await
    .map_err(|e| format!("tab_privilege défaut: {}", e))?;
    Ok(())
}

/// Modèle unique des privilèges **par défaut pour les nouveaux docteurs** (même idée que `tab_type_collaborateur`).
const TYPE_DOCTEUR_TEMPLATE_NOM: &str = "Docteur";

/// Garantit au moins une ligne dans `tab_type_docteur` et retourne `roles_par_defaut` du modèle « Docteur ».
async fn ensure_and_fetch_type_docteur_roles_template(pays: &str, tab_id: &str) -> String {
    let Ok(mut conn) = connect_db(pays, tab_id, "green").await else {
        return PRIV_NOM_DEFAUT_DOCTEUR.to_string();
    };
    if crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, tab_id)
        .await
        .is_err()
    {
        return PRIV_NOM_DEFAUT_DOCTEUR.to_string();
    }
    let type_table = "tab_type_docteur".to_string();
    let cnt: i64 = sqlx::query::<Any>(&format!("SELECT COUNT(*) FROM {}", type_table))
        .fetch_one(&mut conn)
        .await
        .ok()
        .and_then(|r| r.try_get(0).ok())
        .unwrap_or(0);
    if cnt == 0 {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let _ = sqlx::query::<Any>(&format!(
            "INSERT INTO {} (id, nom, roles_par_defaut, date_creation) VALUES (?1, ?2, ?3, ?4)",
            type_table
        ))
        .bind(&id)
        .bind(TYPE_DOCTEUR_TEMPLATE_NOM)
        .bind(PRIV_NOM_DEFAUT_DOCTEUR)
        .bind(&now)
        .execute(&mut conn)
        .await;
    }
    let sql_nom = format!(
        "SELECT roles_par_defaut FROM {} WHERE nom = ?1 LIMIT 1",
        type_table
    );
    if let Ok(Some(r)) = sqlx::query::<Any>(&sql_nom)
        .bind(TYPE_DOCTEUR_TEMPLATE_NOM)
        .fetch_optional(&mut conn)
        .await
    {
        if let Some(t) = r
            .try_get::<Option<String>, _>(0)
            .ok()
            .flatten()
            .filter(|s| !s.trim().is_empty())
        {
            let merged = union_privilege_nom_csv(t.trim(), PRIV_NOM_DEFAUT_DOCTEUR);
            if merged != t.trim() {
                let type_table_up = "tab_type_docteur".to_string();
                let _ = sqlx::query::<Any>(&format!(
                    "UPDATE {} SET roles_par_defaut = ?1 WHERE nom = ?2",
                    type_table_up
                ))
                .bind(&merged)
                .bind(TYPE_DOCTEUR_TEMPLATE_NOM)
                .execute(&mut conn)
                .await;
            }
            return merged;
        }
    }
    let sql_any = format!("SELECT roles_par_defaut FROM {} LIMIT 1", type_table);
    if let Ok(Some(r)) = sqlx::query::<Any>(&sql_any)
        .fetch_optional(&mut conn)
        .await
    {
        if let Some(t) = r
            .try_get::<Option<String>, _>(0)
            .ok()
            .flatten()
            .filter(|s| !s.trim().is_empty())
        {
            return t;
        }
    }
    PRIV_NOM_DEFAUT_DOCTEUR.to_string()
}

/// Si pas de ligne utile dans `tab_privilege`, déduit les codes comme pour un collaborateur (rôle / type).
async fn privilege_nom_fallback_without_tab_privilege_row(
    pays: &str,
    tab_id: &str,
    user_id: &str,
) -> Option<String> {
    // Comptes super-admin : souvent sans ligne `tab_user` / `tab_privilege` — ne pas les traiter comme un user métier.
    let uid_lc = user_id.trim().to_lowercase();
    if uid_lc == "sadmin" || uid_lc == "admin" {
        return Some(PRIV_NOM_DEFAUT_DOCTEUR.to_string());
    }
    // Doc01 démo : même jeu complet que les docteurs créés par le Sadmin.
    if user_id.trim() == DEMO_DOCTOR_ID {
        return Some(PRIV_NOM_DEFAUT_DOCTEUR.to_string());
    }

    for tid in admin_tab_lookup_chain(tab_id) {
        let Ok(mut conn_y) = connect_db(pays, &tid, "yellow").await else {
            continue;
        };
        let _ = crate::db_sqlx::ensure_tables_sqlx(&mut conn_y, &tid).await;
        let user_table = "tab_user".to_string();
        let role_sql = format!("SELECT role FROM {} WHERE id = ?1 LIMIT 1", user_table);
        if let Ok(Some(r)) = sqlx::query::<Any>(&role_sql)
            .bind(user_id)
            .fetch_optional(&mut conn_y)
            .await
        {
            let role = r
                .try_get::<Option<String>, _>(0)
                .ok()
                .flatten()
                .unwrap_or_default()
                .to_lowercase();
            match role.as_str() {
                "assistant" | "comptable" => {
                    return Some(PRIV_NOM_DEFAUT_ASSISTANT_COMPTABLE.to_string());
                }
                "secretaire" => return Some(PRIV_NOM_DEFAUT_SECRETAIRE.to_string()),
                "docteur" => {
                    return Some(ensure_and_fetch_type_docteur_roles_template(pays, &tid).await);
                }
                _ => {}
            }
        }

        let collab_table = "tab_collaborateur".to_string();
        let type_sql = format!("SELECT type_id FROM {} WHERE id = ?1 LIMIT 1", collab_table);
        if let Ok(Some(r)) = sqlx::query::<Any>(&type_sql)
            .bind(user_id)
            .fetch_optional(&mut conn_y)
            .await
        {
            if let Some(type_id) = r.try_get::<Option<String>, _>(0).ok().flatten() {
                if !type_id.is_empty() {
                    let Ok(mut conn_g) = connect_db(pays, &tid, "green").await else {
                        continue;
                    };
                    let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_g, &tid).await;
                    let collab_type_table = "tab_type_collaborateur".to_string();
                    let def_sql = format!(
                        "SELECT roles_par_defaut FROM {} WHERE id = ?1 LIMIT 1",
                        collab_type_table
                    );
                    if let Ok(Some(rr)) = sqlx::query::<Any>(&def_sql)
                        .bind(&type_id)
                        .fetch_optional(&mut conn_g)
                        .await
                    {
                        if let Some(nom_priv) = rr
                            .try_get::<Option<String>, _>(0)
                            .ok()
                            .flatten()
                            .filter(|s| !s.trim().is_empty())
                        {
                            return Some(nom_priv);
                        }
                    }
                }
            }
        }
    }
    None
}

fn parse_or_empty(payload: &str) -> ParsedPayload {
    if let Ok(p) = parse_payload(payload, Some(&get_cript_key())) {
        return p;
    }
    // Si le payload est un objet {"payload": "/api/..."}, extraire le path et réessayer
    if payload.trim().starts_with('{') {
        if let Ok(v) = serde_json::from_str::<Value>(payload.trim()) {
            if let Some(inner) = v.get("payload").and_then(|x| x.as_str()) {
                if inner.starts_with('/') {
                    if let Ok(p) = parse_payload(inner, Some(&get_cript_key())) {
                        return p;
                    }
                }
            }
        }
    }
    // Fallback : payload JSON non chiffré (dev / debug)
    if payload.trim().starts_with('{') {
        if let Ok(v) = serde_json::from_str::<Value>(payload.trim()) {
            if v.get("nom").is_some() || v.get("login").is_some() || v.get("loginOrTel").is_some() {
                return ParsedPayload { body: Some(v), ..Default::default() };
            }
            if v.get("titre").is_some() || v.get("url").is_some() {
                return ParsedPayload { body: Some(v), ..Default::default() };
            }
            if v.get("id").is_some() && (v.get("titre").is_some() || v.get("url").is_some() || v.as_object().map(|o| o.len()).unwrap_or(0) <= 2) {
                return ParsedPayload { body: Some(v.clone()), id: v.get("id").and_then(|x| x.as_str()).map(String::from), ..Default::default() };
            }
            if let Some(b) = v.get("body").and_then(|x| x.as_str()) {
                if let Ok(dec) = crate::crypto::decrypt_data(b, &get_cript_key()) {
                    if let Ok(bv) = serde_json::from_str::<Value>(&dec) {
                        return ParsedPayload { body: Some(bv), ..Default::default() };
                    }
                }
            }
            // body peut être un objet (sans chiffrement) : {"body": {"patientId": "...", "tabId": "...", "pays": "..."}}
            if let Some(b) = v.get("body").filter(|x| x.is_object()) {
                let obj = b.as_object().unwrap();
                return ParsedPayload {
                    body: Some(b.clone()),
                    tab_id: obj.get("tabId").and_then(|x| x.as_str()).map(String::from),
                    pays: obj.get("pays").and_then(|x| x.as_str()).map(String::from),
                    limit: obj.get("limit").and_then(|x| x.as_i64().or_else(|| x.as_str().and_then(|s| s.parse().ok()))),
                    id: obj.get("id").and_then(|x| x.as_str()).map(String::from),
                    patient_id: obj.get("patientId").and_then(|x| x.as_str()).map(String::from),
                    ..Default::default()
                };
            }
            // Payload racine avec patientId (list_actes_by_patient)
            if v.get("patientId").is_some() {
                let obj = v.as_object().unwrap();
                return ParsedPayload {
                    body: Some(v.clone()),
                    tab_id: obj.get("tabId").and_then(|x| x.as_str()).map(String::from),
                    pays: obj.get("pays").and_then(|x| x.as_str()).map(String::from),
                    limit: obj.get("limit").and_then(|x| x.as_i64().or_else(|| x.as_str().and_then(|s| s.parse().ok()))),
                    patient_id: obj.get("patientId").and_then(|x| x.as_str()).map(String::from),
                    ..Default::default()
                };
            }
            // Payload stats (stats_get_info) : dateDebut, dateFin à la racine (format non chiffré)
            if v.get("dateDebut").is_some() || v.get("dateFin").is_some() {
                return ParsedPayload { body: Some(v.clone()), ..Default::default() };
            }
            // Payload list_patients : tabId, limit, pays à la racine (format non chiffré)
            if v.get("tabId").is_some() && v.get("pays").is_some() {
                let obj = v.as_object().unwrap();
                let lim = obj.get("limit").and_then(|x| x.as_i64().or_else(|| x.as_str().and_then(|s| s.parse().ok())));
                return ParsedPayload {
                    body: Some(v.clone()),
                    tab_id: obj.get("tabId").and_then(|x| x.as_str()).map(String::from),
                    pays: obj.get("pays").and_then(|x| x.as_str()).map(String::from),
                    limit: lim,
                    ..Default::default()
                };
            }
        }
    }
    ParsedPayload::default()
}

/// Aperçu du JSON brut reçu quand `parse_or_empty` ne fournit pas de `body` (diagnostic clé / format d’enveloppe).
const BODY_MANQUANT_PREVIEW_MAX: usize = 1200;

fn truncate_payload_preview(payload: &str, max_bytes: usize) -> String {
    if payload.len() <= max_bytes {
        return payload.to_string();
    }
    let mut end = max_bytes;
    while end > 0 && !payload.is_char_boundary(end) {
        end -= 1;
    }
    format!(
        "{}... [tronqué, {} octets au total]",
        &payload[..end],
        payload.len()
    )
}

/// Erreur « Body manquant » avec l’enveloppe reçue (ex. `{"body":"…chiffré…"}`) — le mot de passe n’est pas en clair dans ce JSON.
fn body_manquant_avec_payload(payload: &str, hint: Option<&str>) -> String {
    let len = payload.len();
    let preview = truncate_payload_preview(payload, BODY_MANQUANT_PREVIEW_MAX);
    match hint {
        Some(h) if !h.is_empty() => format!(
            "Body manquant ({}) | octets={} | reçu: {}",
            h, len, preview
        ),
        _ => format!("Body manquant | octets={} | reçu: {}", len, preview),
    }
}

/// Données complémentaires pour le QR identité mobile : `loggId` cabinet + nom affichage.
async fn fetch_identity_qr_extras(
    pays: &str,
    tab_id: &str,
    entity_id: &str,
) -> (String, Option<String>, Option<String>) {
    let tab_id = db::sanitize_tab_id(tab_id);
    let eid = entity_id.trim();
    if eid.is_empty() {
        return (tab_id.clone(), None, None);
    }
    let Ok(mut conn) = connect_db(pays, &tab_id, "yellow").await else {
        return (tab_id.clone(), None, None);
    };
    if crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id)
        .await
        .is_err()
    {
        return (tab_id.clone(), None, None);
    }
    let user_table = "tab_user".to_string();
    let sql = format!(
        "SELECT TRIM(COALESCE(logg_id, '')) as lg, nom, prenom FROM {} WHERE id = ?1 LIMIT 1",
        user_table
    );
    if let Ok(Some(row)) = sqlx::query::<Any>(&sql)
        .bind(eid)
        .fetch_optional(&mut conn)
        .await
    {
        let lg: String = row.try_get::<String, _>(0).unwrap_or_default();
        let logg_out = if lg.is_empty() {
            tab_id.clone()
        } else {
            lg
        };
        let nom = row
            .try_get::<Option<String>, _>(1)
            .ok()
            .flatten()
            .filter(|s| !s.trim().is_empty());
        let prenom = row
            .try_get::<Option<String>, _>(2)
            .ok()
            .flatten()
            .filter(|s| !s.trim().is_empty());
        return (logg_out, nom, prenom);
    }
    let collab_table = "tab_collaborateur".to_string();
    let sql_c = format!(
        "SELECT TRIM(COALESCE(logg_id, '')) as lg FROM {} WHERE id = ?1 LIMIT 1",
        collab_table
    );
    if let Ok(Some(row)) = sqlx::query::<Any>(&sql_c)
        .bind(eid)
        .fetch_optional(&mut conn)
        .await
    {
        let lg: String = row.try_get::<String, _>(0).unwrap_or_default();
        let logg_out = if lg.is_empty() {
            tab_id.clone()
        } else {
            lg
        };
        return (logg_out, None, None);
    }
    (tab_id.clone(), None, None)
}

/// Nom du cabinet (tab_cabinet) pour enrichir les QR identité.
async fn fetch_cabinet_nom_green(pays: &str, tab_try: &str, cabinet_id: &str) -> Option<String> {
    let cid = cabinet_id.trim();
    if cid.is_empty() {
        return None;
    }
    let tid = db::sanitize_tab_id(tab_try);
    let mut conn = connect_db(pays, &tid, "green").await.ok()?;
    let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tid).await;
    let t = "tab_cabinet".to_string();
    let sql = format!(
        "SELECT TRIM(COALESCE(nom,'')) FROM {} WHERE id = ?1 OR TRIM(COALESCE(logg_id,'')) = ?1 LIMIT 1",
        t
    );
    let row = sqlx::query::<Any>(&sql)
        .bind(cid)
        .fetch_optional(&mut conn)
        .await
        .ok()??;
    let s: String = row.try_get(0).ok()?;
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// Dernier recours : premier nom de cabinet « lisible » dans la base green (ligne souvent `id = main` sans `logg_id`).
async fn fetch_any_non_generic_cabinet_nom_green(pays: &str, tab_try: &str) -> Option<String> {
    let tid = db::sanitize_tab_id(tab_try);
    let mut conn = connect_db(pays, &tid, "green").await.ok()?;
    let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tid).await;
    let t = "tab_cabinet".to_string();
    let sql = format!(
        "SELECT TRIM(COALESCE(nom,'')) FROM {} WHERE TRIM(COALESCE(nom,'')) != '' AND LOWER(TRIM(nom)) NOT IN ('cabinet','main','-') LIMIT 1",
        t
    );
    let row = sqlx::query::<Any>(&sql)
        .fetch_optional(&mut conn)
        .await
        .ok()??;
    let s: String = row.try_get(0).ok()?;
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// Nom complet du docteur propriétaire (pour QR patient — rattachement au compte praticien).
async fn fetch_docteur_nom_complet_for_cabinet(pays: &str, tab_id: &str, docteur_id: &str) -> Option<String> {
    let did = docteur_id.trim();
    if did.is_empty() {
        return None;
    }
    let tid = db::sanitize_tab_id(tab_id);
    let mut conn = connect_db(pays, &tid, "yellow").await.ok()?;
    let _ = crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tid).await.ok()?;
    let ut = "tab_user".to_string();
    let sql = format!(
        "SELECT TRIM(COALESCE(prenom,'')), TRIM(COALESCE(nom,'')) FROM {} WHERE id = ?1 AND role = 'docteur' LIMIT 1",
        ut
    );
    let row = sqlx::query::<Any>(&sql)
        .bind(did)
        .fetch_optional(&mut conn)
        .await
        .ok()??;
    let pr: String = row.try_get::<String, _>(0).unwrap_or_default();
    let nm: String = row.try_get::<String, _>(1).unwrap_or_default();
    let full = format!("{} {}", pr.trim(), nm.trim()).trim().to_string();
    if full.is_empty() {
        None
    } else {
        Some(full)
    }
}

/// Contexte commun des QR identité: nom cabinet + nom complet du docteur rattaché.
async fn fetch_qr_identity_context(
    pays: &str,
    tab_id: &str,
    logg_id: &str,
) -> (Option<String>, Option<String>) {
    let tid = db::sanitize_tab_id(tab_id);
    let lg = logg_id.trim();

    let mut cabinet_nom = fetch_cabinet_nom_green(pays, tid.as_str(), lg).await;
    if cabinet_nom.is_none() {
        cabinet_nom = fetch_cabinet_nom_green(pays, "main", lg).await;
    }
    // Souvent `tab_cabinet.id` = UUID docteur (ou `main`) alors que `lg` vient du patient — essais supplémentaires.
    if cabinet_nom.is_none() && !tid.is_empty() && tid != "main" {
        cabinet_nom = fetch_cabinet_nom_green(pays, tid.as_str(), tid.as_str()).await;
    }
    if cabinet_nom.is_none() && tid != "main" {
        cabinet_nom = fetch_cabinet_nom_green(pays, "main", tid.as_str()).await;
    }
    if cabinet_nom.is_none() {
        cabinet_nom = fetch_any_non_generic_cabinet_nom_green(pays, tid.as_str()).await;
    }
    if cabinet_nom.is_none() && tid != "main" {
        cabinet_nom = fetch_any_non_generic_cabinet_nom_green(pays, "main").await;
    }

    // Cas nominal: tab_id == docteur propriétaire.
    let mut docteur_full =
        fetch_docteur_nom_complet_for_cabinet(pays, tid.as_str(), tid.as_str()).await;
    if docteur_full.is_none() && tid.as_str() != "main" {
        docteur_full = fetch_docteur_nom_complet_for_cabinet(pays, "main", tid.as_str()).await;
    }

    // Fallback: certaines bases ont docteur_id == logg_id.
    if docteur_full.is_none() && !lg.is_empty() {
        docteur_full = fetch_docteur_nom_complet_for_cabinet(pays, tid.as_str(), lg).await;
        if docteur_full.is_none() {
            docteur_full = fetch_docteur_nom_complet_for_cabinet(pays, "main", lg).await;
        }
    }

    (cabinet_nom, docteur_full)
}

/// Génère un QR code à la demande (pas de stockage).
/// Le **contenu** du QR est chiffré au format CryptoJS / mobile : `encodeURIComponent(base64(iv):ciphertext)`
/// avec `REACT_APP_CRIPT_KEY` (voir `get_cript_key`), pour lecture par l’app LoggAppro mobile (`decryptData` + `criptKeyQR`).
///
/// Champs JSON pour création de compte mobile : `id`, `tabId`, `role`, `pays`, `loggId` (cabinet), `nom` / `prenom` si connus,
/// optionnel `cabinetNom`, `docteurNomComplet` (patient), `displayLine` (ex. « Dr … » pour scan mobile),
/// `kind`: `loggappro_identity_v1`, `ts`.
fn generate_qrcode_base64(
    id: &str,
    tab_id: &str,
    role: &str,
    pays: &str,
    logg_id: &str,
    nom: Option<&str>,
    prenom: Option<&str>,
    cabinet_nom: Option<&str>,
    docteur_nom_complet: Option<&str>,
    display_line: Option<&str>,
) -> Result<String, String> {
    let lg = logg_id.trim();
    let lg = if lg.is_empty() { tab_id } else { lg };
    let mut m = serde_json::Map::new();
    m.insert("id".into(), json!(id));
    m.insert("tabId".into(), json!(tab_id));
    m.insert("role".into(), json!(role));
    m.insert("pays".into(), json!(pays));
    m.insert("loggId".into(), json!(lg));
    m.insert("kind".into(), json!("loggappro_identity_v1"));
    m.insert("ts".into(), json!(Utc::now().timestamp_millis()));
    if let Some(n) = nom {
        let t = n.trim();
        if !t.is_empty() {
            m.insert("nom".into(), json!(t));
        }
    }
    if let Some(n) = prenom {
        let t = n.trim();
        if !t.is_empty() {
            m.insert("prenom".into(), json!(t));
        }
    }
    if let Some(c) = cabinet_nom {
        let t = c.trim();
        if !t.is_empty() {
            m.insert("cabinetNom".into(), json!(t));
        }
    }
    if let Some(d) = docteur_nom_complet {
        let t = d.trim();
        if !t.is_empty() {
            m.insert("docteurNomComplet".into(), json!(t));
        }
    }
    if let Some(d) = display_line {
        let t = d.trim();
        if !t.is_empty() {
            m.insert("displayLine".into(), json!(t));
        }
    }
    let text = serde_json::Value::Object(m).to_string();
    let encrypted = crypto::encrypt_data(&text, &get_cript_key())?;
    let b64 = draw_base64(&encrypted).map_err(|e| format!("QR génération: {}", e))?;
    Ok(format!("data:image/png;base64,{}", b64))
}

// ========== Page Ouverture ==========

#[tauri::command]
pub async fn create_docteur(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body
        .ok_or_else(|| body_manquant_avec_payload(&payload, Some("vérifiez le chiffrement")))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn").to_lowercase();
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));

    check_paiement_actif("", &tab_id, &pays).await?;

    let mut conn = connect_db(&pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let nom = obj.get("nom").and_then(|v| v.as_str()).unwrap_or("").trim();
    let prenom = obj.get("prenom").and_then(|v| v.as_str()).unwrap_or("").trim();
    let login = obj.get("login").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase();
    let password_plain = obj.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let password = hash_password(password_plain).unwrap_or_else(|_| password_plain.to_string());
    let telephone = obj.get("telephone").and_then(|v| v.as_str()).unwrap_or("").trim();
    let role = "docteur";

    if login.is_empty() || telephone.is_empty() {
        return Err("Login et téléphone sont obligatoires".to_string());
    }

    let mut tx = conn.begin().await.map_err(sql_err)?;
    let user_err = sqlx::query::<Any>("INSERT INTO tab_user (id, nom, prenom, login, password, telephone, role, date_creation) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
        .bind(&id)
        .bind(nom)
        .bind(prenom)
        .bind(&login)
        .bind(&password)
        .bind(telephone)
        .bind(role)
        .bind(&now)
        .execute(&mut *tx)
        .await;
    if let Err(ref e) = user_err {
        let msg = e.to_string();
        if msg.contains("UNIQUE constraint failed") && (msg.contains("login") || msg.contains("tab_user")) {
            return Err("Cet email est déjà utilisé. Veuillez en choisir un autre.".to_string());
        }
    }
    user_err.map_err(|e| format!("tab_user: {}", e))?;
    sqlx::query::<Any>("INSERT INTO tab_docteur (id, date_creation) VALUES (?1, ?2)")
        .bind(&id)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("tab_docteur: {}", e))?;
    let conn_err = sqlx::query::<Any>("INSERT INTO tab_connection (id, logg_id, login, telephone, password, role) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
        .bind(&id)
        .bind("")
        .bind(&login)
        .bind(telephone)
        .bind(&password)
        .bind(role)
        .execute(&mut *tx)
        .await;
    if let Err(ref e) = conn_err {
        let msg = e.to_string();
        if msg.contains("UNIQUE constraint failed") && (msg.contains("login") || msg.contains("telephone")) {
            return Err("Cet email ou ce numéro de téléphone est déjà utilisé. Veuillez en choisir un autre.".to_string());
        }
    }
    conn_err.map_err(|e| format!("tab_connection: {}", e))?;
    tx.commit().await.map_err(sql_err)?;

    // Toujours le jeu complet des privilèges (indépendant de l’ancien modèle `tab_type_docteur` sur bases existantes).
    let _ = insert_default_privilege_row_green(&pays, &tab_id, &id, PRIV_NOM_DEFAUT_DOCTEUR).await;

    // Créer le type "Assistant" par défaut (sans utilisateurs) dans tab_type_collaborateur
    if let Ok(mut conn_green) = connect_db(&pays, &tab_id, "green").await {
        let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, &tab_id).await;
        let type_table = "tab_type_collaborateur".to_string();
        let count_row = sqlx::query::<Any>(&format!("SELECT COUNT(*) FROM {} WHERE nom = 'Assistant'", type_table))
            .fetch_one(&mut conn_green)
            .await;
        let count: i64 = count_row.ok().and_then(|r| r.try_get(0).ok()).unwrap_or(0);
        if count == 0 {
            let type_id = Uuid::new_v4().to_string();
            let roles_defaut = "slf01,crd02,crd03,crd04,crd05,stt01,imp01,exp01,vpr01,vac01,vna01,vns01";
            let _ = sqlx::query::<Any>(&format!("INSERT INTO {} (id, nom, roles_par_defaut, date_creation) VALUES (?1, ?2, ?3, ?4)", type_table))
                .bind(&type_id)
                .bind("Assistant")
                .bind(roles_defaut)
                .bind(&now)
                .execute(&mut conn_green)
                .await;
        }
    }

    upsert_pay_inscription_silent(&pays, &tab_id, &id, &now).await;

    Ok(json!({ "id": id }))
}

#[tauri::command]
pub async fn create_cabinet(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));

    check_paiement_actif("", &tab_id, pays).await?;

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let nom = obj.get("nom").and_then(|v| v.as_str()).unwrap_or("");
    let adresse = obj.get("adresse").and_then(|v| v.as_str()).unwrap_or("");

    sqlx::query::<Any>("INSERT OR IGNORE INTO tab_cabinet (id, nom, adresse, pays, date_creation) VALUES (?1, ?2, ?3, ?4, ?5)")
        .bind(&id)
        .bind(nom)
        .bind(adresse)
        .bind(pays.to_uppercase())
        .bind(&now)
        .execute(&mut conn)
        .await
        .map_err(sql_err)?;

    Ok(json!({ "id": id }))
}

#[tauri::command]
pub async fn auth_connection(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let login_or_tel = obj.get("loginOrTel").and_then(|v| v.as_str()).unwrap_or("");
    let password = obj.get("password").and_then(|v| v.as_str()).unwrap_or("");

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    let row = sqlx::query::<Any>("SELECT id, logg_id, login, telephone, role, password FROM tab_connection WHERE login = ?1 OR telephone = ?1")
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

        let user_row = sqlx::query::<Any>(&format!("SELECT id, nom, prenom, naissance, adresse FROM {} WHERE id = ?1", user_table))
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

        // Mot de passe trop basique (0000 ou 1234) : forcer le changement (docteur, patient, collaborateurs)
        let must_change_basic = matches!(
            role.as_str(),
            "docteur" | "patient" | "assistant" | "comptable" | "secretaire" | "collaborateur"
        ) && (password == "1234" || password == "0000");

        // Si mot de passe par défaut du cabinet : forcer le changement
        let must_change = must_change_basic || if role != "docteur" && role != "patient" {
            let cab_tab = if logg_id.is_empty() { "main" } else { &logg_id };
            if let Ok(mut conn_green) = connect_db(pays, &tab_id, "green").await {
                let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, cab_tab).await;
            let cabinet_table = "tab_cabinet".to_string();
            let cab_id = if logg_id.is_empty() { &id } else { &logg_id };
                if let Ok(Some(r)) = sqlx::query::<Any>(&format!("SELECT COALESCE(password_defaut,'') FROM {} WHERE id = ?1", cabinet_table))
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

        // Compte démo Doc01 : proposer de changer l'email (modal côté client, fermable).
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

// ========== Patients ==========

#[tauri::command]
pub async fn upsert_patient(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());

    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let patient_table = "tab_patient".to_string();
    let custom_cols = get_patient_custom_columns(&mut conn, &patient_table).await.unwrap_or_default();

    let id = obj.get("id").and_then(|v| v.as_str()).map(String::from)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    // loggId : identifiant du cabinet/onglet pour le patient (comme Express). Si absent, utiliser timestamp.
    let logg_id = obj.get("loggId").and_then(|v| v.as_str()).map(String::from)
        .unwrap_or_else(|| Utc::now().timestamp_millis().to_string());
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let nom = obj.get("nom").and_then(|v| v.as_str()).unwrap_or("");
    let prenom = obj.get("prenom").and_then(|v| v.as_str()).unwrap_or("");
    let login = obj.get("login").and_then(|v| v.as_str()).unwrap_or("");
    let password_plain = obj.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let password = if password_plain.is_empty() { String::new() } else { hash_password(password_plain).unwrap_or_else(|_| password_plain.to_string()) };
    let telephone = obj.get("telephone").and_then(|v| v.as_str()).unwrap_or("");
    let naissance = obj.get("naissance").and_then(|v| v.as_str()).unwrap_or("");
    let adresse = obj.get("adresse").and_then(|v| v.as_str()).unwrap_or("");
    let nom_de_jeune_fille = obj.get("nomDeJeuneFille").and_then(|v| v.as_str()).unwrap_or("");
    let profession = obj.get("profession").and_then(|v| v.as_str()).unwrap_or("");
    let adresser_par = obj.get("adresserPar").and_then(|v| v.as_str()).unwrap_or("");
    let observation = obj.get("observation").and_then(|v| v.as_str()).unwrap_or("");

    sqlx::query::<Any>("INSERT OR REPLACE INTO tab_user (id, nom, prenom, login, password, telephone, naissance, role, adresse, logg_id, date_creation) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)")
        .bind(&id)
        .bind(nom)
        .bind(prenom)
        .bind(&login)
        .bind(&password)
        .bind(telephone)
        .bind(naissance)
        .bind("patient")
        .bind(adresse)
        .bind(&logg_id)
        .bind(&now)
        .execute(&mut conn)
        .await
        .map_err(sql_err)?;

    let mut patient_cols: Vec<String> = vec![
        "id".into(), "nom_de_jeune_fille".into(), "profession".into(),
        "adresserPar".into(), "observation".into(), "date_creation".into(),
    ];
    let mut patient_vals: Vec<String> = vec![
        id.clone(),
        nom_de_jeune_fille.to_string(),
        profession.to_string(),
        adresser_par.to_string(),
        observation.to_string(),
        now.clone(),
    ];
    for col in &custom_cols {
        let val = obj.get(col).and_then(|v| v.as_str()).unwrap_or("");
        patient_cols.push(col.clone());
        patient_vals.push(val.to_string());
    }
    let col_str = patient_cols.join(", ");
    let placeholders = (1..=patient_cols.len()).map(|i| format!("?{}", i)).collect::<Vec<_>>().join(", ");
    let sql = format!("INSERT OR REPLACE INTO {} ({}) VALUES ({})", patient_table, col_str, placeholders);
    let mut q = sqlx::query::<Any>(&sql);
    for v in &patient_vals {
        q = q.bind(v);
    }
    q.execute(&mut conn).await.map_err(sql_err)?;

    sqlx::query::<Any>("INSERT OR REPLACE INTO tab_connection (id, logg_id, login, telephone, password, role) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
        .bind(&id)
        .bind(&logg_id)
        .bind(&login)
        .bind(telephone)
        .bind(&password)
        .bind("patient")
        .execute(&mut conn)
        .await
        .map_err(sql_err)?;

    Ok(json!({ "id": id }))
}

#[tauri::command]
pub async fn list_patients(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    // Si limit <= 1 (erreur frontend), utiliser 50 pour afficher la liste complète
    let limit = match p.limit.unwrap_or(50) {
        n if n <= 1 => 50,
        n => n.min(500),
    };
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    let patient_table = "tab_patient".to_string();

    let sql = format!(
        "SELECT u.id, u.nom, u.prenom, u.login, u.password, u.telephone, u.naissance, u.role, u.adresse, u.logg_id, p.nom_de_jeune_fille, p.profession, p.adresserPar, p.observation, CAST(p.date_creation AS TEXT) as date_creation
         FROM {} u
         INNER JOIN {} p ON u.id = p.id
         WHERE u.role = 'patient'
         LIMIT ?1",
        user_table, patient_table
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(limit as i64)
        .fetch_all(&mut conn)
        .await
        .map_err(sql_err)?;

    let mut list = Vec::new();
    for row in rows {
        list.push(json!({
            "user": {
                "id": row.try_get::<String, _>(0).unwrap_or_default(),
                "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
                "prenom": row.try_get::<Option<String>, _>(2).ok().flatten(),
                "login": row.try_get::<Option<String>, _>(3).ok().flatten(),
                "password": row.try_get::<Option<String>, _>(4).ok().flatten(),
                "telephone": row.try_get::<Option<String>, _>(5).ok().flatten(),
                "naissance": row.try_get::<Option<String>, _>(6).ok().flatten(),
                "role": row.try_get::<Option<String>, _>(7).ok().flatten(),
                "adresse": row.try_get::<Option<String>, _>(8).ok().flatten(),
                "loggId": row.try_get::<Option<String>, _>(9).ok().flatten(),
            },
            "patient": {
                "nomDeJeuneFille": row.try_get::<Option<String>, _>(10).ok().flatten(),
                "profession": row.try_get::<Option<String>, _>(11).ok().flatten(),
                "adresserPar": row.try_get::<Option<String>, _>(12).ok().flatten(),
                "observation": row.try_get::<Option<String>, _>(13).ok().flatten(),
                "date_creation": row.try_get::<Option<String>, _>(14).ok().flatten(),
            }
        }));
    }

    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_patient_detail(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().ok_or("ID patient manquant")?;
    let mut tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let mut user_table = "tab_user".to_string();
    let mut patient_table = "tab_patient".to_string();

    let sql = format!(
        "SELECT u.id, u.nom, u.prenom, u.login, u.password, u.telephone, u.naissance, u.role, u.adresse, u.logg_id, p.nom_de_jeune_fille, p.profession, p.adresserPar, p.observation, CAST(p.date_creation AS TEXT) as date_creation
         FROM {} u
         INNER JOIN {} p ON u.id = p.id
         WHERE u.id = ?1",
        user_table, patient_table
    );

    let mut row = sqlx::query::<Any>(&sql)
        .bind(&id)
        .fetch_optional(&mut conn)
        .await
        .map_err(sql_err)?;

    // Fallback: si patient non trouvé et tab_id != main, réessayer avec main
    if row.is_none() && tab_id != "main" {
        tab_id = "main".to_string();
        user_table = "tab_user".to_string();
        patient_table = "tab_patient".to_string();
        conn = connect_db(pays, &tab_id, "yellow").await?;
        crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;
        let sql_main = format!(
            "SELECT u.id, u.nom, u.prenom, u.login, u.password, u.telephone, u.naissance, u.role, u.adresse, u.logg_id, p.nom_de_jeune_fille, p.profession, p.adresserPar, p.observation, CAST(p.date_creation AS TEXT) as date_creation
             FROM {} u
             INNER JOIN {} p ON u.id = p.id
             WHERE u.id = ?1",
            user_table, patient_table
        );
        row = sqlx::query::<Any>(&sql_main)
            .bind(&id)
            .fetch_optional(&mut conn)
            .await
            .map_err(sql_err)?;
    }

    let mut data = match row {
        Some(r) => json!({
            "user": {
                "id": r.try_get::<String, _>(0).unwrap_or_default(),
                "nom": r.try_get::<Option<String>, _>(1).ok().flatten(),
                "prenom": r.try_get::<Option<String>, _>(2).ok().flatten(),
                "login": r.try_get::<Option<String>, _>(3).ok().flatten(),
                "password": r.try_get::<Option<String>, _>(4).ok().flatten(),
                "telephone": r.try_get::<Option<String>, _>(5).ok().flatten(),
                "naissance": r.try_get::<Option<String>, _>(6).ok().flatten(),
                "role": r.try_get::<Option<String>, _>(7).ok().flatten(),
                "adresse": r.try_get::<Option<String>, _>(8).ok().flatten(),
                "loggId": r.try_get::<Option<String>, _>(9).ok().flatten(),
            },
            "patient": {
                "nomDeJeuneFille": r.try_get::<Option<String>, _>(10).ok().flatten(),
                "profession": r.try_get::<Option<String>, _>(11).ok().flatten(),
                "adresserPar": r.try_get::<Option<String>, _>(12).ok().flatten(),
                "observation": r.try_get::<Option<String>, _>(13).ok().flatten(),
                "date_creation": r.try_get::<Option<String>, _>(14).ok().flatten(),
            }
        }),
        None => return Err("Patient non trouvé".to_string()),
    };

    let custom_cols = get_patient_custom_columns(&mut conn, &patient_table).await.unwrap_or_default();
    if !custom_cols.is_empty() {
        let cols_joined = custom_cols.iter().map(|c| format!("p.{}", c)).collect::<Vec<_>>().join(", ");
        let sql_custom = format!(
            "SELECT {} FROM {} p WHERE p.id = ?1",
            cols_joined, patient_table
        );
        if let Ok(Some(custom_row)) = sqlx::query::<Any>(&sql_custom)
            .bind(&id)
            .fetch_optional(&mut conn)
            .await
        {
            let mut custom_map = serde_json::Map::new();
            for (i, col) in custom_cols.iter().enumerate() {
                let val: Option<String> = custom_row.try_get(i).ok();
                custom_map.insert(col.clone(), json!(val.unwrap_or_default()));
            }
            if let Some(patient) = data.get_mut("patient").and_then(|v| v.as_object_mut()) {
                for (k, v) in custom_map {
                    patient.insert(k, v);
                }
            }
        }
    }

    encrypt_response(&data, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn update_patient_detail(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let id = obj.get("id").and_then(|v| v.as_str()).ok_or("ID manquant")?;
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    let patient_table = "tab_patient".to_string();

    let nom = obj.get("nom").and_then(|v| v.as_str()).unwrap_or("");
    let prenom = obj.get("prenom").and_then(|v| v.as_str()).unwrap_or("");
    let login = obj.get("login").and_then(|v| v.as_str()).unwrap_or("");
    let password_plain = obj.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let password = if password_plain.is_empty() { String::new() } else { hash_password(password_plain).unwrap_or_else(|_| password_plain.to_string()) };
    let telephone = obj.get("telephone").and_then(|v| v.as_str()).unwrap_or("");
    let naissance = obj.get("naissance").and_then(|v| v.as_str()).unwrap_or("");
    let adresse = obj.get("adresse").and_then(|v| v.as_str()).unwrap_or("");
    let nom_de_jeune_fille = obj.get("nomDeJeuneFille").and_then(|v| v.as_str()).unwrap_or("");
    let profession = obj.get("profession").and_then(|v| v.as_str()).unwrap_or("");
    let adresser_par = obj.get("adresserPar").and_then(|v| v.as_str()).unwrap_or("");
    let observation = obj.get("observation").and_then(|v| v.as_str()).unwrap_or("");

    sqlx::query::<Any>("UPDATE tab_user SET nom=?1, prenom=?2, login=?3, password=?4, telephone=?5, naissance=?6, adresse=?7 WHERE id=?8")
        .bind(nom)
        .bind(prenom)
        .bind(login)
        .bind(&password)
        .bind(telephone)
        .bind(naissance)
        .bind(adresse)
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(sql_err)?;
    sqlx::query::<Any>(&format!("UPDATE {} SET nom_de_jeune_fille=?1, profession=?2, adresserPar=?3, observation=?4 WHERE id=?5", patient_table))
        .bind(nom_de_jeune_fille)
        .bind(profession)
        .bind(adresser_par)
        .bind(observation)
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(sql_err)?;
    sqlx::query::<Any>("UPDATE tab_connection SET login=?1, telephone=?2, password=?3 WHERE id=?4")
        .bind(login)
        .bind(telephone)
        .bind(&password)
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(sql_err)?;

    let custom_cols = get_patient_custom_columns(&mut conn, &patient_table).await.unwrap_or_default();
    for col in custom_cols {
        if let Some(v) = obj.get(&col).and_then(|x| x.as_str()) {
            let sql = format!("UPDATE {} SET {} = ?1 WHERE id = ?2", patient_table, col);
            let _ = sqlx::query::<Any>(&sql).bind(v).bind(id).execute(&mut conn).await;
        }
    }

    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn delete_patient(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().ok_or("ID patient manquant")?;
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    let cabinet_id = tab_id.as_str();
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;

    sqlx::query::<Any>("DELETE FROM tab_user WHERE id=?1")
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(sql_err)?;
    sqlx::query::<Any>("DELETE FROM tab_patient WHERE id=?1")
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(sql_err)?;
    sqlx::query::<Any>("DELETE FROM tab_connection WHERE id=?1")
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(sql_err)?;

    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn search_patients(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().or(p.params.get(0).map(|s| s.as_str())).unwrap_or("main"));
    let search = p.params.get(1).map(|s| s.as_str()).unwrap_or("");
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    let patient_table = "tab_patient".to_string();
    let like = format!("%{}%", search.to_lowercase());

    let sql = format!(
        "SELECT u.id, u.nom, u.prenom, u.login, u.telephone, u.naissance, u.role, u.adresse, u.logg_id,
                p.nom_de_jeune_fille, p.profession, p.adresserPar, p.observation, CAST(p.date_creation AS TEXT) as p_date_creation, p.avoir_annuelle
         FROM {} u
         INNER JOIN {} p ON u.id = p.id
         WHERE u.role = 'patient' AND (
             LOWER(COALESCE(u.nom,'')) LIKE ?1 OR LOWER(COALESCE(u.prenom,'')) LIKE ?1
             OR LOWER(COALESCE(u.login,'')) LIKE ?1 OR LOWER(COALESCE(u.telephone,'')) LIKE ?1
             OR LOWER(COALESCE(p.nom_de_jeune_fille,'')) LIKE ?1 OR LOWER(u.id) LIKE ?1
             OR LOWER(COALESCE(p.profession,'')) LIKE ?1 OR LOWER(COALESCE(p.observation,'')) LIKE ?1
         )
         LIMIT 50",
        user_table, patient_table
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(&like)
        .fetch_all(&mut conn)
        .await
        .map_err(sql_err)?;

    let mut list = Vec::new();
    for row in rows {
        let item = json!({
            "user": {
                "id": row.try_get::<String, _>(0).ok(),
                "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
                "prenom": row.try_get::<Option<String>, _>(2).ok().flatten(),
                "login": row.try_get::<Option<String>, _>(3).ok().flatten(),
                "telephone": row.try_get::<Option<String>, _>(4).ok().flatten(),
                "naissance": row.try_get::<Option<String>, _>(5).ok().flatten(),
                "role": row.try_get::<Option<String>, _>(6).ok().flatten(),
                "adresse": row.try_get::<Option<String>, _>(7).ok().flatten(),
                "loggId": row.try_get::<Option<String>, _>(8).ok().flatten(),
            },
            "patient": {
                "nomDeJeuneFille": row.try_get::<Option<String>, _>(9).ok().flatten(),
                "profession": row.try_get::<Option<String>, _>(10).ok().flatten(),
                "adresserPar": row.try_get::<Option<String>, _>(11).ok().flatten(),
                "observation": row.try_get::<Option<String>, _>(12).ok().flatten(),
                "dateCreation": row.try_get::<Option<String>, _>(13).ok().flatten(),
                "avoirAnnuelle": row.try_get::<Option<String>, _>(14).ok().flatten(),
            }
        });
        list.push(item);
    }

    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

/// Désactivé définitivement après connexion Sadmin (`remove_demo_docteur_after_sadmin_login`).
fn demo_doctor_flag_path() -> std::path::PathBuf {
    db::get_databases_dir().join("demo_doctor_disabled.flag")
}

#[tauri::command]
pub async fn ensure_default_demo_docteur(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
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
        // Réparation : Doc01 existe mais `tab_privilege` peut manquer (green inaccessible au 1er passage, etc.)
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
    sqlx::query::<Any>(
        "INSERT INTO tab_docteur (id, date_creation, logg_id) VALUES (?1,?2,?3)",
    )
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
    upsert_pay_inscription_silent(pays, &tab_id, DEMO_DOCTOR_ID, &now).await;
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
    let _ = sqlx::query::<Any>("DELETE FROM tab_connection WHERE LOWER(TRIM(login)) = LOWER(?1) OR id = ?2")
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

/// Copie `tab_config` admin `from_tab__*` → `to_tab__*` (valeurs avec remplacements), puis supprime les anciennes lignes.
async fn admin_tab_config_migrate_prefix(
    pays: &str,
    from_tab: &str,
    to_tab: &str,
    replace_pairs: &[(&str, &str)],
) -> Result<(), String> {
    let mut conn = crate::db_sqlx::connect_admin().await?;
    let _ = crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, "main").await;
    let schema = admin_schema::load_schema().map_err(|e| e.to_string())?;
    let (key_col, val_col, dt_col) =
        crate::db_sqlx::resolve_tab_config_phys_cols_full(&mut conn, &schema).await?;
    let prefix_from = format!("{}__", from_tab);
    let sql_all = format!("SELECT rowid, {}, {} FROM tab_config", key_col, val_col);
    let rows = sqlx::query::<Any>(&sql_all)
        .fetch_all(&mut conn)
        .await
        .map_err(sql_err)?;
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let ins_sql = format!(
        "INSERT OR REPLACE INTO tab_config ({}, {}, {}) VALUES (?1, ?2, ?3)",
        key_col, val_col, dt_col
    );
    let mut inserts: Vec<(String, String)> = Vec::new();
    let mut rowids_del: Vec<i64> = Vec::new();
    for row in rows {
        let rid: i64 = row.try_get(0).map_err(sql_err)?;
        let k_enc: String = row.try_get(1).map_err(sql_err)?;
        let v_enc: Option<String> = row.try_get(2).ok();
        let k_full = schema.decrypt_value_or_raw("tab_config", "config_key", &k_enc);
        if !k_full.starts_with(&prefix_from) {
            continue;
        }
        let rest = k_full.strip_prefix(&prefix_from).unwrap_or("");
        let new_key = format!("{}__{}", to_tab, rest);
        let mut v_plain =
            schema.decrypt_value_or_raw("tab_config", "config_value", &v_enc.unwrap_or_default());
        for (a, b) in replace_pairs {
            if !a.is_empty() && a != b {
                v_plain = v_plain.replace(a, b);
            }
        }
        inserts.push((new_key, v_plain));
        rowids_del.push(rid);
    }
    for (nk, nv) in inserts {
        let enc_k = schema.encrypt_value("tab_config", "config_key", &nk)?;
        let enc_v = schema.encrypt_value("tab_config", "config_value", &nv)?;
        let enc_now = schema.encrypt_value("tab_config", "date_creation", &now)?;
        sqlx::query::<Any>(&ins_sql)
            .bind(&enc_k)
            .bind(&enc_v)
            .bind(&enc_now)
            .execute(&mut conn)
            .await
            .map_err(sql_err)?;
    }
    for rid in rowids_del {
        let _ = sqlx::query::<Any>("DELETE FROM tab_config WHERE rowid = ?1")
            .bind(rid)
            .execute(&mut conn)
            .await;
    }
    Ok(())
}

/// Renomme les tables dynamiques `*<old_suffix>` → `*<new_suffix>` (blue / green / orange par cabinet).
async fn rename_sqlite_tables_suffix(
    conn: &mut sqlx::AnyConnection,
    old_suffix: &str,
    new_suffix: &str,
) -> Result<(), String> {
    if old_suffix == new_suffix {
        return Ok(());
    }
    let _ = sqlx::query::<Any>("PRAGMA foreign_keys=OFF")
        .execute(&mut *conn)
        .await;
    let rows = sqlx::query::<Any>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .fetch_all(&mut *conn)
    .await
    .map_err(sql_err)?;
    let mut names: Vec<String> = Vec::new();
    for row in rows {
        if let Ok(n) = row.try_get::<String, _>(0) {
            if n.ends_with(old_suffix) {
                names.push(n);
            }
        }
    }
    names.sort();
    for name in names {
        let Some(prefix) = name.strip_suffix(old_suffix) else {
            continue;
        };
        let new_name = format!("{}{}", prefix, new_suffix);
        if new_name == name {
            continue;
        }
        let esc_old = name.replace('"', "\"\"");
        let esc_new = new_name.replace('"', "\"\"");
        let sql = format!(r#"ALTER TABLE "{}" RENAME TO "{}""#, esc_old, esc_new);
        sqlx::query::<Any>(&sql)
            .execute(&mut *conn)
            .await
            .map_err(|e| format!("Renommage table {}: {}", name, e))?;
    }
    let _ = sqlx::query::<Any>("PRAGMA foreign_keys=ON")
        .execute(&mut *conn)
        .await;
    Ok(())
}

/// Après migration des clés `tab_config`, renomme les tables portant le suffixe démo vers le suffixe du nouvel id.
async fn rename_demo_doctor_db_tables_after_id_change(pays: &str, new_doc_id: &str) -> Result<(), String> {
    let old_suf = db::sanitize_tab_id(DEMO_DOCTOR_ID);
    let new_suf = db::sanitize_tab_id(new_doc_id);
    for color in ["blue", "green", "orange"] {
        let Ok(mut conn) = connect_db(pays, new_doc_id, color).await else {
            continue;
        };
        let _ = rename_sqlite_tables_suffix(&mut conn, &old_suf, &new_suf).await;
    }
    Ok(())
}

/// Remplace le compte **démo** par un **nouveau** docteur (nouvel id UUID, même logique que `create_docteur`) :
/// migration admin blue/green/orange, rattachement des patients, suppression des lignes démo, puis le client doit se reconnecter.
#[tauri::command]
pub async fn finalize_demo_docteur_email(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let tab_main = "main";

    let user_id = obj.get("userId").and_then(|v| v.as_str()).unwrap_or("").trim();
    if user_id != DEMO_DOCTOR_ID {
        return Err("Cette action est réservée au compte de démonstration docteur.".to_string());
    }

    let new_login = obj
        .get("newLogin")
        .or(obj.get("login"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_lowercase();
    if new_login.is_empty() || !new_login.contains('@') || new_login.len() < 5 {
        return Err("Veuillez saisir une adresse e-mail valide.".to_string());
    }
    if new_login == DEMO_DOCTOR_LOGIN {
        return Err("Choisissez une adresse différente de celle de démonstration (doc01@01.com).".to_string());
    }

    let new_password_plain = obj
        .get("newPassword")
        .or(obj.get("password"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if new_password_plain.len() < 4 {
        return Err("Choisissez un mot de passe d’au moins 4 caractères.".to_string());
    }
    let password = hash_password(new_password_plain).map_err(|e| e.to_string())?;

    let nom_in = obj.get("nom").and_then(|v| v.as_str()).unwrap_or("").trim();
    let prenom_in = obj.get("prenom").and_then(|v| v.as_str()).unwrap_or("").trim();
    let telephone_in = obj.get("telephone").and_then(|v| v.as_str()).unwrap_or("").trim();

    let new_id = Uuid::new_v4().to_string();
    let old_suf = db::sanitize_tab_id(DEMO_DOCTOR_ID);
    let new_suf = db::sanitize_tab_id(&new_id);

    let user_table = "tab_user".to_string();
    let docteur_table = "tab_docteur".to_string();

    // Phase 1 : lire / valider sur yellow puis **fermer** la connexion avant migrate admin + rename des
    // bases blue/green/orange. Sinon (même fichier SQLite pour plusieurs couleurs, ou schéma modifié)
    // la transaction yellow peut échouer et tout est annulé → démo intact, pas de nouveau docteur.
    let (nom_f, prenom_f, tel_f) = {
        let mut conn = connect_db(pays, tab_main, "yellow").await?;
        crate::db_sqlx::ensure_tables_sqlx(&mut conn, tab_main).await?;

    let dup_u: i64 = sqlx::query::<Any>(&format!(
        "SELECT COUNT(*) FROM {} WHERE LOWER(TRIM(login)) = LOWER(?1) AND id != ?2",
        user_table
    ))
    .bind(&new_login)
    .bind(DEMO_DOCTOR_ID)
    .fetch_one(&mut conn)
    .await
    .map_err(sql_err)?
    .try_get::<i64, _>(0)
    .unwrap_or(0);
    if dup_u > 0 {
        return Err("Cet e-mail est déjà utilisé par un autre compte.".to_string());
    }

    let dup_conn: i64 = sqlx::query::<Any>(
        "SELECT COUNT(*) FROM tab_connection WHERE LOWER(TRIM(login)) = LOWER(?1) AND id != ?2",
    )
    .bind(&new_login)
    .bind(DEMO_DOCTOR_ID)
    .fetch_one(&mut conn)
    .await
    .map_err(sql_err)?
    .try_get::<i64, _>(0)
    .unwrap_or(0);
    if dup_conn > 0 {
        return Err("Cet e-mail est déjà utilisé pour une connexion.".to_string());
    }

    let demo_row = sqlx::query::<Any>(&format!(
        "SELECT nom, prenom, telephone FROM {} WHERE id = ?1 LIMIT 1",
        user_table
    ))
    .bind(DEMO_DOCTOR_ID)
    .fetch_optional(&mut conn)
    .await
    .map_err(sql_err)?;
    let (nom_f, prenom_f, tel_f) = if let Some(r) = demo_row {
        let dn: String = r.try_get::<Option<String>, _>(0).ok().flatten().unwrap_or_default();
        let dp: String = r.try_get::<Option<String>, _>(1).ok().flatten().unwrap_or_default();
        let dt: String = r.try_get::<Option<String>, _>(2).ok().flatten().unwrap_or_default();
        let nom = if nom_in.is_empty() {
            dn.trim().to_string()
        } else {
            nom_in.to_string()
        };
        let prenom = if prenom_in.is_empty() {
            dp.trim().to_string()
        } else {
            prenom_in.to_string()
        };
        let tel = if telephone_in.is_empty() {
            if dt.trim().is_empty() {
                "770000001".to_string()
            } else {
                dt.trim().to_string()
            }
        } else {
            telephone_in.to_string()
        };
        (nom, prenom, tel)
    } else {
        return Err("Compte démo introuvable. Réessayez après réinstallation du dossier démo.".to_string());
    };

    if tel_f.trim().is_empty() {
        return Err("Un numéro de téléphone est requis (ou renseigné sur le compte démo).".to_string());
    }

    let dup_tel_c: i64 = sqlx::query::<Any>(
        "SELECT COUNT(*) FROM tab_connection WHERE TRIM(telephone) = TRIM(?1) AND id != ?2",
    )
    .bind(&tel_f)
    .bind(DEMO_DOCTOR_ID)
    .fetch_one(&mut conn)
    .await
    .map_err(sql_err)?
    .try_get::<i64, _>(0)
    .unwrap_or(0);
    if dup_tel_c > 0 {
        return Err("Ce numéro de téléphone est déjà utilisé pour une autre connexion.".to_string());
    }

    let dup_tel_u: i64 = sqlx::query::<Any>(&format!(
        "SELECT COUNT(*) FROM {} WHERE TRIM(COALESCE(telephone,'')) = TRIM(?1) AND id != ?2",
        user_table
    ))
    .bind(&tel_f)
    .bind(DEMO_DOCTOR_ID)
    .fetch_one(&mut conn)
    .await
    .map_err(sql_err)?
    .try_get::<i64, _>(0)
    .unwrap_or(0);
    if dup_tel_u > 0 {
        return Err("Ce numéro de téléphone est déjà utilisé par un autre utilisateur (patient ou collaborateur).".to_string());
    }

        (nom_f, prenom_f, tel_f)
    };

    let replace_pairs: Vec<(&str, &str)> = vec![
        (DEMO_DOCTOR_ID, new_id.as_str()),
        (old_suf.as_str(), new_suf.as_str()),
    ];
    admin_tab_config_migrate_prefix(pays, &old_suf, &new_suf, &replace_pairs).await?;
    rename_demo_doctor_db_tables_after_id_change(pays, &new_id).await?;

    // Nouvelle connexion yellow après migrations (voir commentaire phase 1).
    let mut conn = connect_db(pays, tab_main, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, tab_main).await?;

    let demo_present: i64 = sqlx::query::<Any>(&format!(
        "SELECT COUNT(*) FROM {} WHERE id = ?1 AND role = 'docteur'",
        user_table
    ))
    .bind(DEMO_DOCTOR_ID)
    .fetch_one(&mut conn)
    .await
    .map_err(sql_err)?
    .try_get::<i64, _>(0)
    .unwrap_or(0);
    if demo_present == 0 {
        return Err(
            "Compte démo introuvable après migration des bases (finalisation déjà faite ?). Déconnectez-vous et reconnectez-vous avec votre compte définitif."
                .to_string(),
        );
    }

    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut tx = conn.begin().await.map_err(sql_err)?;
    // Rattacher les patients au nouvel id avant de supprimer le démo (même logg_id côté patient).
    sqlx::query::<Any>(&format!(
        "UPDATE {} SET logg_id = ?1 WHERE role = 'patient' AND TRIM(COALESCE(logg_id, '')) = ?2",
        user_table
    ))
    .bind(&new_id)
    .bind(DEMO_DOCTOR_ID)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Rattachement patients: {}", e))?;

    // Supprimer le démo **avant** d’insérer le nouveau docteur : sinon UNIQUE(telephone) échoue si le numéro est inchangé.
    sqlx::query::<Any>(&format!("DELETE FROM {} WHERE id = ?1", docteur_table))
        .bind(DEMO_DOCTOR_ID)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Suppression démo tab_docteur: {}", e))?;
    sqlx::query::<Any>("DELETE FROM tab_connection WHERE id = ?1")
        .bind(DEMO_DOCTOR_ID)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Suppression démo tab_connection: {}", e))?;
    let del_demo_user = sqlx::query::<Any>(&format!("DELETE FROM {} WHERE id = ?1", user_table))
        .bind(DEMO_DOCTOR_ID)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Suppression démo tab_user: {}", e))?
        .rows_affected();
    if del_demo_user != 1 {
        return Err(format!(
            "Suppression démo tab_user : {} ligne(s) (attendu 1). Vérifiez l’id du compte démo.",
            del_demo_user
        ));
    }

    sqlx::query::<Any>(&format!(
        "INSERT INTO {} (id, nom, prenom, login, password, telephone, role, date_creation) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        user_table
    ))
    .bind(&new_id)
    .bind(&nom_f)
    .bind(&prenom_f)
    .bind(&new_login)
    .bind(&password)
    .bind(&tel_f)
    .bind("docteur")
    .bind(&now)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Création docteur (tab_user): {}", e))?;

    sqlx::query::<Any>(&format!(
        "INSERT INTO {} (id, date_creation) VALUES (?1, ?2)",
        docteur_table
    ))
    .bind(&new_id)
    .bind(&now)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Création tab_docteur: {}", e))?;

    sqlx::query::<Any>(
        "INSERT INTO tab_connection (id, logg_id, login, telephone, password, role) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(&new_id)
    .bind("")
    .bind(&new_login)
    .bind(&tel_f)
    .bind(&password)
    .bind("docteur")
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Création tab_connection: {}", e))?;

    tx.commit().await.map_err(sql_err)?;

    if let Ok(mut conn_green) = connect_db(pays, tab_main, "green").await {
        let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, tab_main).await;
        let cabinet_table = "tab_cabinet".to_string();
        let priv_table = "tab_privilege".to_string();
        let _ = sqlx::query::<Any>(&format!("DELETE FROM {} WHERE id = ?1", cabinet_table))
            .bind(DEMO_DOCTOR_ID)
            .execute(&mut conn_green)
            .await;
        let _ = sqlx::query::<Any>(&format!("DELETE FROM {} WHERE id = ?1", priv_table))
            .bind(DEMO_DOCTOR_ID)
            .execute(&mut conn_green)
            .await;
        let _ = sqlx::query::<Any>(&format!(
            "INSERT OR IGNORE INTO {} (id, nom, adresse, pays, logg_id, date_creation) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            cabinet_table
        ))
        .bind(&new_id)
        .bind("Cabinet")
        .bind("")
        .bind(pays.to_uppercase())
        .bind(&new_id)
        .bind(&now)
        .execute(&mut conn_green)
        .await;
        let type_table = "tab_type_collaborateur".to_string();
        let count_row = sqlx::query::<Any>(&format!("SELECT COUNT(*) FROM {} WHERE nom = 'Assistant'", type_table))
            .fetch_one(&mut conn_green)
            .await;
        let count: i64 = count_row.ok().and_then(|r| r.try_get(0).ok()).unwrap_or(0);
        if count == 0 {
            let type_id = Uuid::new_v4().to_string();
            let roles_defaut = "slf01,crd02,crd03,crd04,crd05,stt01,imp01,exp01,vpr01,vac01,vna01,vns01";
            let _ = sqlx::query::<Any>(&format!(
                "INSERT INTO {} (id, nom, roles_par_defaut, date_creation) VALUES (?1, ?2, ?3, ?4)",
                type_table
            ))
            .bind(&type_id)
            .bind("Assistant")
            .bind(roles_defaut)
            .bind(&now)
            .execute(&mut conn_green)
            .await;
        }
    }

    let _ = insert_default_privilege_row_green(pays, tab_main, &new_id, PRIV_NOM_DEFAUT_DOCTEUR).await;

    if let Ok(mut conn_blue) = connect_db(pays, &new_id, "blue").await {
        let _ = crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn_blue, &new_id).await;
    }
    if let Ok(mut conn_green_doc) = connect_db(pays, &new_id, "green").await {
        let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green_doc, &new_id).await;
    }

    if let Ok(mut ca) = crate::db_sqlx::connect_admin().await {
        if crate::db_sqlx::ensure_tables_admin_sqlx(&mut ca, pays, tab_main).await.is_ok() {
            if let Ok(schema) = admin_schema::load_schema() {
                let _ = pay_anchor::delete_inscription_anchor(&mut ca, &schema, DEMO_DOCTOR_ID).await;
            }
        }
    }
    upsert_pay_inscription_silent(pays, tab_main, &new_id, &now).await;

    write_demo_doctor_replacement_id(&new_id);

    encrypt_response(
        &json!({
            "success": true,
            "login": new_login,
            "id": new_id,
            "reconnect": true,
            "message": "Compte créé. Reconnectez-vous avec votre e-mail et votre nouveau mot de passe."
        }),
        Some(&get_cript_key()),
    )
}

// ========== Actes (avec assurance et facture) ==========

fn to_str(v: &Value) -> String {
    v.as_str()
        .map(String::from)
        .or_else(|| v.as_i64().map(|n| n.to_string()))
        .or_else(|| v.as_f64().map(|n| n.to_string()))
        .unwrap_or_default()
}

fn to_i64(v: &Value) -> i64 {
    v.as_i64()
        .or_else(|| v.as_f64().map(|n| n as i64))
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        .unwrap_or(0)
}

#[tauri::command]
pub async fn add_acte(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body
        .ok_or_else(|| body_manquant_avec_payload(&payload, Some("acte, assurance, facture")))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(
        obj.get("tabId")
            .and_then(|v| v.as_str())
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let acte = obj.get("acte").and_then(|v| v.as_object()).ok_or("acte manquant")?;
    let assurance = obj.get("assurance").and_then(|v| v.as_object()).ok_or("assurance manquante")?;
    let facture = obj.get("facture").and_then(|v| v.as_object()).ok_or("facture manquante")?;

    let id = to_str(acte.get("id").unwrap_or(&Value::Null));
    if id.is_empty() {
        return Err("ID acte manquant".to_string());
    }

    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let logg_id = to_str(acte.get("loggId").or(acte.get("logg_id")).unwrap_or(&Value::Null));
    let date_acte = acte
        .get("date")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| now.clone());

    let mut conn = connect_db(pays, &tab_id, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, &tab_id).await?;

    let poso_opt = acte
        .get("posologieId")
        .or(acte.get("posologie_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let acte_sql =
        "INSERT OR REPLACE INTO tab_acte (id, nom, description, date, prix, argentRecu, argentRestant, logg_id, date_creation, posologie_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)";
    sqlx::query::<Any>(acte_sql)
        .bind(&id)
        .bind(acte.get("nom").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(acte.get("description").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(&date_acte)
        .bind(to_i64(acte.get("prix").unwrap_or(&Value::Null)))
        .bind(to_i64(acte.get("argentRecu").unwrap_or(&Value::Null)))
        .bind(to_i64(acte.get("argentRestant").unwrap_or(&Value::Null)))
        .bind(&logg_id)
        .bind(&now)
        .bind(poso_opt)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("Insert acte: {}", e))?;

    let ass_sql =
        "INSERT OR REPLACE INTO tab_assurance (id, nom, pourcentage, logg_id, date_creation) VALUES (?1, ?2, ?3, ?4, ?5)";
    sqlx::query::<Any>(ass_sql)
        .bind(&id)
        .bind(assurance.get("nom").and_then(|v| v.as_str()).unwrap_or("non-assuré"))
        .bind(to_i64(assurance.get("pourcentage").unwrap_or(&Value::Null)))
        .bind(&logg_id)
        .bind(&now)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("Insert assurance: {}", e))?;

    let fact_sql =
        "INSERT OR REPLACE INTO tab_facture (id, prix_acte, argent_recu_acte, argent_restant_acte, argent_assurance, logg_id, date_creation) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)";
    sqlx::query::<Any>(fact_sql)
        .bind(&id)
        .bind(to_i64(facture.get("prixActe").unwrap_or(&Value::Null)))
        .bind(to_i64(facture.get("argentRecuActe").unwrap_or(&Value::Null)))
        .bind(to_i64(facture.get("argentRestantActe").unwrap_or(&Value::Null)))
        .bind(to_i64(facture.get("argentAssurance").unwrap_or(&Value::Null)))
        .bind(&logg_id)
        .bind(&now)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("Insert facture: {}", e))?;

    // Insérer les matériels utilisés pour cet acte et déduire du stock
    if let Some(materiels) = obj.get("materiels").and_then(|v| v.as_array()) {
        let am_table = "tab_acte_materiel".to_string();
        let mut conn_green = connect_db(pays, &tab_id, "green").await?;
        crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, &tab_id).await?;
        let nm_table = "tab_nom_materiel".to_string();

        for m in materiels {
            if let Some(m_obj) = m.as_object() {
                let materiel_id = to_str(m_obj.get("id").unwrap_or(&Value::Null));
                if materiel_id.is_empty() {
                    continue;
                }
                let quantite = to_i64(m_obj.get("quantite").unwrap_or(&Value::Null)).max(0);
                let am_id = Uuid::new_v4().to_string();
                let ins_sql = format!(
                    "INSERT INTO {} (id, acte_id, materiel_id, quantite_utilisee, date_creation) VALUES (?1, ?2, ?3, ?4, ?5)",
                    am_table
                );
                if let Err(e) = sqlx::query::<Any>(&ins_sql)
                    .bind(&am_id)
                    .bind(&id)
                    .bind(&materiel_id)
                    .bind(quantite)
                    .bind(&now)
                    .execute(&mut conn)
                    .await
                {
                    eprintln!("Insert acte_materiel: {}", e);
                } else if quantite > 0 {
                    // Déduire la quantité utilisée du stock (seulement si quantite > 0)
                    let upd_sql = format!(
                        "UPDATE {} SET quantite_defaut = MAX(0, COALESCE(quantite_defaut, 0) - ?1) WHERE id = ?2",
                        nm_table
                    );
                    if let Err(e) = sqlx::query::<Any>(&upd_sql)
                        .bind(quantite)
                        .bind(&materiel_id)
                        .execute(&mut conn_green)
                        .await
                    {
                        eprintln!("Déduction stock materiel: {}", e);
                    } else {
                        let stock_row = sqlx::query::<Any>(&format!(
                            "SELECT nom, COALESCE(quantite_defaut, 0) FROM {} WHERE id = ?1",
                            nm_table
                        ))
                        .bind(&materiel_id)
                        .fetch_optional(&mut conn_green)
                        .await;
                        if let Ok(Some(r)) = stock_row {
                            let nom_m: String = r
                                .try_get::<Option<String>, _>(0)
                                .ok()
                                .flatten()
                                .unwrap_or_default();
                            let qv: i64 = r.try_get::<Option<i64>, _>(1).ok().flatten().unwrap_or(0);
                            ensure_low_stock_reorder_task(
                                pays,
                                tab_id.as_str(),
                                materiel_id.as_str(),
                                nom_m.as_str(),
                                qv,
                                logg_id.as_str(),
                            )
                            .await;
                        }
                    }
                }
            }
        }
    }

    let result = json!({
        "acte": { "id": id },
        "assurance": { "id": id },
        "facture": { "id": id }
    });
    encrypt_response(&result, Some(&get_cript_key()))
}

/// `logg_id` utilisateur (cabinet) pour un patient — même stratégie yellow / fallback `main` que `get_patient_detail`.
async fn fetch_patient_cabinet_logg_id_yellow(
    pays: &str,
    patient_id: &str,
    tab_id_req: &str,
) -> Result<Option<String>, String> {
    let t0 = db::sanitize_tab_id(tab_id_req);
    let try_tabs: Vec<String> = if t0 != "main" {
        vec![t0, "main".to_string()]
    } else {
        vec![t0]
    };

    for tab_id in try_tabs {
        let mut conn = connect_db(pays, &tab_id, "yellow").await?;
        crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;
        let user_table = "tab_user".to_string();
        let patient_table = "tab_patient".to_string();
        let sql = format!(
            "SELECT u.logg_id FROM {} u INNER JOIN {} p ON u.id = p.id WHERE u.id = ?1 AND u.role = 'patient' LIMIT 1",
            user_table, patient_table
        );
        if let Some(r) = sqlx::query::<Any>(&sql)
            .bind(patient_id)
            .fetch_optional(&mut conn)
            .await
            .map_err(sql_err)?
        {
            let logg: Option<String> = r.try_get(0).ok();
            if let Some(s) = logg.filter(|x| !x.trim().is_empty()) {
                return Ok(Some(s.trim().to_string()));
            }
        }
    }
    Ok(None)
}

#[tauri::command]
pub async fn list_actes_by_patient(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let patient_id = p
        .patient_id
        .as_deref()
        .or_else(|| p.params.get(0).map(|s| s.as_str()))
        .unwrap_or("");
    let limit = p.limit.unwrap_or(100).min(500);
    let tab_id_req_raw = p
        .tab_id
            .as_deref()
            .or_else(|| p.params.get(2).map(|s| s.as_str()))
        .unwrap_or("main");
    let tab_id_req = db::sanitize_tab_id(tab_id_req_raw);
    let pays = p.pays.as_deref().unwrap_or("sn");

    if patient_id.is_empty() {
        return encrypt_response(&Value::Array(vec![]), Some(&get_cript_key()));
    }

    // Les actes sont dans la base blue du **cabinet** (`tab_acte{cabinet}`), pas forcément `main` :
    // si le client envoie tabId=main alors que le patient est rattaché à un cabinet (logg_id), il faut ouvrir la bonne base.
    let blue_tab_id = match fetch_patient_cabinet_logg_id_yellow(pays, patient_id, tab_id_req_raw).await? {
        Some(logg) => db::sanitize_tab_id(&logg),
        None => tab_id_req.clone(),
    };

    let mut conn = connect_db(pays, &blue_tab_id, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, &blue_tab_id).await?;

    let sql = r#"SELECT a.id, a.nom, a.description, a.date, a.prix, a.argentRecu, a.argentRestant,
                  a.logg_id, CAST(a.date_creation AS TEXT) as date_creation,
                  ass.nom AS assurance_nom, ass.pourcentage AS assurance_pourcentage,
                  f.prix_acte AS facture_prix_acte, f.argent_recu_acte AS facture_argent_recu_acte,
                  f.argent_restant_acte AS facture_argent_restant_acte, f.argent_assurance AS facture_argent_assurance,
                  a.posologie_id
           FROM tab_acte a
           LEFT JOIN tab_assurance ass ON a.id = ass.id
           LEFT JOIN tab_facture f ON a.id = f.id
           WHERE REPLACE(CAST(a.logg_id AS TEXT), '.0', '') = REPLACE(CAST(?1 AS TEXT), '.0', '')
              OR CAST(a.logg_id AS TEXT) LIKE CAST(?1 AS TEXT) || '%'
              OR CAST(?1 AS TEXT) LIKE CAST(a.logg_id AS TEXT) || '%'
           ORDER BY a.date DESC, a.date_creation DESC
           LIMIT ?2"#;

    let rows = sqlx::query::<Any>(&sql)
        .bind(patient_id)
        .bind(limit)
        .fetch_all(&mut conn)
        .await
        .map_err(sql_err)?;

    let mut list = Vec::new();
    for row in rows {
        let id: Option<String> = row.try_get(0).ok();
        let date_creation: Option<String> = row.try_get(8).ok();
        list.push(json!({
                "acte": {
                    "id": id.clone(),
                "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
                "description": row.try_get::<Option<String>, _>(2).ok().flatten(),
                "date": row.try_get::<Option<String>, _>(3).ok().flatten(),
                "prix": row.try_get::<Option<i64>, _>(4).ok().flatten(),
                "argentRecu": row.try_get::<Option<i64>, _>(5).ok().flatten(),
                "argentRestant": row.try_get::<Option<i64>, _>(6).ok().flatten(),
                "loggId": row.try_get::<Option<String>, _>(7).ok().flatten(),
                    "dateCreation": date_creation.clone(),
                "posologieId": row.try_get::<Option<String>, _>(15).ok().flatten(),
                },
                "assurance": {
                    "id": id.clone(),
                "nom": row.try_get::<Option<String>, _>(9).ok().flatten(),
                "pourcentage": row.try_get::<Option<i64>, _>(10).ok().flatten(),
                    "dateCreation": date_creation.clone(),
                },
                "facture": {
                    "id": id.clone(),
                "prixActe": row.try_get::<Option<i64>, _>(11).ok().flatten(),
                "argentRecuActe": row.try_get::<Option<i64>, _>(12).ok().flatten(),
                "argentRestantActe": row.try_get::<Option<i64>, _>(13).ok().flatten(),
                "argentAssurance": row.try_get::<Option<i64>, _>(14).ok().flatten(),
                    "dateCreation": date_creation.clone(),
                }
        }));
    }

    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_acte(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let acte_id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    if acte_id.is_empty() {
        return encrypt_response(&Value::Null, Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, &tab_id).await?;

    let sql = r#"SELECT a.id, a.nom, a.description, a.date, a.prix, a.argentRecu, a.argentRestant,
                  a.logg_id, CAST(a.date_creation AS TEXT) as date_creation,
                  ass.nom AS assurance_nom, ass.pourcentage AS assurance_pourcentage,
                  f.prix_acte AS facture_prix_acte, f.argent_recu_acte AS facture_argent_recu_acte,
                  f.argent_restant_acte AS facture_argent_restant_acte, f.argent_assurance AS facture_argent_assurance,
                  a.posologie_id
           FROM tab_acte a
           LEFT JOIN tab_assurance ass ON a.id = ass.id
           LEFT JOIN tab_facture f ON a.id = f.id
           WHERE a.id = ?1"#.to_string();

    let row_opt = sqlx::query::<Any>(&sql)
        .bind(acte_id)
        .fetch_optional(&mut conn)
        .await
        .map_err(sql_err)?;

    if let Some(row) = row_opt {
        let id: Option<String> = row.try_get(0).ok();
        let date_creation: Option<String> = row.try_get(8).ok();
        let result = json!({
            "acte": {
                "id": id.clone(),
                "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
                "description": row.try_get::<Option<String>, _>(2).ok().flatten(),
                "date": row.try_get::<Option<String>, _>(3).ok().flatten(),
                "prix": row.try_get::<Option<i64>, _>(4).ok().flatten(),
                "argentRecu": row.try_get::<Option<i64>, _>(5).ok().flatten(),
                "argentRestant": row.try_get::<Option<i64>, _>(6).ok().flatten(),
                "loggId": row.try_get::<Option<String>, _>(7).ok().flatten(),
                "dateCreation": date_creation.clone(),
                "posologieId": row.try_get::<Option<String>, _>(15).ok().flatten(),
            },
            "assurance": {
                "id": id.clone(),
                "nom": row.try_get::<Option<String>, _>(9).ok().flatten(),
                "pourcentage": row.try_get::<Option<i64>, _>(10).ok().flatten(),
                "dateCreation": date_creation.clone(),
            },
            "facture": {
                "id": id.clone(),
                "prixActe": row.try_get::<Option<i64>, _>(11).ok().flatten(),
                "argentRecuActe": row.try_get::<Option<i64>, _>(12).ok().flatten(),
                "argentRestantActe": row.try_get::<Option<i64>, _>(13).ok().flatten(),
                "argentAssurance": row.try_get::<Option<i64>, _>(14).ok().flatten(),
                "dateCreation": date_creation.clone(),
            }
        });
        return encrypt_response(&result, Some(&get_cript_key()));
    }

    encrypt_response(&Value::Null, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn update_acte(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body
        .ok_or_else(|| body_manquant_avec_payload(&payload, Some("acte, assurance, facture")))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(
        obj.get("tabId")
            .and_then(|v| v.as_str())
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let acte = obj.get("acte").and_then(|v| v.as_object()).ok_or("acte manquant")?;
    let assurance = obj.get("assurance").and_then(|v| v.as_object()).ok_or("assurance manquante")?;
    let facture = obj.get("facture").and_then(|v| v.as_object()).ok_or("facture manquante")?;

    let id = to_str(acte.get("id").unwrap_or(&Value::Null));
    if id.is_empty() {
        return Err("ID acte manquant".to_string());
    }

    let mut conn = connect_db(pays, &tab_id, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, &tab_id).await?;

    let poso_upd: Option<String> = acte
        .get("posologieId")
        .or(acte.get("posologie_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    if let Some(ref p_poso) = poso_upd {
        let acte_sql =
            "UPDATE tab_acte SET nom=?, description=?, date=?, prix=?, argentRecu=?, argentRestant=?, logg_id=?, posologie_id=? WHERE id=?";
        sqlx::query::<Any>(&acte_sql)
            .bind(acte.get("nom").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(acte.get("description").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(acte.get("date").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(to_i64(acte.get("prix").unwrap_or(&Value::Null)))
            .bind(to_i64(acte.get("argentRecu").unwrap_or(&Value::Null)))
            .bind(to_i64(acte.get("argentRestant").unwrap_or(&Value::Null)))
            .bind(to_str(acte.get("loggId").or(acte.get("logg_id")).unwrap_or(&Value::Null)))
            .bind(p_poso.as_str())
            .bind(&id)
            .execute(&mut conn)
            .await
            .map_err(|e| format!("Update acte: {}", e))?;
    } else {
    let acte_sql =
        "UPDATE tab_acte SET nom=?, description=?, date=?, prix=?, argentRecu=?, argentRestant=?, logg_id=? WHERE id=?";
        sqlx::query::<Any>(&acte_sql)
            .bind(acte.get("nom").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(acte.get("description").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(acte.get("date").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(to_i64(acte.get("prix").unwrap_or(&Value::Null)))
            .bind(to_i64(acte.get("argentRecu").unwrap_or(&Value::Null)))
            .bind(to_i64(acte.get("argentRestant").unwrap_or(&Value::Null)))
            .bind(to_str(acte.get("loggId").or(acte.get("logg_id")).unwrap_or(&Value::Null)))
            .bind(&id)
            .execute(&mut conn)
            .await
    .map_err(|e| format!("Update acte: {}", e))?;
    }

    let ass_sql = "UPDATE tab_assurance SET nom=?, pourcentage=? WHERE id=?";
    sqlx::query::<Any>(&ass_sql)
        .bind(assurance.get("nom").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(to_i64(assurance.get("pourcentage").unwrap_or(&Value::Null)))
        .bind(&id)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("Update assurance: {}", e))?;

    let fact_sql =
        "UPDATE tab_facture SET prix_acte=?, argent_recu_acte=?, argent_restant_acte=?, argent_assurance=? WHERE id=?";
    sqlx::query::<Any>(&fact_sql)
        .bind(to_i64(facture.get("prixActe").unwrap_or(&Value::Null)))
        .bind(to_i64(facture.get("argentRecuActe").unwrap_or(&Value::Null)))
        .bind(to_i64(facture.get("argentRestantActe").unwrap_or(&Value::Null)))
        .bind(to_i64(facture.get("argentAssurance").unwrap_or(&Value::Null)))
        .bind(&id)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("Update facture: {}", e))?;

    let result = json!({ "acte": { "id": id } });
    encrypt_response(&result, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn delete_acte(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let acte_id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(tab_id.as_str(), &tab_id, pays).await?;

    if acte_id.is_empty() {
        return encrypt_response(&json!({ "success": false }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, &tab_id).await?;

    let poso_t = "tab_posologie".to_string();
    let _ = sqlx::query::<Any>(&format!("DELETE FROM {} WHERE acte_id = ?1", poso_t))
        .bind(acte_id)
        .execute(&mut conn)
        .await;

    sqlx::query::<Any>("DELETE FROM tab_acte WHERE id = ?1")
        .bind(acte_id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Delete acte: {}", e))?;
    sqlx::query::<Any>("DELETE FROM tab_assurance WHERE id = ?1")
        .bind(acte_id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Delete assurance: {}", e))?;
    sqlx::query::<Any>("DELETE FROM tab_facture WHERE id = ?1")
        .bind(acte_id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Delete facture: {}", e))?;

    let result = json!({ "success": true });
    encrypt_response(&result, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_qrcode_part(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    // Accepter format URL (/api/pagePatient/qrcode/id/partNum/tabId/pays) ou body JSON
    let empty_map = serde_json::Map::new();
    let obj = p.body.as_ref().and_then(|b| b.as_object()).unwrap_or(&empty_map);
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    verify_db_credentials(obj, &tab_id, pays).await?;

    let id = p.id.as_deref().or_else(|| p.patient_id.as_deref()).unwrap_or("");
    let index = p.index.unwrap_or(1);

    if id.is_empty() {
        return encrypt_response(&json!({ "part1": "", "part2": "", "part3": "", "part4": "", "part5": "", "part6": "", "part7": "", "part8": "", "part9": "", "part10": "" }), Some(&get_cript_key()));
    }

    let (lg, nom, prenom) = fetch_identity_qr_extras(pays, &tab_id, id).await;
    let (cabinet_nom, docteur_full) = fetch_qr_identity_context(pays, &tab_id, lg.as_str()).await;
    let base64 = match generate_qrcode_base64(
        id,
        &tab_id,
        "patient",
        pays,
        &lg,
        nom.as_deref(),
        prenom.as_deref(),
        cabinet_nom.as_deref(),
        docteur_full.as_deref(),
        None,
    ) {
        Ok(b) => b,
        Err(e) => return Err(e),
    };

    let mut result = json!({
        "part1": "", "part2": "", "part3": "", "part4": "", "part5": "",
        "part6": "", "part7": "", "part8": "", "part9": "", "part10": "",
        "loggId": id, "dateCreation": "", "pays": pays
    });
    if let Some(obj) = result.as_object_mut() {
        if index == 1 {
            obj.insert("part1".to_string(), Value::String(base64));
        }
    }
    encrypt_response(&result, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_photo_part(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    verify_db_credentials(obj, &tab_id, pays).await?;

    let id = p.id.as_deref().unwrap_or("");
    let _index = p.index.unwrap_or(1);

    if id.is_empty() {
        return encrypt_response(
            &json!({
                "part1": "", "part2": "", "part3": "", "part4": "", "part5": "",
                "part6": "", "part7": "", "part8": "", "part9": "", "part10": "",
                "loggId": "", "dateCreation": "", "pays": pays
            }),
            Some(&get_cript_key()),
        );
    }

    let mut conn = connect_db(pays, &tab_id, "orange").await?;
    crate::db_sqlx::ensure_tables_orange_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_photo".to_string();
    let sql = format!(
        "SELECT id, logg_id, part1, part2, part3, part4, part5, part6, part7, part8, part9, part10, CAST(date_creation AS TEXT) FROM {} WHERE id = ?1",
        table
    );

    let mut result = json!({
        "part1": "", "part2": "", "part3": "", "part4": "", "part5": "",
        "part6": "", "part7": "", "part8": "", "part9": "", "part10": "",
        "loggId": "", "dateCreation": "", "pays": pays
    });

    if let Some(row) = sqlx::query::<Any>(&sql)
        .bind(&id)
        .fetch_optional(&mut conn)
        .await
        .map_err(sql_err)?
    {
        let logg_id: Option<String> = row.try_get(1).ok();
        let date_creation: Option<String> = row.try_get(12).ok();
                let part_keys = ["part1", "part2", "part3", "part4", "part5", "part6", "part7", "part8", "part9", "part10"];
                if let Some(obj) = result.as_object_mut() {
                    obj.insert("loggId".to_string(), json!(logg_id.unwrap_or_default()));
                    obj.insert("dateCreation".to_string(), json!(date_creation.unwrap_or_default()));
                    for (i, key) in part_keys.iter().enumerate() {
                let val: Option<String> = row.try_get(i + 2).ok();
                        obj.insert(key.to_string(), json!(val.unwrap_or_default()));
            }
        }
    }

    encrypt_response(&result, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn save_photo(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body
        .ok_or_else(|| body_manquant_avec_payload(&payload, Some("photo/radio")))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(
        obj.get("tabId")
            .and_then(|v| v.as_str())
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let logg_id = obj
        .get("loggId")
        .or(obj.get("logg_id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if id.is_empty() {
        return Err("ID photo/radio manquant".to_string());
    }

    let part1 = obj.get("part1").and_then(|v| v.as_str()).unwrap_or("");
    let part2 = obj.get("part2").and_then(|v| v.as_str()).unwrap_or("");
    let part3 = obj.get("part3").and_then(|v| v.as_str()).unwrap_or("");
    let part4 = obj.get("part4").and_then(|v| v.as_str()).unwrap_or("");
    let part5 = obj.get("part5").and_then(|v| v.as_str()).unwrap_or("");
    let part6 = obj.get("part6").and_then(|v| v.as_str()).unwrap_or("");
    let part7 = obj.get("part7").and_then(|v| v.as_str()).unwrap_or("");
    let part8 = obj.get("part8").and_then(|v| v.as_str()).unwrap_or("");
    let part9 = obj.get("part9").and_then(|v| v.as_str()).unwrap_or("");
    let part10 = obj.get("part10").and_then(|v| v.as_str()).unwrap_or("");

    let mut conn = connect_db(pays, &tab_id, "orange").await?;
    crate::db_sqlx::ensure_tables_orange_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_photo".to_string();
    let sql = format!(
        "INSERT OR REPLACE INTO {} (id, logg_id, part1, part2, part3, part4, part5, part6, part7, part8, part9, part10, date_creation) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        table
    );

    sqlx::query::<Any>(&sql)
        .bind(&id)
        .bind(logg_id)
        .bind(part1)
        .bind(part2)
        .bind(part3)
        .bind(part4)
        .bind(part5)
        .bind(part6)
        .bind(part7)
        .bind(part8)
        .bind(part9)
        .bind(part10)
        .bind(&now)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("Save photo: {}", e))?;

    let result = json!({ "id": id });
    encrypt_response(&result, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_radios_by_acte(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let acte_id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    if acte_id.is_empty() {
        return encrypt_response(&Value::Array(vec![]), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "orange").await?;
    crate::db_sqlx::ensure_tables_orange_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_photo".to_string();
    let sql = format!(
        "SELECT id, logg_id, part1, part2, part3, part4, part5, part6, part7, part8, part9, part10, CAST(date_creation AS TEXT) FROM {} WHERE logg_id = ?1 ORDER BY date_creation ASC",
        table
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(acte_id)
        .fetch_all(&mut conn)
        .await
        .map_err(sql_err)?;

    let mut list = Vec::new();
    for row in rows {
        let id: Option<String> = row.try_get(0).ok();
        let logg_id: Option<String> = row.try_get(1).ok();
        let part1: Option<String> = row.try_get(2).ok();
        let part2: Option<String> = row.try_get(3).ok();
        let part3: Option<String> = row.try_get(4).ok();
        let part4: Option<String> = row.try_get(5).ok();
        let part5: Option<String> = row.try_get(6).ok();
        let part6: Option<String> = row.try_get(7).ok();
        let part7: Option<String> = row.try_get(8).ok();
        let part8: Option<String> = row.try_get(9).ok();
        let part9: Option<String> = row.try_get(10).ok();
        let part10: Option<String> = row.try_get(11).ok();
        let date_creation: Option<String> = row.try_get(12).ok();

                let image_data = [
                    part1.as_deref().unwrap_or(""),
                    part2.as_deref().unwrap_or(""),
                    part3.as_deref().unwrap_or(""),
                    part4.as_deref().unwrap_or(""),
                    part5.as_deref().unwrap_or(""),
                    part6.as_deref().unwrap_or(""),
                    part7.as_deref().unwrap_or(""),
                    part8.as_deref().unwrap_or(""),
                    part9.as_deref().unwrap_or(""),
                    part10.as_deref().unwrap_or(""),
                ]
                .join("");

                if image_data.contains("data:image") {
                    list.push(json!({
                        "id": id.unwrap_or_default(),
                        "part1": part1.unwrap_or_default(),
                        "part2": part2.unwrap_or_default(),
                        "part3": part3.unwrap_or_default(),
                        "part4": part4.unwrap_or_default(),
                        "part5": part5.unwrap_or_default(),
                        "part6": part6.unwrap_or_default(),
                        "part7": part7.unwrap_or_default(),
                        "part8": part8.unwrap_or_default(),
                        "part9": part9.unwrap_or_default(),
                        "part10": part10.unwrap_or_default(),
                        "logg_id": logg_id.as_deref().unwrap_or(acte_id),
                        "date_creation": date_creation.unwrap_or_default()
                    }));
        }
    }

    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_user_privileges(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let privilege_id_raw = p.id.as_deref().unwrap_or("");
    let privilege_id = resolve_legacy_demo_doctor_identifier(privilege_id_raw);
    let tab_id = db::sanitize_tab_id(&resolve_legacy_demo_doctor_identifier(
        p.tab_id.as_deref().unwrap_or("main"),
    ));
    let pays = p.pays.as_deref().unwrap_or("sn");

    if privilege_id.is_empty() {
        return encrypt_response(&json!({ "nom": "" }), Some(&get_cript_key()));
    }

    let mut nom: Option<String> = None;
    for tid in admin_tab_lookup_chain(&tab_id) {
        let Ok(mut conn) = connect_db(pays, &tid, "green").await else {
            continue;
        };
        let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tid).await;
        let table = "tab_privilege".to_string();
    let sql = format!("SELECT nom FROM {} WHERE id = ?1 OR logg_id = ?1", table);
        if let Some(row) = sqlx::query::<Any>(&sql)
            .bind(&privilege_id)
            .fetch_optional(&mut conn)
            .await
            .ok()
            .flatten()
        {
            let n = row
                .try_get::<Option<String>, _>(0)
                .ok()
                .flatten()
                .or_else(|| row.try_get::<String, _>(0).ok())
                .filter(|s| !s.trim().is_empty());
            if let Some(s) = n {
                nom = Some(s);
                break;
            }
        }
    }

    let nom_str = match nom.filter(|s| !s.trim().is_empty()) {
        Some(n) => n,
        None => privilege_nom_fallback_without_tab_privilege_row(pays, &tab_id, &privilege_id)
            .await
            .unwrap_or_default(),
    };

    encrypt_response(&json!({ "nom": nom_str }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_privilege(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = resolve_legacy_demo_doctor_identifier(p.id.as_deref().unwrap_or(""));
    let tab_id = db::sanitize_tab_id(&resolve_legacy_demo_doctor_identifier(
        p.tab_id.as_deref().unwrap_or("main"),
    ));
    let pays = p.pays.as_deref().unwrap_or("sn");

    if id.is_empty() {
        return encrypt_response(&Value::Null, Some(&get_cript_key()));
    }

    for tid in admin_tab_lookup_chain(&tab_id) {
        let Ok(mut conn) = connect_db(pays, &tid, "green").await else {
            continue;
        };
        let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tid).await;

        let table = "tab_privilege".to_string();
        let sql = format!(
            "SELECT id, nom, logg_id, CAST(date_creation AS TEXT) FROM {} WHERE id = ?1 OR logg_id = ?1",
            table
        );

        if let Ok(Some(row)) = sqlx::query::<Any>(&sql)
            .bind(&id)
            .fetch_optional(&mut conn)
            .await
        {
                let result = json!({
                "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
                "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
                "loggId": row.try_get::<Option<String>, _>(2).ok().flatten(),
                "dateCreation": row.try_get::<Option<String>, _>(3).ok().flatten(),
                });
                return encrypt_response(&result, Some(&get_cript_key()));
            }
    }

    // Pas de ligne dans tab_privilege : même chaîne de repli que pour les collaborateurs (rôle / type docteur en base green).
    if let Some(default_nom) =
        privilege_nom_fallback_without_tab_privilege_row(pays, &tab_id, &id).await
    {
        if !default_nom.is_empty() {
            return encrypt_response(
                &json!({
                    "id": id,
                    "nom": default_nom,
                    "loggId": id,
                    "dateCreation": Value::Null
                }),
                Some(&get_cript_key()),
            );
        }
    }

    encrypt_response(&Value::Null, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn update_privilege(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(
        obj.get("tabId")
            .or(obj.get("loggId"))
            .and_then(|v| v.as_str())
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let nom = obj.get("nom").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Err("ID privilege manquant".to_string());
    }

    // Compte cible « docteur » : seul le Sadmin peut modifier ses privilèges (page profil).
    let actor_id = obj
        .get("loggId")
        .or(obj.get("userId"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if let Ok(mut conn_y) = connect_db(pays, &tab_id, "yellow").await {
        let _ = crate::db_sqlx::ensure_tables_sqlx(&mut conn_y, &tab_id).await;
        let user_table = "tab_user".to_string();
        let sql = format!("SELECT role FROM {} WHERE id = ?1 LIMIT 1", user_table);
        if let Ok(Some(row)) = sqlx::query::<Any>(&sql)
            .bind(&id)
            .fetch_optional(&mut conn_y)
            .await
        {
            let role = row
                .try_get::<Option<String>, _>(0)
                .ok()
                .flatten()
                .unwrap_or_default()
                .to_lowercase();
            if role == "docteur" && actor_id != "sadmin" {
                return Err(
                    "Seul le super-administrateur (sadmin) peut modifier les privilèges d'un compte docteur."
                        .to_string(),
                );
            }
        }
    }

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_privilege".to_string();
    let exists: i64 = sqlx::query::<Any>(&format!("SELECT COUNT(*) FROM {} WHERE id = ?1 OR logg_id = ?1", table))
        .bind(&id)
        .bind(&id)
        .fetch_one(&mut conn)
        .await
        .ok()
        .and_then(|r| r.try_get(0).ok())
        .unwrap_or(0);

    if exists > 0 {
        sqlx::query::<Any>(&format!("UPDATE {} SET nom=? WHERE id = ?1 OR logg_id = ?2", table))
            .bind(nom)
            .bind(&id)
            .bind(&id)
            .execute(&mut conn)
            .await
        .map_err(|e| format!("Update privilege: {}", e))?;
    } else {
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        sqlx::query::<Any>(&format!("INSERT INTO {} (id, nom, logg_id, date_creation) VALUES (?1, ?2, ?3, ?4)", table))
            .bind(&id)
            .bind(nom)
            .bind(&id)
            .bind(&now)
            .execute(&mut conn)
            .await
        .map_err(|e| format!("Insert privilege: {}", e))?;
    }

    encrypt_response(&json!({ "id": id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn add_nom_acte(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body
        .ok_or_else(|| body_manquant_avec_payload(&payload, Some("nom, prix, tabId, pays")))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(
        obj.get("tabId")
            .and_then(|v| v.as_str())
            .or_else(|| obj.get("loggId").and_then(|v| v.as_str()))
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let nom = obj.get("nom").and_then(|v| v.as_str()).unwrap_or("").trim();
    if nom.is_empty() {
        return Err("Nom de l'acte obligatoire".to_string());
    }

    let prix = obj.get("prix").and_then(|v| v.as_i64()).unwrap_or(0);
    let logg_id = obj.get("loggId").and_then(|v| v.as_str()).unwrap_or("");

    let id = Utc::now().timestamp_millis().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_nom_acte".to_string();
    let sql = format!(
        "INSERT INTO {} (id, nom, prix, logg_id, date_creation) VALUES (?1, ?2, ?3, ?4, ?5)",
        table
    );

    sqlx::query::<Any>(&sql)
        .bind(&id)
        .bind(nom)
        .bind(prix)
        .bind(logg_id)
        .bind(&now)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Insert nom acte: {}", e))?;

    let result = json!({
        "id": id,
        "nom": nom,
        "prix": prix,
        "loggId": logg_id,
        "dateCreation": now
    });
    encrypt_response(&result, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn update_nom_acte(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(
        obj.get("tabId")
            .or(obj.get("loggId"))
            .and_then(|v| v.as_str())
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Err("ID nom acte manquant".to_string());
    }

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_nom_acte".to_string();
    sqlx::query::<Any>(&format!("UPDATE {} SET nom=?, prix=?, logg_id=? WHERE id=?", table))
        .bind(obj.get("nom").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(to_i64(obj.get("prix").unwrap_or(&Value::Null)))
        .bind(obj.get("loggId").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(&id)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("Update nom acte: {}", e))?;

    encrypt_response(&json!({ "id": id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn list_nom_actes(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let tab_id = db::sanitize_tab_id(
        p.tab_id
            .as_deref()
            .or_else(|| p.params.get(0).map(|s| s.as_str()))
            .unwrap_or("main"),
    );
    let limit = p.limit.unwrap_or(100).min(500);
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_nom_acte".to_string();
    let sql = format!(
        "SELECT id, nom, prix, logg_id, CAST(date_creation AS TEXT) FROM {} ORDER BY nom LIMIT ?1",
        table
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(limit)
        .fetch_all(&mut conn)
        .await
        .map_err(sql_err)?;

    let mut list = Vec::new();
    for row in rows {
        list.push(json!({
            "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
            "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "prix": row.try_get::<Option<i64>, _>(2).ok().flatten(),
            "loggId": row.try_get::<Option<String>, _>(3).ok().flatten(),
            "dateCreation": row.try_get::<Option<String>, _>(4).ok().flatten(),
        }));
    }

    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_nom_acte(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    if id.is_empty() {
        return encrypt_response(&Value::Null, Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_nom_acte".to_string();
    let sql = format!("SELECT id, nom, prix, logg_id, CAST(date_creation AS TEXT) FROM {} WHERE id = ?1", table);

    if let Some(row) = sqlx::query::<Any>(&sql)
        .bind(&id)
        .fetch_optional(&mut conn)
        .await
        .map_err(sql_err)?
    {
                let result = json!({
            "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
            "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "prix": row.try_get::<Option<i64>, _>(2).ok().flatten(),
            "loggId": row.try_get::<Option<String>, _>(3).ok().flatten(),
            "dateCreation": row.try_get::<Option<String>, _>(4).ok().flatten(),
                });
                return encrypt_response(&result, Some(&get_cript_key()));
    }

    encrypt_response(&Value::Null, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn delete_nom_acte(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(tab_id.as_str(), &tab_id, pays).await?;

    if id.is_empty() {
        return encrypt_response(&json!({ "success": false }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_nom_acte".to_string();
    sqlx::query::<Any>(&format!("DELETE FROM {} WHERE id = ?1", table))
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Delete nom acte: {}", e))?;

    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn add_nom_assurance(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body
        .ok_or_else(|| body_manquant_avec_payload(&payload, Some("nom, pourcentage, tabId, pays")))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(
        obj.get("tabId")
            .and_then(|v| v.as_str())
            .or_else(|| obj.get("loggId").and_then(|v| v.as_str()))
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let nom = obj.get("nom").and_then(|v| v.as_str()).unwrap_or("").trim();
    if nom.is_empty() {
        return Err("Nom de l'assurance obligatoire".to_string());
    }

    let pourcentage = obj.get("pourcentage").and_then(|v| v.as_i64()).unwrap_or(0);
    let logg_id = obj.get("loggId").and_then(|v| v.as_str()).unwrap_or("");

    let id = obj.get("id")
        .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)))
        .map(|n| n.to_string())
        .unwrap_or_else(|| Utc::now().timestamp_millis().to_string());
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_nom_assurance".to_string();
    let sql = format!(
        "INSERT INTO {} (id, nom, pourcentage, logg_id, date_creation) VALUES (?1, ?2, ?3, ?4, ?5)",
        table
    );

    sqlx::query::<Any>(&sql)
        .bind(&id)
        .bind(nom)
        .bind(pourcentage)
        .bind(logg_id)
        .bind(&now)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Insert nom assurance: {}", e))?;

    let result = json!({
        "id": id,
        "nom": nom,
        "pourcentage": pourcentage,
        "loggId": logg_id,
        "dateCreation": now
    });
    encrypt_response(&result, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn update_nom_assurance(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(
        obj.get("tabId")
            .or(obj.get("loggId"))
            .and_then(|v| v.as_str())
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Err("ID nom assurance manquant".to_string());
    }

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_nom_assurance".to_string();
    sqlx::query::<Any>(&format!("UPDATE {} SET nom=?, pourcentage=?, logg_id=? WHERE id=?", table))
        .bind(obj.get("nom").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(to_i64(obj.get("pourcentage").unwrap_or(&Value::Null)))
        .bind(obj.get("loggId").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(&id)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("Update nom assurance: {}", e))?;

    encrypt_response(&json!({ "id": id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn list_nom_assurances(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let tab_id = db::sanitize_tab_id(
        p.tab_id
            .as_deref()
            .or_else(|| p.params.get(0).map(|s| s.as_str()))
            .unwrap_or("main"),
    );
    let limit = p.limit.unwrap_or(100).min(500);
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_nom_assurance".to_string();
    let sql = format!(
        "SELECT id, nom, pourcentage, logg_id, CAST(date_creation AS TEXT) FROM {} ORDER BY nom LIMIT ?1",
        table
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(limit)
        .fetch_all(&mut conn)
        .await
        .map_err(sql_err)?;

    let mut list = Vec::new();
    for row in rows {
        list.push(json!({
            "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
            "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "pourcentage": row.try_get::<Option<i64>, _>(2).ok().flatten(),
            "loggId": row.try_get::<Option<String>, _>(3).ok().flatten(),
            "dateCreation": row.try_get::<Option<String>, _>(4).ok().flatten(),
        }));
    }

    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_nom_assurance(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    if id.is_empty() {
        return encrypt_response(&Value::Null, Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_nom_assurance".to_string();
    let sql = format!("SELECT id, nom, pourcentage, logg_id, CAST(date_creation AS TEXT) FROM {} WHERE id = ?1", table);

    if let Some(row) = sqlx::query::<Any>(&sql)
        .bind(&id)
        .fetch_optional(&mut conn)
        .await
        .map_err(sql_err)?
    {
                let result = json!({
            "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
            "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "pourcentage": row.try_get::<Option<i64>, _>(2).ok().flatten(),
            "loggId": row.try_get::<Option<String>, _>(3).ok().flatten(),
            "dateCreation": row.try_get::<Option<String>, _>(4).ok().flatten(),
                });
                return encrypt_response(&result, Some(&get_cript_key()));
    }

    encrypt_response(&Value::Null, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn delete_nom_assurance(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(tab_id.as_str(), &tab_id, pays).await?;

    if id.is_empty() {
        return encrypt_response(&json!({ "success": false }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_nom_assurance".to_string();
    sqlx::query::<Any>(&format!("DELETE FROM {} WHERE id = ?1", table))
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Delete nom assurance: {}", e))?;

    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn list_nom_materiels(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let tab_id = db::sanitize_tab_id(
        p.tab_id
            .as_deref()
            .or_else(|| p.params.get(0).map(|s| s.as_str()))
            .unwrap_or("main"),
    );
    let limit = p.limit.unwrap_or(100).min(500);
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_nom_materiel".to_string();
    let sql = format!(
        "SELECT id, nom, quantite_defaut, prix_defaut, logg_id, CAST(date_creation AS TEXT) FROM {} ORDER BY nom LIMIT ?1",
        table
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(limit)
        .fetch_all(&mut conn)
        .await
        .map_err(sql_err)?;

    let mut list = Vec::new();
    for row in rows {
        list.push(json!({
            "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
            "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "quantiteDefaut": row.try_get::<Option<i64>, _>(2).ok().flatten(),
            "prixDefaut": row.try_get::<Option<i64>, _>(3).ok().flatten(),
            "loggId": row.try_get::<Option<String>, _>(4).ok().flatten(),
            "dateCreation": row.try_get::<Option<String>, _>(5).ok().flatten(),
        }));
    }

    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn add_nom_materiel(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body
        .ok_or_else(|| body_manquant_avec_payload(&payload, Some("nom, tabId/loggId, pays")))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(
        obj.get("tabId")
            .and_then(|v| v.as_str())
            .or_else(|| obj.get("loggId").and_then(|v| v.as_str()))
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let nom = obj.get("nom").and_then(|v| v.as_str()).unwrap_or("").trim();
    if nom.is_empty() {
        return Err("Nom du matériel obligatoire".to_string());
    }

    let prix_defaut = obj.get("prixDefaut").and_then(|v| v.as_i64()).unwrap_or(0);
    let quantite_defaut = obj.get("quantiteDefaut").and_then(|v| v.as_i64()).unwrap_or(0);
    let logg_id = obj.get("loggId").and_then(|v| v.as_str()).unwrap_or("");

    let id = obj.get("id")
        .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)))
        .map(|n| n.to_string())
        .unwrap_or_else(|| Utc::now().timestamp_millis().to_string());
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_nom_materiel".to_string();
    let sql = format!(
        "INSERT INTO {} (id, nom, quantite_defaut, prix_defaut, logg_id, date_creation) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        table
    );

    sqlx::query::<Any>(&sql)
        .bind(&id)
        .bind(nom)
        .bind(quantite_defaut)
        .bind(prix_defaut)
        .bind(logg_id)
        .bind(&now)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Insert nom materiel: {}", e))?;

    ensure_low_stock_reorder_task(pays, tab_id.as_str(), id.as_str(), nom, quantite_defaut, logg_id).await;

    let result = json!({
        "id": id,
        "nom": nom,
        "quantiteDefaut": quantite_defaut,
        "prixDefaut": prix_defaut,
        "loggId": logg_id,
        "dateCreation": now
    });
    encrypt_response(&result, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn update_nom_materiel(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body
        .ok_or_else(|| body_manquant_avec_payload(&payload, Some("id, nom, tabId, pays")))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(
        obj.get("tabId")
            .and_then(|v| v.as_str())
            .or_else(|| obj.get("loggId").and_then(|v| v.as_str()))
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Err("ID matériel manquant".to_string());
    }

    let nom = obj.get("nom").and_then(|v| v.as_str()).unwrap_or("").trim();
    let prix_defaut = obj.get("prixDefaut").and_then(|v| v.as_i64()).unwrap_or(0);
    let quantite_defaut = obj.get("quantiteDefaut").and_then(|v| v.as_i64()).unwrap_or(0);
    let logg_id = obj.get("loggId").and_then(|v| v.as_str()).unwrap_or("");
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_nom_materiel".to_string();
    let sql = format!(
        "UPDATE {} SET nom = ?1, quantite_defaut = ?2, prix_defaut = ?3, logg_id = ?4, date_creation = ?5 WHERE id = ?6",
        table
    );
    sqlx::query::<Any>(&sql)
        .bind(nom)
        .bind(quantite_defaut)
        .bind(prix_defaut)
        .bind(logg_id)
        .bind(&now)
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Update nom materiel: {}", e))?;

    ensure_low_stock_reorder_task(pays, tab_id.as_str(), id, nom, quantite_defaut, logg_id).await;

    let result = json!({
        "id": id,
        "nom": nom,
        "quantiteDefaut": quantite_defaut,
        "prixDefaut": prix_defaut,
        "loggId": logg_id,
        "dateCreation": now
    });
    encrypt_response(&result, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn delete_nom_materiel(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(tab_id.as_str(), &tab_id, pays).await?;

    if id.is_empty() {
        return encrypt_response(&json!({ "success": false }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_nom_materiel".to_string();
    sqlx::query::<Any>(&format!("DELETE FROM {} WHERE id = ?1", table))
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Delete nom materiel: {}", e))?;

    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_materiels_by_acte(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let acte_id = p
        .id
        .as_deref()
        .or_else(|| p.params.get(0).map(|s| s.as_str()))
        .unwrap_or("");
    let tab_id = db::sanitize_tab_id(
        p.tab_id
            .as_deref()
            .or_else(|| p.params.get(1).map(|s| s.as_str()))
            .unwrap_or("main"),
    );
    let pays = p.pays.as_deref().or_else(|| p.params.get(2).map(|s| s.as_str())).unwrap_or("sn");

    if acte_id.is_empty() {
        return encrypt_response(&Value::Array(vec![]), Some(&get_cript_key()));
    }

    let mut conn_blue = connect_db(pays, &tab_id, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn_blue, &tab_id).await?;

    let am_table = "tab_acte_materiel".to_string();
    let sql_am = format!(
        "SELECT id, acte_id, materiel_id, quantite_utilisee FROM {} WHERE acte_id = ?1",
        am_table
    );

    let rows_am = sqlx::query::<Any>(&sql_am)
        .bind(acte_id)
        .fetch_all(&mut conn_blue)
        .await
        .map_err(sql_err)?;

    let mut conn_green = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, &tab_id).await?;
    let nm_table = "tab_nom_materiel".to_string();

    let mut list = Vec::new();
    for row in rows_am {
        let am_id: String = row.try_get(0).unwrap_or_default();
        let _acte_id: String = row.try_get(1).unwrap_or_default();
        let materiel_id: String = row.try_get(2).unwrap_or_default();
        let quantite_utilisee: i64 = row.try_get(3).unwrap_or(0);

        let materiel = sqlx::query::<Any>(&format!("SELECT id, nom, quantite_defaut, prix_defaut FROM {} WHERE id = ?1", nm_table))
            .bind(&materiel_id)
            .fetch_optional(&mut conn_green)
            .await
                .ok()
            .flatten()
            .map(|r| json!({
                "id": r.try_get::<Option<String>, _>(0).ok().flatten(),
                "nom": r.try_get::<Option<String>, _>(1).ok().flatten(),
                "quantite_defaut": r.try_get::<Option<i64>, _>(2).ok().flatten().unwrap_or(0),
                "prix_defaut": r.try_get::<Option<i64>, _>(3).ok().flatten().unwrap_or(0)
            }))
                .unwrap_or(json!({ "id": materiel_id, "nom": "Inconnu", "quantite_defaut": 0, "prix_defaut": 0 }));

            list.push(json!({
                "id": am_id,
                "acte_id": acte_id,
                "materiel_id": materiel_id,
                "quantite_utilisee": quantite_utilisee,
                "materiel": materiel
            }));
    }

    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

/// Remplace les matériels liés à un acte et ajuste le stock (annule l'ancienne consommation puis applique la nouvelle).
#[tauri::command]
pub async fn update_acte_materiels(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(
        obj.get("tabId")
            .and_then(|v| v.as_str())
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let logg_id_task = obj
        .get("loggId")
        .or(obj.get("logg_id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let acte_id = to_str(
        obj.get("acteId")
            .or(obj.get("acte_id"))
            .unwrap_or(&Value::Null),
    );
    if acte_id.is_empty() {
        return Err("ID acte manquant".to_string());
    }

    // Fusionner les lignes par id matériel (catalogue)
    let mut merged_qty: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    if let Some(arr) = obj.get("materiels").and_then(|v| v.as_array()) {
        for m in arr {
            if let Some(m_obj) = m.as_object() {
                let mid = to_str(m_obj.get("id").unwrap_or(&Value::Null));
                if mid.is_empty() {
                    continue;
                }
                let q = to_i64(m_obj.get("quantite").unwrap_or(&Value::Null)).max(0);
                *merged_qty.entry(mid).or_insert(0) += q;
            }
        }
    }
    merged_qty.retain(|_, q| *q > 0);

    let mut conn_blue = connect_db(pays, &tab_id, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn_blue, &tab_id).await?;

    let am_table = "tab_acte_materiel".to_string();
    let sql_old = format!(
        "SELECT materiel_id, quantite_utilisee FROM {} WHERE acte_id = ?1",
        am_table
    );
    let old_rows = sqlx::query::<Any>(&sql_old)
        .bind(&acte_id)
        .fetch_all(&mut conn_blue)
        .await
        .map_err(|e| format!("Lecture matériels acte: {}", e))?;

    let mut conn_green = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, &tab_id).await?;
    let nm_table = "tab_nom_materiel".to_string();

    use std::collections::{HashMap, HashSet};
    let mut old_by_m: HashMap<String, i64> = HashMap::new();
    for row in &old_rows {
        let materiel_id: String = row.try_get(0).unwrap_or_default();
        let q: i64 = row.try_get(1).unwrap_or(0);
        if materiel_id.is_empty() || q <= 0 {
            continue;
        }
        *old_by_m.entry(materiel_id).or_insert(0) += q;
    }

    let mut all_mids: HashSet<String> = old_by_m.keys().cloned().collect();
    for k in merged_qty.keys() {
        all_mids.insert(k.clone());
    }

    /// Libellé matériel pour message d'erreur (optionnel).
    async fn nom_materiel_lbl(
        conn: &mut sqlx::AnyConnection,
        nm_table: &str,
        id: &str,
    ) -> String {
        let q = format!("SELECT nom FROM {} WHERE id = ?1 LIMIT 1", nm_table);
        if let Ok(Some(row)) = sqlx::query::<Any>(&q).bind(id).fetch_optional(conn).await {
            if let Ok(n) = row.try_get::<String, _>(0) {
                if !n.is_empty() {
                    return n;
                }
            }
        }
        id.to_string()
    }

    // Avant toute écriture : impossible d'augmenter la consommation au-delà du stock catalogue
    // (stock courant + quantité déjà réservée sur cet acte).
    for mid in &all_mids {
        let old = *old_by_m.get(mid).unwrap_or(&0);
        let new = *merged_qty.get(mid).unwrap_or(&0);
        if new > old {
            let s: i64 = sqlx::query::<Any>(&format!(
                "SELECT COALESCE(quantite_defaut, 0) FROM {} WHERE id = ?1",
                nm_table
            ))
            .bind(mid.as_str())
            .fetch_optional(&mut conn_green)
            .await
            .map_err(sql_err)?
            .and_then(|r| r.try_get::<i64, _>(0).ok())
            .unwrap_or(0);
            if new > s + old {
                let label = nom_materiel_lbl(&mut conn_green, &nm_table, mid).await;
                return Err(format!(
                    "Stock insuffisant pour « {} » : {} demandé(s), {} disponible(s) (stock {} + déjà {} sur cet acte).",
                    label,
                    new,
                    s + old,
                    s,
                    old
                ));
            }
        }
    }

    sqlx::query::<Any>(&format!("DELETE FROM {} WHERE acte_id = ?1", am_table))
        .bind(&acte_id)
        .execute(&mut conn_blue)
        .await
        .map_err(|e| format!("Suppression liens matériels: {}", e))?;

    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    for (materiel_id, quantite) in merged_qty.iter() {
        let am_id = Uuid::new_v4().to_string();
        let ins_sql = format!(
            "INSERT INTO {} (id, acte_id, materiel_id, quantite_utilisee, date_creation) VALUES (?1, ?2, ?3, ?4, ?5)",
            am_table
        );
        sqlx::query::<Any>(&ins_sql)
            .bind(&am_id)
            .bind(&acte_id)
            .bind(materiel_id)
            .bind(*quantite)
            .bind(&now)
            .execute(&mut conn_blue)
            .await
            .map_err(|e| format!("Insertion lien acte/matériel: {}", e))?;
    }

    // Ajustement stock en une passe : delta = ancienne conso sur l'acte - nouvelle (sans stock négatif).
    for mid in &all_mids {
        let old = *old_by_m.get(mid).unwrap_or(&0);
        let new = *merged_qty.get(mid).unwrap_or(&0);
        let delta = old - new;
        if delta == 0 {
            continue;
        }
        let upd = format!(
            "UPDATE {} SET quantite_defaut = COALESCE(quantite_defaut, 0) + ?1 WHERE id = ?2 AND COALESCE(quantite_defaut, 0) + ?1 >= 0",
            nm_table
        );
        let r = sqlx::query::<Any>(&upd)
            .bind(delta)
            .bind(mid.as_str())
            .execute(&mut conn_green)
            .await
            .map_err(|e| format!("Mise à jour stock matériel: {}", e))?;
        if r.rows_affected() != 1 {
            let label = nom_materiel_lbl(&mut conn_green, &nm_table, mid).await;
            // Remettre les liens blue comme avant (meilleur effort)
            let _ = sqlx::query::<Any>(&format!("DELETE FROM {} WHERE acte_id = ?1", am_table))
                .bind(&acte_id)
                .execute(&mut conn_blue)
                .await;
            for row in &old_rows {
                let mid_o: String = row.try_get(0).unwrap_or_default();
                let q_o: i64 = row.try_get(1).unwrap_or(0);
                if mid_o.is_empty() || q_o <= 0 {
                    continue;
                }
                let am_id = Uuid::new_v4().to_string();
                let _ = sqlx::query::<Any>(&format!(
                    "INSERT INTO {} (id, acte_id, materiel_id, quantite_utilisee, date_creation) VALUES (?1, ?2, ?3, ?4, ?5)",
                    am_table
                ))
                .bind(&am_id)
                .bind(&acte_id)
                .bind(&mid_o)
                .bind(q_o)
                .bind(&now)
                .execute(&mut conn_blue)
                .await;
            }
            return Err(format!(
                "Impossible de mettre à jour le stock pour « {} » (ligne absente ou quantité invalide).",
                label
            ));
        }
    }

    for mid in &all_mids {
        let stock_row = sqlx::query::<Any>(&format!(
            "SELECT nom, COALESCE(quantite_defaut, 0) FROM {} WHERE id = ?1",
            nm_table
        ))
        .bind(mid.as_str())
        .fetch_optional(&mut conn_green)
        .await
        .map_err(sql_err)?;
        if let Some(r) = stock_row {
            let nom_m: String = r
                .try_get::<Option<String>, _>(0)
                .ok()
                .flatten()
                .unwrap_or_default();
            let qv: i64 = r.try_get::<Option<i64>, _>(1).ok().flatten().unwrap_or(0);
            ensure_low_stock_reorder_task(
                pays,
                tab_id.as_str(),
                mid.as_str(),
                nom_m.as_str(),
                qv,
                logg_id_task,
            )
            .await;
        }
    }

    let result = json!({ "success": true, "acteId": acte_id });
    encrypt_response(&result, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_docteur_qrcode(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id_raw = p.tab_id.as_deref().unwrap_or(id);
    let tab_id = db::sanitize_tab_id(tab_id_raw);
    let pays = p.pays.as_deref().unwrap_or("sn");
    if id.is_empty() {
        return encrypt_response(&json!({ "base64": "" }), Some(&get_cript_key()));
    }
    let (lg, nom, prenom) = fetch_identity_qr_extras(pays, tab_id.as_str(), id).await;
    let (cabinet_nom, docteur_full) = fetch_qr_identity_context(pays, tab_id.as_str(), lg.as_str()).await;
    let pren_s = prenom.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let nom_s = nom.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let display_line = match (pren_s, nom_s) {
        (Some(a), Some(b)) => Some(format!("Dr {} {}", a, b)),
        (Some(a), None) => Some(format!("Dr {}", a)),
        (None, Some(b)) => Some(format!("Dr {}", b)),
        _ => None,
    };
    let base64 = generate_qrcode_base64(
        id,
        tab_id.as_str(),
        "docteur",
        pays,
        &lg,
        nom.as_deref(),
        prenom.as_deref(),
        cabinet_nom.as_deref(),
        docteur_full.as_deref(),
        display_line.as_deref(),
    )?;
    encrypt_response(&json!({ "base64": base64 }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_docteur_profile(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().ok_or("ID docteur manquant")?;
    let tab_id_param = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn_yellow = connect_db(pays, &tab_id_param, "yellow").await?;

    let row_to_docteur = |row: &sqlx::any::AnyRow| -> Value {
        json!({
            "id": row.try_get::<String, _>(0).ok(),
            "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "prenom": row.try_get::<Option<String>, _>(2).ok().flatten(),
            "login": row.try_get::<Option<String>, _>(3).ok().flatten(),
            "password": row.try_get::<Option<String>, _>(4).ok().flatten(),
            "telephone": row.try_get::<Option<String>, _>(5).ok().flatten(),
            "naissance": row.try_get::<Option<String>, _>(6).ok().flatten(),
            "adresse": row.try_get::<Option<String>, _>(7).ok().flatten(),
        })
    };

    let mut docteur: Option<Value> = None;
    for try_tab in [&tab_id_param, "main"] {
        let _ = crate::db_sqlx::ensure_tables_sqlx(&mut conn_yellow, try_tab).await;
        let user_table = "tab_user".to_string();
    let sql = format!(
            "SELECT id, nom, prenom, login, password, telephone, naissance, adresse FROM {} WHERE id = ?1 AND role = 'docteur'",
        user_table
    );
        if let Ok(Some(row)) = sqlx::query::<Any>(&sql).bind(id).fetch_optional(&mut conn_yellow).await {
            docteur = Some(row_to_docteur(&row));
            break;
        }
    }
    if docteur.is_none() && (id == "admin" || id == "sadmin" || id == "main") {
        let _ = crate::db_sqlx::ensure_tables_sqlx(&mut conn_yellow, "main").await;
        let user_table = "tab_user".to_string();
        let sql = format!(
            "SELECT id, nom, prenom, login, password, telephone, naissance, adresse FROM {} WHERE role = 'docteur' LIMIT 1",
            user_table
        );
        if let Ok(Some(row)) = sqlx::query::<Any>(&sql).fetch_optional(&mut conn_yellow).await {
            docteur = Some(row_to_docteur(&row));
        }
    }

    let docteur = match docteur {
        Some(d) => d,
        None => return encrypt_response(&json!({ "docteur": null, "cabinet": null }), Some(&get_cript_key())),
    };

    // Récupérer le cabinet depuis la base green (essayer main puis tab_id)
    let mut cabinet = serde_json::Value::Null;
    if let Ok(mut conn_green) = connect_db(pays, &tab_id_param, "green").await {
        for try_tab in ["main", &tab_id_param] {
            let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, try_tab).await;
            let cabinet_table = "tab_cabinet".to_string();
            let sql_by_id = format!("SELECT id, nom, adresse, pays, COALESCE(password_defaut,'') FROM {} WHERE id = ?1", cabinet_table);
            let sql_first = format!("SELECT id, nom, adresse, pays, COALESCE(password_defaut,'') FROM {} LIMIT 1", cabinet_table);
            if let Ok(Some(row)) = sqlx::query::<Any>(&sql_by_id).bind(id).fetch_optional(&mut conn_green).await {
                cabinet = json!({
                    "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
                    "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
                    "adresse": row.try_get::<Option<String>, _>(2).ok().flatten(),
                    "pays": row.try_get::<Option<String>, _>(3).ok().flatten(),
                    "passwordDefaut": row.try_get::<Option<String>, _>(4).ok().flatten(),
                });
                break;
            }
            if let Ok(Some(row)) = sqlx::query::<Any>(&sql_by_id).bind(try_tab).fetch_optional(&mut conn_green).await {
                cabinet = json!({
                    "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
                    "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
                    "adresse": row.try_get::<Option<String>, _>(2).ok().flatten(),
                    "pays": row.try_get::<Option<String>, _>(3).ok().flatten(),
                    "passwordDefaut": row.try_get::<Option<String>, _>(4).ok().flatten(),
                });
                break;
            }
            if let Ok(Some(row)) = sqlx::query::<Any>(&sql_first).fetch_optional(&mut conn_green).await {
                cabinet = json!({
                    "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
                    "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
                    "adresse": row.try_get::<Option<String>, _>(2).ok().flatten(),
                    "pays": row.try_get::<Option<String>, _>(3).ok().flatten(),
                    "passwordDefaut": row.try_get::<Option<String>, _>(4).ok().flatten(),
                });
                break;
            }
        }
    }

    let data = json!({ "docteur": docteur, "cabinet": cabinet });
    encrypt_response(&data, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn update_docteur_profile(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let docteur = obj.get("docteur").and_then(|v| v.as_object()).or_else(|| body.as_object());
    let docteur = docteur.ok_or("docteur manquant")?;

    let id = docteur.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let tab_id_param = db::sanitize_tab_id(
        obj.get("tabId")
            .or(docteur.get("tabId"))
            .and_then(|v| v.as_str())
            .unwrap_or("main"),
    );
    // Si tabId == docteur id (profil propre du docteur), utiliser "main" car c'est là que sont stockés les docteurs
    let tab_id = if tab_id_param == id {
        String::from("main")
    } else {
        tab_id_param
    };
    let pays = obj.get("pays").or(docteur.get("pays")).and_then(|v| v.as_str()).unwrap_or("sn");
    if id.is_empty() {
        return Err("ID docteur manquant".to_string());
    }
    let cabinet_id = docteur.get("loggId").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).unwrap_or(id);
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    let pwd_opt = docteur.get("password").and_then(|v| v.as_str()).filter(|s| !s.is_empty());

    if let Some(pwd) = pwd_opt {
        sqlx::query::<Any>(&format!("UPDATE {} SET nom=?, prenom=?, login=?, password=?, telephone=?, naissance=?, adresse=? WHERE id=? AND role='docteur'", user_table))
            .bind(docteur.get("nom").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(docteur.get("prenom").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(docteur.get("login").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(pwd)
            .bind(docteur.get("telephone").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(docteur.get("naissance").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(docteur.get("adresse").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(&id)
            .execute(&mut conn)
            .await
        .map_err(|e| format!("Update docteur: {}", e))?;

        sqlx::query::<Any>("UPDATE tab_connection SET login=?, telephone=?, password=? WHERE id=?")
            .bind(docteur.get("login").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(docteur.get("telephone").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(pwd)
            .bind(&id)
            .execute(&mut conn)
            .await
        .map_err(|e| format!("Update connection: {}", e))?;
    } else {
        sqlx::query::<Any>(&format!("UPDATE {} SET nom=?, prenom=?, login=?, telephone=?, naissance=?, adresse=? WHERE id=? AND role='docteur'", user_table))
            .bind(docteur.get("nom").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(docteur.get("prenom").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(docteur.get("login").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(docteur.get("telephone").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(docteur.get("naissance").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(docteur.get("adresse").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(&id)
            .execute(&mut conn)
            .await
        .map_err(|e| format!("Update docteur: {}", e))?;
    }

    // Mise à jour du cabinet (base green)
    if let Some(cabinet) = obj.get("cabinet").and_then(|v| v.as_object()) {
        if let Ok(mut conn_g) = connect_db(pays, &tab_id, "green").await {
            let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_g, &tab_id).await;
            let cabinet_table = "tab_cabinet".to_string();
            let nom = cabinet.get("nom").and_then(|v| v.as_str()).unwrap_or("");
            let adresse = cabinet.get("adresse").and_then(|v| v.as_str()).unwrap_or("");
            let pays_cab = cabinet.get("pays").and_then(|v| v.as_str()).unwrap_or(pays).to_uppercase();
            let password_defaut = cabinet.get("passwordDefaut").or(cabinet.get("password_defaut")).and_then(|v| v.as_str()).unwrap_or("");
            let cab_id = cabinet.get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty());

            let cid = cab_id.unwrap_or(&tab_id);
            let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let result = sqlx::query::<Any>(&format!("UPDATE {} SET nom=?, adresse=?, pays=?, password_defaut=? WHERE id=?", cabinet_table))
                .bind(nom)
                .bind(adresse)
                .bind(&pays_cab)
                .bind(password_defaut)
                .bind(cid)
                .execute(&mut conn_g)
                .await;
            let rows = result.map(|r| r.rows_affected()).unwrap_or(0);
            if rows == 0 {
                let _ = sqlx::query::<Any>(&format!("INSERT OR IGNORE INTO {} (id, nom, adresse, pays, date_creation, password_defaut) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", cabinet_table))
                    .bind(cid)
                    .bind(nom)
                    .bind(adresse)
                    .bind(&pays_cab)
                    .bind(&now)
                    .bind(password_defaut)
                    .execute(&mut conn_g)
                    .await;
            }
        }
    }

    encrypt_response(&json!({ "id": id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_assistant_qrcode(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    if id.is_empty() {
        return encrypt_response(&json!({ "base64": "" }), Some(&get_cript_key()));
    }
    let (lg, nom, prenom) = fetch_identity_qr_extras(pays, tab_id.as_str(), id).await;
    let (cabinet_nom, docteur_full) = fetch_qr_identity_context(pays, tab_id.as_str(), lg.as_str()).await;
    let base64 = generate_qrcode_base64(
        id,
        tab_id.as_str(),
        "assistant",
        pays,
        &lg,
        nom.as_deref(),
        prenom.as_deref(),
        cabinet_nom.as_deref(),
        docteur_full.as_deref(),
        None,
    )?;
    encrypt_response(&json!({ "base64": base64 }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_assistant_profile(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    if id.is_empty() {
        return encrypt_response(&json!({ "assistant": null }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    let assistant_table = "tab_assistant".to_string();
    let sql = format!(
        "SELECT u.id, u.nom, u.prenom, u.login, u.telephone, u.naissance, u.adresse FROM {} u JOIN {} a ON u.id = a.id WHERE u.role = 'assistant' AND u.id = ?1",
        user_table, assistant_table
    );

    if let Some(row) = sqlx::query::<Any>(&sql)
        .bind(&id)
        .fetch_optional(&mut conn)
        .await
        .map_err(sql_err)?
    {
                let result = json!({
                    "assistant": {
                "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
                "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
                "prenom": row.try_get::<Option<String>, _>(2).ok().flatten(),
                "login": row.try_get::<Option<String>, _>(3).ok().flatten(),
                "telephone": row.try_get::<Option<String>, _>(4).ok().flatten(),
                "naissance": row.try_get::<Option<String>, _>(5).ok().flatten(),
                "adresse": row.try_get::<Option<String>, _>(6).ok().flatten(),
                    }
                });
                return encrypt_response(&result, Some(&get_cript_key()));
    }

    encrypt_response(&json!({ "assistant": null }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn update_assistant_profile(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let assistant = obj.get("assistant").and_then(|v| v.as_object()).or_else(|| body.as_object());
    let assistant = assistant.ok_or("assistant manquant")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").or(assistant.get("tabId")).and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").or(assistant.get("pays")).and_then(|v| v.as_str()).unwrap_or("sn");
    let id = assistant.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Err("ID assistant manquant".to_string());
    }
    let cabinet_id = assistant.get("loggId").or(obj.get("cabinetId")).and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    sqlx::query::<Any>(&format!("UPDATE {} SET nom=?, prenom=?, login=?, telephone=?, naissance=?, adresse=? WHERE id=? AND role='assistant'", user_table))
        .bind(assistant.get("nom").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(assistant.get("prenom").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(assistant.get("login").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(assistant.get("telephone").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(assistant.get("naissance").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(assistant.get("adresse").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(&id)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("Update assistant: {}", e))?;

    if let Some(pwd) = assistant.get("password").and_then(|v| v.as_str()) {
        if !pwd.is_empty() {
            sqlx::query::<Any>("UPDATE tab_connection SET login=?, telephone=?, password=? WHERE id=?")
                .bind(assistant.get("login").and_then(|v| v.as_str()).unwrap_or(""))
                .bind(assistant.get("telephone").and_then(|v| v.as_str()).unwrap_or(""))
                .bind(pwd)
                .bind(&id)
                .execute(&mut conn)
                .await
                .map_err(|e| format!("Update connection: {}", e))?;
        }
    }

    encrypt_response(&json!({ "id": id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn change_user_password(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let target_user_id = obj.get("userId").or(obj.get("id")).and_then(|v| v.as_str()).unwrap_or("");
    let new_password = obj.get("newPassword").or(obj.get("password")).and_then(|v| v.as_str()).unwrap_or("");
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");

    if target_user_id.is_empty() || new_password.is_empty() {
        return Err("userId et newPassword requis".to_string());
    }

    verify_db_credentials(obj, &tab_id, pays).await?;
    let caller_id = obj.get("userId").or_else(|| obj.get("id")).and_then(|v| v.as_str()).unwrap_or("");
    let is_sadmin = ["sadmin", "admin"].contains(&caller_id.to_lowercase().as_str());
    if !is_sadmin && caller_id != target_user_id {
        return Err("Vous ne pouvez modifier que votre propre mot de passe.".to_string());
    }

    let hashed = hash_password(new_password).map_err(|e| format!("Hash mot de passe: {}", e))?;

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    sqlx::query::<Any>(&format!("UPDATE {} SET password=? WHERE id=?", user_table))
        .bind(&hashed)
        .bind(target_user_id)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("Update user password: {}", e))?;

    sqlx::query::<Any>("UPDATE tab_connection SET password=? WHERE id=?")
        .bind(&hashed)
        .bind(target_user_id)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("Update connection password: {}", e))?;

    encrypt_response(&json!({ "id": target_user_id }), Some(&get_cript_key()))
}

/// Liste tous les docteurs (Sadmin uniquement) - tab_user_main avec role=docteur
#[tauri::command]
pub async fn list_docteurs(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let tab_id = "main";

    verify_sadmin_only(obj, tab_id, pays).await?;

    let mut conn = connect_db(pays, tab_id, "yellow").await?;
    let user_table = "tab_user".to_string();
    let sql = format!(
        "SELECT u.id, u.nom, u.prenom, u.login, u.telephone, u.naissance, u.adresse FROM {} u WHERE lower(trim(u.role)) = 'docteur' ORDER BY u.nom, u.prenom",
        user_table
    );
    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| format!("list_docteurs: {}", e))?;
    let mut list: Vec<Value> = Vec::new();
    for row in rows {
        list.push(json!({
            "id": row.try_get::<String, _>(0).unwrap_or_default(),
            "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "prenom": row.try_get::<Option<String>, _>(2).ok().flatten(),
            "login": row.try_get::<Option<String>, _>(3).ok().flatten(),
            "telephone": row.try_get::<Option<String>, _>(4).ok().flatten(),
            "naissance": row.try_get::<Option<String>, _>(5).ok().flatten(),
            "adresse": row.try_get::<Option<String>, _>(6).ok().flatten(),
            "role": "docteur",
        }));
    }
    encrypt_response(&json!({ "docteurs": list }), Some(&get_cript_key()))
}

/// Réinitialise le mot de passe d'un docteur à 1234 (Sadmin uniquement)
#[tauri::command]
pub async fn reset_docteur_password(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let docteur_id = obj.get("docteurId").or(obj.get("id")).and_then(|v| v.as_str()).unwrap_or("");
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let tab_id = "main";

    if docteur_id.is_empty() {
        return Err("docteurId requis".to_string());
    }

    verify_sadmin_only(obj, tab_id, pays).await?;

    let new_pwd = hash_password("1234").unwrap_or_else(|_| "1234".to_string());
    let mut conn = connect_db(pays, tab_id, "yellow").await?;
    let user_table = "tab_user".to_string();
    sqlx::query::<Any>(&format!("UPDATE {} SET password=? WHERE id=? AND role='docteur'", user_table))
        .bind(&new_pwd)
        .bind(docteur_id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("reset_docteur_password: {}", e))?;
    sqlx::query::<Any>("UPDATE tab_connection SET password=? WHERE id=?")
        .bind(&new_pwd)
        .bind(docteur_id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("reset_docteur_password: {}", e))?;

    encrypt_response(&json!({ "success": true, "message": "Mot de passe réinitialisé à 1234. Le docteur devra le modifier à sa prochaine connexion." }), Some(&get_cript_key()))
}

// ========== Types collaborateurs et collaborateurs unifiés ==========

async fn migrate_old_collaborateurs_to_types(
    _pays: &str,
    tab_id: &str,
    conn_green: &mut sqlx::AnyConnection,
    conn_yellow: &mut sqlx::AnyConnection,
) -> Result<(), String> {
    let type_table = "tab_type_collaborateur".to_string();
    let collab_table = "tab_collaborateur".to_string();
    let user_table = "tab_user".to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let types_to_migrate = [
        ("Assistant", "tab_assistant", "assistant", "slf01,crd02,crd03,crd04,crd05,stt01,imp01,exp01,vpr01,vac01,vna01,vns01"),
        ("Comptable", "tab_comptable", "comptable", "slf01,crd02,crd03,crd04,crd05,stt01,imp01,exp01,vpr01,vac01,vna01,vns01"),
        ("Secrétaire", "tab_secretaire", "secretaire", "slf01,vac01"),
    ];

    for (nom, old_table, role, roles) in &types_to_migrate {
        let old_table_fmt = format!("{}{}", old_table, tab_id);
        let count_sql = format!("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='{}'", old_table_fmt);
        let count_row = sqlx::query::<Any>(&count_sql)
            .fetch_optional(&mut *conn_yellow)
            .await
            .map_err(|e| e.to_string())?;
        let has_old: bool = count_row
            .and_then(|r| r.try_get::<i64, _>(0).ok())
            .map(|c| c > 0)
            .unwrap_or(false);
        if !has_old { continue; }

        let type_id = Uuid::new_v4().to_string();
        let _ = sqlx::query::<Any>(&format!("INSERT INTO {} (id, nom, roles_par_defaut, date_creation) VALUES (?1, ?2, ?3, ?4)", type_table))
            .bind(&type_id)
            .bind(*nom)
            .bind(*roles)
            .bind(&now)
            .execute(&mut *conn_green)
            .await;

        let _ = sqlx::query::<Any>(&format!("INSERT OR IGNORE INTO {} (id, type_id, date_creation, logg_id) SELECT a.id, ?1, COALESCE(a.date_creation, ?2), COALESCE(a.logg_id, '') FROM {} a WHERE a.id IN (SELECT id FROM {} WHERE role = ?3)", collab_table, old_table_fmt, user_table))
            .bind(&type_id)
            .bind(&now)
            .bind(*role)
            .execute(&mut *conn_yellow)
            .await;
    }

    Ok(())
}

#[tauri::command]
pub async fn list_types_collaborateur(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.as_ref().and_then(|b| b.as_object());
    let tab_id = db::sanitize_tab_id(
        p.tab_id.as_deref()
            .or_else(|| body.and_then(|o| o.get("tabId")).and_then(|v| v.as_str()))
            .unwrap_or("main")
    );
    let pays = p.pays.as_deref()
        .or_else(|| body.and_then(|o| o.get("pays")).and_then(|v| v.as_str()))
        .unwrap_or("sn");

    let mut conn_yellow = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn_yellow, &tab_id).await?;
    let mut conn = connect_db(pays, &tab_id, "green").await?;
    let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await;
    let type_table = "tab_type_collaborateur".to_string();

    // Migration: si types vides mais anciennes tables ont des données, migrer
    let count_row = sqlx::query::<Any>(&format!("SELECT COUNT(*) FROM {}", type_table))
        .fetch_optional(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    let count: i64 = count_row.and_then(|r| r.try_get(0).ok()).unwrap_or(0);
    if count == 0 {
        migrate_old_collaborateurs_to_types(pays, &tab_id, &mut conn, &mut conn_yellow).await?;
    }

    let sql = format!("SELECT id, nom, roles_par_defaut, CAST(date_creation AS TEXT) FROM {} ORDER BY nom", type_table);
    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(json!({
            "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
            "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "rolesParDefaut": row.try_get::<Option<String>, _>(2).ok().flatten(),
            "dateCreation": row.try_get::<Option<String>, _>(3).ok().flatten(),
        }));
    }
    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn create_type_collaborateur(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let nom = obj.get("nom").and_then(|v| v.as_str()).unwrap_or("").trim();
    let roles_par_defaut = obj.get("rolesParDefaut").or(obj.get("roles_par_defaut")).and_then(|v| v.as_str()).unwrap_or("");
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    if nom.is_empty() {
        return Err("Le nom du type est obligatoire".to_string());
    }
    if nom.to_lowercase() == "docteur" {
        return Err("Le nom 'Docteur' est réservé".to_string());
    }

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await;
    let type_table = "tab_type_collaborateur".to_string();
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    sqlx::query::<Any>(&format!("INSERT INTO {} (id, nom, roles_par_defaut, date_creation) VALUES (?1, ?2, ?3, ?4)", type_table))
        .bind(&id)
        .bind(nom)
        .bind(roles_par_defaut)
        .bind(&now)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Création type: {}", e))?;

    encrypt_response(&json!({ "id": id, "nom": nom }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn update_type_collaborateur_roles(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body
        .as_ref()
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let type_id = obj
        .get("typeId")
        .or(obj.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let roles_par_defaut = obj
        .get("rolesParDefaut")
        .or(obj.get("roles_par_defaut"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let tab_id = db::sanitize_tab_id(
        obj.get("tabId")
            .and_then(|v| v.as_str())
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    if type_id.is_empty() {
        return Err("typeId manquant".to_string());
    }

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await;
    let type_table = "tab_type_collaborateur".to_string();
    let n = sqlx::query::<Any>(&format!(
        "UPDATE {} SET roles_par_defaut = ?1 WHERE id = ?2",
        type_table
    ))
    .bind(roles_par_defaut.trim())
    .bind(type_id)
    .execute(&mut conn)
    .await
    .map_err(|e| format!("Mise à jour rôles type: {}", e))?
    .rows_affected();

    if n == 0 {
        return Err("Type collaborateur introuvable".to_string());
    }

    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}

/// Liste le modèle de privilèges docteur (`tab_type_docteur`) — même principe que `list_types_collaborateur`.
#[tauri::command]
pub async fn list_types_docteur(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.as_ref().and_then(|b| b.as_object());
    let tab_id = db::sanitize_tab_id(
        p.tab_id
            .as_deref()
            .or_else(|| body.and_then(|o| o.get("tabId")).and_then(|v| v.as_str()))
            .unwrap_or("main"),
    );
    let pays = p
        .pays
        .as_deref()
        .or_else(|| body.and_then(|o| o.get("pays")).and_then(|v| v.as_str()))
        .unwrap_or("sn");

    let _ = ensure_and_fetch_type_docteur_roles_template(pays, &tab_id).await;

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await;
    let type_table = "tab_type_docteur".to_string();
    let sql = format!(
        "SELECT id, nom, roles_par_defaut, CAST(date_creation AS TEXT) FROM {} ORDER BY nom",
        type_table
    );
    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(json!({
            "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
            "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "rolesParDefaut": row.try_get::<Option<String>, _>(2).ok().flatten(),
            "dateCreation": row.try_get::<Option<String>, _>(3).ok().flatten(),
        }));
    }
    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

/// Met à jour `roles_par_defaut` du modèle docteur — n’altère pas les lignes `tab_privilege` des docteurs existants (comme pour les collaborateurs).
#[tauri::command]
pub async fn update_type_docteur_roles(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body
        .as_ref()
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let type_id = obj
        .get("typeId")
        .or(obj.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let roles_par_defaut = obj
        .get("rolesParDefaut")
        .or(obj.get("roles_par_defaut"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let tab_id = db::sanitize_tab_id(
        obj.get("tabId")
            .and_then(|v| v.as_str())
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    if type_id.is_empty() {
        return Err("typeId manquant".to_string());
    }

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await;
    let type_table = "tab_type_docteur".to_string();
    let n = sqlx::query::<Any>(&format!(
        "UPDATE {} SET roles_par_defaut = ?1 WHERE id = ?2",
        type_table
    ))
    .bind(roles_par_defaut.trim())
    .bind(type_id)
    .execute(&mut conn)
    .await
    .map_err(|e| format!("Mise à jour rôles type docteur: {}", e))?
    .rows_affected();

    if n == 0 {
        return Err("Type docteur introuvable".to_string());
    }

    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn list_collaborateurs_by_type(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.as_ref().and_then(|b| b.as_object());
    let type_id = p.id.as_deref()
        .or_else(|| body.and_then(|o| o.get("typeId")).and_then(|v| v.as_str()))
        .unwrap_or("");
    let tab_id = db::sanitize_tab_id(
        p.tab_id.as_deref()
            .or_else(|| body.and_then(|o| o.get("tabId")).and_then(|v| v.as_str()))
            .unwrap_or("main")
    );
    let limit = p.limit.unwrap_or(100).min(500);
    let pays = p.pays.as_deref()
        .or_else(|| body.and_then(|o| o.get("pays")).and_then(|v| v.as_str()))
        .unwrap_or("sn");

    if type_id.is_empty() {
        return encrypt_response(&Value::Array(vec![]), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    let collab_table = "tab_collaborateur".to_string();
    let sql = format!(
        "SELECT u.id, u.nom, u.prenom, u.login, u.telephone, u.naissance, u.adresse FROM {} u JOIN {} c ON u.id = c.id WHERE c.type_id = ?1 ORDER BY u.nom LIMIT ?2",
        user_table, collab_table
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(type_id)
        .bind(limit as i64)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(json!({
            "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
            "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "prenom": row.try_get::<Option<String>, _>(2).ok().flatten(),
            "login": row.try_get::<Option<String>, _>(3).ok().flatten(),
            "telephone": row.try_get::<Option<String>, _>(4).ok().flatten(),
            "naissance": row.try_get::<Option<String>, _>(5).ok().flatten(),
            "adresse": row.try_get::<Option<String>, _>(6).ok().flatten(),
        }));
    }
    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn create_collaborateur(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let collab = obj.get("collaborateur").and_then(|v| v.as_object()).or_else(|| body.as_object());
    let collab = collab.ok_or("collaborateur manquant")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").or(collab.get("tabId")).and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").or(collab.get("pays")).and_then(|v| v.as_str()).unwrap_or("sn");
    let type_id = collab.get("typeId").or(collab.get("type_id")).and_then(|v| v.as_str()).unwrap_or("");
    let logg_id = collab.get("loggId").or(collab.get("logg_id")).and_then(|v| v.as_str()).unwrap_or("");
    let cabinet_id = if logg_id.is_empty() { tab_id.as_str() } else { logg_id };
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    if type_id.is_empty() {
        return Err("typeId obligatoire".to_string());
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let nom = collab.get("nom").and_then(|v| v.as_str()).unwrap_or("").trim();
    let prenom = collab.get("prenom").and_then(|v| v.as_str()).unwrap_or("").trim();
    let login = collab.get("login").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase();
    let password_plain = collab.get("password").and_then(|v| v.as_str())
        .or_else(|| obj.get("passwordDefaut").and_then(|v| v.as_str()))
        .filter(|s| !s.is_empty())
        .unwrap_or("1234");
    let password = hash_password(password_plain).unwrap_or_else(|_| password_plain.to_string());
    let telephone = collab.get("telephone").and_then(|v| v.as_str()).unwrap_or("").trim();
    let naissance = collab.get("naissance").and_then(|v| v.as_str()).unwrap_or("");
    let adresse = collab.get("adresse").and_then(|v| v.as_str()).unwrap_or("");

    let mut conn_green = connect_db(pays, &tab_id, "green").await?;
    let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, &tab_id).await;
    let type_table = "tab_type_collaborateur".to_string();
    let role: String = sqlx::query::<Any>(&format!("SELECT nom FROM {} WHERE id = ?1", type_table))
        .bind(type_id)
        .fetch_optional(&mut conn_green)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<String, _>(0).ok())
        .unwrap_or_else(|| "collaborateur".to_string());

    let roles_par_defaut: String =
        sqlx::query::<Any>(&format!("SELECT roles_par_defaut FROM {} WHERE id = ?1", type_table))
            .bind(type_id)
            .fetch_optional(&mut conn_green)
            .await
            .ok()
            .flatten()
            .and_then(|r| r.try_get::<Option<String>, _>(0).ok().flatten())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| PRIV_NOM_DEFAUT_ASSISTANT_COMPTABLE.to_string());

    if login.is_empty() || telephone.is_empty() {
        return Err("Login et téléphone obligatoires".to_string());
    }

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let mut tx = conn.begin().await.map_err(sql_err)?;
    let user_table = "tab_user".to_string();
    let collab_table = "tab_collaborateur".to_string();
    sqlx::query::<Any>(&format!("INSERT INTO {} (id, nom, prenom, login, password, telephone, naissance, role, adresse, logg_id, date_creation) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)", user_table))
        .bind(&id)
        .bind(nom)
        .bind(prenom)
        .bind(&login)
        .bind(&password)
        .bind(telephone)
        .bind(naissance)
        .bind(role.to_lowercase())
        .bind(adresse)
        .bind(logg_id)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("tab_user: {}", e))?;
    sqlx::query::<Any>(&format!("INSERT INTO {} (id, type_id, date_creation, logg_id) VALUES (?1, ?2, ?3, ?4)", collab_table))
        .bind(&id)
        .bind(type_id)
        .bind(&now)
        .bind(logg_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("tab_collaborateur: {}", e))?;
    sqlx::query::<Any>("INSERT INTO tab_connection (id, logg_id, login, telephone, password, role) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
        .bind(&id)
        .bind(logg_id)
        .bind(&login)
        .bind(telephone)
        .bind(&password)
        .bind(role.to_lowercase())
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("tab_connection: {}", e))?;
    tx.commit().await.map_err(sql_err)?;

    let _ = insert_default_privilege_row_green(pays, &tab_id, &id, &roles_par_defaut).await;

    encrypt_response(&json!({ "id": id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn delete_collaborateur(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let body = p.body.as_ref().and_then(|b| b.as_object());
    let tab_id = db::sanitize_tab_id(
        p.tab_id.as_deref()
            .or_else(|| body.and_then(|o| o.get("tabId")).and_then(|v| v.as_str()))
            .unwrap_or("main")
    );
    let pays = p.pays.as_deref().unwrap_or("sn");
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(tab_id.as_str(), &tab_id, pays).await?;

    if id.is_empty() {
        return encrypt_response(&json!({ "success": false }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let collab_table = "tab_collaborateur".to_string();
    sqlx::query::<Any>(&format!("DELETE FROM {} WHERE id = ?1", collab_table))
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query::<Any>("DELETE FROM tab_user WHERE id = ?1")
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query::<Any>("DELETE FROM tab_connection WHERE id = ?1")
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_collaborateur_profile(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    if id.is_empty() {
        return encrypt_response(&json!({ "collaborateur": null }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    let collab_table = "tab_collaborateur".to_string();
    let sql = format!(
        "SELECT u.id, u.nom, u.prenom, u.login, u.telephone, u.naissance, u.adresse, c.type_id FROM {} u JOIN {} c ON u.id = c.id WHERE u.id = ?1",
        user_table, collab_table
    );

    if let Some(row) = sqlx::query::<Any>(&sql)
        .bind(&id)
        .fetch_optional(&mut conn)
        .await
        .map_err(sql_err)?
    {
        let type_id: Option<String> = row.try_get(7).ok().flatten();
                let result = json!({
                    "collaborateur": {
                "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
                "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
                "prenom": row.try_get::<Option<String>, _>(2).ok().flatten(),
                "login": row.try_get::<Option<String>, _>(3).ok().flatten(),
                "telephone": row.try_get::<Option<String>, _>(4).ok().flatten(),
                "naissance": row.try_get::<Option<String>, _>(5).ok().flatten(),
                "adresse": row.try_get::<Option<String>, _>(6).ok().flatten(),
                        "typeId": type_id,
                    }
                });
                return encrypt_response(&result, Some(&get_cript_key()));
    }

    encrypt_response(&json!({ "collaborateur": null }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_collaborateur_qrcode(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let body = p.body.as_ref().and_then(|b| b.as_object());
    let role = body
        .and_then(|o| o.get("role"))
        .and_then(|v| v.as_str())
        .or_else(|| p.qrcode_role.as_deref())
        .unwrap_or("collaborateur");
    let pays = p.pays.as_deref().unwrap_or("sn");
    if id.is_empty() {
        return encrypt_response(&json!({ "base64": "" }), Some(&get_cript_key()));
    }
    let (lg, nom, prenom) = fetch_identity_qr_extras(pays, tab_id.as_str(), id).await;
    let (cabinet_nom, docteur_full) = fetch_qr_identity_context(pays, tab_id.as_str(), lg.as_str()).await;
    let base64 = generate_qrcode_base64(
        id,
        tab_id.as_str(),
        role,
        pays,
        &lg,
        nom.as_deref(),
        prenom.as_deref(),
        cabinet_nom.as_deref(),
        docteur_full.as_deref(),
        None,
    )?;
    encrypt_response(&json!({ "base64": base64 }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn update_collaborateur_profile(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let collab = obj.get("collaborateur").and_then(|v| v.as_object()).or_else(|| body.as_object());
    let collab = collab.ok_or("collaborateur manquant")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").or(collab.get("tabId")).and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").or(collab.get("pays")).and_then(|v| v.as_str()).unwrap_or("sn");
    let id = collab.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let cabinet_id = collab.get("loggId").or(obj.get("cabinetId")).and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    if id.is_empty() {
        return Err("ID collaborateur manquant".to_string());
    }

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    sqlx::query::<Any>(&format!("UPDATE {} SET nom=?, prenom=?, login=?, telephone=?, naissance=?, adresse=? WHERE id=?", user_table))
        .bind(collab.get("nom").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(collab.get("prenom").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(collab.get("login").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(collab.get("telephone").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(collab.get("naissance").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(collab.get("adresse").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Update collaborateur: {}", e))?;

    if let Some(pwd) = collab.get("password").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
        sqlx::query::<Any>("UPDATE tab_connection SET login=?, telephone=?, password=? WHERE id=?")
            .bind(collab.get("login").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(collab.get("telephone").and_then(|v| v.as_str()).unwrap_or(""))
            .bind(pwd)
            .bind(&id)
            .execute(&mut conn)
            .await
            .map_err(|e| format!("Update connection: {}", e))?;
    }

    encrypt_response(&json!({ "id": id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn create_assistant(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let assistant = obj.get("assistant").and_then(|v| v.as_object()).or_else(|| body.as_object());
    let assistant = assistant.ok_or("assistant manquant")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").or(assistant.get("tabId")).and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").or(assistant.get("pays")).and_then(|v| v.as_str()).unwrap_or("sn");
    let logg_id = assistant.get("loggId").or(assistant.get("logg_id")).and_then(|v| v.as_str()).unwrap_or("");
    let cabinet_id = if logg_id.is_empty() { tab_id.as_str() } else { logg_id };
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let nom = assistant.get("nom").and_then(|v| v.as_str()).unwrap_or("").trim();
    let prenom = assistant.get("prenom").and_then(|v| v.as_str()).unwrap_or("").trim();
    let login = assistant.get("login").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase();
    let password_plain = assistant.get("password").and_then(|v| v.as_str())
        .or_else(|| obj.get("passwordDefaut").and_then(|v| v.as_str()))
        .filter(|s| !s.is_empty())
        .unwrap_or("1234");
    let password = hash_password(password_plain).unwrap_or_else(|_| password_plain.to_string());
    let telephone = assistant.get("telephone").and_then(|v| v.as_str()).unwrap_or("").trim();
    let naissance = assistant.get("naissance").and_then(|v| v.as_str()).unwrap_or("");
    let adresse = assistant.get("adresse").and_then(|v| v.as_str()).unwrap_or("");
    let role = "assistant";

    if login.is_empty() || telephone.is_empty() {
        return Err("Login et téléphone obligatoires".to_string());
    }

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let mut tx = conn.begin().await.map_err(sql_err)?;
    sqlx::query::<Any>("INSERT INTO tab_user (id, nom, prenom, login, password, telephone, naissance, role, adresse, logg_id, date_creation) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)")
        .bind(&id)
        .bind(nom)
        .bind(prenom)
        .bind(&login)
        .bind(&password)
        .bind(telephone)
        .bind(naissance)
        .bind(role)
        .bind(adresse)
        .bind(logg_id)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("tab_user: {}", e))?;
    sqlx::query::<Any>("INSERT INTO tab_assistant (id, date_creation, logg_id) VALUES (?1, ?2, ?3)")
        .bind(&id)
        .bind(&now)
        .bind(logg_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("tab_assistant: {}", e))?;
    sqlx::query::<Any>("INSERT INTO tab_connection (id, logg_id, login, telephone, password, role) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
        .bind(&id)
        .bind(logg_id)
        .bind(&login)
        .bind(telephone)
        .bind(&password)
        .bind(role)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("tab_connection: {}", e))?;
    tx.commit().await.map_err(sql_err)?;

    let _ = insert_default_privilege_row_green(
        pays,
        &tab_id,
        &id,
        PRIV_NOM_DEFAUT_ASSISTANT_COMPTABLE,
    )
    .await;

    encrypt_response(&json!({ "id": id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn list_assistants(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let limit = p.limit.unwrap_or(100).min(500);
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    let assistant_table = "tab_assistant".to_string();
    let sql = format!(
        "SELECT u.id, u.nom, u.prenom, u.login, u.telephone FROM {} u JOIN {} a ON u.id = a.id WHERE u.role = 'assistant' ORDER BY u.nom LIMIT ?1",
        user_table, assistant_table
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(limit as i64)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(json!({
            "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
            "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "prenom": row.try_get::<Option<String>, _>(2).ok().flatten(),
            "login": row.try_get::<Option<String>, _>(3).ok().flatten(),
            "telephone": row.try_get::<Option<String>, _>(4).ok().flatten(),
        }));
    }
    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn delete_assistant(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(tab_id.as_str(), &tab_id, pays).await?;

    if id.is_empty() {
        return encrypt_response(&json!({ "success": false }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    sqlx::query::<Any>("DELETE FROM tab_assistant WHERE id = ?1")
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query::<Any>("DELETE FROM tab_user WHERE id = ?1")
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query::<Any>("DELETE FROM tab_connection WHERE id = ?1")
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_comptable_qrcode(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    if id.is_empty() {
        return encrypt_response(&json!({ "base64": "" }), Some(&get_cript_key()));
    }
    let (lg, nom, prenom) = fetch_identity_qr_extras(pays, tab_id.as_str(), id).await;
    let (cabinet_nom, docteur_full) = fetch_qr_identity_context(pays, tab_id.as_str(), lg.as_str()).await;
    let base64 = generate_qrcode_base64(
        id,
        tab_id.as_str(),
        "comptable",
        pays,
        &lg,
        nom.as_deref(),
        prenom.as_deref(),
        cabinet_nom.as_deref(),
        docteur_full.as_deref(),
        None,
    )?;
    encrypt_response(&json!({ "base64": base64 }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_comptable_profile(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    if id.is_empty() {
        return encrypt_response(&json!({ "comptable": null }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    let comptable_table = "tab_comptable".to_string();
    let sql = format!(
        "SELECT u.id, u.nom, u.prenom, u.login, u.telephone, u.naissance, u.adresse FROM {} u JOIN {} c ON u.id = c.id WHERE u.role = 'comptable' AND u.id = ?1",
        user_table, comptable_table
    );

    if let Some(row) = sqlx::query::<Any>(&sql)
        .bind(&id)
        .fetch_optional(&mut conn)
        .await
        .map_err(sql_err)?
    {
                let result = json!({
                    "comptable": {
                "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
                "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
                "prenom": row.try_get::<Option<String>, _>(2).ok().flatten(),
                "login": row.try_get::<Option<String>, _>(3).ok().flatten(),
                "telephone": row.try_get::<Option<String>, _>(4).ok().flatten(),
                "naissance": row.try_get::<Option<String>, _>(5).ok().flatten(),
                "adresse": row.try_get::<Option<String>, _>(6).ok().flatten(),
                    }
                });
                return encrypt_response(&result, Some(&get_cript_key()));
    }

    encrypt_response(&json!({ "comptable": null }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn update_comptable_profile(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let comptable = obj.get("comptable").and_then(|v| v.as_object()).or_else(|| body.as_object());
    let comptable = comptable.ok_or("comptable manquant")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").or(comptable.get("tabId")).and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").or(comptable.get("pays")).and_then(|v| v.as_str()).unwrap_or("sn");
    let id = comptable.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Err("ID comptable manquant".to_string());
    }
    let cabinet_id = comptable.get("loggId").or(obj.get("cabinetId")).and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    sqlx::query::<Any>(&format!("UPDATE {} SET nom=?, prenom=?, login=?, telephone=?, naissance=?, adresse=? WHERE id=? AND role='comptable'", user_table))
        .bind(comptable.get("nom").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(comptable.get("prenom").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(comptable.get("login").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(comptable.get("telephone").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(comptable.get("naissance").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(comptable.get("adresse").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(&id)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("Update comptable: {}", e))?;

    if let Some(pwd) = comptable.get("password").and_then(|v| v.as_str()) {
        if !pwd.is_empty() {
            sqlx::query::<Any>("UPDATE tab_connection SET login=?, telephone=?, password=? WHERE id=?")
                .bind(comptable.get("login").and_then(|v| v.as_str()).unwrap_or(""))
                .bind(comptable.get("telephone").and_then(|v| v.as_str()).unwrap_or(""))
                .bind(pwd)
                .bind(&id)
                .execute(&mut conn)
                .await
                .map_err(|e| format!("Update connection: {}", e))?;
        }
    }

    encrypt_response(&json!({ "id": id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn create_comptable(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let comptable = obj.get("comptable").and_then(|v| v.as_object()).or_else(|| body.as_object());
    let comptable = comptable.ok_or("comptable manquant")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").or(comptable.get("tabId")).and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").or(comptable.get("pays")).and_then(|v| v.as_str()).unwrap_or("sn");
    let logg_id = comptable.get("loggId").or(comptable.get("logg_id")).and_then(|v| v.as_str()).unwrap_or("");
    let cabinet_id = if logg_id.is_empty() { tab_id.as_str() } else { logg_id };
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let nom = comptable.get("nom").and_then(|v| v.as_str()).unwrap_or("").trim();
    let prenom = comptable.get("prenom").and_then(|v| v.as_str()).unwrap_or("").trim();
    let login = comptable.get("login").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase();
    let password_plain = comptable.get("password").and_then(|v| v.as_str())
        .or_else(|| obj.get("passwordDefaut").and_then(|v| v.as_str()))
        .filter(|s| !s.is_empty())
        .unwrap_or("1234");
    let password = hash_password(password_plain).unwrap_or_else(|_| password_plain.to_string());
    let telephone = comptable.get("telephone").and_then(|v| v.as_str()).unwrap_or("").trim();
    let naissance = comptable.get("naissance").and_then(|v| v.as_str()).unwrap_or("");
    let adresse = comptable.get("adresse").and_then(|v| v.as_str()).unwrap_or("");
    let role = "comptable";

    if login.is_empty() || telephone.is_empty() {
        return Err("Login et téléphone obligatoires".to_string());
    }

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let mut tx = conn.begin().await.map_err(sql_err)?;
    sqlx::query::<Any>("INSERT INTO tab_user (id, nom, prenom, login, password, telephone, naissance, role, adresse, logg_id, date_creation) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)")
        .bind(&id)
        .bind(nom)
        .bind(prenom)
        .bind(&login)
        .bind(&password)
        .bind(telephone)
        .bind(naissance)
        .bind(role)
        .bind(adresse)
        .bind(logg_id)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("tab_user: {}", e))?;
    sqlx::query::<Any>("INSERT INTO tab_comptable (id, date_creation, logg_id) VALUES (?1, ?2, ?3)")
        .bind(&id)
        .bind(&now)
        .bind(logg_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("tab_comptable: {}", e))?;
    sqlx::query::<Any>("INSERT INTO tab_connection (id, logg_id, login, telephone, password, role) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
        .bind(&id)
        .bind(logg_id)
        .bind(&login)
        .bind(telephone)
        .bind(&password)
        .bind(role)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("tab_connection: {}", e))?;
    tx.commit().await.map_err(sql_err)?;

    let _ = insert_default_privilege_row_green(
        pays,
        &tab_id,
        &id,
        PRIV_NOM_DEFAUT_ASSISTANT_COMPTABLE,
    )
    .await;

    encrypt_response(&json!({ "id": id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn list_comptables(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let limit = p.limit.unwrap_or(100).min(500);
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    let comptable_table = "tab_comptable".to_string();
    let sql = format!(
        "SELECT u.id, u.nom, u.prenom, u.login, u.telephone FROM {} u JOIN {} c ON u.id = c.id WHERE u.role = 'comptable' ORDER BY u.nom LIMIT ?1",
        user_table, comptable_table
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(limit as i64)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(json!({
            "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
            "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "prenom": row.try_get::<Option<String>, _>(2).ok().flatten(),
            "login": row.try_get::<Option<String>, _>(3).ok().flatten(),
            "telephone": row.try_get::<Option<String>, _>(4).ok().flatten(),
        }));
    }
    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn delete_comptable(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(tab_id.as_str(), &tab_id, pays).await?;

    if id.is_empty() {
        return encrypt_response(&json!({ "success": false }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    sqlx::query::<Any>("DELETE FROM tab_comptable WHERE id = ?1")
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query::<Any>("DELETE FROM tab_user WHERE id = ?1")
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query::<Any>("DELETE FROM tab_connection WHERE id = ?1")
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_secretaire_qrcode(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    if id.is_empty() {
        return encrypt_response(&json!({ "base64": "" }), Some(&get_cript_key()));
    }
    let (lg, nom, prenom) = fetch_identity_qr_extras(pays, tab_id.as_str(), id).await;
    let (cabinet_nom, docteur_full) = fetch_qr_identity_context(pays, tab_id.as_str(), lg.as_str()).await;
    let base64 = generate_qrcode_base64(
        id,
        tab_id.as_str(),
        "secretaire",
        pays,
        &lg,
        nom.as_deref(),
        prenom.as_deref(),
        cabinet_nom.as_deref(),
        docteur_full.as_deref(),
        None,
    )?;
    encrypt_response(&json!({ "base64": base64 }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn get_secretaire_profile(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    if id.is_empty() {
        return encrypt_response(&json!({ "secretaire": null }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    let secretaire_table = "tab_secretaire".to_string();
    let sql = format!(
        "SELECT u.id, u.nom, u.prenom, u.login, u.telephone, u.naissance, u.adresse FROM {} u JOIN {} s ON u.id = s.id WHERE u.role = 'secretaire' AND u.id = ?1",
        user_table, secretaire_table
    );

    if let Some(row) = sqlx::query::<Any>(&sql)
        .bind(&id)
        .fetch_optional(&mut conn)
        .await
        .map_err(sql_err)?
    {
                let result = json!({
                    "secretaire": {
                "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
                "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
                "prenom": row.try_get::<Option<String>, _>(2).ok().flatten(),
                "login": row.try_get::<Option<String>, _>(3).ok().flatten(),
                "telephone": row.try_get::<Option<String>, _>(4).ok().flatten(),
                "naissance": row.try_get::<Option<String>, _>(5).ok().flatten(),
                "adresse": row.try_get::<Option<String>, _>(6).ok().flatten(),
                    }
                });
                return encrypt_response(&result, Some(&get_cript_key()));
    }

    encrypt_response(&json!({ "secretaire": null }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn update_secretaire_profile(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let secretaire = obj.get("secretaire").and_then(|v| v.as_object()).or_else(|| body.as_object());
    let secretaire = secretaire.ok_or("secretaire manquant")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").or(secretaire.get("tabId")).and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").or(secretaire.get("pays")).and_then(|v| v.as_str()).unwrap_or("sn");
    let id = secretaire.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Err("ID secretaire manquant".to_string());
    }
    let cabinet_id = secretaire.get("loggId").or(obj.get("cabinetId")).and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    sqlx::query::<Any>(&format!("UPDATE {} SET nom=?, prenom=?, login=?, telephone=?, naissance=?, adresse=? WHERE id=? AND role='secretaire'", user_table))
        .bind(secretaire.get("nom").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(secretaire.get("prenom").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(secretaire.get("login").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(secretaire.get("telephone").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(secretaire.get("naissance").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(secretaire.get("adresse").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(&id)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("Update secretaire: {}", e))?;

    if let Some(pwd) = secretaire.get("password").and_then(|v| v.as_str()) {
        if !pwd.is_empty() {
            sqlx::query::<Any>("UPDATE tab_connection SET login=?, telephone=?, password=? WHERE id=?")
                .bind(secretaire.get("login").and_then(|v| v.as_str()).unwrap_or(""))
                .bind(secretaire.get("telephone").and_then(|v| v.as_str()).unwrap_or(""))
                .bind(pwd)
                .bind(&id)
                .execute(&mut conn)
                .await
                .map_err(|e| format!("Update connection: {}", e))?;
        }
    }

    encrypt_response(&json!({ "id": id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn create_secretaire(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let secretaire = obj.get("secretaire").and_then(|v| v.as_object()).or_else(|| body.as_object());
    let secretaire = secretaire.ok_or("secretaire manquant")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").or(secretaire.get("tabId")).and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").or(secretaire.get("pays")).and_then(|v| v.as_str()).unwrap_or("sn");
    let logg_id = secretaire.get("loggId").or(secretaire.get("logg_id")).and_then(|v| v.as_str()).unwrap_or("");
    let cabinet_id = if logg_id.is_empty() { tab_id.as_str() } else { logg_id };
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let nom = secretaire.get("nom").and_then(|v| v.as_str()).unwrap_or("").trim();
    let prenom = secretaire.get("prenom").and_then(|v| v.as_str()).unwrap_or("").trim();
    let login = secretaire.get("login").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase();
    let password_plain = secretaire.get("password").and_then(|v| v.as_str())
        .or_else(|| obj.get("passwordDefaut").and_then(|v| v.as_str()))
        .filter(|s| !s.is_empty())
        .unwrap_or("1234");
    let password = hash_password(password_plain).unwrap_or_else(|_| password_plain.to_string());
    let telephone = secretaire.get("telephone").and_then(|v| v.as_str()).unwrap_or("").trim();
    let naissance = secretaire.get("naissance").and_then(|v| v.as_str()).unwrap_or("");
    let adresse = secretaire.get("adresse").and_then(|v| v.as_str()).unwrap_or("");
    let role = "secretaire";

    if login.is_empty() || telephone.is_empty() {
        return Err("Login et téléphone obligatoires".to_string());
    }

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let mut tx = conn.begin().await.map_err(sql_err)?;
    sqlx::query::<Any>("INSERT INTO tab_user (id, nom, prenom, login, password, telephone, naissance, role, adresse, logg_id, date_creation) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)")
        .bind(&id)
        .bind(nom)
        .bind(prenom)
        .bind(&login)
        .bind(&password)
        .bind(telephone)
        .bind(naissance)
        .bind(role)
        .bind(adresse)
        .bind(logg_id)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("tab_user: {}", e))?;
    sqlx::query::<Any>("INSERT INTO tab_secretaire (id, date_creation, logg_id) VALUES (?1, ?2, ?3)")
        .bind(&id)
        .bind(&now)
        .bind(logg_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("tab_secretaire: {}", e))?;
    sqlx::query::<Any>("INSERT INTO tab_connection (id, logg_id, login, telephone, password, role) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
        .bind(&id)
        .bind(logg_id)
        .bind(&login)
        .bind(telephone)
        .bind(&password)
        .bind(role)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("tab_connection: {}", e))?;
    tx.commit().await.map_err(sql_err)?;

    let _ = insert_default_privilege_row_green(pays, &tab_id, &id, PRIV_NOM_DEFAUT_SECRETAIRE).await;

    encrypt_response(&json!({ "id": id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn list_secretaires(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let limit = p.limit.unwrap_or(100).min(500);
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    let user_table = "tab_user".to_string();
    let secretaire_table = "tab_secretaire".to_string();
    let sql = format!(
        "SELECT u.id, u.nom, u.prenom, u.login, u.telephone FROM {} u JOIN {} s ON u.id = s.id WHERE u.role = 'secretaire' ORDER BY u.nom LIMIT ?1",
        user_table, secretaire_table
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(limit as i64)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(json!({
            "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
            "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "prenom": row.try_get::<Option<String>, _>(2).ok().flatten(),
            "login": row.try_get::<Option<String>, _>(3).ok().flatten(),
            "telephone": row.try_get::<Option<String>, _>(4).ok().flatten(),
        }));
    }
    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn delete_secretaire(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(tab_id.as_str(), &tab_id, pays).await?;

    if id.is_empty() {
        return encrypt_response(&json!({ "success": false }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "yellow").await?;
    crate::db_sqlx::ensure_tables_sqlx(&mut conn, &tab_id).await?;

    sqlx::query::<Any>("DELETE FROM tab_secretaire WHERE id = ?1")
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query::<Any>("DELETE FROM tab_user WHERE id = ?1")
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query::<Any>("DELETE FROM tab_connection WHERE id = ?1")
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}

/// Filtre stats sur le jour calendaire : le champ `date` des actes est souvent `yyyy-mm-ddTHH:mm` ;
/// un simple `date <= 'yyyy-mm-dd'` exclut ces lignes (chaîne plus longue > date seule).
fn stats_acte_day_filter(column: &str) -> String {
    format!(
        "substr(trim(COALESCE({col},'')), 1, 10) >= ?1 AND substr(trim(COALESCE({col},'')), 1, 10) <= ?2",
        col = column
    )
}

fn stats_parse_ymd_bounds(date_debut: &str, date_fin: &str) -> (String, String) {
    let d1 = date_debut.trim();
    let d2 = date_fin.trim();
    let day_start = if d1.len() >= 10 && d1.as_bytes().get(4) == Some(&b'-') && d1.as_bytes().get(7) == Some(&b'-') {
        d1[..10].to_string()
    } else {
        d1.to_string()
    };
    let day_end = if d2.len() >= 10 && d2.as_bytes().get(4) == Some(&b'-') && d2.as_bytes().get(7) == Some(&b'-') {
        d2[..10].to_string()
    } else {
        d2.to_string()
    };
    (day_start, day_end)
}

/// Noms d'actes depuis le JSON (chaînes ou nombres).
fn stats_parse_nom_actes_array(arr: &[Value]) -> Vec<String> {
    let mut out = Vec::new();
    for v in arr {
        let s = v
            .as_str()
            .map(String::from)
            .or_else(|| v.as_i64().map(|n| n.to_string()))
            .or_else(|| v.as_f64().map(|n| n.to_string()));
        if let Some(t) = s {
            let t = t.trim();
            if !t.is_empty() {
                out.push(t.to_string());
            }
        }
    }
    out
}

/// Lit `nomActes` quel que soit le format (camelCase, snake_case, tableau JSON, chaîne JSON).
fn stats_extract_nom_actes_from_body(obj: &serde_json::Map<String, Value>) -> Vec<String> {
    const KEYS: &[&str] = &["nomActes", "nom_actes", "NomsActes", "filterActes"];
    for &k in KEYS {
        if let Some(v) = obj.get(k) {
            if v.is_null() {
                continue;
            }
            if let Some(arr) = v.as_array() {
                let parsed = stats_parse_nom_actes_array(arr);
                if !parsed.is_empty() {
                    return parsed;
                }
            }
            if let Some(s) = v.as_str() {
                let t = s.trim();
                if t.starts_with('[') {
                    if let Ok(arr) = serde_json::from_str::<Vec<Value>>(t) {
                        let parsed = stats_parse_nom_actes_array(&arr);
                        if !parsed.is_empty() {
                            return parsed;
                        }
                    }
                } else if !t.is_empty() {
                    return vec![t.to_string()];
                }
            }
        }
    }
    Vec::new()
}

/// Filtre `IN` sur le nom d'acte : compare en **lower(trim(...))** pour éviter échecs (casse, espaces).
/// `column` = `nom` ou `acte.nom`.
fn stats_nom_acte_in_clause(column: &str, noms: &[String]) -> (String, Vec<String>) {
    let cleaned: Vec<String> = noms
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if cleaned.is_empty() {
        return (String::new(), vec![]);
    }
    let ph = std::iter::repeat("?").take(cleaned.len()).collect::<Vec<_>>().join(",");
    let clause = format!(
        " AND lower(trim(COALESCE({col},''))) IN ({ph})",
        col = column,
        ph = ph
    );
    let binds: Vec<String> = cleaned.iter().map(|s| s.to_lowercase()).collect();
    (clause, binds)
}

#[tauri::command]
pub async fn stats_list_nom_actes(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    let date_debut = p.params.get(0).map(|s| s.as_str()).unwrap_or("");
    let date_fin = p.params.get(1).map(|s| s.as_str()).unwrap_or("");
    let (day_start, day_end) = stats_parse_ymd_bounds(date_debut, date_fin);

    let mut conn = connect_db(pays, &tab_id, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, &tab_id).await?;

    let acte_table = "tab_acte".to_string();
    let filt = stats_acte_day_filter("date");
    let sql = format!(
        "SELECT DISTINCT nom FROM {} WHERE {} AND nom IS NOT NULL AND nom != '' ORDER BY nom",
        acte_table, filt
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(&day_start)
        .bind(&day_end)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut list: Vec<Value> = Vec::new();
    for row in rows {
        if let Ok(Some(nom)) = row.try_get::<Option<String>, _>(0) {
            list.push(Value::String(nom));
        }
    }
    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn stats_get_info(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let date_debut = obj.get("dateDebut").and_then(|v| v.as_str()).unwrap_or("");
    let date_fin = obj.get("dateFin").and_then(|v| v.as_str()).unwrap_or("");
    let (day_start, day_end) = stats_parse_ymd_bounds(date_debut, date_fin);
    let nom_actes: Vec<String> = stats_extract_nom_actes_from_body(obj);
    let group_by = obj.get("groupByPeriod").and_then(|v| v.as_str()).unwrap_or("mois");
    let abscisse_raw = obj.get("abscisseType").and_then(|v| v.as_str()).unwrap_or("type_acte");
    let abscisse_type = if abscisse_raw.trim().is_empty() {
        "type_acte"
    } else {
        abscisse_raw
    };

    let mut conn = connect_db(pays, &tab_id, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, &tab_id).await?;

    let acte_table = "tab_acte".to_string();
    let date_filt = stats_acte_day_filter("date");
    let mut list: Vec<Value> = Vec::new();

    if abscisse_type == "type_acte" {
        let (nom_filt, nom_binds) = stats_nom_acte_in_clause("nom", &nom_actes);
        let sql = format!(
            "SELECT max(trim(COALESCE(nom,''))) AS nomActe, COUNT(*) AS nombreActes, COALESCE(SUM(argentRecu),0) AS totalArgentRecu, COALESCE(SUM(prix),0) AS totalPrixActe FROM {} WHERE {} {} GROUP BY lower(trim(COALESCE(nom,''))) ORDER BY nombreActes DESC",
            acte_table, date_filt, nom_filt
        );

        let mut q = sqlx::query::<Any>(&sql).bind(&day_start).bind(&day_end);
        for b in &nom_binds {
            q = q.bind(b);
        }
        let rows = q.fetch_all(&mut conn).await.map_err(|e| e.to_string())?;
            for row in rows {
            list.push(json!({
                "nomActe": row.try_get::<Option<String>, _>(0).ok().flatten(),
                "nombreActes": row.try_get::<i64, _>(1).unwrap_or(0),
                "totalArgentRecu": row.try_get::<i64, _>(2).unwrap_or(0),
                "totalPrixActe": row.try_get::<i64, _>(3).unwrap_or(0),
            }));
        }
    } else if abscisse_type == "date" && (group_by == "mois" || group_by == "jour" || group_by == "semaine" || group_by == "annee") {
        // Ne pas utiliser strftime('…', date) sur du texte type "yyyy-mm-ddTHH:mm" : SQLite peut renvoyer NULL → aucune ligne.
        let periode_expr = match group_by {
            "annee" => "substr(trim(COALESCE(date,'')), 1, 4)",
            "mois" => "substr(trim(COALESCE(date,'')), 1, 7)",
            "jour" => "substr(trim(COALESCE(date,'')), 1, 10)",
            "semaine" => "strftime('%Y-%W', date(substr(trim(replace(replace(COALESCE(date,''), 'T', ' '), '/', '-')), 1, 10)))",
            _ => "substr(trim(COALESCE(date,'')), 1, 7)",
        };
        let (nom_filt, nom_binds) = stats_nom_acte_in_clause("nom", &nom_actes);
        let sql = format!(
            "SELECT {} AS periode, COUNT(*) AS nombreActes, COALESCE(SUM(argentRecu),0) AS totalArgentRecu, COALESCE(SUM(prix),0) AS totalPrixActe FROM {} WHERE {} {} GROUP BY periode ORDER BY periode",
            periode_expr, acte_table, date_filt, nom_filt
        );

        let mut q = sqlx::query::<Any>(&sql).bind(&day_start).bind(&day_end);
        for b in &nom_binds {
            q = q.bind(b);
        }
        let rows = q.fetch_all(&mut conn).await.map_err(|e| e.to_string())?;
            for row in rows {
            list.push(json!({
                "periode": row.try_get::<Option<String>, _>(0).ok().flatten(),
                "nombreActes": row.try_get::<i64, _>(1).unwrap_or(0),
                "totalArgentRecu": row.try_get::<i64, _>(2).unwrap_or(0),
                "totalPrixActe": row.try_get::<i64, _>(3).unwrap_or(0),
            }));
        }
    } else if abscisse_type == "jour_semaine" {
        let day_norm = "date(substr(trim(replace(replace(COALESCE(date,''), 'T', ' '), '/', '-')), 1, 10))";
        let (nom_filt, nom_binds) = stats_nom_acte_in_clause("nom", &nom_actes);
        let sql = format!(
            r#"SELECT 
                CASE CAST(strftime('%w', {0}) AS INTEGER)
                    WHEN 0 THEN 'Dimanche'
                    WHEN 1 THEN 'Lundi'
                    WHEN 2 THEN 'Mardi'
                    WHEN 3 THEN 'Mercredi'
                    WHEN 4 THEN 'Jeudi'
                    WHEN 5 THEN 'Vendredi'
                    WHEN 6 THEN 'Samedi'
                    ELSE 'Inconnu'
                END AS jourSemaine,
                COUNT(*) AS nombreActes,
                COALESCE(SUM(argentRecu),0) AS totalArgentRecu,
                COALESCE(SUM(prix),0) AS totalPrixActe
            FROM {1} WHERE {2} {3}
            GROUP BY jourSemaine
            ORDER BY MIN(CAST(strftime('%w', {0}) AS INTEGER))"#,
            day_norm, acte_table, date_filt, nom_filt
        );
        let mut q = sqlx::query::<Any>(&sql).bind(&day_start).bind(&day_end);
        for b in &nom_binds {
            q = q.bind(b);
        }
        let rows = q.fetch_all(&mut conn).await.map_err(|e| e.to_string())?;
        for row in rows {
            list.push(json!({
                "jourSemaine": row.try_get::<Option<String>, _>(0).ok().flatten(),
                "nombreActes": row.try_get::<i64, _>(1).unwrap_or(0),
                "totalArgentRecu": row.try_get::<i64, _>(2).unwrap_or(0),
                "totalPrixActe": row.try_get::<i64, _>(3).unwrap_or(0),
            }));
        }
    } else if abscisse_type == "tranche_prix" {
        let (nom_filt, nom_binds) = stats_nom_acte_in_clause("nom", &nom_actes);
        let sql = format!(
            r#"SELECT 
                CASE 
                    WHEN prix < 25000 THEN '0-25k FCFA'
                    WHEN prix >= 25000 AND prix < 50000 THEN '25k-50k FCFA'
                    WHEN prix >= 50000 AND prix < 100000 THEN '50k-100k FCFA'
                    WHEN prix >= 100000 AND prix < 250000 THEN '100k-250k FCFA'
                    ELSE '>250k FCFA'
                END AS tranchePrix,
                COUNT(*) AS nombreActes,
                COALESCE(SUM(argentRecu),0) AS totalArgentRecu,
                COALESCE(SUM(prix),0) AS totalPrixActe
            FROM {} WHERE {} {}
            GROUP BY tranchePrix
            ORDER BY MIN(prix)"#,
            acte_table, date_filt, nom_filt
        );
        let mut q = sqlx::query::<Any>(&sql).bind(&day_start).bind(&day_end);
        for b in &nom_binds {
            q = q.bind(b);
        }
        let rows = q.fetch_all(&mut conn).await.map_err(|e| e.to_string())?;
        for row in rows {
            list.push(json!({
                "tranchePrix": row.try_get::<Option<String>, _>(0).ok().flatten(),
                "nombreActes": row.try_get::<i64, _>(1).unwrap_or(0),
                "totalArgentRecu": row.try_get::<i64, _>(2).unwrap_or(0),
                "totalPrixActe": row.try_get::<i64, _>(3).unwrap_or(0),
            }));
        }
    } else if abscisse_type == "type_assurance" {
        let ass_table = "tab_assurance".to_string();
        let (nom_filt, nom_binds) = stats_nom_acte_in_clause("acte.nom", &nom_actes);
        let sql = format!(
            r#"SELECT COALESCE(a.nom, 'Sans assurance') AS typeAssurance,
                COUNT(*) AS nombreActes,
                COALESCE(SUM(acte.argentRecu),0) AS totalArgentRecu,
                COALESCE(SUM(acte.prix),0) AS totalPrixActe
            FROM {} acte
            LEFT JOIN {} a ON acte.id = a.id
            WHERE {} {}
            GROUP BY typeAssurance
            ORDER BY nombreActes DESC"#,
            acte_table,
            ass_table,
            stats_acte_day_filter("acte.date"),
            nom_filt
        );
        let mut q = sqlx::query::<Any>(&sql).bind(&day_start).bind(&day_end);
        for b in &nom_binds {
            q = q.bind(b);
        }
        let rows = q.fetch_all(&mut conn).await.map_err(|e| e.to_string())?;
        for row in rows {
            list.push(json!({
                "typeAssurance": row.try_get::<Option<String>, _>(0).ok().flatten(),
                "nombreActes": row.try_get::<i64, _>(1).unwrap_or(0),
                "totalArgentRecu": row.try_get::<i64, _>(2).unwrap_or(0),
                "totalPrixActe": row.try_get::<i64, _>(3).unwrap_or(0),
            }));
        }
    } else if abscisse_type == "statut_paiement" {
        let (nom_filt, nom_binds) = stats_nom_acte_in_clause("nom", &nom_actes);
        let sql = format!(
            r#"SELECT 
                CASE 
                    WHEN COALESCE(argentRestant,0) <= 0 THEN 'Payé'
                    ELSE 'Non payé'
                END AS statutPaiement,
                COUNT(*) AS nombreActes,
                COALESCE(SUM(argentRecu),0) AS totalArgentRecu,
                COALESCE(SUM(prix),0) AS totalPrixActe
            FROM {} WHERE {} {}
            GROUP BY CASE WHEN COALESCE(argentRestant,0) <= 0 THEN 'Payé' ELSE 'Non payé' END
            ORDER BY statutPaiement"#,
            acte_table, date_filt, nom_filt
        );
        let mut q = sqlx::query::<Any>(&sql).bind(&day_start).bind(&day_end);
        for b in &nom_binds {
            q = q.bind(b);
        }
        let rows = q.fetch_all(&mut conn).await.map_err(|e| e.to_string())?;
        for row in rows {
            list.push(json!({
                "statutPaiement": row.try_get::<Option<String>, _>(0).ok().flatten(),
                "nombreActes": row.try_get::<i64, _>(1).unwrap_or(0),
                "totalArgentRecu": row.try_get::<i64, _>(2).unwrap_or(0),
                "totalPrixActe": row.try_get::<i64, _>(3).unwrap_or(0),
            }));
        }
    }

    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn radios_list_pending(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn = connect_db(pays, &tab_id, "orange").await?;
    crate::db_sqlx::ensure_tables_orange_sqlx(&mut conn, &tab_id).await?;

    let photo_table = "tab_photo".to_string();
    let sql = format!(
        "SELECT id, logg_id, CAST(date_creation AS TEXT) FROM {} WHERE logg_id IS NULL OR logg_id = '' ORDER BY date_creation DESC LIMIT 100",
        photo_table
    );

    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(json!({
            "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
            "logg_id": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "docteur_id": null,
            "patient_id": null,
            "acte_id": null,
            "file_path": null,
            "thumbnail_path": null,
            "status": "pending",
            "metadata": null,
            "created_at": row.try_get::<Option<String>, _>(2).ok().flatten(),
            "updated_at": null,
        }));
    }
    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn radios_associer(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let radio_id = obj.get("radioId").and_then(|v| v.as_str()).unwrap_or("");
    let acte_id = obj.get("acteId").and_then(|v| v.as_str()).unwrap_or("");
    let patient_id = obj.get("patientId").and_then(|v| v.as_str()).unwrap_or("");
    if radio_id.is_empty() {
        return encrypt_response(&json!({ "success": false, "message": "radioId manquant" }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "orange").await?;
    crate::db_sqlx::ensure_tables_orange_sqlx(&mut conn, &tab_id).await?;

    let photo_table = "tab_photo".to_string();
    let link_id = if !acte_id.is_empty() { acte_id } else { patient_id };
    sqlx::query::<Any>(&format!("UPDATE {} SET logg_id = ?1 WHERE id = ?2", photo_table))
        .bind(link_id)
        .bind(radio_id)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("radios_associer: {}", e))?;

    encrypt_response(&json!({ "success": true, "id": radio_id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn radios_download_preview(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let radio_id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    if radio_id.is_empty() {
        return encrypt_response(&Value::Null, Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, &tab_id, "orange").await?;
    crate::db_sqlx::ensure_tables_orange_sqlx(&mut conn, &tab_id).await?;

    let photo_table = "tab_photo".to_string();
    let part1 = sqlx::query::<Any>(&format!("SELECT part1 FROM {} WHERE id = ?1", photo_table))
        .bind(radio_id)
        .fetch_optional(&mut conn)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<Option<String>, _>(0).ok().flatten());

    if let Some(b64) = part1 {
        if !b64.is_empty() {
            return encrypt_response(&json!({
                "id": radio_id,
                "mimeType": "image/jpeg",
                "base64": b64,
                "metadata": null
            }), Some(&get_cript_key()));
        }
    }

    encrypt_response(&Value::Null, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn trace_add(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").or(obj.get("logg_id")).and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let id = obj.get("id").and_then(|v| v.as_str()).map(String::from).unwrap_or_else(|| Utc::now().timestamp_millis().to_string());
    let action = obj.get("action").and_then(|v| v.as_str()).unwrap_or("create");
    let type_entite = obj.get("type_entite").and_then(|v| v.as_str()).unwrap_or("");
    let nom_entite = obj.get("nom_entite").and_then(|v| v.as_str()).unwrap_or("");
    let id_entite = obj.get("id_entite").and_then(|v| v.as_str()).unwrap_or("");
    let user_id = obj.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
    let user_nom = obj.get("user_nom").and_then(|v| v.as_str()).unwrap_or("");
    let user_role = obj.get("user_role").and_then(|v| v.as_str()).unwrap_or("");
    let details = obj.get("details").and_then(|v| v.as_str()).unwrap_or("");
    let logg_id = obj.get("logg_id").and_then(|v| v.as_str()).unwrap_or("");
    let date_action = obj.get("date_action")
        .and_then(|v| v.as_str().map(String::from))
        .or_else(|| obj.get("date_action").and_then(|v| v.as_f64().map(|f| (f as i64).to_string())))
        .unwrap_or_else(|| Utc::now().format("%Y-%m-%d %H:%M:%S").to_string());

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await?;

    let schema = admin_schema::load_schema().map_err(|e| format!("trace_add schema: {}", e))?;
    let trace_table = "tab_trace";
    let cols = schema.insert_cols("tab_trace", admin_schema::TAB_TRACE_COLS);
    let enc_id = schema.encrypt_value("tab_trace", "id", &id)?;
    let enc_action = schema.encrypt_value("tab_trace", "action", action)?;
    let enc_type_entite = schema.encrypt_value("tab_trace", "type_entite", type_entite)?;
    let enc_nom_entite = schema.encrypt_value("tab_trace", "nom_entite", nom_entite)?;
    let enc_id_entite = schema.encrypt_value("tab_trace", "id_entite", id_entite)?;
    let enc_date_action = schema.encrypt_value("tab_trace", "date_action", &date_action)?;
    let enc_user_id = schema.encrypt_value("tab_trace", "user_id", user_id)?;
    let enc_user_nom = schema.encrypt_value("tab_trace", "user_nom", user_nom)?;
    let enc_user_role = schema.encrypt_value("tab_trace", "user_role", user_role)?;
    let enc_details = schema.encrypt_value("tab_trace", "details", details)?;
    let enc_logg_id = schema.encrypt_value("tab_trace", "logg_id", logg_id)?;
    sqlx::query::<Any>(&format!("INSERT INTO {} ({}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)", trace_table, cols))
        .bind(&enc_id)
        .bind(&enc_action)
        .bind(&enc_type_entite)
        .bind(&enc_nom_entite)
        .bind(&enc_id_entite)
        .bind(&enc_date_action)
        .bind(&enc_user_id)
        .bind(&enc_user_nom)
        .bind(&enc_user_role)
        .bind(&enc_details)
        .bind(&enc_logg_id)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("trace_add: {}", e))?;

    encrypt_response(&json!({ "id": id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn trace_list_all(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let limit = p.limit.unwrap_or(100).min(500);
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await?;

    let schema = admin_schema::load_schema().map_err(|e| e.to_string())?;
    let trace_table = "tab_trace";
    let date_col = schema.col_or_logical("tab_trace", "date_action");
    let sel_cols = schema.select_cols_cast_datetime("tab_trace", admin_schema::TAB_TRACE_COLS, &["date_action"]);
    let sql = format!(
        "SELECT {} FROM {} ORDER BY {} DESC LIMIT ?1",
        sel_cols, trace_table, date_col
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(limit as i64)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        let v = |i: usize| row.try_get::<Option<String>, _>(i).ok().flatten().unwrap_or_default();
        list.push(json!({
            "id": schema.decrypt_value_or_raw("tab_trace", "id", &v(0)),
            "action": schema.decrypt_value_or_raw("tab_trace", "action", &v(1)),
            "type_entite": schema.decrypt_value_or_raw("tab_trace", "type_entite", &v(2)),
            "nom_entite": schema.decrypt_value_or_raw("tab_trace", "nom_entite", &v(3)),
            "id_entite": schema.decrypt_value_or_raw("tab_trace", "id_entite", &v(4)),
            "date_action": schema.decrypt_value_or_raw("tab_trace", "date_action", &v(5)),
            "user_id": schema.decrypt_value_or_raw("tab_trace", "user_id", &v(6)),
            "user_nom": schema.decrypt_value_or_raw("tab_trace", "user_nom", &v(7)),
            "user_role": schema.decrypt_value_or_raw("tab_trace", "user_role", &v(8)),
            "details": schema.decrypt_value_or_raw("tab_trace", "details", &v(9)),
            "logg_id": schema.decrypt_value_or_raw("tab_trace", "logg_id", &v(10)),
        }));
    }
    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn trace_list_by_logg_id(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let logg_id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let limit = p.limit.unwrap_or(100).min(500);
    let pays = p.pays.as_deref().unwrap_or("sn");

    if logg_id.is_empty() {
        return encrypt_response(&Value::Array(vec![]), Some(&get_cript_key()));
    }

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await?;

    let schema = admin_schema::load_schema().map_err(|e| e.to_string())?;
    let trace_table = "tab_trace";
    let logg_col = schema.col_or_logical("tab_trace", "logg_id");
    let date_col = schema.col_or_logical("tab_trace", "date_action");
    let sel_cols = schema.select_cols_cast_datetime("tab_trace", admin_schema::TAB_TRACE_COLS, &["date_action"]);
    let enc_logg_id = schema.encrypt_value("tab_trace", "logg_id", logg_id)?;
    let sql = format!(
        "SELECT {} FROM {} WHERE {} = ?1 ORDER BY {} DESC LIMIT ?2",
        sel_cols, trace_table, logg_col, date_col
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(&enc_logg_id)
        .bind(limit as i64)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        let v = |i: usize| row.try_get::<Option<String>, _>(i).ok().flatten().unwrap_or_default();
        list.push(json!({
            "id": schema.decrypt_value_or_raw("tab_trace", "id", &v(0)),
            "action": schema.decrypt_value_or_raw("tab_trace", "action", &v(1)),
            "type_entite": schema.decrypt_value_or_raw("tab_trace", "type_entite", &v(2)),
            "nom_entite": schema.decrypt_value_or_raw("tab_trace", "nom_entite", &v(3)),
            "id_entite": schema.decrypt_value_or_raw("tab_trace", "id_entite", &v(4)),
            "date_action": schema.decrypt_value_or_raw("tab_trace", "date_action", &v(5)),
            "user_id": schema.decrypt_value_or_raw("tab_trace", "user_id", &v(6)),
            "user_nom": schema.decrypt_value_or_raw("tab_trace", "user_nom", &v(7)),
            "user_role": schema.decrypt_value_or_raw("tab_trace", "user_role", &v(8)),
            "details": schema.decrypt_value_or_raw("tab_trace", "details", &v(9)),
            "logg_id": schema.decrypt_value_or_raw("tab_trace", "logg_id", &v(10)),
        }));
    }
    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn trace_list_pagination(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let limit = p.limit.unwrap_or(20).min(100);
    let offset = p.offset.unwrap_or(0).max(0);
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await?;

    let schema = admin_schema::load_schema().map_err(|e| e.to_string())?;
    let trace_table = "tab_trace";
    let date_col = schema.col_or_logical("tab_trace", "date_action");
    let sel_cols = schema.select_cols_cast_datetime("tab_trace", admin_schema::TAB_TRACE_COLS, &["date_action"]);
    let sql = format!(
        "SELECT {} FROM {} ORDER BY {} DESC LIMIT ?1 OFFSET ?2",
        sel_cols, trace_table, date_col
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(limit as i64)
        .bind(offset as i64)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        let v = |i: usize| row.try_get::<Option<String>, _>(i).ok().flatten().unwrap_or_default();
        list.push(json!({
            "id": schema.decrypt_value_or_raw("tab_trace", "id", &v(0)),
            "action": schema.decrypt_value_or_raw("tab_trace", "action", &v(1)),
            "type_entite": schema.decrypt_value_or_raw("tab_trace", "type_entite", &v(2)),
            "nom_entite": schema.decrypt_value_or_raw("tab_trace", "nom_entite", &v(3)),
            "id_entite": schema.decrypt_value_or_raw("tab_trace", "id_entite", &v(4)),
            "date_action": schema.decrypt_value_or_raw("tab_trace", "date_action", &v(5)),
            "user_id": schema.decrypt_value_or_raw("tab_trace", "user_id", &v(6)),
            "user_nom": schema.decrypt_value_or_raw("tab_trace", "user_nom", &v(7)),
            "user_role": schema.decrypt_value_or_raw("tab_trace", "user_role", &v(8)),
            "details": schema.decrypt_value_or_raw("tab_trace", "details", &v(9)),
            "logg_id": schema.decrypt_value_or_raw("tab_trace", "logg_id", &v(10)),
        }));
    }
    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

/// Préfixe dans `description` pour dédupliquer les tâches « réappro » par matériel.
const STOCK_ALERT_MARKER_PREFIX: &str = "loggappro_stock_alert:";

fn truncate_task_label(s: &str, max_chars: usize) -> String {
    let t = s.trim();
    if t.chars().count() <= max_chars {
        return t.to_string();
    }
    t.chars().take(max_chars).collect::<String>() + "…"
}

/// Si le stock catalogue est &lt; 5, crée une tâche « achat » (une seule pending par matériel).
async fn ensure_low_stock_reorder_task(
    pays: &str,
    tab_id_in: &str,
    materiel_id: &str,
    materiel_nom: &str,
    quantite: i64,
    logg_id: &str,
) {
    if let Err(e) =
        ensure_low_stock_reorder_task_inner(pays, tab_id_in, materiel_id, materiel_nom, quantite, logg_id).await
    {
        eprintln!("ensure_low_stock_reorder_task: {}", e);
    }
}

async fn ensure_low_stock_reorder_task_inner(
    pays: &str,
    tab_id_in: &str,
    materiel_id: &str,
    materiel_nom: &str,
    quantite: i64,
    logg_id: &str,
) -> Result<(), String> {
    if quantite >= 5 {
        return Ok(());
    }
    let mid = materiel_id.trim();
    if mid.is_empty() {
        return Ok(());
    }
    let tab_id = db::sanitize_tab_id(tab_id_in);
    let marker = format!("{}{}", STOCK_ALERT_MARKER_PREFIX, mid);

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await?;

    let schema = admin_schema::load_schema().map_err(|e| format!("stock task: {}", e))?;
    let task_table = "tab_task";
    let task_phys = crate::db_sqlx::resolve_admin_table_phys_cols_ordered(
        &mut conn,
        &schema,
        task_table,
        admin_schema::TAB_TASK_COLS,
    )
    .await
    .map_err(|e| format!("stock task: {}", e))?;
    let q = |i: usize| crate::db_sqlx::quote_sql_ident(&task_phys[i]);
    let enc_pending = schema.encrypt_value("tab_task", "statut", "pending")?;
    let sql = format!(
        "SELECT {}, {} FROM {} WHERE {} = ?1 LIMIT 500",
        q(0),
        q(2),
        task_table,
        q(8)
    );
    let rows = sqlx::query::<Any>(&sql)
        .bind(&enc_pending)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    for row in rows {
        let enc_desc: String = row.try_get::<Option<String>, _>(1).ok().flatten().unwrap_or_default();
        let desc = schema.decrypt_value_or_raw("tab_task", "description", &enc_desc);
        if desc.contains(&marker) {
            return Ok(());
        }
    }

    let id = Utc::now().timestamp_millis().to_string();
    let titre = format!(
        "Stock bas — {}",
        truncate_task_label(materiel_nom, 100)
    );
    let description = format!(
        "{}\nStock actuel : {} unité(s). Prévoir un réapprovisionnement (achat).",
        marker, quantite
    );
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let cols = crate::db_sqlx::admin_insert_cols_list(&task_phys);
    let enc_statut = schema.encrypt_value("tab_task", "statut", "pending")?;
    let enc_id = schema.encrypt_value("tab_task", "id", &id)?;
    let enc_titre = schema.encrypt_value("tab_task", "titre", &titre)?;
    let enc_desc_new = schema.encrypt_value("tab_task", "description", &description)?;
    let enc_date_rappel = schema.encrypt_value("tab_task", "date_rappel", "")?;
    let enc_now = schema.encrypt_value("tab_task", "date_creation", &now)?;
    let enc_user_id = schema.encrypt_value("tab_task", "user_id", "")?;
    let enc_user_nom = schema.encrypt_value("tab_task", "user_nom", "LoggAppro")?;
    let enc_logg_id = schema.encrypt_value("tab_task", "logg_id", logg_id)?;
    sqlx::query::<Any>(&format!(
        "INSERT INTO {} ({}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        task_table, cols
    ))
    .bind(&enc_id)
    .bind(&enc_titre)
    .bind(&enc_desc_new)
    .bind(&enc_date_rappel)
    .bind(&enc_now)
    .bind(&enc_user_id)
    .bind(&enc_user_nom)
    .bind(&enc_logg_id)
    .bind(&enc_statut)
    .execute(&mut conn)
    .await
    .map_err(|e| format!("stock task insert: {}", e))?;

    Ok(())
}

// ========== TÂCHES (avec rappel date/heure) ==========
#[tauri::command]
pub async fn task_add(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").or(obj.get("loggId")).or(obj.get("logg_id")).and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let id = obj.get("id").and_then(|v| v.as_str()).map(String::from)
        .unwrap_or_else(|| Utc::now().timestamp_millis().to_string());
    let titre = obj.get("titre").and_then(|v| v.as_str()).unwrap_or("").trim();
    if titre.is_empty() {
        return Err("Titre de la tâche obligatoire".to_string());
    }
    let description = obj.get("description").and_then(|v| v.as_str()).unwrap_or("");
    let date_rappel = obj.get("dateRappel").or(obj.get("date_rappel")).and_then(|v| v.as_str()).unwrap_or("");
    let user_id = obj.get("userId").or(obj.get("user_id")).and_then(|v| v.as_str()).unwrap_or("");
    let user_nom = obj.get("userNom").or(obj.get("user_nom")).and_then(|v| v.as_str()).unwrap_or("");
    let logg_id = obj.get("loggId").or(obj.get("logg_id")).and_then(|v| v.as_str()).unwrap_or("");
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await?;

    let schema = admin_schema::load_schema().map_err(|e| format!("task_add: {}", e))?;
    let task_table = "tab_task";
    let task_phys = crate::db_sqlx::resolve_admin_table_phys_cols_ordered(
        &mut conn,
        &schema,
        task_table,
        admin_schema::TAB_TASK_COLS,
    )
    .await
    .map_err(|e| format!("task_add: {}", e))?;
    let cols = crate::db_sqlx::admin_insert_cols_list(&task_phys);
    let enc_statut = schema.encrypt_value("tab_task", "statut", "pending")?;
    let enc_id = schema.encrypt_value("tab_task", "id", &id)?;
    let enc_titre = schema.encrypt_value("tab_task", "titre", titre)?;
    let enc_desc = schema.encrypt_value("tab_task", "description", description)?;
    let enc_date_rappel = schema.encrypt_value("tab_task", "date_rappel", date_rappel)?;
    let enc_now = schema.encrypt_value("tab_task", "date_creation", &now)?;
    let enc_user_id = schema.encrypt_value("tab_task", "user_id", user_id)?;
    let enc_user_nom = schema.encrypt_value("tab_task", "user_nom", user_nom)?;
    let enc_logg_id = schema.encrypt_value("tab_task", "logg_id", logg_id)?;
    sqlx::query::<Any>(&format!("INSERT INTO {} ({}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)", task_table, cols))
        .bind(&enc_id)
        .bind(&enc_titre)
        .bind(&enc_desc)
        .bind(&enc_date_rappel)
        .bind(&enc_now)
        .bind(&enc_user_id)
        .bind(&enc_user_nom)
        .bind(&enc_logg_id)
        .bind(&enc_statut)
        .execute(&mut conn)
        .await
    .map_err(|e| format!("task_add: {}", e))?;

    encrypt_response(&json!({ "id": id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn task_list(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let limit = p.limit.unwrap_or(100).min(500);
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await?;

    let schema = admin_schema::load_schema().map_err(sql_err)?;
    let task_table = "tab_task";
    let task_phys = crate::db_sqlx::resolve_admin_table_phys_cols_ordered(
        &mut conn,
        &schema,
        task_table,
        admin_schema::TAB_TASK_COLS,
    )
    .await
    .map_err(sql_err)?;
    let sel_cols = crate::db_sqlx::admin_select_cols_cast_datetime(
        &task_phys,
        admin_schema::TAB_TASK_COLS,
        &["date_rappel", "date_creation"],
    );
    let date_rappel_col = crate::db_sqlx::quote_sql_ident(&task_phys[3]);
    let date_creation_col = crate::db_sqlx::quote_sql_ident(&task_phys[4]);
    let sql = format!(
        "SELECT {} FROM {} ORDER BY COALESCE(NULLIF({}, ''), '9999-12-31 23:59:59') ASC, {} DESC LIMIT ?1",
        sel_cols, task_table, date_rappel_col, date_creation_col
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(limit)
        .fetch_all(&mut conn)
        .await
        .map_err(sql_err)?;

    let mut list = Vec::new();
    for row in rows {
        let v = |i: usize| row.try_get::<Option<String>, _>(i).ok().flatten().unwrap_or_default();
        list.push(json!({
            "id": schema.decrypt_value_or_raw("tab_task", "id", &v(0)),
            "titre": schema.decrypt_value_or_raw("tab_task", "titre", &v(1)),
            "description": schema.decrypt_value_or_raw("tab_task", "description", &v(2)),
            "dateRappel": schema.decrypt_value_or_raw("tab_task", "date_rappel", &v(3)),
            "dateCreation": schema.decrypt_value_or_raw("tab_task", "date_creation", &v(4)),
            "userId": schema.decrypt_value_or_raw("tab_task", "user_id", &v(5)),
            "userNom": schema.decrypt_value_or_raw("tab_task", "user_nom", &v(6)),
            "loggId": schema.decrypt_value_or_raw("tab_task", "logg_id", &v(7)),
            "statut": schema.decrypt_value_or_raw("tab_task", "statut", &v(8)),
        }));
    }
    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn task_list_rappels_pending(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await?;

    let schema = admin_schema::load_schema().map_err(sql_err)?;
    let task_table = "tab_task";
    let task_phys = crate::db_sqlx::resolve_admin_table_phys_cols_ordered(
        &mut conn,
        &schema,
        task_table,
        admin_schema::TAB_TASK_COLS,
    )
    .await
    .map_err(sql_err)?;
    let q = |i: usize| crate::db_sqlx::quote_sql_ident(&task_phys[i]);
    let enc_pending = schema.encrypt_value("tab_task", "statut", "pending")?;
    let sql = format!(
        "SELECT {}, {}, {}, CAST({} AS TEXT), CAST({} AS TEXT) FROM {} WHERE {} = ?1 AND {} IS NOT NULL AND {} != ''",
        q(0),
        q(1),
        q(2),
        q(3),
        q(4),
        task_table,
        q(8),
        q(3),
        q(3)
    );

    let rows = sqlx::query::<Any>(&sql)
        .bind(&enc_pending)
        .fetch_all(&mut conn)
        .await
        .map_err(sql_err)?;

    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut list = Vec::new();
    for row in rows {
        let v = |i: usize| row.try_get::<Option<String>, _>(i).ok().flatten().unwrap_or_default();
        let date_rappel = schema.decrypt_value_or_raw("tab_task", "date_rappel", &v(3));
        if !date_rappel.is_empty() && date_rappel <= now {
            list.push(json!({
                "id": schema.decrypt_value_or_raw("tab_task", "id", &v(0)),
                "titre": schema.decrypt_value_or_raw("tab_task", "titre", &v(1)),
                "description": schema.decrypt_value_or_raw("tab_task", "description", &v(2)),
                "dateRappel": date_rappel,
                "dateCreation": schema.decrypt_value_or_raw("tab_task", "date_creation", &v(4)),
            }));
        }
    }
    list.sort_by(|a, b| {
        let da = a.get("dateRappel").and_then(|v| v.as_str()).unwrap_or("");
        let db = b.get("dateRappel").and_then(|v| v.as_str()).unwrap_or("");
        da.cmp(db)
    });
    encrypt_response(&Value::Array(list), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn task_marquer_rappel_affiche(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(tab_id.as_str(), &tab_id, pays).await?;

    if id.is_empty() {
        return encrypt_response(&json!({ "success": false }), Some(&get_cript_key()));
    }

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await?;

    let schema = admin_schema::load_schema().map_err(|e| format!("task_marquer_rappel_affiche: {}", e))?;
    let task_table = "tab_task";
    let task_phys = crate::db_sqlx::resolve_admin_table_phys_cols_ordered(
        &mut conn,
        &schema,
        task_table,
        admin_schema::TAB_TASK_COLS,
    )
    .await
    .map_err(|e| format!("task_marquer_rappel_affiche: {}", e))?;
    let id_col = crate::db_sqlx::quote_sql_ident(&task_phys[0]);
    let statut_col = crate::db_sqlx::quote_sql_ident(&task_phys[8]);
    let enc_id = schema.encrypt_value("tab_task", "id", &id)?;
    let enc_statut = schema.encrypt_value("tab_task", "statut", "rappel_affiche")?;
    sqlx::query::<Any>(&format!("UPDATE {} SET {} = ?1 WHERE {} = ?2", task_table, statut_col, id_col))
        .bind(&enc_statut)
        .bind(&enc_id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("task_marquer_rappel_affiche: {}", e))?;

    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn task_update_statut(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let statut = obj.get("statut").and_then(|v| v.as_str()).unwrap_or("done");
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(tab_id.as_str(), &tab_id, pays).await?;

    if id.is_empty() {
        return encrypt_response(&json!({ "success": false }), Some(&get_cript_key()));
    }

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await?;

    let schema = admin_schema::load_schema().map_err(|e| format!("task_update_statut: {}", e))?;
    let task_table = "tab_task";
    let task_phys = crate::db_sqlx::resolve_admin_table_phys_cols_ordered(
        &mut conn,
        &schema,
        task_table,
        admin_schema::TAB_TASK_COLS,
    )
    .await
    .map_err(|e| format!("task_update_statut: {}", e))?;
    let id_col = crate::db_sqlx::quote_sql_ident(&task_phys[0]);
    let statut_col = crate::db_sqlx::quote_sql_ident(&task_phys[8]);
    let enc_id = schema.encrypt_value("tab_task", "id", &id)?;
    let enc_statut = schema.encrypt_value("tab_task", "statut", statut)?;
    sqlx::query::<Any>(&format!("UPDATE {} SET {} = ?1 WHERE {} = ?2", task_table, statut_col, id_col))
        .bind(&enc_statut)
        .bind(&enc_id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("task_update_statut: {}", e))?;

    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn task_delete(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let id = p.id.as_deref().unwrap_or("");
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(tab_id.as_str(), &tab_id, pays).await?;

    if id.is_empty() {
        return encrypt_response(&json!({ "success": false }), Some(&get_cript_key()));
    }

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await?;

    let schema = admin_schema::load_schema().map_err(|e| format!("task_delete: {}", e))?;
    let task_table = "tab_task";
    let task_phys = crate::db_sqlx::resolve_admin_table_phys_cols_ordered(
        &mut conn,
        &schema,
        task_table,
        admin_schema::TAB_TASK_COLS,
    )
    .await
    .map_err(|e| format!("task_delete: {}", e))?;
    let id_col = crate::db_sqlx::quote_sql_ident(&task_phys[0]);
    let enc_id = schema.encrypt_value("tab_task", "id", &id)?;
    sqlx::query::<Any>(&format!("DELETE FROM {} WHERE {} = ?1", task_table, id_col))
        .bind(&enc_id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("task_delete: {}", e))?;

    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}

// ========== IMPORT/EXPORT CSV (superAdmin uniquement) ==========

#[tauri::command]
pub async fn data_export_list_tables(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));

    verify_db_credentials(obj, &tab_id, pays).await?;

    // Bases métier uniquement : pas d’énumération des tables de dblaadmin (admin) dans le select import/export.
    let colors = ["yellow", "green", "blue", "orange"];
    let mut tables: Vec<Value> = Vec::new();

    // Groupes combinés (format table.colonne pour les colonnes)
    tables.push(json!({
        "name": "group_docteurs_collaborateurs_users",
        "dbColor": "yellow",
        "columns": ["tab_user.id","tab_user.nom","tab_user.prenom","tab_user.login","tab_user.password","tab_user.telephone","tab_user.naissance","tab_user.role","tab_user.adresse","tab_user.logg_id","tab_user.date_creation","tab_docteur.id","tab_docteur.date_creation","tab_docteur.logg_id","tab_collaborateur.id","tab_collaborateur.type_id","tab_collaborateur.date_creation","tab_collaborateur.logg_id"],
        "isCombined": true,
        "label": "Docteurs + Collaborateurs + Users"
    }));
    tables.push(json!({
        "name": "group_actes_assurances_factures_materiels",
        "dbColor": "blue",
        "columns": ["_type","tab_acte.id","tab_acte.nom","tab_acte.description","tab_acte.date","tab_acte.prix","tab_acte.argentRecu","tab_acte.argentRestant","tab_acte.logg_id","tab_acte.date_creation","tab_acte.posologie_id","tab_assurance.id","tab_assurance.nom","tab_assurance.pourcentage","tab_assurance.logg_id","tab_assurance.date_creation","tab_facture.id","tab_facture.prix_acte","tab_facture.argent_recu_acte","tab_facture.argent_restant_acte","tab_facture.argent_assurance","tab_facture.logg_id","tab_facture.date_creation","tab_nom_materiel.id","tab_nom_materiel.nom","tab_nom_materiel.quantite_defaut","tab_nom_materiel.prix_defaut","tab_nom_materiel.logg_id","tab_nom_materiel.date_creation"],
        "isCombined": true,
        "label": "Actes + Assurances + Factures + Matériels (tab_acte, tab_assurance, tab_facture, tab_nom_materiel)"
    }));
    tables.push(json!({
        "name": "group_posologie_et_modeles_ordonnance",
        "dbColor": "blue",
        "columns": ["_type","patient_suffix","id","posologie_id","color_hex","acte_id","medicament_id","quantite","matin","midi","soir","heures_json","p_date_creation","m_id","m_name","m_icon","m_description","m_category","m_elements_json","m_date_creation"],
        "isCombined": true,
        "label": "Posologies (tous dossiers patients) + modèles d'ordonnance / prescription"
    }));
    tables.push(json!({
        "name": "group_actes_assurances_factures_posologie",
        "dbColor": "blue",
        "columns": ["_type","tab_acte.id","tab_acte.nom","tab_acte.description","tab_acte.date","tab_acte.prix","tab_acte.argentRecu","tab_acte.argentRestant","tab_acte.logg_id","tab_acte.date_creation","tab_acte.posologie_id","tab_assurance.id","tab_assurance.nom","tab_assurance.pourcentage","tab_assurance.logg_id","tab_assurance.date_creation","tab_facture.id","tab_facture.prix_acte","tab_facture.argent_recu_acte","tab_facture.argent_restant_acte","tab_facture.argent_assurance","tab_facture.logg_id","tab_facture.date_creation","posologie_row.patient_suffix","posologie_row.id","posologie_row.posologie_id","posologie_row.color_hex","posologie_row.acte_id","posologie_row.medicament_id","posologie_row.quantite","posologie_row.matin","posologie_row.midi","posologie_row.soir","posologie_row.heures_json","posologie_row.date_creation"],
        "isCombined": true,
        "label": "Actes + Assurances + Factures + Posologies (tous dossiers), sans matériels ni modèles"
    }));
    tables.push(json!({
        "name": "group_actes_assurances_factures_posologie_et_modeles_ordonnance",
        "dbColor": "blue",
        "columns": ["_type","tab_acte.id","tab_acte.nom","tab_acte.description","tab_acte.date","tab_acte.prix","tab_acte.argentRecu","tab_acte.argentRestant","tab_acte.logg_id","tab_acte.date_creation","tab_acte.posologie_id","tab_assurance.id","tab_assurance.nom","tab_assurance.pourcentage","tab_assurance.logg_id","tab_assurance.date_creation","tab_facture.id","tab_facture.prix_acte","tab_facture.argent_recu_acte","tab_facture.argent_restant_acte","tab_facture.argent_assurance","tab_facture.logg_id","tab_facture.date_creation","posologie_row.patient_suffix","posologie_row.id","posologie_row.posologie_id","posologie_row.color_hex","posologie_row.acte_id","posologie_row.medicament_id","posologie_row.quantite","posologie_row.matin","posologie_row.midi","posologie_row.soir","posologie_row.heures_json","posologie_row.date_creation","m_id","m_name","m_icon","m_description","m_category","m_elements_json","m_date_creation"],
        "isCombined": true,
        "label": "Actes + Assurances + Factures + Posologies + modèles d'ordonnance / prescription"
    }));

    for color in &colors {
        let mut conn = if *color == "admin" {
            crate::db_sqlx::connect_admin().await.ok()
        } else {
            connect_db(pays, &tab_id, color).await.ok()
        };
        if let Some(ref mut conn) = conn {
            let sql = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name";
            if let Ok(rows) = sqlx::query::<Any>(sql).fetch_all(&mut *conn).await {
                for row in rows {
                    if let Ok(name) = row.try_get::<String, _>(0) {
                        let columns = list_table_columns_prefixed(&mut *conn, &name).await.unwrap_or_default();
                        tables.push(json!({
                            "name": name,
                            "dbColor": color,
                            "columns": columns
                        }));
                    }
                }
            }
        }
    }

    encrypt_response(&json!({ "tables": tables }), Some(&get_cript_key()))
}

async fn get_table_columns(conn: &mut sqlx::AnyConnection, table: &str) -> Result<Vec<String>, String> {
    let sql = format!("PRAGMA table_info({})", table);
    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut *conn)
        .await
        .map_err(sql_err)?;
    let mut cols = Vec::new();
    for row in rows {
        if let Ok(col) = row.try_get::<String, _>(1) {
            cols.push(col);
        }
    }
    Ok(cols)
}

/// Colonnes pour les modèles d’import/export : `nom_table.colonne`, avec `id` en tête si la table en a une.
async fn list_table_columns_prefixed(conn: &mut sqlx::AnyConnection, table: &str) -> Result<Vec<String>, String> {
    let cols = get_table_columns(conn, table).await?;
    let mut out: Vec<String> = cols.iter().map(|c| format!("{}.{}", table, c)).collect();
    let id_key = format!("{}.id", table);
    if let Some(pos) = out.iter().position(|x| x == &id_key) {
        if pos > 0 {
            let id = out.remove(pos);
            out.insert(0, id);
        }
    }
    Ok(out)
}

/// Colonnes de la clé primaire (simple ou composite), ordre PRAGMA (pk 1, 2, …).
async fn get_primary_key_columns(conn: &mut sqlx::AnyConnection, table: &str) -> Vec<String> {
    let sql = format!("PRAGMA table_info({})", table);
    let Ok(rows) = sqlx::query::<Any>(&sql).fetch_all(&mut *conn).await else {
        return Vec::new();
    };
    let mut parts: Vec<(i32, String)> = Vec::new();
    for row in rows {
        let Ok(name) = row.try_get::<String, _>(1) else {
            continue;
        };
        let pk: i32 = row.try_get(5).unwrap_or(0);
        if pk > 0 {
            parts.push((pk, name));
        }
    }
    parts.sort_by_key(|(k, _)| *k);
    parts.into_iter().map(|(_, n)| n).collect()
}

/// Type de colonne à créer ou modifier
#[derive(Clone)]
enum NewColumnKind {
    Simple(&'static str),   // TEXT, REAL
    Formula(String),        // expression SQL pour GENERATED
}

/// Parse nomColonne[del] ou nomTable.nomColonne[del] -> Some((nomColonne, table_opt))
fn parse_del_column(header: &str) -> Option<(String, Option<String>)> {
    let h = header.trim();
    if h.ends_with("[del]") {
        let name = h[..h.len() - 5].trim();
        let (col, table_opt) = if let Some(dot) = name.find('.') {
            let t: String = name[..dot].trim().chars().filter(|c| c.is_alphanumeric() || *c == '_').collect();
            let c: String = name[dot + 1..].trim().chars().filter(|c| c.is_alphanumeric() || *c == '_').collect();
            (c, if t.is_empty() { None } else { Some(t) })
        } else {
            let s: String = name.chars().filter(|c| c.is_alphanumeric() || *c == '_').collect();
            (s, None)
        };
        if !col.is_empty() {
            return Some((col, table_opt));
        }
    }
    None
}

/// Parse NEW_<nomTable>.<nomColonne>[chaine], NEW_<nomTable>.<nomColonne>[number], ou NEW_<nomTable>.<nomColonne>[expression].
/// Retourne (table, colonne, kind). La table doit correspondre à la table cible de l'import.
fn parse_new_column_header(header: &str) -> Option<(String, String, NewColumnKind)> {
    let h = header.trim();
    if !h.starts_with("NEW_") {
        return None;
    }
    if let Some(bracket) = h.find('[') {
        let before_bracket = h[4..bracket].trim();
        let rest = h[bracket..].trim();
        // Format: nomTable.nomColonne (au moins un point)
        if let Some(dot) = before_bracket.find('.') {
            let table_part = before_bracket[..dot].trim();
            let col_part = before_bracket[dot + 1..].trim();
            let table_sanitized: String = table_part.chars().filter(|c| c.is_alphanumeric() || *c == '_').collect();
            let col_sanitized: String = col_part.chars().filter(|c| c.is_alphanumeric() || *c == '_').collect();
            if table_sanitized.is_empty() || col_sanitized.is_empty() {
            return None;
        }
        if rest == "[chaine]" {
                return Some((table_sanitized, col_sanitized, NewColumnKind::Simple("TEXT")));
        }
        if rest == "[number]" {
                return Some((table_sanitized, col_sanitized, NewColumnKind::Simple("REAL")));
        }
            // Formule : NEW_table.col[col1 + col2]
        if rest.starts_with('[') && rest.ends_with(']') {
            let expr = rest[1..rest.len() - 1].trim();
            if !expr.is_empty() {
                    return Some((table_sanitized, col_sanitized, NewColumnKind::Formula(expr.to_string())));
                }
            }
        }
    }
    None
}

/// Valide une expression de formule et la convertit en SQL sûr.
/// Autorise : identifiants (colonnes), + - * / ( ) , == <= >= <> < > != , nombres, espaces.
fn validate_formula_to_sql(expr: &str, allowed_cols: &[String]) -> Result<String, String> {
    let re = Regex::new(r"[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?").unwrap();
    let allowed_set: std::collections::HashSet<String> = allowed_cols.iter().cloned().collect();
    let mut sql = expr.to_string();
    // Remplacer <> par != pour SQLite
    sql = sql.replace("<>", "!=");
    // Extraire les identifiants et valider
    let mut cols_to_replace: Vec<(String, String)> = Vec::new();
    for cap in re.find_iter(&sql) {
        let ident = cap.as_str();
        let col = if ident.contains('.') {
            ident.split('.').last().unwrap_or(ident).to_string()
        } else {
            ident.to_string()
        };
        if !allowed_set.contains(&col) && !col.is_empty() {
            return Err(format!("Colonne \"{}\" non autorisée dans la formule", col));
        }
        cols_to_replace.push((ident.to_string(), format!("\"{}\"", col)));
    }
    // Remplacer par ordre de longueur décroissante pour éviter les sous-chaînes
    cols_to_replace.sort_by(|a, b| b.0.len().cmp(&a.0.len()));
    for (orig, quoted) in &cols_to_replace {
        sql = sql.replace(orig, quoted);
    }
    Ok(sql)
}

async fn ensure_import_meta(conn: &mut sqlx::AnyConnection) -> Result<(), String> {
    sqlx::query::<Any>(
        "CREATE TABLE IF NOT EXISTS _import_meta (
            table_name TEXT NOT NULL,
            column_name TEXT NOT NULL,
            formula TEXT,
            PRIMARY KEY (table_name, column_name)
        )",
    )
    .execute(&mut *conn)
    .await
    .map_err(sql_err)?;
    Ok(())
}

async fn get_patient_custom_columns(conn: &mut sqlx::AnyConnection, patient_table: &str) -> Result<Vec<String>, String> {
    ensure_import_meta(conn).await?;
    let sql = "SELECT column_name FROM _import_meta WHERE table_name = ?1";
    let rows = sqlx::query::<Any>(sql)
        .bind(patient_table)
        .fetch_all(&mut *conn)
        .await
        .map_err(sql_err)?;
    let mut cols = Vec::new();
    for row in rows {
        if let Ok(col) = row.try_get::<String, _>(0) {
            cols.push(col);
        }
    }
    Ok(cols)
}

async fn get_stored_formula(conn: &mut sqlx::AnyConnection, table: &str, col: &str) -> Result<Option<String>, String> {
    let sql = "SELECT formula FROM _import_meta WHERE table_name = ?1 AND column_name = ?2";
    let row = sqlx::query::<Any>(sql)
        .bind(table)
        .bind(col)
        .fetch_optional(&mut *conn)
        .await
        .map_err(sql_err)?;
    Ok(row.and_then(|r| r.try_get::<String, _>(0).ok()))
}

async fn set_stored_formula(conn: &mut sqlx::AnyConnection, table: &str, col: &str, formula: Option<&str>) -> Result<(), String> {
    if let Some(f) = formula {
        sqlx::query::<Any>("INSERT OR REPLACE INTO _import_meta (table_name, column_name, formula) VALUES (?1, ?2, ?3)")
            .bind(table)
            .bind(col)
            .bind(f)
            .execute(&mut *conn)
            .await
        .map_err(sql_err)?;
    } else {
        sqlx::query::<Any>("DELETE FROM _import_meta WHERE table_name = ?1 AND column_name = ?2")
            .bind(table)
            .bind(col)
            .execute(&mut *conn)
            .await
        .map_err(sql_err)?;
    }
    Ok(())
}

/// Convertit un header CSV en (nom_col_db, is_del, new_kind).
/// Pour NEW_<table>.<col>, table_name doit correspondre à la table cible.
/// Accepte aussi `nom_table_sql.colonne` lorsque `nom_table_sql` est la table importée (export avec préfixe).
fn parse_csv_header(header: &str, existing_cols: &[String], table_name: &str) -> Result<Option<(String, bool, Option<NewColumnKind>)>, String> {
    let h = header.trim();
    if let Some((del_col, del_table_opt)) = parse_del_column(h) {
        if let Some(ref dt) = del_table_opt {
            if *dt != table_name {
                return Err(format!(
                    "Colonne [del] \"{}\" : table \"{}\" ne correspond pas à la table d'import \"{}\"",
                    h, dt, table_name
                ));
            }
        }
        return Ok(Some((del_col, true, None)));
    }
    if existing_cols.iter().any(|c| c == h) {
        return Ok(Some((h.to_string(), false, None)));
    }
    if let Some(dot) = h.rfind('.') {
        let prefix = h[..dot].trim();
        let col_part = h[dot + 1..].trim();
        if !prefix.is_empty()
            && !col_part.is_empty()
            && prefix == table_name
            && existing_cols.iter().any(|c| c == col_part)
        {
            return Ok(Some((col_part.to_string(), false, None)));
        }
    }
    if let Some((header_table, col_name, kind)) = parse_new_column_header(h) {
        // La table du header doit correspondre à la table cible
        if header_table == table_name {
            return Ok(Some((col_name, false, Some(kind))));
        }
        return Err(format!(
            "Colonne NEW_ \"{}\" : table \"{}\" ne correspond pas à la table d'import \"{}\"",
            h, header_table, table_name
        ));
    }
    Err(format!("Colonne CSV inconnue : \"{}\"", h))
}

/// Export combiné : tab_user + tab_docteur + tab_collaborateur (une ligne par user docteur/collaborateur)
async fn data_export_combined_docteurs_collaborateurs_users(
    pays: &str,
    tab_id: &str,
    _obj: &serde_json::Map<String, Value>,
) -> Result<Value, String> {
    let mut conn = connect_db(pays, tab_id, "yellow").await?;
    let _ = crate::db_sqlx::ensure_tables_sqlx(&mut conn, tab_id).await;

    let user_table = "tab_user".to_string();
    let docteur_table = "tab_docteur".to_string();
    let collab_table = "tab_collaborateur".to_string();

    let sql = format!(
        "SELECT u.id, u.nom, u.prenom, u.login, u.password, u.telephone, u.naissance, u.role, u.adresse, u.logg_id, u.date_creation,
         d.id as docteur_row_id, d.date_creation as docteur_date_creation, d.logg_id as docteur_logg_id,
         c.id as collab_row_id, c.type_id as collab_type_id, c.date_creation as collab_date_creation, c.logg_id as collab_logg_id
         FROM {} u
         LEFT JOIN {} d ON u.id = d.id
         LEFT JOIN {} c ON u.id = c.id
         WHERE u.role = 'docteur' OR d.id IS NOT NULL OR c.id IS NOT NULL
         ORDER BY u.nom, u.prenom",
        user_table, docteur_table, collab_table
    );

    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .map_err(sql_err)?;

    let header = "tab_user.id;tab_user.nom;tab_user.prenom;tab_user.login;tab_user.password;tab_user.telephone;tab_user.naissance;tab_user.role;tab_user.adresse;tab_user.logg_id;tab_user.date_creation;tab_docteur.id;tab_docteur.date_creation;tab_docteur.logg_id;tab_collaborateur.id;tab_collaborateur.type_id;tab_collaborateur.date_creation;tab_collaborateur.logg_id";
    let mut rows_csv: Vec<String> = vec![header.to_string()];

    for row in rows {
        let vals: Vec<String> = (0..18)
            .map(|i| {
                row.try_get::<Option<String>, _>(i)
                    .ok()
                    .flatten()
                    .unwrap_or_default()
                    .replace(';', ",")
                    .replace('\n', " ")
                    .replace('\r', "")
            })
            .collect();
        rows_csv.push(vals.join(";"));
    }

    let csv_content = rows_csv.join("\n");
    encrypt_response(&json!({ "csv": csv_content }), Some(&get_cript_key()))
}

/// Export combiné : tab_acte + tab_assurance + tab_facture + tab_nom_materiel (PAS tab_nom_acte, tab_nom_assurance)
async fn data_export_combined_actes_assurances_factures_materiels(
    pays: &str,
    tab_id: &str,
    _obj: &serde_json::Map<String, Value>,
) -> Result<Value, String> {
    let header = "_type;tab_acte.id;tab_acte.nom;tab_acte.description;tab_acte.date;tab_acte.prix;tab_acte.argentRecu;tab_acte.argentRestant;tab_acte.logg_id;tab_acte.date_creation;tab_acte.posologie_id;tab_assurance.id;tab_assurance.nom;tab_assurance.pourcentage;tab_assurance.logg_id;tab_assurance.date_creation;tab_facture.id;tab_facture.prix_acte;tab_facture.argent_recu_acte;tab_facture.argent_restant_acte;tab_facture.argent_assurance;tab_facture.logg_id;tab_facture.date_creation;tab_nom_materiel.id;tab_nom_materiel.nom;tab_nom_materiel.quantite_defaut;tab_nom_materiel.prix_defaut;tab_nom_materiel.logg_id;tab_nom_materiel.date_creation";
    let mut rows_csv: Vec<String> = vec![header.to_string()];

    let escape = |s: String| s.replace(';', ",").replace('\n', " ").replace('\r', "");
    let empty10 = vec![""; 10];
    let empty5 = vec![""; 5];
    let empty7 = vec![""; 7];
    let empty6 = vec![""; 6];

    // tab_acte (blue) - PAS tab_nom_acte
    if let Ok(mut conn) = connect_db(pays, tab_id, "blue").await {
        let _ = crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, tab_id).await;
        let acte_table = "tab_acte".to_string();
        let sql = format!("SELECT id, nom, description, date, prix, argentRecu, argentRestant, logg_id, CAST(date_creation AS TEXT), IFNULL(posologie_id, '') FROM {}", acte_table);
        if let Ok(rows) = sqlx::query::<Any>(&sql).fetch_all(&mut conn).await {
            for row in rows {
                let a: Vec<String> = (0..10).map(|i| escape(row.try_get::<Option<String>, _>(i).ok().flatten().unwrap_or_default())).collect();
                rows_csv.push(format!("acte;{};{};{};{}", a.join(";"), empty5.join(";"), empty7.join(";"), empty6.join(";")));
            }
        }
    }

    // tab_assurance (blue) - PAS tab_nom_assurance
    if let Ok(mut conn) = connect_db(pays, tab_id, "blue").await {
        let assurance_table = "tab_assurance".to_string();
        let sql = format!("SELECT id, nom, pourcentage, logg_id, CAST(date_creation AS TEXT) FROM {}", assurance_table);
        if let Ok(rows) = sqlx::query::<Any>(&sql).fetch_all(&mut conn).await {
            for row in rows {
                let a: Vec<String> = (0..5).map(|i| escape(row.try_get::<Option<String>, _>(i).ok().flatten().unwrap_or_default())).collect();
                rows_csv.push(format!("assurance;{};{};{};{}", empty10.join(";"), a.join(";"), empty7.join(";"), empty6.join(";")));
            }
        }
    }

    // tab_facture (blue)
    if let Ok(mut conn) = connect_db(pays, tab_id, "blue").await {
        let facture_table = "tab_facture".to_string();
        let sql = format!("SELECT id, prix_acte, argent_recu_acte, argent_restant_acte, argent_assurance, logg_id, CAST(date_creation AS TEXT) FROM {}", facture_table);
        if let Ok(rows) = sqlx::query::<Any>(&sql).fetch_all(&mut conn).await {
            for row in rows {
                let f: Vec<String> = (0..7).map(|i| escape(row.try_get::<Option<String>, _>(i).ok().flatten().unwrap_or_default())).collect();
                rows_csv.push(format!("facture;{};{};{};{}", empty10.join(";"), empty5.join(";"), f.join(";"), empty6.join(";")));
            }
        }
    }

    // tab_nom_materiel (green) - PAS tab_acte_materiel
    if let Ok(mut conn) = connect_db(pays, tab_id, "green").await {
        let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, tab_id).await;
        let materiel_table = "tab_nom_materiel".to_string();
        let sql = format!("SELECT id, nom, quantite_defaut, prix_defaut, logg_id, CAST(date_creation AS TEXT) FROM {}", materiel_table);
        if let Ok(rows) = sqlx::query::<Any>(&sql).fetch_all(&mut conn).await {
            for row in rows {
                let m: Vec<String> = (0..6).map(|i| escape(row.try_get::<Option<String>, _>(i).ok().flatten().unwrap_or_default())).collect();
                rows_csv.push(format!("materiel;{};{};{};{}", empty10.join(";"), empty5.join(";"), empty7.join(";"), m.join(";")));
            }
        }
    }

    let csv_content = rows_csv.join("\n");
    encrypt_response(&json!({ "csv": csv_content }), Some(&get_cript_key()))
}

/// Export combiné : tab_acte + tab_assurance + tab_facture + lignes `tab_posologie*` (suffixe patient).
/// Sans `tab_nom_materiel`. Si `with_modeles`, ajoute les lignes `modele_ordonnance` (prescription / ordonnance).
async fn data_export_combined_actes_assurances_factures_posologie_inner(
    pays: &str,
    tab_id: &str,
    _obj: &serde_json::Map<String, Value>,
    with_modeles: bool,
) -> Result<Value, String> {
    let header_base = "_type;tab_acte.id;tab_acte.nom;tab_acte.description;tab_acte.date;tab_acte.prix;tab_acte.argentRecu;tab_acte.argentRestant;tab_acte.logg_id;tab_acte.date_creation;tab_acte.posologie_id;tab_assurance.id;tab_assurance.nom;tab_assurance.pourcentage;tab_assurance.logg_id;tab_assurance.date_creation;tab_facture.id;tab_facture.prix_acte;tab_facture.argent_recu_acte;tab_facture.argent_restant_acte;tab_facture.argent_assurance;tab_facture.logg_id;tab_facture.date_creation;posologie_row.patient_suffix;posologie_row.id;posologie_row.posologie_id;posologie_row.color_hex;posologie_row.acte_id;posologie_row.medicament_id;posologie_row.quantite;posologie_row.matin;posologie_row.midi;posologie_row.soir;posologie_row.heures_json;posologie_row.date_creation";
    let header = if with_modeles {
        format!(
            "{};m_id;m_name;m_icon;m_description;m_category;m_elements_json;m_date_creation",
            header_base
        )
    } else {
        header_base.to_string()
    };
    let mut rows_csv: Vec<String> = vec![header];

    let escape = |s: String| s.replace(';', ",").replace('\n', " ").replace('\r', "");
    let empty5 = vec![""; 5].join(";");
    let empty7 = vec![""; 7].join(";");
    let empty12 = vec![""; 12].join(";");
    let empty22 = vec![""; 22].join(";");
    let empty7m = vec![""; 7].join(";");
    let tail_afp = if with_modeles {
        format!("{};{}", empty12, empty7m)
    } else {
        empty12.clone()
    };

    if let Ok(mut conn) = connect_db(pays, tab_id, "blue").await {
        let _ = crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, tab_id).await;
        let acte_table = "tab_acte".to_string();
        let sql = format!("SELECT id, nom, description, date, prix, argentRecu, argentRestant, logg_id, CAST(date_creation AS TEXT), IFNULL(posologie_id, '') FROM {}", acte_table);
        if let Ok(rows) = sqlx::query::<Any>(&sql).fetch_all(&mut conn).await {
            for row in rows {
                let a: Vec<String> = (0..10)
                    .map(|i| escape(row.try_get::<Option<String>, _>(i).ok().flatten().unwrap_or_default()))
                    .collect();
                rows_csv.push(format!("acte;{};{};{};{}", a.join(";"), empty5, empty7, tail_afp));
            }
        }
    }

    if let Ok(mut conn) = connect_db(pays, tab_id, "blue").await {
        let assurance_table = "tab_assurance".to_string();
        let sql = format!("SELECT id, nom, pourcentage, logg_id, CAST(date_creation AS TEXT) FROM {}", assurance_table);
        if let Ok(rows) = sqlx::query::<Any>(&sql).fetch_all(&mut conn).await {
            for row in rows {
                let a: Vec<String> = (0..5)
                    .map(|i| escape(row.try_get::<Option<String>, _>(i).ok().flatten().unwrap_or_default()))
                    .collect();
                rows_csv.push(format!(
                    "assurance;{};{};{};{}",
                    vec![""; 10].join(";"),
                    a.join(";"),
                    empty7,
                    tail_afp
                ));
            }
        }
    }

    if let Ok(mut conn) = connect_db(pays, tab_id, "blue").await {
        let facture_table = "tab_facture".to_string();
        let sql = format!("SELECT id, prix_acte, argent_recu_acte, argent_restant_acte, argent_assurance, logg_id, CAST(date_creation AS TEXT) FROM {}", facture_table);
        if let Ok(rows) = sqlx::query::<Any>(&sql).fetch_all(&mut conn).await {
            for row in rows {
                let f: Vec<String> = (0..7)
                    .map(|i| escape(row.try_get::<Option<String>, _>(i).ok().flatten().unwrap_or_default()))
                    .collect();
                rows_csv.push(format!(
                    "facture;{};{};{};{}",
                    vec![""; 10].join(";"),
                    empty5,
                    f.join(";"),
                    tail_afp
                ));
            }
        }
    }

    if let Ok(mut conn_blue) = connect_db(pays, tab_id, "blue").await {
        let tnames: Vec<String> = sqlx::query::<Any>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'tab_posologie%' ORDER BY name",
        )
        .fetch_all(&mut conn_blue)
        .await
        .unwrap_or_default()
        .into_iter()
        .filter_map(|r| r.try_get::<String, _>(0).ok())
        .collect();

        for tname in tnames {
            let Some(suffix) = tname.strip_prefix("tab_posologie") else {
                continue;
            };
            if suffix.is_empty() {
                continue;
            }
            let sql = format!(
                "SELECT id, posologie_id, color_hex, acte_id, medicament_id, quantite, matin, midi, soir, heures_json, CAST(date_creation AS TEXT) FROM {}",
                tname
            );
            if let Ok(rows) = sqlx::query::<Any>(&sql).fetch_all(&mut conn_blue).await {
                for row in rows {
                    let id = escape(
                        row.try_get::<Option<String>, _>(0)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let posologie_id = escape(
                        row.try_get::<Option<String>, _>(1)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let color_hex = escape(
                        row.try_get::<Option<String>, _>(2)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let acte_id = escape(
                        row.try_get::<Option<String>, _>(3)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let medicament_id = escape(
                        row.try_get::<Option<String>, _>(4)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let quantite = row
                        .try_get::<i64, _>(5)
                        .or_else(|_| row.try_get::<i32, _>(5).map(|i| i as i64))
                        .unwrap_or(1)
                        .to_string();
                    let matin = row
                        .try_get::<i64, _>(6)
                        .or_else(|_| row.try_get::<i32, _>(6).map(|i| i as i64))
                        .unwrap_or(0)
                        .to_string();
                    let midi = row
                        .try_get::<i64, _>(7)
                        .or_else(|_| row.try_get::<i32, _>(7).map(|i| i as i64))
                        .unwrap_or(0)
                        .to_string();
                    let soir = row
                        .try_get::<i64, _>(8)
                        .or_else(|_| row.try_get::<i32, _>(8).map(|i| i as i64))
                        .unwrap_or(0)
                        .to_string();
                    let heures_json = escape(
                        row.try_get::<Option<String>, _>(9)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let p_date = escape(
                        row.try_get::<Option<String>, _>(10)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let pos_line = vec![
                        escape(suffix.to_string()),
                        id,
                        posologie_id,
                        color_hex,
                        acte_id,
                        medicament_id,
                        quantite,
                        matin,
                        midi,
                        soir,
                        heures_json,
                        p_date,
                    ]
                    .join(";");
                    let row_s = if with_modeles {
                        format!("posologie;{};{};{}", empty22, pos_line, empty7m)
                    } else {
                        format!("posologie;{};{}", empty22, pos_line)
                    };
                    rows_csv.push(row_s);
                }
            }
        }
    }

    if with_modeles {
        if let Ok(mut conn_green) = connect_db(pays, tab_id, "green").await {
            let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, tab_id).await;
            let mtable = "tab_modele_etat".to_string();
            let sql = format!(
                "SELECT id, name, icon, description, category, elements_json, CAST(date_creation AS TEXT) FROM {}",
                mtable
            );
            if let Ok(mrows) = sqlx::query::<Any>(&sql).fetch_all(&mut conn_green).await {
                for row in mrows {
                    let elements_json: String = row.try_get(5).unwrap_or_default();
                    let elements: Value =
                        serde_json::from_str(&elements_json).unwrap_or(Value::Array(vec![]));
                    let category: String = row
                        .try_get(4)
                        .unwrap_or_else(|_| "administratif".to_string());
                    let cat_lc = category.to_lowercase();
                    let ok = cat_lc == "prescription"
                        || cat_lc.contains("ordonnance")
                        || json_value_has_posologie_binding(&elements);
                    if !ok {
                        continue;
                    }
                    let mid = escape(
                        row.try_get::<Option<String>, _>(0)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let mname = escape(
                        row.try_get::<Option<String>, _>(1)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let micon = escape(
                        row.try_get::<Option<String>, _>(2)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let mdesc = escape(
                        row.try_get::<Option<String>, _>(3)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let mcat = escape(category);
                    let mel = escape(elements_json);
                    let mdate = escape(
                        row.try_get::<Option<String>, _>(6)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    rows_csv.push(format!(
                        "modele_ordonnance;{};{};{};{};{};{};{};{};{}",
                        empty22,
                        empty12,
                        mid,
                        mname,
                        micon,
                        mdesc,
                        mcat,
                        mel,
                        mdate
                    ));
                }
            }
        }
    }

    let csv_content = rows_csv.join("\n");
    encrypt_response(&json!({ "csv": csv_content }), Some(&get_cript_key()))
}

/// Export combiné : toutes les tables `tab_posologie*` (base bleue cabinet) + modèles d'état prescription / ordonnance (green).
async fn data_export_combined_posologie_modeles_ordonnance(
    pays: &str,
    tab_id: &str,
    _obj: &serde_json::Map<String, Value>,
) -> Result<Value, String> {
    let escape = |s: String| s.replace(';', ",").replace('\n', " ").replace('\r', "");
    let header = "_type;patient_suffix;id;posologie_id;color_hex;acte_id;medicament_id;quantite;matin;midi;soir;heures_json;p_date_creation;m_id;m_name;m_icon;m_description;m_category;m_elements_json;m_date_creation";
    let mut rows_csv: Vec<String> = vec![header.to_string()];
    let empty7 = vec![""; 7].join(";");

    if let Ok(mut conn_blue) = connect_db(pays, tab_id, "blue").await {
        let tnames: Vec<String> = sqlx::query::<Any>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'tab_posologie%' ORDER BY name",
        )
        .fetch_all(&mut conn_blue)
        .await
        .unwrap_or_default()
        .into_iter()
        .filter_map(|r| r.try_get::<String, _>(0).ok())
        .collect();

        for tname in tnames {
            let Some(suffix) = tname.strip_prefix("tab_posologie") else {
                continue;
            };
            if suffix.is_empty() {
                continue;
            }
            let sql = format!(
                "SELECT id, posologie_id, color_hex, acte_id, medicament_id, quantite, matin, midi, soir, heures_json, CAST(date_creation AS TEXT) FROM {}",
                tname
            );
            if let Ok(rows) = sqlx::query::<Any>(&sql).fetch_all(&mut conn_blue).await {
                for row in rows {
                    let id = escape(
                        row.try_get::<Option<String>, _>(0)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let posologie_id = escape(
                        row.try_get::<Option<String>, _>(1)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let color_hex = escape(
                        row.try_get::<Option<String>, _>(2)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let acte_id = escape(
                        row.try_get::<Option<String>, _>(3)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let medicament_id = escape(
                        row.try_get::<Option<String>, _>(4)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let quantite = row
                        .try_get::<i64, _>(5)
                        .or_else(|_| row.try_get::<i32, _>(5).map(|i| i as i64))
                        .unwrap_or(1)
                        .to_string();
                    let matin = row
                        .try_get::<i64, _>(6)
                        .or_else(|_| row.try_get::<i32, _>(6).map(|i| i as i64))
                        .unwrap_or(0)
                        .to_string();
                    let midi = row
                        .try_get::<i64, _>(7)
                        .or_else(|_| row.try_get::<i32, _>(7).map(|i| i as i64))
                        .unwrap_or(0)
                        .to_string();
                    let soir = row
                        .try_get::<i64, _>(8)
                        .or_else(|_| row.try_get::<i32, _>(8).map(|i| i as i64))
                        .unwrap_or(0)
                        .to_string();
                    let heures_json = escape(
                        row.try_get::<Option<String>, _>(9)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    let p_date = escape(
                        row.try_get::<Option<String>, _>(10)
                            .ok()
                            .flatten()
                            .unwrap_or_default(),
                    );
                    rows_csv.push(format!(
                        "posologie;{};{};{};{};{};{};{};{};{};{};{};{};{}",
                        escape(suffix.to_string()),
                        id,
                        posologie_id,
                        color_hex,
                        acte_id,
                        medicament_id,
                        quantite,
                        matin,
                        midi,
                        soir,
                        heures_json,
                        p_date,
                        empty7
                    ));
                }
            }
        }
    }

    if let Ok(mut conn_green) = connect_db(pays, tab_id, "green").await {
        let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, tab_id).await;
        let mtable = "tab_modele_etat".to_string();
        let sql = format!(
            "SELECT id, name, icon, description, category, elements_json, CAST(date_creation AS TEXT) FROM {}",
            mtable
        );
        if let Ok(mrows) = sqlx::query::<Any>(&sql).fetch_all(&mut conn_green).await {
            for row in mrows {
                let elements_json: String = row.try_get(5).unwrap_or_default();
                let elements: Value =
                    serde_json::from_str(&elements_json).unwrap_or(Value::Array(vec![]));
                let category: String = row
                    .try_get(4)
                    .unwrap_or_else(|_| "administratif".to_string());
                let cat_lc = category.to_lowercase();
                let ok = cat_lc == "prescription"
                    || cat_lc.contains("ordonnance")
                    || json_value_has_posologie_binding(&elements);
                if !ok {
                    continue;
                }
                let mid = escape(
                    row.try_get::<Option<String>, _>(0)
                        .ok()
                        .flatten()
                        .unwrap_or_default(),
                );
                let mname = escape(
                    row.try_get::<Option<String>, _>(1)
                        .ok()
                        .flatten()
                        .unwrap_or_default(),
                );
                let micon = escape(
                    row.try_get::<Option<String>, _>(2)
                        .ok()
                        .flatten()
                        .unwrap_or_default(),
                );
                let mdesc = escape(
                    row.try_get::<Option<String>, _>(3)
                        .ok()
                        .flatten()
                        .unwrap_or_default(),
                );
                let mcat = escape(category);
                let mel = escape(elements_json);
                let mdate = escape(
                    row.try_get::<Option<String>, _>(6)
                        .ok()
                        .flatten()
                        .unwrap_or_default(),
                );
                let prefix_modele = format!("modele_ordonnance;{}", vec![""; 12].join(";"));
                rows_csv.push(format!(
                    "{};{};{};{};{};{};{};{}",
                    prefix_modele, mid, mname, micon, mdesc, mcat, mel, mdate
                ));
            }
        }
    }

    let csv_content = rows_csv.join("\n");
    encrypt_response(&json!({ "csv": csv_content }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn data_export_table(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let table_name_raw = obj.get("tableName").and_then(|v| v.as_str()).ok_or("tableName manquant")?;
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));

    verify_db_credentials(obj, &tab_id, pays).await?;

    // Export combiné : docteurs + collaborateurs + users
    if table_name_raw == "group_docteurs_collaborateurs_users" {
        return data_export_combined_docteurs_collaborateurs_users(pays, &tab_id, obj).await;
    }
    // Export combiné : actes + assurances + factures + nom_materiels (PAS tab_nom_acte, tab_nom_assurance)
    if table_name_raw == "group_actes_assurances_factures_materiels" {
        return data_export_combined_actes_assurances_factures_materiels(pays, &tab_id, obj).await;
    }
    if table_name_raw == "group_actes_assurances_factures_posologie" {
        return data_export_combined_actes_assurances_factures_posologie_inner(pays, &tab_id, obj, false).await;
    }
    if table_name_raw == "group_actes_assurances_factures_posologie_et_modeles_ordonnance" {
        return data_export_combined_actes_assurances_factures_posologie_inner(pays, &tab_id, obj, true).await;
    }
    if table_name_raw == "group_posologie_et_modeles_ordonnance" {
        return data_export_combined_posologie_modeles_ordonnance(pays, &tab_id, obj).await;
    }

    let table_name = db::validate_table_name(table_name_raw)?;
    let db_color = obj.get("dbColor").and_then(|v| v.as_str()).unwrap_or("yellow");

    let mut conn = connect_db(pays, &tab_id, db_color).await?;
    let mut columns = get_table_columns(&mut conn, &table_name).await?;
    if columns.is_empty() {
        return Err("Table vide ou inexistante".to_string());
    }
    // Même ordre que les modèles (`data_export_list_tables`) : `id` en tête si la colonne existe.
    if let Some(pos) = columns.iter().position(|c| c == "id") {
        if pos > 0 {
            let idc = columns.remove(pos);
            columns.insert(0, idc);
        }
    }
    let header = columns
        .iter()
        .map(|c| format!("{}.{}", table_name, c))
        .collect::<Vec<_>>()
        .join(";");
    let mut rows_csv: Vec<String> = vec![header];

    let cols_joined = columns.join(", ");
    let sql = format!("SELECT {} FROM {}", cols_joined, table_name);
    let row_count = columns.len();
    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .map_err(sql_err)?;

    for row in rows {
        let mut vals: Vec<String> = Vec::with_capacity(row_count);
        for i in 0..row_count {
            let v: Option<String> = row.try_get(i).ok();
            vals.push(v.unwrap_or_default().replace(';', ",").replace('\n', " ").replace('\r', ""));
        }
        rows_csv.push(vals.join(";"));
    }

    let csv_content = rows_csv.join("\n");
    encrypt_response(&json!({ "csv": csv_content }), Some(&get_cript_key()))
}

/// Import combiné : répartir les colonnes vers tab_user, tab_docteur, tab_collaborateur.
/// Même `id` qu’une ligne existante → mise à jour (UPSERT) ; sinon → création.
async fn data_import_combined_docteurs_collaborateurs_users(
    pays: &str,
    tab_id: &str,
    csv_content: &str,
    _obj: &serde_json::Map<String, Value>,
) -> Result<Value, String> {
    let lines: Vec<&str> = csv_content.lines().filter(|l| !l.is_empty()).collect();
    if lines.len() < 2 {
        return encrypt_response(&json!({ "success": true, "rowsInserted": 0 }), Some(&get_cript_key()));
    }
    let header = lines[0];
    let headers: Vec<&str> = header.split(';').map(|s| s.trim()).collect();
    let id_idx = headers.iter().position(|h| *h == "tab_user.id" || *h == "id").unwrap_or(0);
    let mut conn = connect_db(pays, tab_id, "yellow").await?;
    let _ = crate::db_sqlx::ensure_tables_sqlx(&mut conn, tab_id).await;
    let user_table = "tab_user".to_string();
    let docteur_table = "tab_docteur".to_string();
    let collab_table = "tab_collaborateur".to_string();

    let mut inserted = 0i64;
    for line in lines.iter().skip(1) {
        let vals: Vec<&str> = line.split(';').map(|s| s.trim()).collect();
        if vals.len() <= id_idx {
            continue;
        }
        let id = vals[id_idx];
        if id.is_empty() {
            continue;
        }
        let get = |name: &str| -> String {
            headers.iter().position(|h| *h == name)
                .and_then(|i| vals.get(i))
                .map(|s| s.replace(';', ",").replace('\n', " "))
                .unwrap_or_default()
        };
        let role = if get("tab_collaborateur.type_id") != "" { "collaborateur" } else { "docteur" };
        let sql_user = format!(
            "INSERT INTO {} (id, nom, prenom, login, password, telephone, naissance, role, adresse, logg_id, date_creation) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) \
             ON CONFLICT(id) DO UPDATE SET \
             nom=excluded.nom, prenom=excluded.prenom, login=excluded.login, password=excluded.password, \
             telephone=excluded.telephone, naissance=excluded.naissance, role=excluded.role, adresse=excluded.adresse, \
             logg_id=excluded.logg_id, date_creation=excluded.date_creation",
            user_table
        );
        if sqlx::query::<Any>(&sql_user)
            .bind(id)
            .bind(get("tab_user.nom"))
            .bind(get("tab_user.prenom"))
            .bind(get("tab_user.login"))
            .bind(get("tab_user.password"))
            .bind(get("tab_user.telephone"))
            .bind(get("tab_user.naissance"))
            .bind(role)
            .bind(get("tab_user.adresse"))
            .bind(get("tab_user.logg_id"))
            .bind(get("tab_user.date_creation"))
            .execute(&mut conn)
            .await
            .is_ok()
        {
            inserted += 1;
        }
        if get("tab_docteur.date_creation") != "" || get("tab_docteur.logg_id") != "" {
            let dc = if get("tab_docteur.date_creation").is_empty() { get("tab_user.date_creation") } else { get("tab_docteur.date_creation") };
            let sql_d = format!(
                "INSERT INTO {} (id, date_creation, logg_id) VALUES (?1,?2,?3) \
                 ON CONFLICT(id) DO UPDATE SET date_creation=excluded.date_creation, logg_id=excluded.logg_id",
                docteur_table
            );
            let _ = sqlx::query::<Any>(&sql_d)
                .bind(id)
                .bind(&dc)
                .bind(get("tab_docteur.logg_id"))
                .execute(&mut conn)
                .await;
        }
        if get("tab_collaborateur.type_id") != "" {
            let cc = if get("tab_collaborateur.date_creation").is_empty() { get("tab_user.date_creation") } else { get("tab_collaborateur.date_creation") };
            let sql_c = format!(
                "INSERT INTO {} (id, type_id, date_creation, logg_id) VALUES (?1,?2,?3,?4) \
                 ON CONFLICT(id) DO UPDATE SET type_id=excluded.type_id, date_creation=excluded.date_creation, logg_id=excluded.logg_id",
                collab_table
            );
            let _ = sqlx::query::<Any>(&sql_c)
                .bind(id)
                .bind(get("tab_collaborateur.type_id"))
                .bind(&cc)
                .bind(get("tab_collaborateur.logg_id"))
                .execute(&mut conn)
                .await;
        }
    }
    encrypt_response(&json!({ "success": true, "rowsInserted": inserted }), Some(&get_cript_key()))
}

/// Première lettre en majuscule, reste en minuscules (ex. « CONSULTATION » → « Consultation »).
fn title_case_xxxxx_import(s: &str) -> String {
    let t = s.trim();
    if t.is_empty() {
        return String::new();
    }
    let lower = t.to_lowercase();
    let mut c = lower.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

/// Crée une entrée `tab_nom_acte` / `tab_nom_assurance` / `tab_nom_materiel` si aucun nom équivalent (insensible à la casse).
async fn ensure_nom_acte_import(pays: &str, tab_id: &str, nom_brut: &str, logg_id: &str) {
    let n = nom_brut.trim();
    if n.is_empty() {
        return;
    }
    let Ok(mut conn) = connect_db(pays, tab_id, "green").await else {
        return;
    };
    let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, tab_id).await;
    let table = "tab_nom_acte".to_string();
    let cnt: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM {} WHERE lower(trim(nom)) = lower(trim(?1))",
        table
    ))
    .bind(n)
    .fetch_one(&mut conn)
    .await
    .unwrap_or(0);
    if cnt > 0 {
        return;
    }
    let id = Uuid::new_v4().to_string();
    let display = title_case_xxxxx_import(n);
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let sql = format!(
        "INSERT INTO {} (id, nom, prix, logg_id, date_creation) VALUES (?1, ?2, 0, ?3, ?4)",
        table
    );
    let lg = if logg_id.is_empty() {
        tab_id.to_string()
    } else {
        logg_id.to_string()
    };
    let _ = sqlx::query::<Any>(&sql)
        .bind(&id)
        .bind(&display)
        .bind(&lg)
        .bind(&now)
        .execute(&mut conn)
        .await;
}

async fn ensure_nom_assurance_import(pays: &str, tab_id: &str, nom_brut: &str, logg_id: &str) {
    let n = nom_brut.trim();
    if n.is_empty() {
        return;
    }
    let Ok(mut conn) = connect_db(pays, tab_id, "green").await else {
        return;
    };
    let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, tab_id).await;
    let table = "tab_nom_assurance".to_string();
    let cnt: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM {} WHERE lower(trim(nom)) = lower(trim(?1))",
        table
    ))
    .bind(n)
    .fetch_one(&mut conn)
    .await
    .unwrap_or(0);
    if cnt > 0 {
        return;
    }
    let id = Uuid::new_v4().to_string();
    let display = title_case_xxxxx_import(n);
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let sql = format!(
        "INSERT INTO {} (id, nom, pourcentage, logg_id, date_creation) VALUES (?1, ?2, 0, ?3, ?4)",
        table
    );
    let lg = if logg_id.is_empty() {
        tab_id.to_string()
    } else {
        logg_id.to_string()
    };
    let _ = sqlx::query::<Any>(&sql)
        .bind(&id)
        .bind(&display)
        .bind(&lg)
        .bind(&now)
        .execute(&mut conn)
        .await;
}

async fn ensure_nom_materiel_import(pays: &str, tab_id: &str, nom_brut: &str, logg_id: &str) {
    let n = nom_brut.trim();
    if n.is_empty() {
        return;
    }
    let Ok(mut conn) = connect_db(pays, tab_id, "green").await else {
        return;
    };
    let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, tab_id).await;
    let table = "tab_nom_materiel".to_string();
    let cnt: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM {} WHERE lower(trim(nom)) = lower(trim(?1))",
        table
    ))
    .bind(n)
    .fetch_one(&mut conn)
    .await
    .unwrap_or(0);
    if cnt > 0 {
        return;
    }
    let id = Uuid::new_v4().to_string();
    let display = title_case_xxxxx_import(n);
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let sql = format!(
        "INSERT INTO {} (id, nom, quantite_defaut, prix_defaut, logg_id, date_creation) VALUES (?1, ?2, 0, 0, ?3, ?4)",
        table
    );
    let lg = if logg_id.is_empty() {
        tab_id.to_string()
    } else {
        logg_id.to_string()
    };
    let _ = sqlx::query::<Any>(&sql)
        .bind(&id)
        .bind(&display)
        .bind(&lg)
        .bind(&now)
        .execute(&mut conn)
        .await;
}

/// Import combiné : répartir selon `_type` vers tab_acte, tab_assurance, tab_facture, tab_nom_materiel.
/// Pour chaque ligne : `id` déjà présent → mise à jour ; sinon → création (UPSERT sur `id`).
async fn data_import_combined_actes_assurances_factures_materiels(
    pays: &str,
    tab_id: &str,
    csv_content: &str,
    _obj: &serde_json::Map<String, Value>,
) -> Result<Value, String> {
    let lines: Vec<&str> = csv_content.lines().filter(|l| !l.is_empty()).collect();
    if lines.len() < 2 {
        return encrypt_response(&json!({ "success": true, "rowsInserted": 0 }), Some(&get_cript_key()));
    }
    let header = lines[0];
    let headers: Vec<&str> = header.split(';').map(|s| s.trim()).collect();
    let get_idx = |name: &str| headers.iter().position(|h| *h == name);

    let mut inserted = 0i64;

    for line in lines.iter().skip(1) {
        let vals: Vec<&str> = line.split(';').map(|s| s.trim()).collect();
        let get = |name: &str| -> String {
            get_idx(name).and_then(|i| vals.get(i)).map(|s| s.replace(';', ",").replace('\n', " ")).unwrap_or_default()
        };
        let typ = get("_type").to_lowercase();

        if typ == "acte" {
            let mut conn = connect_db(pays, tab_id, "blue").await?;
            let _ = crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, tab_id).await;
            let acte_table = "tab_acte".to_string();
            let id = get("tab_acte.id");
            if !id.is_empty() {
                let pid = get("tab_acte.posologie_id");
                let pid_bind: Option<String> = if pid.is_empty() {
                    None
                } else {
                    Some(pid)
                };
                let sql = format!(
                    "INSERT INTO {} (id, nom, description, date, prix, argentRecu, argentRestant, logg_id, date_creation, posologie_id) \
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) \
                     ON CONFLICT(id) DO UPDATE SET \
                     nom=excluded.nom, description=excluded.description, date=excluded.date, prix=excluded.prix, \
                     argentRecu=excluded.argentRecu, argentRestant=excluded.argentRestant, logg_id=excluded.logg_id, \
                     date_creation=excluded.date_creation, posologie_id=excluded.posologie_id",
                    acte_table
                );
                if sqlx::query::<Any>(&sql)
                    .bind(&id).bind(get("tab_acte.nom")).bind(get("tab_acte.description")).bind(get("tab_acte.date"))
                    .bind(get("tab_acte.prix").parse::<i64>().unwrap_or(0)).bind(get("tab_acte.argentRecu").parse::<i64>().unwrap_or(0)).bind(get("tab_acte.argentRestant").parse::<i64>().unwrap_or(0))
                    .bind(get("tab_acte.logg_id")).bind(get("tab_acte.date_creation"))
                    .bind(pid_bind)
                    .execute(&mut conn).await.is_ok()
                {
                    let nom_acte = get("tab_acte.nom");
                    let logg_acte = get("tab_acte.logg_id");
                    ensure_nom_acte_import(pays, tab_id, &nom_acte, &logg_acte).await;
                    inserted += 1;
                }
            }
        } else if typ == "assurance" {
            let mut conn = connect_db(pays, tab_id, "blue").await?;
            let assurance_table = "tab_assurance".to_string();
            let id = get("tab_assurance.id");
            if !id.is_empty() {
                let sql = format!(
                    "INSERT INTO {} (id, nom, pourcentage, logg_id, date_creation) VALUES (?1,?2,?3,?4,?5) \
                     ON CONFLICT(id) DO UPDATE SET \
                     nom=excluded.nom, pourcentage=excluded.pourcentage, logg_id=excluded.logg_id, date_creation=excluded.date_creation",
                    assurance_table
                );
                if sqlx::query::<Any>(&sql)
                    .bind(&id).bind(get("tab_assurance.nom")).bind(get("tab_assurance.pourcentage").parse::<i32>().unwrap_or(0)).bind(get("tab_assurance.logg_id")).bind(get("tab_assurance.date_creation"))
                    .execute(&mut conn).await.is_ok()
                {
                    let nom_as = get("tab_assurance.nom");
                    let logg_as = get("tab_assurance.logg_id");
                    ensure_nom_assurance_import(pays, tab_id, &nom_as, &logg_as).await;
                    inserted += 1;
                }
            }
        } else if typ == "facture" {
            let mut conn = connect_db(pays, tab_id, "blue").await?;
            let facture_table = "tab_facture".to_string();
            let id = get("tab_facture.id");
            if !id.is_empty() {
                let sql = format!(
                    "INSERT INTO {} (id, prix_acte, argent_recu_acte, argent_restant_acte, argent_assurance, logg_id, date_creation) \
                     VALUES (?1,?2,?3,?4,?5,?6,?7) \
                     ON CONFLICT(id) DO UPDATE SET \
                     prix_acte=excluded.prix_acte, argent_recu_acte=excluded.argent_recu_acte, \
                     argent_restant_acte=excluded.argent_restant_acte, argent_assurance=excluded.argent_assurance, \
                     logg_id=excluded.logg_id, date_creation=excluded.date_creation",
                    facture_table
                );
                if sqlx::query::<Any>(&sql)
                    .bind(&id).bind(get("tab_facture.prix_acte").parse::<i64>().unwrap_or(0)).bind(get("tab_facture.argent_recu_acte").parse::<i64>().unwrap_or(0))
                    .bind(get("tab_facture.argent_restant_acte").parse::<i64>().unwrap_or(0)).bind(get("tab_facture.argent_assurance").parse::<i64>().unwrap_or(0))
                    .bind(get("tab_facture.logg_id")).bind(get("tab_facture.date_creation"))
                    .execute(&mut conn).await.is_ok()
                {
                    inserted += 1;
                }
            }
        } else if typ == "materiel" {
            let mut conn = connect_db(pays, tab_id, "green").await?;
            let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, tab_id).await;
            let materiel_table = "tab_nom_materiel".to_string();
            let id = get("tab_nom_materiel.id");
            if !id.is_empty() {
                let sql = format!(
                    "INSERT INTO {} (id, nom, quantite_defaut, prix_defaut, logg_id, date_creation) VALUES (?1,?2,?3,?4,?5,?6) \
                     ON CONFLICT(id) DO UPDATE SET \
                     nom=excluded.nom, quantite_defaut=excluded.quantite_defaut, prix_defaut=excluded.prix_defaut, \
                     logg_id=excluded.logg_id, date_creation=excluded.date_creation",
                    materiel_table
                );
                if sqlx::query::<Any>(&sql)
                    .bind(&id).bind(get("tab_nom_materiel.nom")).bind(get("tab_nom_materiel.quantite_defaut").parse::<i32>().unwrap_or(0)).bind(get("tab_nom_materiel.prix_defaut").parse::<i32>().unwrap_or(0))
                    .bind(get("tab_nom_materiel.logg_id")).bind(get("tab_nom_materiel.date_creation"))
                    .execute(&mut conn).await.is_ok()
                {
                    let nm = get("tab_nom_materiel.nom");
                    let lgm = get("tab_nom_materiel.logg_id");
                    ensure_nom_materiel_import(pays, tab_id, &nm, &lgm).await;
                    inserted += 1;
                }
            }
        }
    }
    encrypt_response(&json!({ "success": true, "rowsInserted": inserted }), Some(&get_cript_key()))
}

/// Import combiné : actes + assurances + factures + posologies (colonnes `posologie_row.*`).
/// Si `with_modeles`, traite aussi `modele_ordonnance` (`m_*`). Sinon ignore ces lignes. Ignore `materiel`.
async fn data_import_combined_actes_assurances_factures_posologie_inner(
    pays: &str,
    tab_id: &str,
    csv_content: &str,
    _obj: &serde_json::Map<String, Value>,
    with_modeles: bool,
) -> Result<Value, String> {
    let lines: Vec<&str> = csv_content.lines().filter(|l| !l.is_empty()).collect();
    if lines.len() < 2 {
        return encrypt_response(&json!({ "success": true, "rowsInserted": 0 }), Some(&get_cript_key()));
    }
    let header = lines[0];
    let headers: Vec<&str> = header.split(';').map(|s| s.trim()).collect();
    let get_idx = |name: &str| headers.iter().position(|h| *h == name);

    let mut inserted = 0i64;

    for line in lines.iter().skip(1) {
        let vals: Vec<&str> = line.split(';').map(|s| s.trim()).collect();
        let get = |name: &str| -> String {
            get_idx(name)
                .and_then(|i| vals.get(i))
                .map(|s| s.replace(';', ",").replace('\n', " "))
                .unwrap_or_default()
        };
        let typ = get("_type").to_lowercase();

        if typ == "acte" {
            let mut conn = connect_db(pays, tab_id, "blue").await?;
            let _ = crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, tab_id).await;
            let acte_table = "tab_acte".to_string();
            let id = get("tab_acte.id");
            if !id.is_empty() {
                let pid = get("tab_acte.posologie_id");
                let pid_bind: Option<String> = if pid.is_empty() {
                    None
                } else {
                    Some(pid)
                };
                let sql = format!(
                    "INSERT INTO {} (id, nom, description, date, prix, argentRecu, argentRestant, logg_id, date_creation, posologie_id) \
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) \
                     ON CONFLICT(id) DO UPDATE SET \
                     nom=excluded.nom, description=excluded.description, date=excluded.date, prix=excluded.prix, \
                     argentRecu=excluded.argentRecu, argentRestant=excluded.argentRestant, logg_id=excluded.logg_id, \
                     date_creation=excluded.date_creation, posologie_id=excluded.posologie_id",
                    acte_table
                );
                if sqlx::query::<Any>(&sql)
                    .bind(&id)
                    .bind(get("tab_acte.nom"))
                    .bind(get("tab_acte.description"))
                    .bind(get("tab_acte.date"))
                    .bind(get("tab_acte.prix").parse::<i64>().unwrap_or(0))
                    .bind(get("tab_acte.argentRecu").parse::<i64>().unwrap_or(0))
                    .bind(get("tab_acte.argentRestant").parse::<i64>().unwrap_or(0))
                    .bind(get("tab_acte.logg_id"))
                    .bind(get("tab_acte.date_creation"))
                    .bind(pid_bind)
                    .execute(&mut conn)
                    .await
                    .is_ok()
                {
                    let nom_acte = get("tab_acte.nom");
                    let logg_acte = get("tab_acte.logg_id");
                    ensure_nom_acte_import(pays, tab_id, &nom_acte, &logg_acte).await;
                    inserted += 1;
                }
            }
        } else if typ == "assurance" {
            let mut conn = connect_db(pays, tab_id, "blue").await?;
            let assurance_table = "tab_assurance".to_string();
            let id = get("tab_assurance.id");
            if !id.is_empty() {
                let sql = format!(
                    "INSERT INTO {} (id, nom, pourcentage, logg_id, date_creation) VALUES (?1,?2,?3,?4,?5) \
                     ON CONFLICT(id) DO UPDATE SET \
                     nom=excluded.nom, pourcentage=excluded.pourcentage, logg_id=excluded.logg_id, date_creation=excluded.date_creation",
                    assurance_table
                );
                if sqlx::query::<Any>(&sql)
                    .bind(&id)
                    .bind(get("tab_assurance.nom"))
                    .bind(get("tab_assurance.pourcentage").parse::<i32>().unwrap_or(0))
                    .bind(get("tab_assurance.logg_id"))
                    .bind(get("tab_assurance.date_creation"))
                    .execute(&mut conn)
                    .await
                    .is_ok()
                {
                    let nom_as = get("tab_assurance.nom");
                    let logg_as = get("tab_assurance.logg_id");
                    ensure_nom_assurance_import(pays, tab_id, &nom_as, &logg_as).await;
                    inserted += 1;
                }
            }
        } else if typ == "facture" {
            let mut conn = connect_db(pays, tab_id, "blue").await?;
            let facture_table = "tab_facture".to_string();
            let id = get("tab_facture.id");
            if !id.is_empty() {
                let sql = format!(
                    "INSERT INTO {} (id, prix_acte, argent_recu_acte, argent_restant_acte, argent_assurance, logg_id, date_creation) \
                     VALUES (?1,?2,?3,?4,?5,?6,?7) \
                     ON CONFLICT(id) DO UPDATE SET \
                     prix_acte=excluded.prix_acte, argent_recu_acte=excluded.argent_recu_acte, \
                     argent_restant_acte=excluded.argent_restant_acte, argent_assurance=excluded.argent_assurance, \
                     logg_id=excluded.logg_id, date_creation=excluded.date_creation",
                    facture_table
                );
                if sqlx::query::<Any>(&sql)
                    .bind(&id)
                    .bind(get("tab_facture.prix_acte").parse::<i64>().unwrap_or(0))
                    .bind(get("tab_facture.argent_recu_acte").parse::<i64>().unwrap_or(0))
                    .bind(get("tab_facture.argent_restant_acte").parse::<i64>().unwrap_or(0))
                    .bind(get("tab_facture.argent_assurance").parse::<i64>().unwrap_or(0))
                    .bind(get("tab_facture.logg_id"))
                    .bind(get("tab_facture.date_creation"))
                    .execute(&mut conn)
                    .await
                    .is_ok()
                {
                    inserted += 1;
                }
            }
        } else if typ == "materiel" {
            continue;
        } else if typ == "posologie" {
            let suffix_raw = get("posologie_row.patient_suffix");
            let patient_key = db::sanitize_tab_id(&suffix_raw);
            if patient_key.is_empty() {
                continue;
            }
            let id = get("posologie_row.id");
            let posologie_id = get("posologie_row.posologie_id");
            let color_hex = get("posologie_row.color_hex");
            let acte_id = get("posologie_row.acte_id");
            let medicament_id = get("posologie_row.medicament_id");
            if id.is_empty() || posologie_id.is_empty() || acte_id.is_empty() || medicament_id.is_empty() {
                continue;
            }
            let quantite = get("posologie_row.quantite").parse::<i64>().unwrap_or(1).max(1);
            let matin = get("posologie_row.matin").parse::<i32>().unwrap_or(0);
            let midi = get("posologie_row.midi").parse::<i32>().unwrap_or(0);
            let soir = get("posologie_row.soir").parse::<i32>().unwrap_or(0);
            let heures_json = get("posologie_row.heures_json");
            let heures_json = if heures_json.is_empty() {
                "[]".to_string()
            } else {
                heures_json
            };
            let p_date = get("posologie_row.date_creation");
            let date_creation = if p_date.is_empty() {
                Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
            } else {
                p_date
            };

            let mut conn = connect_db(pays, &patient_key, "blue").await?;
            crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, &patient_key).await?;
            let poso_table = "tab_posologie".to_string();
            let sql = format!(
                "INSERT INTO {} (id, posologie_id, color_hex, acte_id, medicament_id, quantite, matin, midi, soir, heures_json, date_creation) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) \
                 ON CONFLICT(id) DO UPDATE SET \
                 posologie_id=excluded.posologie_id, color_hex=excluded.color_hex, acte_id=excluded.acte_id, \
                 medicament_id=excluded.medicament_id, quantite=excluded.quantite, matin=excluded.matin, midi=excluded.midi, \
                 soir=excluded.soir, heures_json=excluded.heures_json, date_creation=excluded.date_creation",
                poso_table
            );
            if sqlx::query::<Any>(&sql)
                .bind(&id)
                .bind(&posologie_id)
                .bind(&color_hex)
                .bind(&acte_id)
                .bind(&medicament_id)
                .bind(quantite)
                .bind(matin)
                .bind(midi)
                .bind(soir)
                .bind(&heures_json)
                .bind(&date_creation)
                .execute(&mut conn)
                .await
                .is_ok()
            {
                let acte_tbl = "tab_acte".to_string();
                let _ = sqlx::query::<Any>(&format!(
                    "UPDATE {} SET posologie_id = ?1 WHERE id = ?2",
                    acte_tbl
                ))
                .bind(&posologie_id)
                .bind(&acte_id)
                .execute(&mut conn)
                .await;
                inserted += 1;
            }
        } else if typ == "modele_ordonnance" {
            if !with_modeles {
                continue;
            }
            let mid = get("m_id");
            let mname = get("m_name");
            if mid.is_empty() || mname.is_empty() {
                continue;
            }
            let micon = get("m_icon");
            let micon = if micon.is_empty() {
                "📄".to_string()
            } else {
                micon
            };
            let mdesc = get("m_description");
            let mcat = get("m_category");
            let mcat = if mcat.is_empty() {
                "prescription".to_string()
            } else {
                mcat
            };
            let mel = get("m_elements_json");
            if mel.is_empty() {
                continue;
            }
            let mdate = get("m_date_creation");
            let mdate = if mdate.is_empty() {
                Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
            } else {
                mdate
            };

            let mut conn = connect_db(pays, tab_id, "green").await?;
            crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, tab_id).await?;
            let mtable = "tab_modele_etat".to_string();
            let sql = format!(
                "INSERT INTO {} (id, name, icon, description, category, elements_json, date_creation) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
                 ON CONFLICT(id) DO UPDATE SET \
                 name=excluded.name, icon=excluded.icon, description=excluded.description, category=excluded.category, \
                 elements_json=excluded.elements_json, date_creation=excluded.date_creation",
                mtable
            );
            if sqlx::query::<Any>(&sql)
                .bind(&mid)
                .bind(&mname)
                .bind(&micon)
                .bind(&mdesc)
                .bind(&mcat)
                .bind(&mel)
                .bind(&mdate)
                .execute(&mut conn)
                .await
                .is_ok()
            {
                inserted += 1;
            }
        }
    }

    encrypt_response(&json!({ "success": true, "rowsInserted": inserted }), Some(&get_cript_key()))
}

/// Autorise les colonnes `NEW_...` à l’import : aligné sur le front (acc01|apy01 + iex03).
/// Ne se base pas sur le booléen client — lecture `tab_privilege` (green). Sadmin : contournement.
async fn user_may_import_new_columns(pays: &str, tab_id: &str, user_id: &str) -> Result<bool, String> {
    let uid = user_id.trim();
    if uid == "sadmin" {
        return Ok(true);
    }
    if uid.is_empty() {
        return Ok(false);
    }
    let mut conn = connect_db(pays, tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, tab_id).await?;
    let table = "tab_privilege".to_string();
    let sql = format!("SELECT nom FROM {} WHERE id = ?1 OR logg_id = ?1", table);
    let nom_opt: Option<String> = sqlx::query::<Any>(&sql)
        .bind(uid)
        .fetch_optional(&mut conn)
        .await
        .map_err(sql_err)?
        .and_then(|r| r.try_get(0).ok());
    let nom_str = nom_opt.unwrap_or_else(|| {
        PRIV_NOM_DEFAUT_DOCTEUR.to_string()
    });
    let codes: Vec<&str> = nom_str
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    let has_access = codes.iter().any(|c| *c == "acc01" || *c == "apy01");
    let has_iex03 = codes.iter().any(|c| *c == "iex03" || *c == "data.schema");
    Ok(has_access && has_iex03)
}

/// Import combiné : lignes `posologie` → `tab_posologie{patient_suffix}` + lien `tab_acte` ; `modele_ordonnance` → `tab_modele_etat`.
/// UPSERT sur la clé primaire `id` (mise à jour si l’`id` existe déjà).
async fn data_import_combined_posologie_modeles_ordonnance(
    pays: &str,
    tab_id: &str,
    csv_content: &str,
    _obj: &serde_json::Map<String, Value>,
) -> Result<Value, String> {
    let lines: Vec<&str> = csv_content.lines().filter(|l| !l.is_empty()).collect();
    if lines.len() < 2 {
        return encrypt_response(&json!({ "success": true, "rowsInserted": 0 }), Some(&get_cript_key()));
    }
    let header = lines[0];
    let headers: Vec<&str> = header.split(';').map(|s| s.trim()).collect();
    let col = |name: &str| -> usize {
        headers.iter().position(|h| *h == name).unwrap_or(usize::MAX)
    };
    let i_type = col("_type");
    let i_suf = col("patient_suffix");
    let i_id = col("id");
    let i_pos = col("posologie_id");
    let i_col = col("color_hex");
    let i_acte = col("acte_id");
    let i_med = col("medicament_id");
    let i_q = col("quantite");
    let i_ma = col("matin");
    let i_mi = col("midi");
    let i_so = col("soir");
    let i_hj = col("heures_json");
    let i_pd = col("p_date_creation");
    let i_mid = col("m_id");
    let i_mn = col("m_name");
    let i_mic = col("m_icon");
    let i_md = col("m_description");
    let i_mcat = col("m_category");
    let i_mel = col("m_elements_json");
    let i_mdt = col("m_date_creation");

    let mut inserted = 0i64;

    for line in lines.iter().skip(1) {
        let vals: Vec<&str> = line.split(';').collect();
        let get = |i: usize| -> String {
            if i == usize::MAX {
                return String::new();
            }
            vals
                .get(i)
                .map(|s| s.trim().to_string())
                .unwrap_or_default()
        };
        let typ = if i_type != usize::MAX {
            get(i_type).to_lowercase()
        } else {
            vals
                .first()
                .map(|s| s.trim().to_lowercase())
                .unwrap_or_default()
        };

        if typ == "posologie" {
            let suffix_raw = get(i_suf);
            let patient_key = db::sanitize_tab_id(&suffix_raw);
            if patient_key.is_empty() {
                continue;
            }
            let id = get(i_id);
            let posologie_id = get(i_pos);
            let color_hex = get(i_col);
            let acte_id = get(i_acte);
            let medicament_id = get(i_med);
            if id.is_empty() || posologie_id.is_empty() || acte_id.is_empty() || medicament_id.is_empty() {
                continue;
            }
            let quantite = get(i_q).parse::<i64>().unwrap_or(1).max(1);
            let matin = get(i_ma).parse::<i32>().unwrap_or(0);
            let midi = get(i_mi).parse::<i32>().unwrap_or(0);
            let soir = get(i_so).parse::<i32>().unwrap_or(0);
            let heures_json = get(i_hj);
            let heures_json = if heures_json.is_empty() {
                "[]".to_string()
            } else {
                heures_json
            };
            let p_date = get(i_pd);
            let date_creation = if p_date.is_empty() {
                Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
            } else {
                p_date
            };

            let mut conn = connect_db(pays, &patient_key, "blue").await?;
            crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, &patient_key).await?;
            let poso_table = "tab_posologie".to_string();
            let sql = format!(
                "INSERT INTO {} (id, posologie_id, color_hex, acte_id, medicament_id, quantite, matin, midi, soir, heures_json, date_creation) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) \
                 ON CONFLICT(id) DO UPDATE SET \
                 posologie_id=excluded.posologie_id, color_hex=excluded.color_hex, acte_id=excluded.acte_id, \
                 medicament_id=excluded.medicament_id, quantite=excluded.quantite, matin=excluded.matin, midi=excluded.midi, \
                 soir=excluded.soir, heures_json=excluded.heures_json, date_creation=excluded.date_creation",
                poso_table
            );
            if sqlx::query::<Any>(&sql)
                .bind(&id)
                .bind(&posologie_id)
                .bind(&color_hex)
                .bind(&acte_id)
                .bind(&medicament_id)
                .bind(quantite)
                .bind(matin)
                .bind(midi)
                .bind(soir)
                .bind(&heures_json)
                .bind(&date_creation)
                .execute(&mut conn)
                .await
                .is_ok()
            {
                let acte_tbl = "tab_acte".to_string();
                let _ = sqlx::query::<Any>(&format!(
                    "UPDATE {} SET posologie_id = ?1 WHERE id = ?2",
                    acte_tbl
                ))
                .bind(&posologie_id)
                .bind(&acte_id)
                .execute(&mut conn)
                .await;
                inserted += 1;
            }
        } else if typ == "modele_ordonnance" {
            let mid = get(i_mid);
            let mname = get(i_mn);
            if mid.is_empty() || mname.is_empty() {
                continue;
            }
            let micon = get(i_mic);
            let micon = if micon.is_empty() {
                "📄".to_string()
            } else {
                micon
            };
            let mdesc = get(i_md);
            let mcat = get(i_mcat);
            let mcat = if mcat.is_empty() {
                "prescription".to_string()
            } else {
                mcat
            };
            let mel = get(i_mel);
            if mel.is_empty() {
                continue;
            }
            let mdate = get(i_mdt);
            let mdate = if mdate.is_empty() {
                Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
            } else {
                mdate
            };

            let mut conn = connect_db(pays, tab_id, "green").await?;
            crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, tab_id).await?;
            let mtable = "tab_modele_etat".to_string();
            let sql = format!(
                "INSERT INTO {} (id, name, icon, description, category, elements_json, date_creation) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
                 ON CONFLICT(id) DO UPDATE SET \
                 name=excluded.name, icon=excluded.icon, description=excluded.description, category=excluded.category, \
                 elements_json=excluded.elements_json, date_creation=excluded.date_creation",
                mtable
            );
            if sqlx::query::<Any>(&sql)
                .bind(&mid)
                .bind(&mname)
                .bind(&micon)
                .bind(&mdesc)
                .bind(&mcat)
                .bind(&mel)
                .bind(&mdate)
                .execute(&mut conn)
                .await
                .is_ok()
            {
                inserted += 1;
            }
        }
    }

    encrypt_response(&json!({ "success": true, "rowsInserted": inserted }), Some(&get_cript_key()))
}

/// Import CSV : par table ou groupes combinés. Politique ligne à ligne :
/// si toutes les colonnes de la clé primaire sont présentes dans le fichier → `INSERT … ON CONFLICT … DO UPDATE` (création ou mise à jour) ;
/// sinon → `INSERT OR REPLACE` (compatibilité anciens exports / PK composite incomplète).
#[tauri::command]
pub async fn data_import_table(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let table_name_raw = obj.get("tableName").and_then(|v| v.as_str()).ok_or("tableName manquant")?;
    let csv_content = obj.get("csvContent").and_then(|v| v.as_str()).ok_or("csvContent manquant")?;
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    // Import combiné : répartir automatiquement vers les bonnes tables
    if table_name_raw == "group_docteurs_collaborateurs_users" {
        return data_import_combined_docteurs_collaborateurs_users(pays, &tab_id, csv_content, obj).await;
    }
    if table_name_raw == "group_actes_assurances_factures_materiels" {
        return data_import_combined_actes_assurances_factures_materiels(pays, &tab_id, csv_content, obj).await;
    }
    if table_name_raw == "group_actes_assurances_factures_posologie" {
        return data_import_combined_actes_assurances_factures_posologie_inner(
            pays,
            &tab_id,
            csv_content,
            obj,
            false,
        )
        .await;
    }
    if table_name_raw == "group_actes_assurances_factures_posologie_et_modeles_ordonnance" {
        return data_import_combined_actes_assurances_factures_posologie_inner(
            pays,
            &tab_id,
            csv_content,
            obj,
            true,
        )
        .await;
    }
    if table_name_raw == "group_posologie_et_modeles_ordonnance" {
        return data_import_combined_posologie_modeles_ordonnance(pays, &tab_id, csv_content, obj).await;
    }

    let table_name = db::validate_table_name(table_name_raw)?;
    let db_color = obj.get("dbColor").and_then(|v| v.as_str()).unwrap_or("yellow");
    let confirm_modify = obj.get("confirmModify").and_then(|v| v.as_bool()).unwrap_or(false);

    let mut conn = connect_db(pays, &tab_id, db_color).await?;
    ensure_import_meta(&mut conn).await?;
    let mut existing_cols = get_table_columns(&mut conn, &table_name).await?;
    if existing_cols.is_empty() {
        return Err("Table inexistante".to_string());
    }

    let lines: Vec<&str> = csv_content.lines().filter(|l| !l.is_empty()).collect();
    if lines.len() < 2 {
        return encrypt_response(&json!({ "success": true, "rowsInserted": 0 }), Some(&get_cript_key()));
    }

    let header = lines[0];
    let csv_headers: Vec<String> = header.split(';').map(|s| s.trim().to_string()).collect();

    // Droit réel : base `tab_privilege` (+ sadmin). Le champ JSON `allowNewColumns` est ignoré (anti-contournement client).
    let user_id = obj.get("userId").and_then(|v| v.as_str()).unwrap_or("");
    let allow_new_columns = user_may_import_new_columns(pays, &tab_id, user_id).await?;

    // 1. Parser les headers : colonnes à insérer, à supprimer [del], ou nouvelles (NEW_)
    let mut parsed: Vec<(String, bool, Option<NewColumnKind>)> = Vec::new();
    let mut cols_to_del: Vec<String> = Vec::new();
    let mut formula_changes: Vec<(String, String, String)> = Vec::new();
    let mut wants_new_columns = false;

    for h in &csv_headers {
        match parse_csv_header(h, &existing_cols, &table_name) {
            Ok(Some((name, is_del, kind))) => {
                if is_del {
                    cols_to_del.push(name);
                } else {
                    if kind.is_some() {
                        wants_new_columns = true;
                    }
                    if let Some(ref k) = kind {
                        if let NewColumnKind::Formula(ref expr) = k {
                            if existing_cols.contains(&name) {
                                if let Ok(Some(old)) = get_stored_formula(&mut conn, &table_name, &name).await {
                                    if old != *expr {
                                        formula_changes.push((name.clone(), old, expr.clone()));
                                    }
                                }
                            }
                        }
                    }
                    parsed.push((name, is_del, kind));
                }
            }
            Ok(None) => {}
            Err(e) => return Err(e),
        }
    }

    if wants_new_columns && !allow_new_columns {
        return Err(
            "Import avec colonnes NEW_ : privilège « Schéma import (nouvelles colonnes) » (iex03) requis."
                .to_string(),
        );
    }

    if !formula_changes.is_empty() && !confirm_modify {
        let details: Vec<Value> = formula_changes
            .iter()
            .map(|(col, old, new)| json!({ "column": col, "oldFormula": old, "newFormula": new }))
            .collect();
        return encrypt_response(
            &json!({
                "success": false,
                "needsConfirmation": true,
                "message": "Formule(s) modifiée(s). Confirmer la modification ?",
                "columnsToModify": details
            }),
            Some(&get_cript_key()),
        );
    }

    // 2. Supprimer les colonnes [del] (SQLite 3.35+)
    for col in &cols_to_del {
        if existing_cols.contains(col) {
            let alter_sql = format!("ALTER TABLE {} DROP COLUMN {}", table_name, col);
            if let Err(e) = sqlx::query::<Any>(&alter_sql).execute(&mut conn).await {
                return Err(format!("Impossible de supprimer la colonne {} : {} (SQLite 3.35+ requis)", col, e));
            }
            existing_cols.retain(|c| c != col);
            set_stored_formula(&mut conn, &table_name, col, None).await?;
        }
    }

    // 3. Traiter chaque colonne : ajouter si NEW_, construire liste pour INSERT
    let mut insert_col_names: Vec<String> = Vec::new();
    let mut col_indices: Vec<usize> = Vec::new();
    let mut generated_cols: Vec<String> = Vec::new();

    for (i, h) in csv_headers.iter().enumerate() {
        if let Ok(Some((name, is_del, kind))) = parse_csv_header(h, &existing_cols, &table_name) {
            if is_del || cols_to_del.contains(&name) {
                continue;
            }
            match &kind {
                Some(NewColumnKind::Simple(sql_type)) => {
                    if !existing_cols.contains(&name) {
                        let alter_sql = format!("ALTER TABLE {} ADD COLUMN {} {}", table_name, name, sql_type);
                        sqlx::query::<Any>(&alter_sql).execute(&mut conn).await.map_err(|e| format!("ADD COLUMN {} : {}", name, e))?;
                        existing_cols.push(name.clone());
                        set_stored_formula(&mut conn, &table_name, &name, Some("SIMPLE")).await?;
                    }
                    insert_col_names.push(name.clone());
                    col_indices.push(i);
                }
                Some(NewColumnKind::Formula(expr)) => {
                    let sql_expr = validate_formula_to_sql(expr, &existing_cols)?;
                    if !existing_cols.contains(&name) {
                        let alter_sql = format!(
                            "ALTER TABLE {} ADD COLUMN {} REAL GENERATED ALWAYS AS ({})",
                            table_name, name, sql_expr
                        );
                        sqlx::query::<Any>(&alter_sql).execute(&mut conn).await.map_err(|e| format!("ADD COLUMN {} : {}", name, e))?;
                        existing_cols.push(name.clone());
                        set_stored_formula(&mut conn, &table_name, &name, Some(expr)).await?;
                    } else if formula_changes.iter().any(|(c, _, _)| c == &name) {
                        let drop_sql = format!("ALTER TABLE {} DROP COLUMN {}", table_name, name);
                        sqlx::query::<Any>(&drop_sql).execute(&mut conn).await.map_err(|e| format!("DROP COLUMN {} : {}", name, e))?;
                        existing_cols.retain(|c| c != &name);
                        let alter_sql = format!(
                            "ALTER TABLE {} ADD COLUMN {} REAL GENERATED ALWAYS AS ({})",
                            table_name, name, sql_expr
                        );
                        sqlx::query::<Any>(&alter_sql).execute(&mut conn).await.map_err(|e| format!("ADD COLUMN {} : {}", name, e))?;
                        existing_cols.push(name.clone());
                        set_stored_formula(&mut conn, &table_name, &name, Some(expr)).await?;
                    } else {
                        set_stored_formula(&mut conn, &table_name, &name, Some(expr)).await?;
                    }
                    generated_cols.push(name.clone());
                }
                None => {
                    insert_col_names.push(name.clone());
                    col_indices.push(i);
                }
            }
        }
    }

    let placeholders: Vec<String> = (0..insert_col_names.len()).map(|_| "?".to_string()).collect();
    let ph = placeholders.join(", ");
    let cols = insert_col_names.join(", ");
    // Upsert : si toutes les colonnes PK sont dans le CSV → ON CONFLICT DO UPDATE (création / mise à jour) ;
    // sinon INSERT OR REPLACE (ex. PK composite partielle — comportement historique).
    let pk_cols = get_primary_key_columns(&mut conn, &table_name).await;
    let all_pk_present = !pk_cols.is_empty() && pk_cols.iter().all(|c| insert_col_names.contains(c));
    let sql = if all_pk_present {
        let conflict_target = pk_cols.join(", ");
        let update_set: Vec<String> = insert_col_names
            .iter()
            .filter(|c| !pk_cols.contains(c))
            .map(|c| format!("{} = excluded.{}", c, c))
            .collect();
        if update_set.is_empty() {
            format!(
                "INSERT OR IGNORE INTO {} ({}) VALUES ({})",
                table_name, cols, ph
            )
        } else {
            format!(
                "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT({}) DO UPDATE SET {}",
                table_name, cols, ph, conflict_target, update_set.join(", ")
            )
        }
    } else {
        format!(
            "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
            table_name, cols, ph
        )
    };

    let mut inserted = 0i64;

    for line in lines.iter().skip(1) {
        let vals: Vec<&str> = line.split(';').map(|s| s.trim()).collect();
        if vals.len() >= csv_headers.len() && col_indices.iter().all(|&i| i < vals.len()) {
            let mut q = sqlx::query::<Any>(&sql);
            for &i in &col_indices {
                q = q.bind(vals[i]);
                }
            if q.execute(&mut conn).await.is_ok() {
                inserted += 1;
            }
        }
    }

    encrypt_response(&json!({ "success": true, "rowsInserted": inserted }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn data_list_custom_columns(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));

    verify_db_credentials(obj, &tab_id, pays).await?;

    let patient_table = "tab_patient".to_string();
    let acte_table = "tab_acte".to_string();

    let mut patient_cols: Vec<String> = Vec::new();
    let mut acte_cols: Vec<String> = Vec::new();

    if let Ok(mut conn_yellow) = connect_db(pays, &tab_id, "yellow").await {
        if ensure_import_meta(&mut conn_yellow).await.is_ok() {
            let sql = "SELECT column_name FROM _import_meta WHERE table_name = ?1";
            if let Ok(rows) = sqlx::query::<Any>(sql).bind(&patient_table).fetch_all(&mut conn_yellow).await {
                for row in rows {
                    if let Ok(col) = row.try_get::<String, _>(0) {
                        patient_cols.push(col);
                    }
                }
            }
        }
    }

    if let Ok(mut conn_blue) = connect_db(pays, &tab_id, "blue").await {
        if ensure_import_meta(&mut conn_blue).await.is_ok() {
            let sql = "SELECT column_name FROM _import_meta WHERE table_name = ?1";
            if let Ok(rows) = sqlx::query::<Any>(sql).bind(&acte_table).fetch_all(&mut conn_blue).await {
                for row in rows {
                    if let Ok(col) = row.try_get::<String, _>(0) {
                        acte_cols.push(col);
                    }
                }
            }
        }
    }

    encrypt_response(
        &json!({ "patient": patient_cols, "acte": acte_cols }),
        Some(&get_cript_key()),
    )
}

// ========== FONCTION DE TEST TEMPORAIRE ==========
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

// ========== Médicaments (green) & Posologies (blue patient) ==========

fn random_posologie_pastel_hex() -> String {
    let mut b = [0u8; 3];
    OsRng.fill_bytes(&mut b);
    let r = 200u16 + (u16::from(b[0]) % 56);
    let g = 200u16 + (u16::from(b[1]) % 56);
    let bl = 200u16 + (u16::from(b[2]) % 56);
    format!("#{:02x}{:02x}{:02x}", r as u8, g as u8, bl as u8)
}

fn json_value_has_posologie_binding(v: &Value) -> bool {
    match v {
        Value::Array(a) => a.iter().any(json_value_has_posologie_binding),
        Value::Object(o) => {
            for (k, val) in o {
                let kl = k.to_lowercase();
                if matches!(
                    kl.as_str(),
                    "type" | "variabletype" | "fieldtype" | "binding" | "sourcetype"
                ) {
                    if let Some(s) = val.as_str() {
                        if s.to_lowercase().contains("posologie") {
                            return true;
                        }
                    }
                }
                if let Some(s) = val.as_str() {
                    let sl = s.to_lowercase();
                    if sl.contains("{{posologie") || sl.contains("posologie}}") {
                        return true;
                    }
                }
                if json_value_has_posologie_binding(val) {
                    return true;
                }
            }
            false
        }
        _ => false,
    }
}

#[tauri::command]
pub async fn list_medicaments(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.as_ref().and_then(|b| b.as_object());
    let tab_id = db::sanitize_tab_id(
        p.tab_id
            .as_deref()
            .or_else(|| body.and_then(|o| o.get("tabId")).and_then(|v| v.as_str()))
            .unwrap_or("main"),
    );
    let pays = p
        .pays
        .as_deref()
        .or_else(|| body.and_then(|o| o.get("pays")).and_then(|v| v.as_str()))
        .unwrap_or("sn");

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;
    let table = "tab_medicament".to_string();
    let sql = format!(
        "SELECT id, nom, forme, CAST(date_creation AS TEXT) FROM {} ORDER BY nom COLLATE NOCASE",
        table
    );
    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for row in rows {
        list.push(json!({
            "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
            "nom": row.try_get::<Option<String>, _>(1).ok().flatten(),
            "forme": row.try_get::<Option<String>, _>(2).ok().flatten(),
            "dateCreation": row.try_get::<Option<String>, _>(3).ok().flatten(),
        }));
    }
    encrypt_response(&json!({ "medicaments": list }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn add_medicament(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let nom = obj.get("nom").and_then(|v| v.as_str()).unwrap_or("").trim();
    if nom.is_empty() {
        return Err("Nom du médicament requis".to_string());
    }
    let forme = obj.get("forme").and_then(|v| v.as_str()).unwrap_or("");
    let logg_id = obj.get("loggId").and_then(|v| v.as_str()).unwrap_or("");

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let table = "tab_medicament".to_string();
    sqlx::query::<Any>(&format!(
        "INSERT INTO {} (id, nom, forme, logg_id, date_creation) VALUES (?1, ?2, ?3, ?4, ?5)",
        table
    ))
    .bind(&id)
    .bind(nom)
    .bind(forme)
    .bind(logg_id)
    .bind(&now)
    .execute(&mut conn)
    .await
    .map_err(|e| format!("add_medicament: {}", e))?;

    encrypt_response(&json!({ "id": id, "success": true }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn delete_medicament(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let id = obj
        .get("id")
        .or(obj.get("medicamentId"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if id.is_empty() {
        return Err("id médicament requis".to_string());
    }

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;
    let table = "tab_medicament".to_string();
    sqlx::query::<Any>(&format!("DELETE FROM {} WHERE id = ?1", table))
        .bind(id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("delete_medicament: {}", e))?;

    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn list_actes_ids_in_posologie(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.as_ref().and_then(|b| b.as_object());
    let patient_id = p
        .patient_id
        .as_deref()
        .or_else(|| body.and_then(|o| o.get("patientId")).and_then(|v| v.as_str()))
        .unwrap_or("");
    let pays = p
        .pays
        .as_deref()
        .or_else(|| body.and_then(|o| o.get("pays")).and_then(|v| v.as_str()))
        .unwrap_or("sn");

    if patient_id.is_empty() {
        return encrypt_response(&json!({ "acteIds": [] }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, patient_id, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, patient_id).await?;
    let table = "tab_posologie".to_string();
    let sql = format!("SELECT DISTINCT acte_id FROM {}", table);
    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .unwrap_or_default();
    let ids: Vec<String> = rows
        .into_iter()
        .filter_map(|r| r.try_get::<Option<String>, _>(0).ok().flatten())
        .collect();
    encrypt_response(&json!({ "acteIds": ids }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn list_posologie_acte_colors(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.as_ref().and_then(|b| b.as_object());
    let patient_id = p
        .patient_id
        .as_deref()
        .or_else(|| body.and_then(|o| o.get("patientId")).and_then(|v| v.as_str()))
        .unwrap_or("");
    let pays = p
        .pays
        .as_deref()
        .or_else(|| body.and_then(|o| o.get("pays")).and_then(|v| v.as_str()))
        .unwrap_or("sn");

    if patient_id.is_empty() {
        return encrypt_response(&json!({ "acteColors": {} }), Some(&get_cript_key()));
    }

    let mut conn = connect_db(pays, patient_id, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, patient_id).await?;
    let table = "tab_posologie".to_string();
    let sql = format!("SELECT acte_id, color_hex FROM {}", table);
    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .unwrap_or_default();
    let mut colors = serde_json::Map::new();
    for row in rows {
        if let (Ok(Some(aid)), Ok(Some(hex))) = (
            row.try_get::<Option<String>, _>(0),
            row.try_get::<Option<String>, _>(1),
        ) {
            if !aid.is_empty() {
                colors.insert(aid, Value::String(hex));
            }
        }
    }
    encrypt_response(&json!({ "acteColors": colors }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn save_posologie(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let patient_id = obj.get("patientId").and_then(|v| v.as_str()).unwrap_or("").trim();
    let cabinet_tab = db::sanitize_tab_id(
        obj.get("cabinetTabId")
            .or(obj.get("tabId"))
            .and_then(|v| v.as_str())
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    verify_db_credentials(obj, cabinet_tab.as_str(), pays).await?;
    check_paiement_actif(cabinet_tab.as_str(), &cabinet_tab, pays).await?;

    if patient_id.is_empty() {
        return Err("patientId requis".to_string());
    }

    let lines = obj
        .get("lines")
        .and_then(|v| v.as_array())
        .ok_or("lines[] requis")?;
    if lines.is_empty() {
        return Err("Au moins une ligne de posologie".to_string());
    }

    let mut seen_acte: std::collections::HashSet<String> = std::collections::HashSet::new();
    for line in lines {
        let lo = line.as_object().ok_or("Ligne invalide")?;
        let acte_id = to_str(lo.get("acteId").or(lo.get("acte_id")).unwrap_or(&Value::Null));
        let med_id = to_str(lo.get("medicamentId").or(lo.get("medicament_id")).unwrap_or(&Value::Null));
        if acte_id.is_empty() || med_id.is_empty() {
            return Err("Chaque ligne doit avoir acteId et medicamentId".to_string());
        }
        if !seen_acte.insert(acte_id.clone()) {
            return Err(format!("Acte {} utilisé deux fois dans cette posologie", acte_id));
        }
    }

    let mut conn_blue = connect_db(pays, patient_id, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn_blue, patient_id).await?;
    let poso_table = "tab_posologie".to_string();

    for line in lines {
        let lo = line.as_object().unwrap();
        let acte_id = to_str(lo.get("acteId").or(lo.get("acte_id")).unwrap_or(&Value::Null));
        let cnt: i64 = sqlx::query::<Any>(&format!(
            "SELECT COUNT(*) FROM {} WHERE acte_id = ?1",
            poso_table
        ))
        .bind(&acte_id)
        .fetch_one(&mut conn_blue)
        .await
        .ok()
        .and_then(|r| r.try_get(0).ok())
        .unwrap_or(0);
        if cnt > 0 {
            return Err(format!(
                "L'acte {} est déjà lié à une posologie existante",
                acte_id
            ));
        }
    }

    let mut conn_green = connect_db(pays, &cabinet_tab, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, &cabinet_tab).await?;
    let med_table = "tab_medicament".to_string();
    let patient_table = "tab_patient".to_string();
    let patient_full_name: String = sqlx::query::<Any>(&format!(
        "SELECT IFNULL(prenom, ''), IFNULL(nom, '') FROM {} WHERE id = ?1 OR logg_id = ?1 LIMIT 1",
        patient_table
    ))
    .bind(patient_id)
    .fetch_optional(&mut conn_green)
    .await
    .ok()
    .flatten()
    .map(|r| {
        let prenom = r
            .try_get::<Option<String>, _>(0)
            .ok()
            .flatten()
            .unwrap_or_default();
        let nom = r
            .try_get::<Option<String>, _>(1)
            .ok()
            .flatten()
            .unwrap_or_default();
        format!("{} {}", prenom.trim(), nom.trim()).trim().to_string()
    })
    .unwrap_or_default();

    let posologie_id = Uuid::new_v4().to_string();
    let color_hex = random_posologie_pastel_hex();
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut tx = conn_blue.begin().await.map_err(sql_err)?;

    let mut qr_lines: Vec<Value> = Vec::new();
    for line in lines {
        let lo = line.as_object().unwrap();
        let acte_id = to_str(lo.get("acteId").or(lo.get("acte_id")).unwrap_or(&Value::Null));
        let medicament_id = to_str(lo.get("medicamentId").or(lo.get("medicament_id")).unwrap_or(&Value::Null));
        let quantite = to_i64(lo.get("quantite").unwrap_or(&Value::Null)).max(1);
        let matin = 0i32;
        let midi = 0i32;
        let soir = 0i32;
        let heures_val = lo.get("heures").cloned().unwrap_or(Value::Array(vec![]));
        let heures_arr = heures_val.as_array().cloned().unwrap_or_default();
        let heures_json_str = serde_json::to_string(&heures_arr).unwrap_or_else(|_| "[]".to_string());
        let heures_count = heures_arr.len();
        if heures_count == 0 {
            return Err("Chaque ligne : au moins une heure de prise (heures[])".to_string());
        }

        let med_nom: String = sqlx::query::<Any>(&format!(
            "SELECT nom FROM {} WHERE id = ?1 LIMIT 1",
            med_table
        ))
        .bind(&medicament_id)
        .fetch_optional(&mut conn_green)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<Option<String>, _>(0).ok().flatten())
        .unwrap_or_else(|| "?".to_string());

        let row_id = Uuid::new_v4().to_string();
        sqlx::query::<Any>(&format!(
            "INSERT INTO {} (id, posologie_id, color_hex, acte_id, medicament_id, quantite, matin, midi, soir, heures_json, date_creation) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            poso_table
        ))
        .bind(&row_id)
        .bind(&posologie_id)
        .bind(&color_hex)
        .bind(&acte_id)
        .bind(&medicament_id)
        .bind(quantite)
        .bind(matin)
        .bind(midi)
        .bind(soir)
        .bind(&heures_json_str)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Insert posologie: {}", e))?;

        qr_lines.push(json!({
            "acteId": acte_id,
            "medicamentId": medicament_id,
            "medicamentNom": med_nom,
            "quantite": quantite,
            "heures": heures_arr,
        }));
    }

    for acte_id in &seen_acte {
        let acte_tbl = "tab_acte".to_string();
        sqlx::query::<Any>(&format!(
            "UPDATE {} SET posologie_id = ?1 WHERE id = ?2",
            acte_tbl
        ))
        .bind(&posologie_id)
        .bind(acte_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Lien acte posologie: {}", e))?;
    }

    tx.commit().await.map_err(sql_err)?;

    let plain_qr = json!({
        "v": 1,
        "kind": "loggappro_posologie",
        "patientId": patient_id,
        "patientFullName": patient_full_name,
        "cabinetTabId": cabinet_tab.as_str(),
        "pays": pays,
        "posologieId": posologie_id,
        "lines": qr_lines,
    })
    .to_string();
    let enc = crate::crypto::encrypt_data(&plain_qr, &get_cript_key())
        .map_err(|e| format!("Chiffrement QR: {}", e))?;
    let qr_b64 = draw_base64(&enc).map_err(|e| format!("QR: {}", e))?;
    let qr_data_url = format!("data:image/png;base64,{}", qr_b64);

    encrypt_response(
        &json!({
            "success": true,
            "posologieId": posologie_id,
            "colorHex": color_hex,
            "qrBase64": qr_data_url,
            "payloadEncrypted": enc,
        }),
        Some(&get_cript_key()),
    )
}

/// QR code posologie (même charge utile que après `save_posologie`) à partir des lignes déjà en base.
#[tauri::command]
pub async fn get_posologie_qrcode(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let patient_id_raw = obj
        .get("patientId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let cabinet_tab = db::sanitize_tab_id(
        obj.get("tabId")
            .or(obj.get("cabinetTabId"))
            .and_then(|v| v.as_str())
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let posologie_id_opt = obj
        .get("posologieId")
        .or(obj.get("posologie_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());

    if patient_id_raw.is_empty() {
        return encrypt_response(&json!({ "qrBase64": Value::Null }), Some(&get_cript_key()));
    }

    verify_db_credentials(obj, cabinet_tab.as_str(), pays).await?;
    check_paiement_actif(cabinet_tab.as_str(), &cabinet_tab, pays).await?;

    let patient_key = db::sanitize_tab_id(patient_id_raw);
    let mut conn = connect_db(pays, &patient_key, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, &patient_key).await?;
    let table = "tab_posologie".to_string();

    let sql_all = format!(
        "SELECT posologie_id, acte_id, medicament_id, quantite, heures_json FROM {} ORDER BY date_creation ASC, id ASC",
        table
    );
    let rows = sqlx::query::<Any>(&sql_all)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| format!("get_posologie_qrcode: {}", e))?;

    if rows.is_empty() {
        return encrypt_response(&json!({ "qrBase64": Value::Null }), Some(&get_cript_key()));
    }

    let mut parsed: Vec<(String, String, String, i64, String)> = Vec::new();
    for row in rows {
        let pid = row
            .try_get::<Option<String>, _>(0)
            .ok()
            .flatten()
            .unwrap_or_default();
        let acte_id = row
            .try_get::<Option<String>, _>(1)
            .ok()
            .flatten()
            .unwrap_or_default();
        let med_id = row
            .try_get::<Option<String>, _>(2)
            .ok()
            .flatten()
            .unwrap_or_default();
        let q = row
            .try_get::<i64, _>(3)
            .or_else(|_| row.try_get::<i32, _>(3).map(|i| i as i64))
            .unwrap_or(1)
            .max(1);
        let hj = row
            .try_get::<Option<String>, _>(4)
            .ok()
            .flatten()
            .unwrap_or_else(|| "[]".to_string());
        if !acte_id.is_empty() && !med_id.is_empty() {
            parsed.push((pid, acte_id, med_id, q, hj));
        }
    }

    if parsed.is_empty() {
        return encrypt_response(&json!({ "qrBase64": Value::Null }), Some(&get_cript_key()));
    }

    let filtered: Vec<(String, String, String, i64, String)> =
        match posologie_id_opt.as_ref() {
            Some(want) => parsed
                .into_iter()
                .filter(|(pid, _, _, _, _)| pid == want)
                .collect(),
            None => parsed,
        };

    if filtered.is_empty() {
        return encrypt_response(&json!({ "qrBase64": Value::Null }), Some(&get_cript_key()));
    }

    let chosen_poso_id: String = if let Some(want) = posologie_id_opt {
        want.to_string()
    } else {
        let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        for (pid, _, _, _, _) in &filtered {
            *counts.entry(pid.clone()).or_insert(0) += 1;
        }
        counts
            .into_iter()
            .max_by_key(|(_, c)| *c)
            .map(|(k, _)| k)
            .unwrap_or_default()
    };

    let final_lines: Vec<_> = filtered
        .into_iter()
        .filter(|(pid, _, _, _, _)| pid == &chosen_poso_id)
        .collect();

    if final_lines.is_empty() || chosen_poso_id.is_empty() {
        return encrypt_response(&json!({ "qrBase64": Value::Null }), Some(&get_cript_key()));
    }

    let mut conn_green = connect_db(pays, &cabinet_tab, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, &cabinet_tab).await?;
    let med_table = "tab_medicament".to_string();
    let patient_table = "tab_patient".to_string();
    let patient_full_name: String = sqlx::query::<Any>(&format!(
        "SELECT IFNULL(prenom, ''), IFNULL(nom, '') FROM {} WHERE id = ?1 OR logg_id = ?1 LIMIT 1",
        patient_table
    ))
    .bind(patient_id_raw)
    .fetch_optional(&mut conn_green)
    .await
    .ok()
    .flatten()
    .map(|r| {
        let prenom = r
            .try_get::<Option<String>, _>(0)
            .ok()
            .flatten()
            .unwrap_or_default();
        let nom = r
            .try_get::<Option<String>, _>(1)
            .ok()
            .flatten()
            .unwrap_or_default();
        format!("{} {}", prenom.trim(), nom.trim()).trim().to_string()
    })
    .unwrap_or_default();

    let mut qr_lines: Vec<Value> = Vec::new();
    for (_, acte_id, medicament_id, quantite, heures_json_str) in final_lines {
        let heures: Value =
            serde_json::from_str(&heures_json_str).unwrap_or(Value::Array(vec![]));
        let heures_arr = heures.as_array().cloned().unwrap_or_default();
        let med_nom: String = sqlx::query::<Any>(&format!(
            "SELECT nom FROM {} WHERE id = ?1 LIMIT 1",
            med_table
        ))
        .bind(&medicament_id)
        .fetch_optional(&mut conn_green)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<Option<String>, _>(0).ok().flatten())
        .unwrap_or_else(|| "?".to_string());
        qr_lines.push(json!({
            "acteId": acte_id,
            "medicamentId": medicament_id,
            "medicamentNom": med_nom,
            "quantite": quantite,
            "heures": Value::Array(heures_arr),
        }));
    }

    let plain_qr = json!({
        "v": 1,
        "kind": "loggappro_posologie",
        "patientId": patient_id_raw,
        "patientFullName": patient_full_name,
        "cabinetTabId": cabinet_tab.as_str(),
        "pays": pays,
        "posologieId": chosen_poso_id,
        "lines": qr_lines,
    })
    .to_string();
    let enc = crate::crypto::encrypt_data(&plain_qr, &get_cript_key())
        .map_err(|e| format!("Chiffrement QR: {}", e))?;
    let qr_b64 = draw_base64(&enc).map_err(|e| format!("QR: {}", e))?;
    let qr_data_url = format!("data:image/png;base64,{}", qr_b64);

    encrypt_response(
        &json!({ "qrBase64": qr_data_url }),
        Some(&get_cript_key()),
    )
}

/// Convertit les lignes SQL `tab_posologie*` en objets attendus par le frontend (`normalizePosologieLineFromApi`).
fn posologie_sql_rows_to_json_values(rows: &[sqlx::any::AnyRow]) -> Vec<Value> {
    let mut lines: Vec<Value> = Vec::new();
    for row in rows {
        let acte_id = row
            .try_get::<Option<String>, _>(0)
            .ok()
            .flatten()
            .unwrap_or_default();
        let med_id = row
            .try_get::<Option<String>, _>(1)
            .ok()
            .flatten()
            .unwrap_or_default();
        let quantite = row
            .try_get::<i64, _>(2)
            .or_else(|_| row.try_get::<i32, _>(2).map(|i| i as i64))
            .unwrap_or(1)
            .max(1);
        let heures_json: String = row
            .try_get::<Option<String>, _>(3)
            .ok()
            .flatten()
            .unwrap_or_else(|| "[]".to_string());
        let heures: Value = serde_json::from_str(&heures_json).unwrap_or(Value::Array(vec![]));
        lines.push(json!({
            "acteId": acte_id,
            "medicamentId": med_id,
            "quantite": quantite,
            "nombreBoites": 1,
            "heures": heures,
        }));
    }
    lines
}

/// Toutes les lignes de posologie du patient (base bleue `tab_posologie{patient_id}`).
#[tauri::command]
pub async fn get_posologie_lines_for_patient(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let patient_id = obj
        .get("patientId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let cabinet_tab = db::sanitize_tab_id(
        obj
            .get("tabId")
            .or(obj.get("cabinetTabId"))
            .and_then(|v| v.as_str())
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");

    if patient_id.is_empty() {
        return encrypt_response(&json!({ "lines": [] }), Some(&get_cript_key()));
    }

    verify_db_credentials(obj, cabinet_tab.as_str(), pays).await?;
    check_paiement_actif(cabinet_tab.as_str(), &cabinet_tab, pays).await?;

    let mut conn = connect_db(pays, patient_id, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, patient_id).await?;
    let table = "tab_posologie".to_string();
    let sql = format!(
        "SELECT acte_id, medicament_id, quantite, heures_json FROM {} ORDER BY date_creation ASC, id ASC",
        table
    );
    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| format!("get_posologie_lines_for_patient: {}", e))?;

    let lines = posologie_sql_rows_to_json_values(&rows);
    encrypt_response(&json!({ "lines": lines }), Some(&get_cript_key()))
}

/// Lignes de posologie pour un acte donné (même table que `save_posologie`).
#[tauri::command]
pub async fn get_posologie_lines_for_acte(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let patient_id = obj
        .get("patientId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let acte_id = obj
        .get("acteId")
        .or(obj.get("acte_id"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let cabinet_tab = db::sanitize_tab_id(
        obj
            .get("tabId")
            .or(obj.get("cabinetTabId"))
            .and_then(|v| v.as_str())
            .unwrap_or("main"),
    );
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");

    if patient_id.is_empty() || acte_id.is_empty() {
        return encrypt_response(&json!({ "lines": [] }), Some(&get_cript_key()));
    }

    verify_db_credentials(obj, cabinet_tab.as_str(), pays).await?;
    check_paiement_actif(cabinet_tab.as_str(), &cabinet_tab, pays).await?;

    let mut conn = connect_db(pays, patient_id, "blue").await?;
    crate::db_sqlx::ensure_tables_blue_sqlx(&mut conn, patient_id).await?;
    let table = "tab_posologie".to_string();
    let sql = format!(
        "SELECT acte_id, medicament_id, quantite, heures_json FROM {} WHERE acte_id = ?1 ORDER BY date_creation ASC, id ASC",
        table
    );
    let rows = sqlx::query::<Any>(&sql)
        .bind(acte_id)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| format!("get_posologie_lines_for_acte: {}", e))?;

    let lines = posologie_sql_rows_to_json_values(&rows);
    encrypt_response(&json!({ "lines": lines }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn list_modeles_etat_posologie(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.as_ref().and_then(|b| b.as_object());
    let tab_id = db::sanitize_tab_id(
        p.tab_id
            .as_deref()
            .or_else(|| body.and_then(|o| o.get("tabId")).and_then(|v| v.as_str()))
            .unwrap_or("main"),
    );
    let pays = p
        .pays
        .as_deref()
        .or_else(|| body.and_then(|o| o.get("pays")).and_then(|v| v.as_str()))
        .unwrap_or("sn");

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_modele_etat".to_string();
    let sql = format!("SELECT id, name, icon, description, category, elements_json, CAST(date_creation AS TEXT) FROM {} ORDER BY date_creation DESC", table);

    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut modeles: Vec<Value> = Vec::new();
    for row in rows {
        let elements_json: String = row.try_get(5).unwrap_or_default();
        let elements: Value = serde_json::from_str(&elements_json).unwrap_or(Value::Array(vec![]));
        if !json_value_has_posologie_binding(&elements) {
            continue;
        }
        let id: String = row.try_get(0).unwrap_or_default();
        let name: String = row.try_get(1).unwrap_or_default();
        let icon: String = row.try_get(2).unwrap_or_else(|_| "📄".to_string());
        let description: Option<String> = row.try_get(3).ok().flatten();
        let category: String = row.try_get(4).unwrap_or_else(|_| "administratif".to_string());
        let date_creation: Option<String> = row.try_get(6).ok().flatten();

        modeles.push(json!({
            "id": id,
            "name": name,
            "icon": icon,
            "description": description.unwrap_or_default(),
            "category": category,
            "elements": serde_json::from_str::<Vec<Value>>(&elements_json).unwrap_or_default(),
            "date_creation": date_creation
        }));
    }

    encrypt_response(&json!({ "modeles": modeles }), Some(&get_cript_key()))
}

/// Modèles d’état utilisables pour une ordonnance PDF : catégorie prescription / ordonnance ou variable posologie.
#[tauri::command]
pub async fn list_modeles_etat_ordonnance(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.as_ref().and_then(|b| b.as_object());
    let tab_id = db::sanitize_tab_id(
        p.tab_id
            .as_deref()
            .or_else(|| body.and_then(|o| o.get("tabId")).and_then(|v| v.as_str()))
            .unwrap_or("main"),
    );
    let pays = p
        .pays
        .as_deref()
        .or_else(|| body.and_then(|o| o.get("pays")).and_then(|v| v.as_str()))
        .unwrap_or("sn");

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_modele_etat".to_string();
    let sql = format!("SELECT id, name, icon, description, category, elements_json, CAST(date_creation AS TEXT) FROM {} ORDER BY date_creation DESC", table);

    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut modeles: Vec<Value> = Vec::new();
    for row in rows {
        let elements_json: String = row.try_get(5).unwrap_or_default();
        let elements: Value = serde_json::from_str(&elements_json).unwrap_or(Value::Array(vec![]));
        let category: String = row.try_get(4).unwrap_or_else(|_| "administratif".to_string());
        let cat_lc = category.to_lowercase();
        let ok = cat_lc == "prescription"
            || cat_lc.contains("ordonnance")
            || json_value_has_posologie_binding(&elements);
        if !ok {
            continue;
        }
        let id: String = row.try_get(0).unwrap_or_default();
        let name: String = row.try_get(1).unwrap_or_default();
        let icon: String = row.try_get(2).unwrap_or_else(|_| "📄".to_string());
        let description: Option<String> = row.try_get(3).ok().flatten();
        let date_creation: Option<String> = row.try_get(6).ok().flatten();

        modeles.push(json!({
            "id": id,
            "name": name,
            "icon": icon,
            "description": description.unwrap_or_default(),
            "category": category,
            "elements": serde_json::from_str::<Vec<Value>>(&elements_json).unwrap_or_default(),
            "date_creation": date_creation
        }));
    }

    encrypt_response(&json!({ "modeles": modeles }), Some(&get_cript_key()))
}

// ========== Modèles Page État (tab_modele_etat) ==========

#[tauri::command]
pub async fn list_modeles_etat(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let table = "tab_modele_etat".to_string();
    let sql = format!("SELECT id, name, icon, description, category, elements_json, CAST(date_creation AS TEXT) FROM {} ORDER BY date_creation DESC", table);

    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut modeles: Vec<Value> = Vec::new();
    for row in rows {
        let id: String = row.try_get(0).unwrap_or_default();
        let name: String = row.try_get(1).unwrap_or_default();
        let icon: String = row.try_get(2).unwrap_or_else(|_| "📄".to_string());
        let description: Option<String> = row.try_get(3).ok().flatten();
        let category: String = row.try_get(4).unwrap_or_else(|_| "administratif".to_string());
        let elements_json: String = row.try_get(5).unwrap_or_default();
        let date_creation: Option<String> = row.try_get(6).ok().flatten();

        let elements: Vec<Value> = serde_json::from_str(&elements_json).unwrap_or_default();
        modeles.push(json!({
            "id": id,
            "name": name,
            "icon": icon,
            "description": description.unwrap_or_default(),
            "category": category,
            "elements": elements,
            "date_creation": date_creation
        }));
    }

    encrypt_response(&json!({ "modeles": modeles }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn save_modele_etat(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let name = obj.get("name").and_then(|v| v.as_str()).ok_or("Nom du modèle requis")?;
    let icon = obj.get("icon").and_then(|v| v.as_str()).unwrap_or("📄");
    let description = obj.get("description").and_then(|v| v.as_str()).unwrap_or("");
    let category = obj.get("category").and_then(|v| v.as_str()).unwrap_or("administratif");
    let elements = obj.get("elements").ok_or("Éléments requis")?;
    let elements_json = serde_json::to_string(elements).map_err(|e| format!("JSON éléments: {}", e))?;

    let id = obj.get("id").and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| format!("custom_{}", Uuid::new_v4().to_string()));

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    crate::db_sqlx::ensure_tables_green_sqlx(&mut conn, &tab_id).await?;

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let table = "tab_modele_etat".to_string();

    sqlx::query::<Any>(&format!("INSERT OR REPLACE INTO {} (id, name, icon, description, category, elements_json, date_creation) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", table))
        .bind(&id)
        .bind(name)
        .bind(icon)
        .bind(description)
        .bind(category)
        .bind(&elements_json)
        .bind(&now)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("save_modele_etat: {}", e))?;

    encrypt_response(&json!({ "id": id, "success": true }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn delete_modele_etat(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let id = obj.get("id").and_then(|v| v.as_str()).ok_or("ID du modèle requis")?;
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or(tab_id.as_str());
    verify_db_credentials(obj, &tab_id, pays).await?;
    check_paiement_actif(cabinet_id, &tab_id, pays).await?;

    let mut conn = connect_db(pays, &tab_id, "green").await?;
    let table = "tab_modele_etat".to_string();

    let result = sqlx::query::<Any>(&format!("DELETE FROM {} WHERE id = ?1", table))
        .bind(&id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("delete_modele_etat: {}", e))?;

    encrypt_response(&json!({ "success": result.rows_affected() > 0 }), Some(&get_cript_key()))
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

/// Sous Windows : tente d’ouvrir l’URL dans Microsoft Edge (exécutable connu), sinon laisse échouer.
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

/// Ouvre `mailto:` via les mécanismes Windows (association protocole), pas via le navigateur par défaut.
/// Utile quand Chrome a plusieurs profils et « mange » les ouvertures lancées par certaines APIs.
#[cfg(target_os = "windows")]
fn try_open_mailto_windows_shell(url: &str) -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    // 1) Handler de protocole Windows (souvent plus fiable que l’API utilisée par `opener` avec Chrome)
    let mut r = std::process::Command::new("rundll32.exe");
    r.args(["url.dll,FileProtocolHandler", url]);
    r.creation_flags(CREATE_NO_WINDOW);
    if r.status().map(|s| s.success()).unwrap_or(false) {
        return true;
    }

    // 2) `start "" "<mailto>"` : titre vide obligatoire si l’URL contient des caractères spéciaux
    let mut c = std::process::Command::new("cmd");
    c.args(["/C", "start", "", url]);
    c.creation_flags(CREATE_NO_WINDOW);
    c.status().map(|s| s.success()).unwrap_or(false)
}

/// Ouvre http(s) / mailto dans le navigateur : **Windows** → Microsoft Edge si possible, sinon navigateur par défaut.
#[tauri::command]
pub fn open_external_url_prefer_edge(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !is_allowed_external_url(&url) {
        return Err("URL non autorisée (http, https ou mailto uniquement).".to_string());
    }

    // mailto : ne pas passer par Edge ; sous Windows, éviter le chemin qui ouvre Chrome (multi-profils).
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

/// Retourne l'IP locale de la machine et l'URL front (http://IP:7061)
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

// ========== Paiement Paydunia (PAR = Paiement Avec Redirection) ==========
// Clés PayDunya globales : stockées dans tab_configmain, identiques pour tous les comptes (sadmin → tous les docteurs)
// URLs fixes selon doc PayDunya : pas de config d'URL, test et production ont des endpoints fixes

const PAYDUNYA_CONFIG_TAB: &str = "main";

/// Retourne le statut de paiement pour un cabinet. Utilisé pour bloquer les écritures si lecture_seule ou bloque.
/// - actif : paiement à jour
/// - lecture_seule : expiré depuis 0 à 5 mois (pas de paiement ou expiration récente)
/// - bloque : expiré depuis plus de 5 mois
async fn get_statut_paiement_internal(cabinet_id: &str, tab_id: &str, pays: &str) -> Result<String, String> {
    let mut conn = crate::db_sqlx::connect_admin().await?;
    loop {
        match get_statut_paiement_once(&mut conn, cabinet_id, tab_id, pays).await {
            Ok(s) => return Ok(s),
            Err(e) if e == admin_schema::ADMIN_DECRYPT_FAILED => {
                conn = crate::db_sqlx::recreate_admin_preserving_payments(conn).await?;
            }
            Err(e) => return Err(e),
        }
    }
}

async fn get_statut_paiement_once(conn: &mut sqlx::AnyConnection, cabinet_id: &str, tab_id: &str, pays: &str) -> Result<String, String> {
    crate::db_sqlx::ensure_tables_admin_sqlx(conn, pays, tab_id).await?;
    let schema = admin_schema::load_schema().map_err(|e| e.to_string())?;
    let admin_table = "tab_admin";
    let cabinet_col = schema.col_or_logical("tab_admin", "cabinet_id");
    let date_col = schema.col_or_logical("tab_admin", "date_creation");
    let mois_col = schema.col_or_logical("tab_admin", "nombre_mois");
    let enc_cabinet = schema.encrypt_value("tab_admin", "cabinet_id", cabinet_id)?;
    let sql = format!(
        "SELECT CAST({} AS TEXT), COALESCE({}, 1) FROM {} WHERE {} = ?1 ORDER BY {} DESC LIMIT 1",
        date_col, mois_col, admin_table, cabinet_col, date_col
    );
    let row_opt = sqlx::query::<Any>(&sql)
        .bind(&enc_cabinet)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let row: Option<(String, i64)> = match row_opt {
        Some(r) => {
            let d_enc: String = r.try_get(0).map_err(|e| e.to_string())?;
            let n: i64 = r.try_get(1).unwrap_or(1);
            let d = schema.decrypt_value_or_fail("tab_admin", "date_creation", &d_enc)?;
            Some((d, n))
        }
        None => None,
    };

    let maintenant = chrono::Utc::now();
    let date_ref = if let Some((ref date_creation, nombre_mois)) = row {
        let dt = chrono::NaiveDateTime::parse_from_str(date_creation, "%Y-%m-%d %H:%M:%S")
            .unwrap_or_else(|_| chrono::NaiveDateTime::MIN);
        let base = chrono::DateTime::from_naive_utc_and_offset(dt, chrono::Utc);
        base + chrono::Duration::days(30 * nombre_mois)
    } else {
        // Pas de paiement : période de grâce de 7 jours pour nouveaux docteurs ou cabinets
        let check_grace = |date_creation: &str| -> bool {
            chrono::NaiveDateTime::parse_from_str(date_creation, "%Y-%m-%d %H:%M:%S")
                .ok()
                .map(|dt| {
                    let creation: chrono::DateTime<chrono::Utc> = chrono::DateTime::from_naive_utc_and_offset(dt, chrono::Utc);
                    let grace_end = creation + chrono::Duration::days(7);
                    maintenant < grace_end
                })
                .unwrap_or(false)
        };
        // 1. Date d'inscription de référence (dblaadmin, chiffrée + leurres) — sinon sync depuis tab_docteur
        if let Some(date_creation) = resolve_inscription_date_for_payment(cabinet_id, pays, tab_id).await {
            if check_grace(&date_creation) {
                return Ok("actif".to_string());
            }
        }
        // 2. Cabinet existant (sans docteur) : période de grâce 7 jours après création du cabinet
        if let Ok(mut conn_green) = connect_db(pays, tab_id, "green").await {
            let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, tab_id).await;
            let cabinet_table = "tab_cabinet".to_string();
            let sql_cab = format!("SELECT CAST(date_creation AS TEXT) FROM {} WHERE id = ?1", cabinet_table);
            if let Ok(Some(r)) = sqlx::query::<Any>(&sql_cab).bind(cabinet_id).fetch_optional(&mut conn_green).await {
                if let Ok(date_creation) = r.try_get::<String, _>(0) {
                    if check_grace(&date_creation) {
                        return Ok("actif".to_string());
                    }
                }
            }
        }
        return Ok("lecture_seule".to_string());
    };

    let diff_mois = (maintenant - date_ref).num_seconds() as f64 / (30.0 * 24.0 * 3600.0);
    let statut = if diff_mois > 5.0 {
        "bloque"
    } else if diff_mois > 0.0 {
        "lecture_seule"
    } else {
        "actif"
    };
    Ok(statut.to_string())
}

/// Vérifie que le mode est correct avant toute action modifiant les données.
/// Appelé systématiquement avant chaque écriture, indépendamment du paiement.
/// Bypass pour SAdmin, première connexion, docteur non créé.
async fn check_paiement_actif(cabinet_id: &str, tab_id: &str, pays: &str) -> Result<(), String> {
    if no_payment_expected(cabinet_id, tab_id, pays).await {
        return Ok(());
    }
    let statut = get_statut_paiement_internal(cabinet_id, tab_id, pays).await
        .unwrap_or_else(|_| "lecture_seule".to_string());
    match statut.as_str() {
        "actif" => Ok(()),
        "lecture_seule" => Err("Paiement expiré. Vous êtes en mode lecture seule. Effectuez un paiement pour modifier les données.".to_string()),
        "bloque" => Err("Paiement expiré depuis plus de 5 mois. L'accès aux modifications est bloqué. Effectuez un paiement pour débloquer.".to_string()),
        _ => Err("Statut de paiement inconnu.".to_string()),
    }
}
async fn verifier_statut_paiement_once(
    conn: &mut sqlx::AnyConnection,
    cabinet_id: &str,
    tab_id: &str,
    pays: &str,
) -> Result<Option<(String, i64)>, String> {
    crate::db_sqlx::ensure_tables_admin_sqlx(conn, pays, tab_id).await?;
    let schema = admin_schema::load_schema().map_err(|e| e.to_string())?;
    let admin_table = "tab_admin";
    let cabinet_col = schema.col_or_logical("tab_admin", "cabinet_id");
    let date_col = schema.col_or_logical("tab_admin", "date_creation");
    let mois_col = schema.col_or_logical("tab_admin", "nombre_mois");
    let enc_cabinet = schema.encrypt_value("tab_admin", "cabinet_id", cabinet_id)?;
    let sql = format!(
        "SELECT CAST({} AS TEXT), COALESCE({}, 1) FROM {} WHERE {} = ?1 ORDER BY {} DESC LIMIT 1",
        date_col, mois_col, admin_table, cabinet_col, date_col
    );
    let row_opt = sqlx::query::<Any>(&sql)
        .bind(&enc_cabinet)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let row = match row_opt {
        Some(r) => {
            let d_enc: String = r.try_get(0).map_err(|e| e.to_string())?;
            let n: i64 = r.try_get(1).unwrap_or(1);
            let d = schema.decrypt_value_or_fail("tab_admin", "date_creation", &d_enc)?;
            let _ = crate::last_payment_file::save_last_payment_date(cabinet_id, tab_id, &d);
            Some((d, n))
        }
        None => None,
    };
    Ok(row)
}

async fn recuperer_date_paiement_once(
    conn: &mut sqlx::AnyConnection,
    cabinet_id: &str,
    tab_id: &str,
    pays: &str,
) -> Result<Option<String>, String> {
    crate::db_sqlx::ensure_tables_admin_sqlx(conn, pays, tab_id).await?;
    let schema = admin_schema::load_schema().map_err(|e| e.to_string())?;
    let admin_table = "tab_admin";
    let cabinet_col = schema.col_or_logical("tab_admin", "cabinet_id");
    let date_col = schema.col_or_logical("tab_admin", "date_creation");
    let enc_cabinet = schema.encrypt_value("tab_admin", "cabinet_id", cabinet_id)?;
    let sql = format!(
        "SELECT CAST({} AS TEXT) FROM {} WHERE {} = ?1 ORDER BY {} DESC LIMIT 1",
        date_col, admin_table, cabinet_col, date_col
    );
    let row_opt = sqlx::query::<Any>(&sql)
        .bind(&enc_cabinet)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let date_creation = match row_opt {
        Some(r) => {
            let d_enc: String = r.try_get(0).map_err(|e| e.to_string())?;
            let d = schema.decrypt_value_or_fail("tab_admin", "date_creation", &d_enc)?;
            let _ = crate::last_payment_file::save_last_payment_date(cabinet_id, tab_id, &d);
            Some(d)
        }
        None => None,
    };
    Ok(date_creation)
}

const PAYDUNYA_URL_TEST: &str = "https://app.paydunya.com/sandbox-api/v1/checkout-invoice/create";
const PAYDUNYA_URL_PRODUCTION: &str = "https://app.paydunya.com/api/v1/checkout-invoice/create";
const PAYDUNYA_CONFIRM_TEST: &str = "https://app.paydunya.com/sandbox-api/v1/checkout-invoice/confirm";
const PAYDUNYA_CONFIRM_PRODUCTION: &str = "https://app.paydunya.com/api/v1/checkout-invoice/confirm";

/// URL de base pour return/callback PayDunya (backend sur 7062)
fn paydunya_base_url() -> String {
    local_ip_address::local_ip()
        .map(|ip| format!("http://{}:7062", ip))
        .unwrap_or_else(|_| "http://localhost:7062".to_string())
}

async fn get_paydunya_config_from_db(_tab_id: &str, pays: &str) -> Option<(String, String, String, String)> {
    let mut conn = crate::db_sqlx::connect_admin().await.ok()?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, PAYDUNYA_CONFIG_TAB).await.ok()?;
    let schema = admin_schema::load_schema().ok()?;
    let (key_col, val_col, _) =
        crate::db_sqlx::resolve_tab_config_phys_cols_full(&mut conn, &schema).await.ok()?;

    // Récupérer toutes les lignes PayDunya : tab_config puis tab_configmain (legacy)
    let sql = format!("SELECT {}, {} FROM tab_config", key_col, val_col);
    let mut rows = sqlx::query::<Any>(&sql).fetch_all(&mut conn).await.ok()?;
    if rows.is_empty() {
        let legacy_table = "tab_config".to_string();
        let sql_legacy = format!("SELECT {}, {} FROM {}", key_col, val_col, legacy_table);
        if let Ok(legacy_rows) = sqlx::query::<Any>(&sql_legacy).fetch_all(&mut conn).await {
            rows = legacy_rows;
        }
    }

    let prefix = format!("{}__", PAYDUNYA_CONFIG_TAB);
    let mut mode = String::new();
    let mut cle_principale = String::new();
    let mut test_cle_privee = String::new();
    let mut test_token = String::new();
    let mut live_cle_privee = String::new();
    let mut live_token = String::new();
    for row in rows {
        let k_enc: String = match row.try_get(0) {
            Ok(x) => x,
            Err(_) => continue,
        };
        let k_full = schema.decrypt_value("tab_config", "config_key", &k_enc).unwrap_or_else(|_| schema.decrypt_value_or_raw("tab_config", "config_key", &k_enc));
        if !k_full.contains("paydunya") {
            continue;
        }
        let k = k_full.strip_prefix(&prefix).unwrap_or(&k_full).to_string();
        let v: Option<String> = row.try_get(1).ok().flatten();
        let val_raw = v.unwrap_or_default();
        // 1. Déchiffrement schéma admin (config_value est toujours chiffré en base)
        let val_schema = schema.decrypt_value("tab_config", "config_value", &val_raw).unwrap_or_else(|_| val_raw.clone());
        // 2. Déchiffrement spécifique PayDunya pour les clés sensibles (double couche)
        let decrypted = match k.as_str() {
            "paydunya_cle_principale" | "paydunya_test_cle_publique" | "paydunya_test_cle_privee" | "paydunya_test_token"
            | "paydunya_live_cle_publique" | "paydunya_live_cle_privee" | "paydunya_live_token"
            | "paydunya_test_master_key" | "paydunya_test_private_key" | "paydunya_live_master_key" | "paydunya_live_private_key"
            | "paydunya_master_key" | "paydunya_private_key" | "paydunya_token" => {
                crate::crypto::decrypt_paydunya_key(&val_schema)
            }
            _ => val_schema,
        };
            match k.as_str() {
            "paydunya_mode" => mode = decrypted,
            "paydunya_cle_principale" => cle_principale = decrypted,
            "paydunya_test_master_key" if cle_principale.is_empty() => cle_principale = decrypted.clone(),
            "paydunya_live_master_key" if cle_principale.is_empty() => cle_principale = decrypted.clone(),
            "paydunya_master_key" if cle_principale.is_empty() => cle_principale = decrypted,
            "paydunya_test_cle_privee" => test_cle_privee = decrypted,
            "paydunya_test_private_key" if test_cle_privee.is_empty() => test_cle_privee = decrypted,
            "paydunya_test_token" => test_token = decrypted,
            "paydunya_live_cle_privee" => live_cle_privee = decrypted,
            "paydunya_live_private_key" if live_cle_privee.is_empty() => live_cle_privee = decrypted,
            "paydunya_live_token" => live_token = decrypted,
            "paydunya_private_key" => {
                if test_cle_privee.is_empty() { test_cle_privee = decrypted.clone(); }
                if live_cle_privee.is_empty() { live_cle_privee = decrypted; }
            }
            "paydunya_token" => {
                if test_token.is_empty() { test_token = decrypted.clone(); }
                if live_token.is_empty() { live_token = decrypted; }
            }
            _ => {}
        }
    }
    // Placeholder contenant "REMPLACER" = vide (ne pas utiliser pour l'API)
    let treat_empty = |s: String| if s.to_uppercase().contains("REMPLACER") { String::new() } else { s };
    let use_test = mode.to_lowercase() == "test" || mode.to_lowercase() == "sandbox";
    let (master, private_key, token) = if use_test {
        (treat_empty(cle_principale), treat_empty(test_cle_privee), treat_empty(test_token))
    } else {
        (treat_empty(cle_principale), treat_empty(live_cle_privee), treat_empty(live_token))
    };
    if !master.is_empty() && !private_key.is_empty() && !token.is_empty() {
        let url = if use_test {
            PAYDUNYA_URL_TEST.to_string()
            } else {
            PAYDUNYA_URL_PRODUCTION.to_string()
            };
        Some((master, url, private_key, token))
    } else {
        None
    }
}

async fn get_paydunya_config(tab_id: &str, pays: &str) -> (String, String, String, String) {
    if let Some(cfg) = get_paydunya_config_from_db(tab_id, pays).await {
        return cfg;
    }
    let mode = std::env::var("PAYDUNYA_MODE").unwrap_or_else(|_| "test".to_string());
    let use_test = mode.to_lowercase() == "test" || mode.to_lowercase() == "sandbox";
    let (master, private_key, token) = if use_test {
        (
            std::env::var("PAYDUNIA_MASTER_KEY").or_else(|_| std::env::var("PAYDUNIA_TEST_MASTER_KEY")).unwrap_or_default(),
            std::env::var("PAYDUNIA_TEST_PRIVATE_KEY").unwrap_or_default(),
            std::env::var("PAYDUNIA_TEST_TOKEN").unwrap_or_default(),
        )
    } else {
        (
            std::env::var("PAYDUNIA_MASTER_KEY").or_else(|_| std::env::var("PAYDUNIA_PRODUCTION_MASTER_KEY")).unwrap_or_default(),
            std::env::var("PAYDUNIA_PRODUCTION_PRIVATE_KEY").unwrap_or_default(),
            std::env::var("PAYDUNIA_PRODUCTION_TOKEN").unwrap_or_default(),
        )
    };
    let url = if use_test {
        PAYDUNYA_URL_TEST.to_string()
    } else {
        PAYDUNYA_URL_PRODUCTION.to_string()
    };
    (master, url, private_key, token)
}

/// Vérifie le statut d'une facture PayDunya via l'API confirm (sandbox ou live).
async fn paydunya_confirm_invoice(token: &str, use_test: bool, master: &str, private_key: &str, pay_token: &str) -> Result<Value, String> {
    let confirm_url = if use_test {
        format!("{}/{}", PAYDUNYA_CONFIRM_TEST, token)
    } else {
        format!("{}/{}", PAYDUNYA_CONFIRM_PRODUCTION, token)
    };
    let client = reqwest::Client::new();
    let res = client
        .get(&confirm_url)
        .header("PAYDUNYA-MASTER-KEY", master.trim())
        .header("PAYDUNYA-PRIVATE-KEY", private_key.trim())
        .header("PAYDUNYA-TOKEN", pay_token.trim())
        .send()
        .await
        .map_err(|e| format!("Erreur vérification PayDunya: {}", e))?;
    let res_json: Value = res.json().await.map_err(|e| format!("Réponse PayDunya: {}", e))?;
    Ok(res_json)
}

/// Enregistre un paiement confirmé dans tab_admin et last_payment_file.
async fn paydunya_record_payment(
    cabinet_id: &str,
    tab_id: &str,
    pays: &str,
    nombre_mois: i64,
    montant: f64,
    type_paiement: &str,
) -> Result<(), String> {
    let today = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = crate::last_payment_file::save_last_payment_date(cabinet_id, tab_id, &today);

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, tab_id).await?;
    let schema = admin_schema::load_schema().map_err(|e| e.to_string())?;
    let admin_table = "tab_admin";
    let cols = admin_schema::TAB_ADMIN_COLS;
    let ins = schema.insert_cols("tab_admin", cols);
    let id = uuid::Uuid::new_v4().to_string();
    let enc_id = schema.encrypt_value("tab_admin", "id", &id)?;
    let enc_cab = schema.encrypt_value("tab_admin", "cabinet_id", cabinet_id)?;
    let enc_dc = schema.encrypt_value("tab_admin", "date_creation", &today)?;
    let enc_n = schema.encrypt_value("tab_admin", "nombre_mois", &nombre_mois.to_string())?;
    let enc_m = schema.encrypt_value("tab_admin", "montant", &montant.to_string())?;
    let enc_tp = schema.encrypt_value("tab_admin", "type_paiement", type_paiement)?;
    let enc_url = schema.encrypt_value("tab_admin", "url_pdf", "")?;
    let enc_logg = schema.encrypt_value("tab_admin", "logg_id", tab_id)?;
    let sql = format!("INSERT OR REPLACE INTO {} ({}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)", admin_table, ins);
    sqlx::query::<Any>(&sql)
        .bind(&enc_id)
        .bind(&enc_cab)
        .bind(&enc_url)
        .bind(&enc_logg)
        .bind(&enc_dc)
        .bind(&enc_n)
        .bind(&enc_m)
        .bind(&enc_tp)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Enregistrement paiement: {}", e))?;
    Ok(())
}

/// Traite le retour/callback PayDunya : vérifie le statut et enregistre si completed.
pub async fn paydunya_handle_return_or_callback(token: &str, data_json: Option<&str>) -> Result<bool, String> {
    let (master, url, private_key, pay_token) = get_paydunya_config("main", "sn").await;
    if master.is_empty() || private_key.is_empty() || pay_token.is_empty() {
        return Err("Configuration PayDunya incomplète".to_string());
    }

    let res_json: Value = if let Some(data_str) = data_json {
        serde_json::from_str(data_str).map_err(|e| format!("Parse callback data: {}", e))?
    } else {
        let use_test = url.contains("sandbox");
        paydunya_confirm_invoice(token, use_test, &master, &private_key, &pay_token).await?
    };

    let res_code = res_json.get("response_code").and_then(|v| v.as_str()).unwrap_or("");
    if res_code != "00" {
        return Ok(false);
    }
    let status = res_json.get("status").and_then(|v| v.as_str()).unwrap_or("");
    if status.to_lowercase() != "completed" {
        return Ok(false);
    }

    let custom_data = res_json.get("custom_data").and_then(|v| v.as_object());
    let (cabinet_id, tab_id, nombre_mois, montant, type_paiement) = if let Some(lp) = custom_data.and_then(|c| c.get("lp")).and_then(|v| v.as_object()) {
        let docteur = lp.get("docteur").and_then(|v| v.as_object());
        let cabinet_id = docteur.and_then(|d| d.get("id")).and_then(|v| v.as_str()).unwrap_or("");
        let tab_id = docteur.and_then(|d| d.get("loggId")).and_then(|v| v.as_str())
            .or_else(|| docteur.and_then(|d| d.get("id")).and_then(|v| v.as_str()))
            .unwrap_or("main");
        let nombre_mois = lp.get("nombreMois").and_then(|v| v.as_i64()).unwrap_or(1);
        let montant = lp.get("montantTotal").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let type_paiement = lp.get("typePaiement").and_then(|v| v.as_str()).unwrap_or("mensuel");
        (cabinet_id.to_string(), tab_id.to_string(), nombre_mois, montant, type_paiement.to_string())
    } else if let Some(cab) = custom_data.and_then(|c| c.get("cabinet_id")).and_then(|v| v.as_str()) {
        let tab = custom_data.and_then(|c| c.get("tab_id")).and_then(|v| v.as_str()).unwrap_or("main");
        (cab.to_string(), tab.to_string(), 1, 50000.0, "frais_reparation_corruption".to_string())
    } else {
        return Ok(false);
    };

    let tab_sanitized = db::sanitize_tab_id(&tab_id);
    paydunya_record_payment(&cabinet_id, &tab_sanitized, "sn", nombre_mois, montant, &type_paiement).await?;
    Ok(true)
}

/// Retourne true si l'absence de date de paiement est attendue (SAdmin, 1ère connexion, docteur non créé).
async fn no_payment_expected(cabinet_id: &str, tab_id: &str, pays: &str) -> bool {
    if cabinet_id.is_empty() || cabinet_id == "sadmin" {
        return true;
    }
    if let Ok(mut conn) = connect_db(pays, tab_id, "yellow").await {
        let docteur_table = "tab_docteur".to_string();
        let sql = format!("SELECT 1 FROM {} WHERE id = ?1 LIMIT 1", docteur_table);
        if let Ok(Some(_)) = sqlx::query::<Any>(&sql).bind(cabinet_id).fetch_optional(&mut conn).await {
            return false; // docteur existe, on peut attendre un paiement
        }
    }
    true // docteur inexistant ou impossible de vérifier -> pas de corruption
}

#[tauri::command]
pub async fn verifier_statut_paiement(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let cabinet_id = p.id.as_deref().unwrap_or("").to_string();
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut row: Option<(String, i64)> = None;
    if let Ok(mut conn) = crate::db_sqlx::connect_admin().await {
        loop {
            match verifier_statut_paiement_once(&mut conn, &cabinet_id, &tab_id, pays).await {
                Ok(r) => { row = r; break; }
                Err(e) if e == admin_schema::ADMIN_DECRYPT_FAILED => {
                    conn = crate::db_sqlx::recreate_admin_preserving_payments(conn).await?;
                }
                Err(_) => break,
            }
        }
    }
    if row.is_none() {
        if let Ok((fcab, ftab, fdate)) = crate::last_payment_file::read_last_payment_date() {
            if (cabinet_id.is_empty() || fcab == cabinet_id) && ftab == tab_id && !fdate.is_empty() {
                row = Some((fdate, 1));
            }
        }
    }
    // Pas de corruption si : SAdmin, 1ère connexion, ou docteur non créé
    if row.is_none() && crate::last_payment_file::read_last_payment_date().is_err() {
        if no_payment_expected(&cabinet_id, &tab_id, pays).await {
            // Cas normal : pas de date de paiement attendue
        } else {
            return Err(CORRUPTION_DETECTED.to_string());
        }
    }

    // Pas de paiement enregistré : période de grâce 7 jours (docteur ou cabinet) ou lecture_seule
    if row.is_none() {
        let mut in_grace = false;
        let mut date_ref = chrono::Utc::now();
        let check_grace = |date_creation: &str| -> bool {
            chrono::NaiveDateTime::parse_from_str(date_creation, "%Y-%m-%d %H:%M:%S")
                .ok()
                .map(|dt| {
                    let creation: chrono::DateTime<chrono::Utc> = chrono::DateTime::from_naive_utc_and_offset(dt, chrono::Utc);
                    let grace_end = creation + chrono::Duration::days(7);
                    chrono::Utc::now() < grace_end
                })
                .unwrap_or(false)
        };
        if let Some(dc) = resolve_inscription_date_for_payment(&cabinet_id, pays, &tab_id).await {
            if check_grace(&dc) {
                in_grace = true;
                if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&dc, "%Y-%m-%d %H:%M:%S") {
                    date_ref = chrono::DateTime::from_naive_utc_and_offset(dt, chrono::Utc) + chrono::Duration::days(7);
                }
            }
        }
        if !in_grace && cabinet_id != "sadmin" && !cabinet_id.is_empty() {
            if let Ok(mut conn_green) = connect_db(pays, &tab_id, "green").await {
                let _ = crate::db_sqlx::ensure_tables_green_sqlx(&mut conn_green, &tab_id).await;
                let cabinet_table = "tab_cabinet".to_string();
                let sql_cab = format!("SELECT CAST(date_creation AS TEXT) FROM {} WHERE id = ?1", cabinet_table);
                if let Ok(Some(r)) = sqlx::query::<Any>(&sql_cab).bind(&cabinet_id).fetch_optional(&mut conn_green).await {
                    if let Ok(dc) = r.try_get::<String, _>(0) {
                        if check_grace(&dc) {
                            in_grace = true;
                            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&dc, "%Y-%m-%d %H:%M:%S") {
                                date_ref = chrono::DateTime::from_naive_utc_and_offset(dt, chrono::Utc) + chrono::Duration::days(7);
                            }
                        }
                    }
                }
            }
        }
        let statut = if in_grace { "actif" } else { "lecture_seule" };
        let result = json!({
            "statut": statut,
            "dateReference": date_ref.to_rfc3339(),
            "moisDepuisExpiration": 0.0,
            "derniereDatePaiement": Value::Null
        });
        return encrypt_response(&result, Some(&get_cript_key()));
    }

    let maintenant = chrono::Utc::now();
    let mut date_ref = maintenant;

    if let Some((ref date_creation, nombre_mois)) = row {
        let dt = chrono::NaiveDateTime::parse_from_str(date_creation, "%Y-%m-%d %H:%M:%S")
            .unwrap_or_else(|_| chrono::NaiveDateTime::MIN);
        date_ref = chrono::DateTime::from_naive_utc_and_offset(dt, chrono::Utc);
        date_ref = date_ref + chrono::Duration::days(30 * nombre_mois);
    } else if let Some(date_creation) = resolve_inscription_date_for_payment(&cabinet_id, pays, &tab_id).await {
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&date_creation, "%Y-%m-%d %H:%M:%S") {
                let creation = chrono::DateTime::from_naive_utc_and_offset(dt, chrono::Utc);
                let grace_end = creation + chrono::Duration::days(7);
                if maintenant < grace_end {
                    date_ref = grace_end;
                } else {
                    date_ref = creation + chrono::Duration::days(30);
                }
            }
        } else {
            date_ref = maintenant - chrono::Duration::days(180);
    }

    let diff_mois = (maintenant - date_ref).num_seconds() as f64 / (30.0 * 24.0 * 3600.0);
    let statut = if diff_mois > 5.0 {
        "bloque"
    } else if diff_mois > 0.0 {
        "lecture_seule"
    } else {
        "actif"
    };

    let derniere = row.as_ref().map(|r| json!({"date_creation": &r.0, "nombre_mois": r.1}));
    let result = json!({
        "statut": statut,
        "dateReference": date_ref.to_rfc3339(),
        "moisDepuisExpiration": diff_mois.max(0.0),
        "derniereDatePaiement": derniere
    });
    encrypt_response(&result, Some(&get_cript_key()))
}

#[tauri::command]
pub async fn recuperer_date_paiement(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let cabinet_id = p.id.as_deref().unwrap_or("").to_string();
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    let mut date_creation: Option<String> = None;
    if let Ok(mut conn) = crate::db_sqlx::connect_admin().await {
        loop {
            match recuperer_date_paiement_once(&mut conn, &cabinet_id, &tab_id, pays).await {
                Ok(d) => { date_creation = d; break; }
                Err(e) if e == admin_schema::ADMIN_DECRYPT_FAILED => {
                    conn = crate::db_sqlx::recreate_admin_preserving_payments(conn).await?;
                }
                Err(_) => break,
            }
        }
    }
    if date_creation.is_none() {
        if let Ok((fcab, ftab, fdate)) = crate::last_payment_file::read_last_payment_date() {
            if (cabinet_id.is_empty() || fcab == cabinet_id) && ftab == tab_id && !fdate.is_empty() {
                date_creation = Some(fdate);
            }
        }
    }
    // Pas de corruption si : SAdmin, 1ère connexion, ou docteur non créé
    if date_creation.is_none() && crate::last_payment_file::read_last_payment_date().is_err() {
        if no_payment_expected(&cabinet_id, &tab_id, pays).await {
            // Cas normal : pas de date de paiement attendue
        } else {
            return Err(CORRUPTION_DETECTED.to_string());
        }
    }

    if let Some(dc) = date_creation {
        return encrypt_response(&json!({ "date_creation": dc, "cabinet_id": cabinet_id }), Some(&get_cript_key()));
    }

    // Pas de paiement enregistré : prochaine échéance logique (fin d’essai 7 j ou +30 j), pas « aujourd’hui »
    let maintenant = chrono::Utc::now();
    if let Some(dc_ins) = resolve_inscription_date_for_payment(&cabinet_id, pays, &tab_id).await {
        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&dc_ins, "%Y-%m-%d %H:%M:%S") {
            let creation: chrono::DateTime<chrono::Utc> =
                chrono::DateTime::from_naive_utc_and_offset(dt, chrono::Utc);
            let grace_end = creation + chrono::Duration::days(7);
            let next = if maintenant < grace_end {
                grace_end
            } else {
                creation + chrono::Duration::days(30)
            };
            let s = next.format("%Y-%m-%d %H:%M:%S").to_string();
            return encrypt_response(&json!({ "date_creation": s, "cabinet_id": cabinet_id }), Some(&get_cript_key()));
        }
    }
    let fallback = (maintenant + chrono::Duration::days(7)).format("%Y-%m-%d %H:%M:%S").to_string();
    encrypt_response(&json!({ "date_creation": fallback, "cabinet_id": cabinet_id }), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn payer_paydunya(payload: String) -> Result<Value, String> {
    // Garde-temps PayDunya : vérification avant tout paiement
    match paydunya_time_guard::check_and_update().await {
        Ok((can_use, _status, msg)) => {
            if !can_use {
                return Err(format!(
                    "PayDunya temporairement indisponible. {}",
                    msg
                ));
            }
        }
        Err(e) => {
            log::warn!("[PayDunya] Erreur garde-temps: {}", e);
            return Err("Vérification de sécurité PayDunya indisponible. Réessayez plus tard.".to_string());
        }
    }

    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let docteur = obj.get("docteur").and_then(|v| v.as_object()).ok_or("docteur manquant")?;
    let _privileges = obj.get("privileges").and_then(|v| v.as_array());
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");

    let tab_id = docteur.get("role").and_then(|v| v.as_str()).map(|r| if r == "docteur" { docteur.get("id").and_then(|v| v.as_str()).unwrap_or("main") } else { docteur.get("loggId").and_then(|v| v.as_str()).unwrap_or("main") }).unwrap_or("main");
    let cabinet_id = docteur.get("id").and_then(|v| v.as_str()).unwrap_or("");

    let tab_sanitized = db::sanitize_tab_id(tab_id);
    let mut conn = crate::db_sqlx::connect_admin().await?;
    loop {
        match crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_sanitized).await {
            Ok(()) => break,
            Err(e) if e.contains("Déchiffrement") => {
                conn = crate::db_sqlx::recreate_admin_preserving_payments(conn).await?;
            }
            Err(e) => return Err(e),
        }
    }

    let schema = admin_schema::load_schema().map_err(|e| e.to_string())?;
    let admin_table = "tab_admin";
    let cabinet_col = schema.col_or_logical("tab_admin", "cabinet_id");
    let date_col = schema.col_or_logical("tab_admin", "date_creation");
    let enc_cabinet = schema.encrypt_value("tab_admin", "cabinet_id", cabinet_id)?;
    let sql = format!("SELECT {} FROM {} WHERE {} = ?1 ORDER BY {} DESC LIMIT 1", date_col, admin_table, cabinet_col, date_col);
    let est_premier = sqlx::query::<Any>(&sql)
        .bind(&enc_cabinet)
        .fetch_optional(&mut conn)
        .await
        .ok()
        .flatten()
        .is_none();

    let prix_mensuel_ref: i64 = std::env::var("PAYDUNIA_PRODUIT_PRIX_MENSUEL")
        .unwrap_or_else(|_| "100000".to_string())
        .parse()
        .unwrap_or(100_000);
    // Renouvellement « tout d’un coup » (12 mois) : 12 × mensuel, sauf si PAYDUNIA_PRODUIT_PRIX est défini (montant total annuel explicite).
    let prix_annuel: i64 = std::env::var("PAYDUNIA_PRODUIT_PRIX")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(prix_mensuel_ref.saturating_mul(12));
    let prix_inscription: i64 = std::env::var("PAYDUNIA_PRODUIT_PRIX_INSCRIPTION")
        .unwrap_or_else(|_| "150000".to_string())
        .parse()
        .unwrap_or(150_000);
    let _monaie = std::env::var("PAYDUNIA_PRODUIT_MONNAIE").unwrap_or_else(|_| "XOF".to_string());
    let prix = if est_premier { prix_inscription } else { prix_annuel };
    let description = if est_premier { "Paiement d'inscription à LoggAppro" } else { "Paiement annuel LoggAppro" };

    let (master, url, private_key, token) = get_paydunya_config(&tab_sanitized, pays).await;
    if url.is_empty() || private_key.is_empty() || token.is_empty() {
        return Err("Configuration Paydunia incomplète. Configurez les clés API dans Autres Pages > Configuration API.".to_string());
    }

    let store_nom = std::env::var("PAYDUNIA_STORE_NOM").unwrap_or_else(|_| "LoggAppro".to_string());
    let vendeur_nom = docteur.get("nom").and_then(|v| v.as_str()).unwrap_or("Client");
    let vendeur_email = docteur.get("email").and_then(|v| v.as_str()).unwrap_or("");
    let vendeur_tel = docteur.get("telephone").and_then(|v| v.as_str()).unwrap_or("");

    let base_url = paydunya_base_url();
    let return_url = format!("{}/api/paydunya/return", base_url);
    let callback_url = format!("{}/api/paydunya/callback", base_url);
    let nombre_mois = if est_premier { 1 } else { 12 };
    let type_paiement = if est_premier { "inscription" } else { "annuel" };

    // Format PayDunya PAR avec return_url et callback_url pour validation automatique
    let invoice = json!({
        "items": {"item_0": {"name": description, "quantity": 1, "unit_price": prix.to_string(), "total_price": prix.to_string(), "description": description}},
        "total_amount": prix,
        "description": description,
        "customer": {"name": vendeur_nom, "email": vendeur_email, "phone": vendeur_tel}
    });
    let store = json!({"name": store_nom, "tagline": "informatique"});
    let custom_data = json!({
        "customer_name": vendeur_nom,
        "customer_email": vendeur_email,
        "lp": {"docteur": docteur, "nombreMois": nombre_mois, "montantTotal": prix, "typePaiement": type_paiement}
    });
    let actions = json!({
        "return_url": return_url,
        "callback_url": callback_url
    });
    let body_req = json!({
        "invoice": invoice,
        "store": store,
        "custom_data": custom_data,
        "actions": actions
    });

    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("PAYDUNYA-MASTER-KEY", master.trim())
        .header("PAYDUNYA-PRIVATE-KEY", private_key.trim())
        .header("PAYDUNYA-TOKEN", token.trim())
        .json(&body_req)
        .send()
        .await
        .map_err(|e| format!("Erreur Paydunya: {}", e))?;

    let res_json: Value = res.json().await.map_err(|e| format!("Réponse Paydunya: {}", e))?;
    let code = res_json.get("response_code").and_then(|v| v.as_str()).unwrap_or("");
    let url_paiement = res_json.get("response_text").and_then(|v| v.as_str()).unwrap_or("");

    if code == "00" && !url_paiement.is_empty() {
        let _ = paydunya_time_guard::register_usage();
        encrypt_response(&json!({ "urlDePaiement": url_paiement }), Some(&get_cript_key()))
    } else {
        Err(res_json.get("response_text").and_then(|v| v.as_str()).unwrap_or("Erreur Paydunya").to_string())
    }
}

#[tauri::command]
pub async fn payer_paydunya_mensuel(payload: String) -> Result<Value, String> {
    // Garde-temps PayDunya : vérification avant tout paiement
    match paydunya_time_guard::check_and_update().await {
        Ok((can_use, _status, msg)) => {
            if !can_use {
                return Err(format!(
                    "PayDunya temporairement indisponible. {}",
                    msg
                ));
            }
        }
        Err(e) => {
            log::warn!("[PayDunya] Erreur garde-temps: {}", e);
            return Err("Vérification de sécurité PayDunya indisponible. Réessayez plus tard.".to_string());
        }
    }

    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let docteur = obj.get("docteur").and_then(|v| v.as_object()).ok_or("docteur manquant")?;
    let _privileges = obj.get("privileges").and_then(|v| v.as_array());
    let nombre_mois: i64 = obj.get("nombreMois").and_then(|v| v.as_i64()).unwrap_or(1);
    let montant_total: i64 = obj.get("montantTotal").and_then(|v| v.as_i64()).unwrap_or(0);
    let type_paiement = obj.get("typePaiement").and_then(|v| v.as_str()).unwrap_or("mensuel");
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");

    if nombre_mois < 1 || nombre_mois > 12 || montant_total <= 0 {
        return Err("nombreMois (1-12) et montantTotal > 0 requis".to_string());
    }

    let tab_id = docteur.get("role").and_then(|v| v.as_str()).map(|r| if r == "docteur" { docteur.get("id").and_then(|v| v.as_str()).unwrap_or("main") } else { docteur.get("loggId").and_then(|v| v.as_str()).unwrap_or("main") }).unwrap_or("main");
    let _monaie = std::env::var("PAYDUNIA_PRODUIT_MONNAIE").unwrap_or_else(|_| "XOF".to_string());
    let description = if type_paiement == "inscription" {
        format!("Paiement d'inscription LoggAppro + {} mois", nombre_mois)
    } else {
        format!("Paiement de {} mois LoggAppro", nombre_mois)
    };

    let tab_sanitized = db::sanitize_tab_id(tab_id);
    let (master, url, private_key, token) = get_paydunya_config(&tab_sanitized, pays).await;
    if url.is_empty() || private_key.is_empty() || token.is_empty() {
        return Err("Configuration Paydunia incomplète. Configurez les clés API dans Autres Pages > Configuration API.".to_string());
    }

    let store_nom = std::env::var("PAYDUNIA_STORE_NOM").unwrap_or_else(|_| "LoggAppro".to_string());
    let vendeur_nom = docteur.get("nom").and_then(|v| v.as_str()).unwrap_or("Client");
    let vendeur_email = docteur.get("email").and_then(|v| v.as_str()).unwrap_or("");
    let vendeur_tel = docteur.get("telephone").and_then(|v| v.as_str()).unwrap_or("");

    let item_name = if type_paiement == "inscription" {
        "Inscription + Abonnement LoggAppro"
    } else {
        "Abonnement LoggAppro"
    };
    let base_url = paydunya_base_url();
    let return_url = format!("{}/api/paydunya/return", base_url);
    let callback_url = format!("{}/api/paydunya/callback", base_url);

    let invoice = json!({
        "items": {"item_0": {"name": item_name, "quantity": 1, "unit_price": montant_total.to_string(), "total_price": montant_total.to_string(), "description": description}},
        "total_amount": montant_total,
        "description": description,
        "customer": {"name": vendeur_nom, "email": vendeur_email, "phone": vendeur_tel}
    });
    let store = json!({"name": store_nom, "tagline": "informatique"});
    let custom_data = json!({
        "customer_name": vendeur_nom,
        "customer_email": vendeur_email,
        "lp": {"docteur": docteur, "nombreMois": nombre_mois, "montantTotal": montant_total, "typePaiement": type_paiement}
    });
    let actions = json!({
        "return_url": return_url,
        "callback_url": callback_url
    });
    let body_req = json!({
        "invoice": invoice,
        "store": store,
        "custom_data": custom_data,
        "actions": actions
    });

    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("PAYDUNYA-MASTER-KEY", master.trim())
        .header("PAYDUNYA-PRIVATE-KEY", private_key.trim())
        .header("PAYDUNYA-TOKEN", token.trim())
        .json(&body_req)
        .send()
        .await
        .map_err(|e| format!("Erreur Paydunya: {}", e))?;

    let res_json: Value = res.json().await.map_err(|e| format!("Réponse Paydunya: {}", e))?;
    let code = res_json.get("response_code").and_then(|v| v.as_str()).unwrap_or("");
    let url_paiement = res_json.get("response_text").and_then(|v| v.as_str()).unwrap_or("");

    if code == "00" && !url_paiement.is_empty() {
        let _ = paydunya_time_guard::register_usage();
        encrypt_response(&json!({ "urlDePaiement": url_paiement }), Some(&get_cript_key()))
    } else {
        Err(res_json.get("response_text").and_then(|v| v.as_str()).unwrap_or("Erreur Paydunya").to_string())
    }
}

// ========== Commandes garde-temps PayDunya (interface frontend) ==========

#[tauri::command]
pub async fn paydunya_can_use() -> Result<Value, String> {
    match paydunya_time_guard::check_and_update().await {
        Ok((can_use, status, msg)) => Ok(json!({
            "canUse": can_use,
            "status": format!("{:?}", status),
            "message": msg
        })),
        Err(e) => Ok(json!({
            "canUse": false,
            "status": "ERROR",
            "message": e
        })),
    }
}

#[tauri::command]
pub fn paydunya_get_status() -> Result<Value, String> {
    match paydunya_time_guard::get_status() {
        Ok((status, state)) => Ok(json!({
            "status": format!("{:?}", status),
            "firstUseAt": state.first_use_at,
            "lastSeenAt": state.last_seen_at,
            "lastServerAt": state.last_server_at,
            "anomalyCount": state.anomaly_count
        })),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn paydunya_register_usage() -> Result<(), String> {
    paydunya_time_guard::register_usage()
}

#[tauri::command]
pub async fn paydunya_sync_time() -> Result<Value, String> {
    match paydunya_time_guard::check_and_update().await {
        Ok((can_use, status, msg)) => Ok(json!({
            "success": true,
            "canUse": can_use,
            "status": format!("{:?}", status),
            "message": msg
        })),
        Err(e) => Ok(json!({
            "success": false,
            "canUse": false,
            "message": e
        })),
    }
}

// ========== Config API (clés PayDunya, etc.) ==========

#[tauri::command]
pub fn get_default_databases_dir() -> Result<String, String> {
    let path = db::get_databases_dir();
    Ok(path.to_string_lossy().to_string())
}

/// Vide toutes les bases de données en supprimant les fichiers .db du répertoire databases.
/// À appeler avec l'application fermée pour éviter les erreurs de fichier verrouillé.
/// Réservé Sadmin.
#[tauri::command]
pub async fn vider_bases_donnees(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    verify_sadmin_only(obj, "main", "sn").await?;

    use std::fs;
    let dir = db::get_databases_dir();
    if !dir.exists() {
        return Ok(json!({ "success": true, "deleted": 0, "message": "Aucun répertoire databases trouvé" }));
    }
    let mut deleted = 0u32;
    let mut errors = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "db") {
                // Supprimer d'abord les fichiers WAL et SHM associés (SQLite)
                if let Some(stem) = path.file_stem() {
                    let wal = dir.join(format!("{}.db-wal", stem.to_string_lossy()));
                    let shm = dir.join(format!("{}.db-shm", stem.to_string_lossy()));
                    let _ = fs::remove_file(&wal);
                    let _ = fs::remove_file(&shm);
                }
                if let Err(e) = fs::remove_file(&path) {
                    errors.push(format!("{}: {}", path.display(), e));
                } else {
                    deleted += 1;
                }
            }
        }
    }
    if errors.is_empty() {
        Ok(json!({ "success": true, "deleted": deleted, "message": format!("{} fichier(s) supprimé(s)", deleted) }))
    } else {
        Err(format!("Erreurs: {}", errors.join("; ")))
    }
}

/// Exécute une requête SQL sur une base configurée (Sadmin uniquement).
/// Supporte SQLite, MySQL, PostgreSQL selon la config. SQL Server non supporté par SQLx.
#[tauri::command]
pub async fn execute_sql(payload: String) -> Result<Value, String> {
    use sqlx::any::Any;
    use sqlx::Row;

    let p = parse_or_empty(&payload);
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    let db_color = obj.get("dbColor").and_then(|v| v.as_str()).unwrap_or("admin");

    verify_sadmin_only(obj, &tab_id, pays).await?;

    let query = obj.get("query").and_then(|v| v.as_str()).ok_or("query manquant")?.trim();

    let mut conn = crate::db_sqlx::connect_db_async(pays, &tab_id, db_color).await?;

    let start = std::time::Instant::now();
    let upper = query.to_uppercase();

    let (rows, affected_rows) = if upper.trim_start().starts_with("SELECT") || upper.trim_start().starts_with("PRAGMA") || upper.trim_start().starts_with("WITH") {
        let sqlx_rows = sqlx::query::<Any>(query).fetch_all(&mut conn).await.map_err(|e| format!("SQL: {}", e))?;
        let mut rows_vec: Vec<serde_json::Map<String, Value>> = Vec::new();
        for row in sqlx_rows {
            let mut map = serde_json::Map::new();
            let columns = row.columns();
            for (i, col) in columns.iter().enumerate() {
                let name = col.name.to_string();
                let v: Value = if let Ok(x) = row.try_get::<Option<i64>, _>(i) {
                    x.map(|n| json!(n)).unwrap_or(Value::Null)
                } else if let Ok(x) = row.try_get::<Option<f64>, _>(i) {
                    x.map(|n| json!(n)).unwrap_or(Value::Null)
                } else if let Ok(x) = row.try_get::<Option<String>, _>(i) {
                    x.map(|s| json!(s)).unwrap_or(Value::Null)
                } else if let Ok(x) = row.try_get::<Option<Vec<u8>>, _>(i) {
                    x.map(|b| json!(BASE64.encode(&b))).unwrap_or(Value::Null)
                } else {
                    Value::Null
                };
                map.insert(name, v);
            }
            rows_vec.push(map);
        }
        (Some(rows_vec), None)
    } else {
        let result = sqlx::query::<Any>(query).execute(&mut conn).await.map_err(|e| format!("SQL: {}", e))?;
        let n = result.rows_affected() as i64;
        (None, Some(n))
    };

    let execution_time = start.elapsed().as_millis() as u64;

    let mut out = serde_json::Map::new();
    out.insert("executionTime".to_string(), json!(execution_time));
    if let Some(r) = rows {
        out.insert("rows".to_string(), json!(r));
    }
    if let Some(a) = affected_rows {
        out.insert("affectedRows".to_string(), json!(a));
    }

    Ok(Value::Object(out))
}

#[tauri::command]
pub async fn get_app_config(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    verify_db_credentials(obj, &tab_id, pays).await?;

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, PAYDUNYA_CONFIG_TAB).await?;

    let paydunya_key_names = [
        "paydunya_cle_principale", "paydunya_test_cle_publique", "paydunya_test_cle_privee", "paydunya_test_token",
        "paydunya_live_cle_publique", "paydunya_live_cle_privee", "paydunya_live_token",
        "paydunya_test_master_key", "paydunya_test_private_key", "paydunya_live_master_key", "paydunya_live_private_key",
        "paydunya_master_key", "paydunya_private_key", "paydunya_token",
    ];
    let mut config: serde_json::Map<String, Value> = serde_json::Map::new();

    let schema = admin_schema::load_schema().map_err(|e| e.to_string())?;
    let (key_col, val_col, _) =
        crate::db_sqlx::resolve_tab_config_phys_cols_full(&mut conn, &schema).await?;

    // Charger config du tab (bases, etc.) - clés tab_id__key
    let tab_keys = [
        "db_type", "db_path",
        "db_type_yellow", "db_path_yellow", "db_host_yellow", "db_port_yellow", "db_name_yellow", "db_user_yellow", "db_password_yellow", "db_ssl_yellow", "db_schema_yellow",
        "db_type_green", "db_path_green", "db_host_green", "db_port_green", "db_name_green", "db_user_green", "db_password_green", "db_ssl_green", "db_schema_green",
        "db_type_blue", "db_path_blue", "db_host_blue", "db_port_blue", "db_name_blue", "db_user_blue", "db_password_blue", "db_ssl_blue", "db_schema_blue",
        "db_type_orange", "db_path_orange", "db_host_orange", "db_port_orange", "db_name_orange", "db_user_orange", "db_password_orange", "db_ssl_orange", "db_schema_orange",
        "db_type_pink", "db_path_pink", "db_host_pink", "db_port_pink", "db_name_pink", "db_user_pink", "db_password_pink", "db_ssl_pink", "db_schema_pink",
    ];
    let tab_full_keys: Vec<String> = tab_keys.iter().map(|k| format!("{}__{}", tab_id, *k)).collect();
    let enc_tab_keys: Vec<String> = tab_full_keys.iter().filter_map(|k| schema.encrypt_value("tab_config", "config_key", k).ok()).collect();
    if !enc_tab_keys.is_empty() {
        let in_clause = enc_tab_keys.iter().map(|k| format!("'{}'", k.replace('\'', "''"))).collect::<Vec<_>>().join(", ");
        let sql = format!("SELECT {}, {} FROM tab_config WHERE {} IN ({})", key_col, val_col, key_col, in_clause);
        if let Ok(rows) = sqlx::query::<Any>(&sql).fetch_all(&mut conn).await {
            let prefix = format!("{}__", tab_id);
    for row in rows {
                if let (Ok(k_enc), Ok(v_enc)) = (row.try_get::<String, _>(0), row.try_get::<Option<String>, _>(1)) {
                    let k_full = schema.decrypt_value_or_raw("tab_config", "config_key", &k_enc);
                    let k = k_full.strip_prefix(&prefix).unwrap_or(&k_full).to_string();
                    let v = schema.decrypt_value_or_raw("tab_config", "config_value", &v_enc.unwrap_or_default());
                    config.insert(k, serde_json::json!(v));
                }
            }
        }
    }

    // Clés PayDunya globales : main__paydunya_* (mêmes pour tous)
    let paydunya_keys = [
        "paydunya_mode", "paydunya_cle_principale", "paydunya_test_cle_publique", "paydunya_test_cle_privee",
        "paydunya_test_token", "paydunya_live_cle_publique", "paydunya_live_cle_privee", "paydunya_live_token",
        "paydunya_test_master_key", "paydunya_test_private_key", "paydunya_live_master_key", "paydunya_live_private_key",
        "paydunya_master_key", "paydunya_private_key", "paydunya_token",
    ];
    let paydunya_full_keys: Vec<String> = paydunya_keys.iter().map(|k| format!("{}__{}", PAYDUNYA_CONFIG_TAB, k)).collect();
    let enc_keys: Vec<String> = paydunya_full_keys.iter().filter_map(|k| schema.encrypt_value("tab_config", "config_key", k).ok()).collect();
    let in_clause = enc_keys.iter().map(|k| format!("'{}'", k.replace('\'', "''"))).collect::<Vec<_>>().join(", ");
    let sql_pay = format!("SELECT {}, {} FROM tab_config WHERE {} IN ({})", key_col, val_col, key_col, in_clause);
    if let Ok(rows) = sqlx::query::<Any>(&sql_pay).fetch_all(&mut conn).await {
        let paydunya_prefix = format!("{}__", PAYDUNYA_CONFIG_TAB);
        let old_keys = ["paydunya_master_key", "paydunya_private_key", "paydunya_token", "paydunya_test_master_key", "paydunya_test_private_key", "paydunya_live_master_key", "paydunya_live_private_key"];
        for row in rows {
            if let (Ok(k_enc), Ok(v_enc)) = (row.try_get::<String, _>(0), row.try_get::<Option<String>, _>(1)) {
                let k_full = schema.decrypt_value_or_raw("tab_config", "config_key", &k_enc);
                let k = k_full.strip_prefix(&paydunya_prefix).unwrap_or(&k_full).to_string();
                let val = schema.decrypt_value_or_raw("tab_config", "config_value", &v_enc.unwrap_or_default());
                let val_str = if paydunya_key_names.contains(&k.as_str()) && !val.is_empty() {
                    crate::crypto::decrypt_paydunya_key(&val)
                } else {
                    val.clone()
                };
                if old_keys.contains(&k.as_str()) {
                    // Migration : anciennes clés → nouvelles
                    let (new_key, live_key_opt) = match k.as_str() {
                        "paydunya_master_key" | "paydunya_test_master_key" | "paydunya_live_master_key" => ("paydunya_cle_principale", None),
                        "paydunya_private_key" => ("paydunya_test_cle_privee", Some("paydunya_live_cle_privee")),
                        "paydunya_test_private_key" => ("paydunya_test_cle_privee", None),
                        "paydunya_live_private_key" => ("paydunya_live_cle_privee", None),
                        "paydunya_token" => ("paydunya_test_token", Some("paydunya_live_token")),
                        _ => continue,
                    };
                    if !val_str.is_empty() && config.get(new_key).and_then(|x| x.as_str()).unwrap_or("").is_empty() {
                        config.insert(new_key.to_string(), serde_json::json!(val_str.clone()));
                    }
                    if let Some(lk) = live_key_opt {
                        if !val_str.is_empty() && config.get(lk).and_then(|x| x.as_str()).unwrap_or("").is_empty() {
                            config.insert(lk.to_string(), serde_json::json!(val_str));
                        }
                    }
                } else {
                    config.insert(k, serde_json::json!(val_str));
                }
            }
        }
    }

    // Masquer les mots de passe : ne jamais renvoyer les valeurs réelles au client
    const PASSWORD_KEYS: &[&str] = &[
        "db_password_yellow", "db_password_green", "db_password_blue", "db_password_orange", "db_password_pink",
        "paydunya_cle_principale", "paydunya_test_cle_publique", "paydunya_test_cle_privee", "paydunya_test_token",
        "paydunya_live_cle_publique", "paydunya_live_cle_privee", "paydunya_live_token",
    ];
    for k in PASSWORD_KEYS {
        if config.contains_key(*k) {
            config.insert((*k).to_string(), serde_json::json!("********"));
        }
    }

    encrypt_response(&Value::Object(config), Some(&get_cript_key()))
}

#[tauri::command]
pub async fn set_app_config(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;

    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");
    verify_sadmin_only(obj, &tab_id, pays).await?;

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, PAYDUNYA_CONFIG_TAB).await?;

    let paydunya_encrypt_keys = [
        "paydunya_cle_principale", "paydunya_test_cle_publique", "paydunya_test_cle_privee", "paydunya_test_token",
        "paydunya_live_cle_publique", "paydunya_live_cle_privee", "paydunya_live_token",
    ];
    let paydunya_config_keys = [
        "paydunya_mode", "paydunya_cle_principale",
        "paydunya_test_cle_publique", "paydunya_test_cle_privee", "paydunya_test_token",
        "paydunya_live_cle_publique", "paydunya_live_cle_privee", "paydunya_live_token",
    ];

    let schema = admin_schema::load_schema().map_err(|e| format!("set_app_config: {}", e))?;
    let (key_col, val_col, dt_col) =
        crate::db_sqlx::resolve_tab_config_phys_cols_full(&mut conn, &schema).await?;

    // Clés PayDunya : globales (main__paydunya_*), mêmes pour tous les comptes
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    for key in paydunya_config_keys {
        if let Some(v) = obj.get(key).and_then(|x| x.as_str()) {
            if v.is_empty() || v == "********" {
                continue;
            }
            let to_store = if paydunya_encrypt_keys.contains(&key) {
                crate::crypto::encrypt_paydunya_key(v).unwrap_or_else(|_| v.to_string())
            } else {
                v.to_string()
            };
            let key_full = format!("{}__{}", PAYDUNYA_CONFIG_TAB, key);
            let enc_key = schema.encrypt_value("tab_config", "config_key", &key_full)?;
            let enc_val = schema.encrypt_value("tab_config", "config_value", &to_store)?;
            let enc_now = schema.encrypt_value("tab_config", "date_creation", &now)?;
            let sql_pay = format!("INSERT OR REPLACE INTO tab_config ({}, {}, {}) VALUES (?1, ?2, ?3)", key_col, val_col, dt_col);
            sqlx::query::<Any>(&sql_pay)
                .bind(&enc_key)
                .bind(&enc_val)
                .bind(&enc_now)
                .execute(&mut conn)
                .await
                .map_err(|e| format!("set_app_config PayDunya: {}", e))?;
        }
    }

    // Config du tab (bases, etc.) - clés tab_id__key
    let sql = format!("INSERT OR REPLACE INTO tab_config ({}, {}, {}) VALUES (?1, ?2, ?3)", key_col, val_col, dt_col);
    let tab_keys = [
        "db_type", "db_path",
        "db_type_yellow", "db_path_yellow", "db_host_yellow", "db_port_yellow", "db_name_yellow", "db_user_yellow", "db_password_yellow", "db_ssl_yellow", "db_schema_yellow",
        "db_type_green", "db_path_green", "db_host_green", "db_port_green", "db_name_green", "db_user_green", "db_password_green", "db_ssl_green", "db_schema_green",
        "db_type_blue", "db_path_blue", "db_host_blue", "db_port_blue", "db_name_blue", "db_user_blue", "db_password_blue", "db_ssl_blue", "db_schema_blue",
        "db_type_orange", "db_path_orange", "db_host_orange", "db_port_orange", "db_name_orange", "db_user_orange", "db_password_orange", "db_ssl_orange", "db_schema_orange",
        "db_type_pink", "db_path_pink", "db_host_pink", "db_port_pink", "db_name_pink", "db_user_pink", "db_password_pink", "db_ssl_pink", "db_schema_pink",
    ];
    let now_tab = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    for key in tab_keys {
        if let Some(v) = obj.get(key).and_then(|x| x.as_str()) {
            if v.is_empty() || v == "********" {
                continue;
            }
            let key_full = format!("{}__{}", tab_id, key);
            let enc_key = schema.encrypt_value("tab_config", "config_key", &key_full)?;
            let enc_val = schema.encrypt_value("tab_config", "config_value", v)?;
            let enc_now = schema.encrypt_value("tab_config", "date_creation", &now_tab)?;
            sqlx::query::<Any>(&sql)
                .bind(&enc_key)
                .bind(&enc_val)
                .bind(&enc_now)
                .execute(&mut conn)
                .await
                .map_err(|e| format!("set_app_config: {}", e))?;
        }
    }

    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}

// ========== Tutoriels (tab_tuto dans dblaadmin) ==========

#[tauri::command]
pub async fn list_tutos(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    verify_db_credentials(obj, "main", "sn").await?;

    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, "sn", "main").await?;

    let schema = admin_schema::load_schema().map_err(|e| format!("list_tutos: {}", e))?;
    let date_col = schema.col_or_logical("tab_tuto", "date_creation");
    let sel_cols = schema.select_cols_cast_datetime("tab_tuto", admin_schema::TAB_TUTO_COLS, &["date_creation"]);
    let sql = format!("SELECT {} FROM tab_tuto ORDER BY {} ASC", sel_cols, date_col);
    let rows = sqlx::query::<Any>(&sql)
        .fetch_all(&mut conn)
        .await
        .map_err(|e| format!("list_tutos: {}", e))?;
    let mut list: Vec<Value> = Vec::new();
    for row in rows {
        let v = |i: usize| row.try_get::<Option<String>, _>(i).ok().flatten().unwrap_or_default();
        list.push(serde_json::json!({
            "id": schema.decrypt_value_or_raw("tab_tuto", "id", &v(0)),
            "titre": schema.decrypt_value_or_raw("tab_tuto", "titre", &v(1)),
            "url": schema.decrypt_value_or_raw("tab_tuto", "url", &v(2)),
            "date_creation": schema.decrypt_value_or_raw("tab_tuto", "date_creation", &v(3))
        }));
    }
    Ok(serde_json::json!(list))
}

#[tauri::command]
pub async fn add_tuto(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    verify_sadmin_only(obj, "main", "sn").await?;

    let titre = obj.get("titre").and_then(|v| v.as_str()).unwrap_or("").trim();
    let url = obj.get("url").and_then(|v| v.as_str()).unwrap_or("").trim();
    if titre.is_empty() || url.is_empty() {
        return Err("titre et url requis".to_string());
    }
    let id = chrono::Utc::now().timestamp_millis().to_string();
    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, "sn", "main").await?;

    let schema = admin_schema::load_schema().map_err(|e| format!("add_tuto: {}", e))?;
    let cols = schema.insert_cols("tab_tuto", admin_schema::TAB_TUTO_COLS);
    let enc_id = schema.encrypt_value("tab_tuto", "id", &id)?;
    let enc_titre = schema.encrypt_value("tab_tuto", "titre", titre)?;
    let enc_url = schema.encrypt_value("tab_tuto", "url", url)?;
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let enc_now = schema.encrypt_value("tab_tuto", "date_creation", &now)?;
    sqlx::query::<Any>(&format!("INSERT INTO tab_tuto ({}) VALUES (?1, ?2, ?3, ?4)", cols))
        .bind(&enc_id)
        .bind(&enc_titre)
        .bind(&enc_url)
        .bind(&enc_now)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("add_tuto: {}", e))?;
    Ok(serde_json::json!({ "id": id, "titre": titre, "url": url }))
}

#[tauri::command]
pub async fn update_tuto(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    verify_sadmin_only(obj, "main", "sn").await?;

    let id = obj.get("id").and_then(|v| v.as_str()).ok_or("ID manquant")?;
    let titre = obj.get("titre").and_then(|v| v.as_str()).unwrap_or("").trim();
    let url = obj.get("url").and_then(|v| v.as_str()).unwrap_or("").trim();
    if titre.is_empty() || url.is_empty() {
        return Err("titre et url requis".to_string());
    }
    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, "sn", "main").await?;

    let schema = admin_schema::load_schema().map_err(|e| format!("update_tuto: {}", e))?;
    let titre_col = schema.col_or_logical("tab_tuto", "titre");
    let url_col = schema.col_or_logical("tab_tuto", "url");
    let id_col = schema.col_or_logical("tab_tuto", "id");
    let enc_titre = schema.encrypt_value("tab_tuto", "titre", titre)?;
    let enc_url = schema.encrypt_value("tab_tuto", "url", url)?;
    let enc_id = schema.encrypt_value("tab_tuto", "id", id)?;
    let result = sqlx::query::<Any>(&format!("UPDATE tab_tuto SET {} = ?1, {} = ?2 WHERE {} = ?3", titre_col, url_col, id_col))
        .bind(&enc_titre)
        .bind(&enc_url)
        .bind(&enc_id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("update_tuto: {}", e))?;
    if result.rows_affected() == 0 {
        return Err("Tutoriel non trouvé".to_string());
    }
    Ok(serde_json::json!({ "id": id, "titre": titre, "url": url }))
}

#[tauri::command]
pub async fn delete_tuto(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let obj = p.body
        .as_ref()
        .and_then(|b| b.as_object())
        .ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    verify_sadmin_only(obj, "main", "sn").await?;

    let id = p.id.as_deref().or_else(|| p.body.as_ref().and_then(|b| b.get("id")).and_then(|v| v.as_str()))
        .ok_or("ID manquant")?;
    let mut conn = crate::db_sqlx::connect_admin().await?;
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, "sn", "main").await?;

    let schema = admin_schema::load_schema().map_err(|e| format!("delete_tuto: {}", e))?;
    let id_col = schema.col_or_logical("tab_tuto", "id");
    let enc_id = schema.encrypt_value("tab_tuto", "id", id)?;
    let result = sqlx::query::<Any>(&format!("DELETE FROM tab_tuto WHERE {} = ?1", id_col))
        .bind(&enc_id)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("delete_tuto: {}", e))?;
    if result.rows_affected() == 0 {
        return Err("Tutoriel non trouvé".to_string());
    }
    Ok(serde_json::json!({ "success": true }))
}

// ========== Corruption données + SADMIN ==========

/// Code d'erreur retourné quand ni dblaadmin ni le fichier de backup n'ont de date valide.
pub const CORRUPTION_DETECTED: &str = "CORRUPTION_DETECTED";

/// Vérifie si une corruption est détectée (ni dblaadmin ni fichier backup).
#[tauri::command]
pub async fn check_corruption_status(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let cabinet_id = p.id.as_deref().unwrap_or("").to_string();
    let tab_id = db::sanitize_tab_id(p.tab_id.as_deref().unwrap_or("main"));
    let pays = p.pays.as_deref().unwrap_or("sn");

    // 1. Essayer dblaadmin
    if let Ok(mut conn) = crate::db_sqlx::connect_admin().await {
        if crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await.is_ok() {
            if let Ok(schema) = admin_schema::load_schema() {
                let admin_table = "tab_admin";
                let cabinet_col = schema.col_or_logical("tab_admin", "cabinet_id");
                let date_col = schema.col_or_logical("tab_admin", "date_creation");
                if let Ok(enc_cabinet) = schema.encrypt_value("tab_admin", "cabinet_id", &cabinet_id) {
                    let sql = format!(
                        "SELECT CAST({} AS TEXT) FROM {} WHERE {} = ?1 ORDER BY {} DESC LIMIT 1",
                        date_col, admin_table, cabinet_col, date_col
                    );
                    if let Ok(Some(row)) = sqlx::query::<Any>(&sql)
                        .bind(&enc_cabinet)
                        .fetch_optional(&mut conn)
                        .await
                    {
                        if let Ok(_) = row.try_get::<String, _>(0) {
                            return encrypt_response(
                                &json!({ "corruption": false, "source": "dblaadmin" }),
                                Some(&get_cript_key()),
                            );
                        }
                    }
                }
            }
        }
    }

    // 2. Essayer fichier backup
    if let Ok((fcab, ftab, _date)) = crate::last_payment_file::read_last_payment_date() {
        if (cabinet_id.is_empty() || fcab == cabinet_id) && ftab == tab_id {
            return encrypt_response(
                &json!({ "corruption": false, "source": "file" }),
                Some(&get_cript_key()),
            );
        }
    }

    // 3. Pas de corruption si : SAdmin, 1ère connexion, ou docteur non créé
    if no_payment_expected(&cabinet_id, &tab_id, pays).await {
        return encrypt_response(
            &json!({ "corruption": false, "source": "first_use_or_sadmin" }),
            Some(&get_cript_key()),
        );
    }

    encrypt_response(
        &json!({ "corruption": true, "code": CORRUPTION_DETECTED }),
        Some(&get_cript_key()),
    )
}

/// Génère le mot de passe SADMIN pour une date donnée : 706 + DDMMYY + DDMMYY.
fn sadmin_password_for_date(date: chrono::NaiveDate) -> String {
    let ddmmyy = date.format("%d%m%y").to_string();
    format!("706{}{}", ddmmyy, ddmmyy)
}

/// Mots de passe acceptés:
/// - date UTC du jour
/// - date locale du jour
/// - date locale de la veille/du lendemain (tolérance minuit/fuseau)
fn expected_sadmin_passwords() -> Vec<String> {
    use chrono::{Duration, Local, Utc};
    let utc_today = Utc::now().date_naive();
    let local_today = Local::now().date_naive();
    let local_prev = local_today - Duration::days(1);
    let local_next = local_today + Duration::days(1);
    let mut out = vec![
        sadmin_password_for_date(utc_today),
        sadmin_password_for_date(local_today),
        sadmin_password_for_date(local_prev),
        sadmin_password_for_date(local_next),
    ];
    out.sort();
    out.dedup();
    out
}

/// Vérifie le mot de passe SADMIN, réinitialise la date de paiement à aujourd'hui,
#[tauri::command]
pub async fn verify_sadmin_reset_paiement(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let password = obj
        .get("password")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .unwrap_or("");
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or("");
    let tab_id = db::sanitize_tab_id(obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main"));
    let pays = obj.get("pays").and_then(|v| v.as_str()).unwrap_or("sn");

    let expected = expected_sadmin_passwords();
    if !expected.iter().any(|p| p == password) {
        return Err("Mot de passe SADMIN incorrect.".to_string());
    }

    let today = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Enregistrer dans le fichier backup
    let _ = crate::last_payment_file::save_last_payment_date(cabinet_id, &tab_id, &today);

    // Enregistrer dans dblaadmin (recréer si nécessaire)
    let mut conn = match crate::db_sqlx::connect_admin().await {
        Ok(c) => c,
        Err(_) => {
            crate::db_sqlx::delete_admin_db_and_schema();
            crate::db_sqlx::connect_admin_fresh().await?
        }
    };
    crate::db_sqlx::ensure_tables_admin_sqlx(&mut conn, pays, &tab_id).await?;
    let schema = admin_schema::load_schema().map_err(|e| e.to_string())?;
    let admin_table = "tab_admin";
    let cols = admin_schema::TAB_ADMIN_COLS;
    let ins = schema.insert_cols("tab_admin", cols);
    let id = uuid::Uuid::new_v4().to_string();
    let enc_id = schema.encrypt_value("tab_admin", "id", &id)?;
    let enc_cab = schema.encrypt_value("tab_admin", "cabinet_id", cabinet_id)?;
    let enc_dc = schema.encrypt_value("tab_admin", "date_creation", &today)?;
    let enc_n = schema.encrypt_value("tab_admin", "nombre_mois", "1")?;
    let enc_m = schema.encrypt_value("tab_admin", "montant", "50000")?;
    let enc_tp = schema.encrypt_value("tab_admin", "type_paiement", "frais_reparation_corruption")?;
    let enc_url = schema.encrypt_value("tab_admin", "url_pdf", "")?;
    let enc_logg = schema.encrypt_value("tab_admin", "logg_id", &tab_id)?;
    let sql = format!(
        "INSERT OR REPLACE INTO {} ({}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        admin_table, ins
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
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Insert frais réparation: {}", e))?;

    // Créer facture PayDunya pour frais de réparation 50000
    let (master, url, private_key, token) = get_paydunya_config(&tab_id, pays).await;
    if url.is_empty() || private_key.is_empty() || token.is_empty() {
        return encrypt_response(
            &json!({
                "success": true,
                "message": "Date réinitialisée. Configurez PayDunya pour payer les frais de réparation de 50000 XOF.",
                "urlDePaiement": "",
                "fraisReparation": 50000
            }),
            Some(&get_cript_key()),
        );
    }

    let base_url = paydunya_base_url();
    let return_url = format!("{}/api/paydunya/return", base_url);
    let callback_url = format!("{}/api/paydunya/callback", base_url);
    let invoice = json!({
        "items": {"item_0": {"name": "Frais de réparation - LoggAppro", "quantity": 1, "unit_price": "50000", "total_price": "50000", "description": "Frais de réparation suite à tentative de corruption de données"}},
        "total_amount": 50000,
        "description": "Frais de réparation 50000 XOF - LoggAppro",
        "customer": {"name": "Client", "email": "", "phone": ""}
    });
    let store = json!({"name": "LoggAppro", "tagline": "informatique"});
    let custom_data = json!({"lp_frais_reparation": true, "cabinet_id": cabinet_id, "tab_id": tab_id});
    let actions = json!({"return_url": return_url, "callback_url": callback_url});
    let body_req = json!({"invoice": invoice, "store": store, "custom_data": custom_data, "actions": actions});

    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("PAYDUNYA-MASTER-KEY", master.trim())
        .header("PAYDUNYA-PRIVATE-KEY", private_key.trim())
        .header("PAYDUNYA-TOKEN", token.trim())
        .json(&body_req)
        .send()
        .await
        .map_err(|e| format!("Erreur Paydunya: {}", e))?;

    let res_json: Value = res.json().await.map_err(|e| format!("Réponse Paydunya: {}", e))?;
    let code = res_json.get("response_code").and_then(|v| v.as_str()).unwrap_or("");
    let url_paiement = res_json.get("response_text").and_then(|v| v.as_str()).unwrap_or("");

    if code == "00" && !url_paiement.is_empty() {
        encrypt_response(
            &json!({
                "success": true,
                "message": "Date réinitialisée. Payez les frais de réparation de 50000 XOF via le lien ci-dessous.",
                "urlDePaiement": url_paiement,
                "fraisReparation": 50000
            }),
            Some(&get_cript_key()),
        )
    } else {
        encrypt_response(
            &json!({
                "success": true,
                "message": "Date réinitialisée. Erreur PayDunya pour les frais de réparation - payez manuellement 50000 XOF.",
                "urlDePaiement": "",
                "fraisReparation": 50000
            }),
            Some(&get_cript_key()),
        )
    }
}

/// Enregistre la dernière date de paiement dans le fichier backup (à appeler après chaque paiement confirmé).
#[tauri::command]
pub async fn enregistrer_derniere_date_paiement(payload: String) -> Result<Value, String> {
    let p = parse_or_empty(&payload);
    let body = p.body.ok_or_else(|| body_manquant_avec_payload(&payload, None))?;
    let obj = body.as_object().ok_or("Body invalide")?;
    let cabinet_id = obj.get("cabinetId").and_then(|v| v.as_str()).unwrap_or("");
    let tab_id = obj.get("tabId").and_then(|v| v.as_str()).unwrap_or("main");
    let date_creation = obj
        .get("dateCreation")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string());
    crate::last_payment_file::save_last_payment_date(cabinet_id, tab_id, &date_creation)?;
    encrypt_response(&json!({ "success": true }), Some(&get_cript_key()))
}
