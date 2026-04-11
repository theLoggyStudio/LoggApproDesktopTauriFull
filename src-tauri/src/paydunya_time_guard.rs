//! Garde-temps hybride pour le module PayDunya uniquement.
//! Détecte les reculs d'horloge et protège contre la fraude par modification de date.
//! N'affecte pas les autres modules de l'application.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// Statuts possibles du module PayDunya
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PayDunyaStatus {
    /// PayDunya utilisable normalement
    Active,
    /// Mode limité (avertissement)
    Limited,
    /// Bloqué (suspicion de fraude horaire)
    Blocked,
    /// Hors ligne autorisé (pas de serveur, dernière date connue utilisée)
    OfflineAllowed,
    /// Horloge suspecte (recul détecté)
    SuspiciousClock,
}

impl Default for PayDunyaStatus {
    fn default() -> Self {
        PayDunyaStatus::Active
    }
}

/// État persistant du garde-temps PayDunya
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PayDunyaGuardState {
    /// Date/heure de première utilisation de PayDunya
    pub first_use_at: String,
    /// Dernière date/heure valide observée
    pub last_seen_at: String,
    /// Dernière date/heure obtenue depuis le serveur
    pub last_server_at: String,
    /// Nombre d'anomalies détectées
    pub anomaly_count: u32,
    /// Statut actuel
    pub status: String,
    /// Version du schéma (pour migrations futures)
    #[serde(default)]
    pub version: u32,
}

impl Default for PayDunyaGuardState {
    fn default() -> Self {
        let now = Utc::now().to_rfc3339();
        PayDunyaGuardState {
            first_use_at: now.clone(),
            last_seen_at: now.clone(),
            last_server_at: now.clone(),
            anomaly_count: 0,
            status: PayDunyaStatus::Active.to_string(),
            version: 1,
        }
    }
}

impl PayDunyaStatus {
    fn to_string(&self) -> String {
        match self {
            PayDunyaStatus::Active => "ACTIVE".to_string(),
            PayDunyaStatus::Limited => "LIMITED".to_string(),
            PayDunyaStatus::Blocked => "BLOCKED".to_string(),
            PayDunyaStatus::OfflineAllowed => "OFFLINE_ALLOWED".to_string(),
            PayDunyaStatus::SuspiciousClock => "SUSPICIOUS_CLOCK".to_string(),
        }
    }

    fn from_str(s: &str) -> Self {
        match s {
            "ACTIVE" => PayDunyaStatus::Active,
            "LIMITED" => PayDunyaStatus::Limited,
            "BLOCKED" => PayDunyaStatus::Blocked,
            "OFFLINE_ALLOWED" => PayDunyaStatus::OfflineAllowed,
            "SUSPICIOUS_CLOCK" => PayDunyaStatus::SuspiciousClock,
            _ => PayDunyaStatus::Active,
        }
    }
}

/// Seuil en secondes : si l'heure locale recule de plus que ça, anomalie
const ROLLBACK_THRESHOLD_SECS: i64 = 300; // 5 minutes
/// Nombre d'anomalies avant blocage
const ANOMALY_THRESHOLD_BLOCK: u32 = 3;
/// Nombre d'anomalies avant mode limité
const ANOMALY_THRESHOLD_LIMITED: u32 = 1;

fn get_guard_file_path() -> PathBuf {
    let dir = crate::db::get_databases_dir();
    let parent = dir.parent().unwrap_or(&dir);
    parent.join("lpd_pay.dat")
}

fn get_cript_key() -> String {
    crate::cript_key::resolve_cript_key()
}

/// Charge l'état depuis le stockage (chiffré)
fn load_state() -> Result<PayDunyaGuardState, String> {
    let path = get_guard_file_path();
    if !path.exists() {
        return Err("Fichier absent".to_string());
    }
    let encrypted = fs::read_to_string(&path).map_err(|e| format!("Lecture: {}", e))?;
    let decrypted = crate::crypto::decrypt_data(&encrypted, &get_cript_key())
        .map_err(|e| format!("Déchiffrement: {}", e))?;
    let state: PayDunyaGuardState =
        serde_json::from_str(&decrypted).map_err(|e| format!("JSON: {}", e))?;
    Ok(state)
}

/// Sauvegarde l'état (chiffré)
fn save_state(state: &PayDunyaGuardState) -> Result<(), String> {
    let path = get_guard_file_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let json = serde_json::to_string(state).map_err(|e| format!("JSON: {}", e))?;
    let encrypted = crate::crypto::encrypt_data(&json, &get_cript_key())
        .map_err(|e| format!("Chiffrement: {}", e))?;
    fs::write(&path, encrypted).map_err(|e| format!("Écriture: {}", e))?;
    Ok(())
}

/// Récupère l'heure serveur depuis une source externe fiable
async fn fetch_server_time() -> Option<DateTime<Utc>> {
    // Priorité 1 : WorldTimeAPI (gratuit, pas de clé)
    let urls = [
        "https://worldtimeapi.org/api/ip",
        "https://timeapi.io/api/Time/current/zone?timeZone=UTC",
    ];
    for url in urls {
        if let Ok(res) = reqwest::get(url).await {
            if res.status().is_success() {
                if let Ok(json) = res.json::<Value>().await {
                    // WorldTimeAPI: {"datetime":"2026-03-14T12:00:00.123456+00:00","unixtime":...}
                    if let Some(dt_str) = json.get("datetime").and_then(|v| v.as_str()) {
                        if let Ok(dt) = DateTime::parse_from_rfc3339(dt_str) {
                            return Some(dt.with_timezone(&Utc));
                        }
                    }
                    // timeapi.io: {"dateTime":"2026-03-14T12:00:00"}
                    if let Some(dt_str) = json.get("dateTime").and_then(|v| v.as_str()) {
                        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(
                            dt_str,
                            "%Y-%m-%dT%H:%M:%S",
                        ) {
                            return Some(DateTime::from_naive_utc_and_offset(dt, Utc));
                        }
                    }
                    // unixtime fallback
                    if let Some(ts) = json.get("unixtime").and_then(|v| v.as_i64()) {
                        if let Some(dt) =
                            DateTime::from_timestamp(ts, 0)
                        {
                            return Some(dt);
                        }
                    }
                }
            }
        }
    }
    None
}

/// Heure locale du système
fn local_time_now() -> DateTime<Utc> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| {
            DateTime::from_timestamp(d.as_secs() as i64, 0).unwrap_or_else(|| Utc::now())
        })
        .unwrap_or_else(|_| Utc::now())
}

/// Parse une date ISO en DateTime<Utc>
fn parse_rfc3339(s: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s).ok().map(|dt| dt.with_timezone(&Utc))
}

/// Vérifie si PayDunya peut être utilisé et met à jour l'état
pub async fn check_and_update() -> Result<(bool, PayDunyaStatus, String), String> {
    let local_now = local_time_now();

    let mut state = match load_state() {
        Ok(s) => s,
        Err(_) => {
            // Première utilisation : créer un état initial
            let server_time = fetch_server_time().await;
            let ref_time = server_time.unwrap_or(local_now);
            let ref_str = ref_time.to_rfc3339();
            let state = PayDunyaGuardState {
                first_use_at: ref_str.clone(),
                last_seen_at: ref_str.clone(),
                last_server_at: ref_str.clone(),
                anomaly_count: 0,
                status: PayDunyaStatus::Active.to_string(),
                version: 1,
            };
            if let Err(e) = save_state(&state) {
                log::warn!("[PayDunyaGuard] Impossible de sauvegarder l'état initial: {}", e);
            }
            return Ok((true, PayDunyaStatus::Active, "Première utilisation".to_string()));
        }
    };

    let current_status = PayDunyaStatus::from_str(&state.status);
    if current_status == PayDunyaStatus::Blocked {
        return Ok((false, PayDunyaStatus::Blocked, "PayDunya bloqué (anomalies horaires)".to_string()));
    }

    let server_time = fetch_server_time().await;
    let last_seen = parse_rfc3339(&state.last_seen_at).unwrap_or(local_now);
    let last_server = parse_rfc3339(&state.last_server_at).unwrap_or(local_now);

    let (ref_time, source) = if let Some(st) = server_time {
        state.last_server_at = st.to_rfc3339();
        (st, "serveur")
    } else {
        // Fallback : dernière date serveur connue, puis locale
        let fallback = if last_server > last_seen { last_server } else { last_seen };
        (fallback, "cache")
    };

    // Détection de recul : l'heure locale est-elle inférieure à la dernière connue ?
    let local_secs = local_now.timestamp();
    let _ref_secs = ref_time.timestamp();
    let last_seen_secs = last_seen.timestamp();

    let rollback_detected = local_secs < last_seen_secs - ROLLBACK_THRESHOLD_SECS;

    if rollback_detected {
        state.anomaly_count += 1;
        state.status = if state.anomaly_count >= ANOMALY_THRESHOLD_BLOCK {
            PayDunyaStatus::Blocked.to_string()
        } else if state.anomaly_count >= ANOMALY_THRESHOLD_LIMITED {
            PayDunyaStatus::SuspiciousClock.to_string()
        } else {
            PayDunyaStatus::SuspiciousClock.to_string()
        };
        if let Err(e) = save_state(&state) {
            log::warn!("[PayDunyaGuard] Erreur sauvegarde: {}", e);
        }
        let status = PayDunyaStatus::from_str(&state.status);
        let can_use = status != PayDunyaStatus::Blocked;
        return Ok((
            can_use,
            status,
            format!(
                "Recul horaire détecté (anomalie #{})",
                state.anomaly_count
            ),
        ));
    }

    // Tout est cohérent : mettre à jour last_seen_at
    state.last_seen_at = ref_time.to_rfc3339();
    state.status = PayDunyaStatus::Active.to_string();
    if let Err(e) = save_state(&state) {
        log::warn!("[PayDunyaGuard] Erreur sauvegarde: {}", e);
    }

    Ok((
        true,
        PayDunyaStatus::Active,
        format!("Source: {}", source),
    ))
}

/// Enregistre une utilisation de PayDunya (appelé après un paiement réussi)
pub fn register_usage() -> Result<(), String> {
    let local_now = local_time_now();
    let mut state = load_state().unwrap_or_else(|_| PayDunyaGuardState::default());
    state.last_seen_at = local_now.to_rfc3339();
    save_state(&state)
}

/// Retourne le statut actuel sans mise à jour
pub fn get_status() -> Result<(PayDunyaStatus, PayDunyaGuardState), String> {
    let state = load_state()?;
    let status = PayDunyaStatus::from_str(&state.status);
    Ok((status, state))
}
