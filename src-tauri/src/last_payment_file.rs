//! Fichier chiffré contenant la dernière date de paiement (backup durable).
//! Utilisé quand dblaadmin est corrompu ou absent.

use std::fs;
use std::path::PathBuf;

use crate::crypto;
use crate::db;

fn get_key() -> String {
    crate::cript_key::resolve_cript_key()
}

fn file_path() -> PathBuf {
    db::get_databases_dir().join("lpd_last_payment.dat")
}

/// Enregistre la dernière date de paiement dans un fichier chiffré.
pub fn save_last_payment_date(cabinet_id: &str, tab_id: &str, date_creation: &str) -> Result<(), String> {
    let data = serde_json::json!({
        "cabinet_id": cabinet_id,
        "tab_id": tab_id,
        "date_creation": date_creation,
    });
    let json = serde_json::to_string(&data).map_err(|e| format!("Serialize: {}", e))?;
    let enc = crypto::encrypt_data(&json, &get_key())?;
    if let Some(parent) = file_path().parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(file_path(), &enc).map_err(|e| format!("Écriture: {}", e))
}

/// Lit la dernière date de paiement depuis le fichier chiffré.
pub fn read_last_payment_date() -> Result<(String, String, String), String> {
    let path = file_path();
    if !path.exists() {
        return Err("Fichier inexistant".to_string());
    }
    let enc = fs::read_to_string(&path).map_err(|e| format!("Lecture: {}", e))?;
    let json = crypto::decrypt_data(&enc, &get_key())?;
    let v: serde_json::Value = serde_json::from_str(&json).map_err(|e| format!("Parse: {}", e))?;
    let cabinet_id = v.get("cabinet_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let tab_id = v.get("tab_id").and_then(|x| x.as_str()).unwrap_or("main").to_string();
    let date_creation = v.get("date_creation").and_then(|x| x.as_str()).unwrap_or("").to_string();
    Ok((cabinet_id, tab_id, date_creation))
}

