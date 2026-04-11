//! Parsing des payloads chiffrés (body ou URL)

use serde_json::Value;

use crate::crypto;

/// Clé de chiffrement par défaut (dev)
pub const DEFAULT_CRIPT_KEY: &str = "clechiffredeboutenbout0123456789";

/// Payload parsé - body JSON ou paramètres URL
#[derive(Debug, Default)]
pub struct ParsedPayload {
    pub body: Option<Value>,
    pub url_path: Option<String>,
    pub params: Vec<String>,
    pub tab_id: Option<String>,
    pub pays: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub id: Option<String>,
    pub index: Option<i32>,
    pub patient_id: Option<String>,
    /// Rôle pour les QR codes: patient, docteur, assistant, comptable, secretaire
    pub qrcode_role: Option<String>,
}

/// Parse le payload (format body ou url)
pub fn parse_payload(payload: &str, key: Option<&str>) -> Result<ParsedPayload, String> {
    let key = key.unwrap_or(DEFAULT_CRIPT_KEY);
    let payload = payload.trim();

    if payload.is_empty() {
        return Ok(ParsedPayload::default());
    }

    // Format body: {"body":"<encrypted>"}
    if payload.starts_with('{') {
        return parse_body_payload(payload, key);
    }

    // Format URL: /api/xxx/enc1/enc2/enc3
    if payload.starts_with('/') {
        return parse_url_payload(payload, key);
    }

    Err("Format de payload non reconnu".to_string())
}

fn parse_body_payload(payload: &str, key: &str) -> Result<ParsedPayload, String> {
    let parsed: Value = serde_json::from_str(payload).map_err(|e| format!("JSON invalide: {}", e))?;
    let body_enc = parsed
        .get("body")
        .and_then(|v| v.as_str())
        .ok_or("Champ 'body' manquant")?;

    let decrypted = crypto::decrypt_data(body_enc, key)?;
    let body: Value = serde_json::from_str(&decrypted).unwrap_or(Value::String(decrypted));

    let mut p = ParsedPayload::default();
    p.body = Some(body.clone());

    if let Some(obj) = body.as_object() {
        p.tab_id = obj.get("tabId").and_then(|v| v.as_str()).map(String::from);
        p.pays = obj.get("pays").and_then(|v| v.as_str()).map(String::from);
        p.id = obj.get("id").and_then(|v| v.as_str()).map(String::from);
        p.patient_id = obj.get("patientId").and_then(|v| v.as_str()).map(String::from);
        if let Some(n) = obj.get("limit") {
            p.limit = n.as_i64().or_else(|| n.as_str().and_then(|s| s.parse().ok()));
        }
    }

    Ok(p)
}

fn parse_url_payload(payload: &str, key: &str) -> Result<ParsedPayload, String> {
    // Format: /api/pagePatient/patients/encTabId/encLimit/encPays
    // ou: /api/navtop/patients/chercher/encTabId/encSearch/encPays
    let parts: Vec<&str> = payload.split('/').collect();
    let non_empty: Vec<&str> = parts.iter().filter(|s| !s.is_empty()).copied().collect();

    // Trouver où commencent les params chiffrés (premier segment qui déchiffre)
    let mut path_len = 0;
    for (i, part) in non_empty.iter().enumerate() {
        if crypto::decrypt_data(part, key).is_ok() {
            path_len = i;
            break;
        }
        path_len = i + 1;
    }

    let path_parts: Vec<&str> = non_empty.iter().take(path_len).copied().collect();
    let path_str = if path_parts.is_empty() {
        String::new()
    } else {
        format!("/{}", path_parts.join("/"))
    };

    let mut params = Vec::new();
    for part in non_empty.iter().skip(path_len) {
        if let Ok(dec) = crypto::decrypt_data(part, key) {
            params.push(dec);
        }
    }

    let mut p = ParsedPayload::default();
    p.url_path = Some(path_str.clone());
    p.params = params.clone();

    if path_str.contains("chercher") && params.len() >= 3 {
        p.tab_id = params.get(0).cloned();
        p.params = params.clone();
        p.pays = params.get(2).cloned();
    } else if path_str.contains("patients") && params.len() >= 3 && !path_str.contains("chercher") {
        p.tab_id = params.get(0).cloned();
        p.limit = params.get(1).and_then(|s| s.parse().ok());
        p.pays = params.get(2).cloned();
    } else if path_str.contains("pagePatient") && path_str.contains("qrcode") && params.len() >= 4 {
        // /api/pagePatient/qrcode: [id, partNum, tabId, pays] — exclure pageProfile (ex. collaborateur/qrcode a aussi 4 params)
        p.id = params.get(0).cloned();
        p.index = params.get(1).and_then(|s| s.parse().ok());
        p.tab_id = params.get(2).cloned();
        p.pays = params.get(3).cloned();
        p.qrcode_role = Some("patient".to_string());
    } else if path_str.contains("qrcode") && params.len() >= 3 && path_str.contains("docteur") {
        // /api/pageProfile/docteur/qrcode: [id, tabId, pays]
        p.id = params.get(0).cloned();
        p.tab_id = params.get(1).cloned();
        p.pays = params.get(2).cloned();
        p.qrcode_role = Some("docteur".to_string());
    } else if path_str.contains("qrcode") && params.len() >= 4 && path_str.contains("collaborateur") {
        // /api/pageProfile/collaborateur/qrcode: [id, tabId, role, pays]
        p.id = params.get(0).cloned();
        p.tab_id = params.get(1).cloned();
        p.qrcode_role = params.get(2).cloned();
        p.pays = params.get(3).cloned();
    } else if path_str.contains("qrcode") && params.len() >= 3 && (path_str.contains("assistant") || path_str.contains("comptable") || path_str.contains("secretaire")) {
        // /api/pageProfile/assistant|comptable|secretaire/qrcode: [id, tabId, pays]
        p.id = params.get(0).cloned();
        p.tab_id = params.get(1).cloned();
        p.pays = params.get(2).cloned();
        if path_str.contains("assistant") {
            p.qrcode_role = Some("assistant".to_string());
        } else if path_str.contains("comptable") {
            p.qrcode_role = Some("comptable".to_string());
        } else if path_str.contains("secretaire") {
            p.qrcode_role = Some("secretaire".to_string());
        }
    } else if path_str.contains("patient") && !path_str.contains("patients") && params.len() >= 3 {
        p.id = params.get(0).cloned();
        p.tab_id = params.get(1).cloned();
        p.pays = params.get(2).cloned();
    } else if path_str.contains("docteur") && !path_str.contains("docteurs") && params.len() >= 3 {
        p.id = params.get(0).cloned();
        p.tab_id = params.get(1).cloned();
        p.pays = params.get(2).cloned();
    } else if path_str.contains("pagePatientDetail") && path_str.contains("actes") && params.len() >= 4 {
        // list_actes_by_patient : [patientId, limit, tabId, pays]
        // Ne pas matcher /api/statistique/NomActesExistantes (contient la sous-chaîne "actes").
        p.patient_id = params.get(0).cloned();
        p.limit = params.get(1).and_then(|s| s.parse().ok());
        p.tab_id = params.get(2).cloned();
        p.pays = params.get(3).cloned();
    } else if path_str.contains("autorisation") && path_str.contains("privilege") && params.len() >= 3 {
        p.id = params.get(0).cloned();      // privilegeId (user/docteur id)
        p.tab_id = params.get(1).cloned();
        p.pays = params.get(2).cloned();
    } else if path_str.contains("autorisation") && (path_str.contains("verifierStatutPaiement") || path_str.contains("datePayement")) && params.len() >= 3 {
        // verifierStatutPaiement / datePayement: [cabinetId, tabId, pays]
        p.id = params.get(0).cloned();      // cabinetId
        p.tab_id = params.get(1).cloned();
        p.pays = params.get(2).cloned();
    } else if path_str.contains("pageProfile") && params.len() >= 2 {
        if path_str.contains("assistants") && params.len() >= 3 {
            p.tab_id = params.get(0).cloned();
            p.limit = params.get(1).and_then(|s| s.parse().ok());
            p.pays = params.get(2).cloned();
        } else if path_str.contains("assistant") && !path_str.contains("assistants") {
            p.id = params.get(0).cloned();
            if params.len() >= 3 {
                p.tab_id = params.get(1).cloned();
            }
            p.pays = params.last().cloned();
        } else if path_str.contains("comptables") && params.len() >= 3 {
            p.tab_id = params.get(0).cloned();
            p.limit = params.get(1).and_then(|s| s.parse().ok());
            p.pays = params.get(2).cloned();
        } else if path_str.contains("comptable") && !path_str.contains("comptables") {
            p.id = params.get(0).cloned();
            if params.len() >= 3 {
                p.tab_id = params.get(1).cloned();
            }
            p.pays = params.last().cloned();
        } else if path_str.contains("secretaires") && params.len() >= 3 {
            p.tab_id = params.get(0).cloned();
            p.limit = params.get(1).and_then(|s| s.parse().ok());
            p.pays = params.get(2).cloned();
        } else if path_str.contains("secretaire") && !path_str.contains("secretaires") {
            p.id = params.get(0).cloned();
            if params.len() >= 3 {
                p.tab_id = params.get(1).cloned();
            }
            p.pays = params.last().cloned();
        } else if path_str.contains("privilege") && params.len() >= 3 {
            p.id = params.get(0).cloned();
            p.tab_id = params.get(1).cloned();
            p.pays = params.get(2).cloned();
        }
    } else if path_str.contains("nomMateriels") && params.len() >= 3 {
        p.tab_id = params.get(0).cloned();
        p.limit = params.get(1).and_then(|s| s.parse().ok());
        p.pays = params.get(2).cloned();
    } else if path_str.contains("nomMateriel") && !path_str.contains("nomMateriels") && params.len() >= 3 {
        // get/delete nom_materiel: [id, tabId, pays]
        p.id = params.get(0).cloned();
        p.tab_id = params.get(1).cloned();
        p.pays = params.get(2).cloned();
    } else if path_str.contains("materiels") && params.len() >= 3 {
        p.id = params.get(0).cloned();      // acteId
        p.tab_id = params.get(1).cloned();
        p.pays = params.get(2).cloned();
    } else if path_str.contains("img/radios") && params.len() >= 3 {
        // /api/img/radios: [acteId, tabId, pays]
        p.id = params.get(0).cloned();       // acteId
        p.tab_id = params.get(1).cloned();
        p.pays = params.get(2).cloned();
    } else if path_str.contains("img/photo") && params.len() >= 4 {
        // /api/img/photo: [imgId, partNum, tabId, pays]
        p.id = params.get(0).cloned();
        p.index = params.get(1).and_then(|s| s.parse().ok());
        p.tab_id = params.get(2).cloned();
        p.pays = params.get(3).cloned();
    } else if path_str.contains("PatientDetail") && path_str.contains("acte") {
        if params.len() >= 4 {
            // delete_acte: [acteId, loggId, tabId, pays]
            p.id = params.get(0).cloned();
            p.patient_id = params.get(1).cloned();
            p.tab_id = params.get(2).cloned();
            p.pays = params.get(3).cloned();
        } else if params.len() >= 3 {
            // get_acte: [tabId, id, pays]
            p.tab_id = params.get(0).cloned();
            p.id = params.get(1).cloned();
            p.pays = params.get(2).cloned();
        }
    } else if path_str.contains("pageParametre") && (path_str.contains("nomActes") || path_str.contains("nomAssurances")) && params.len() >= 3 {
        // list nom_actes / nom_assurances: [tabId, limit, pays]
        p.tab_id = params.get(0).cloned();
        p.limit = params.get(1).and_then(|s| s.parse().ok());
        p.pays = params.get(2).cloned();
    } else if path_str.contains("pageParametre") && (path_str.contains("nomActe") || path_str.contains("nomAssurance")) && params.len() >= 3 {
        // get/delete nom_acte ou nom_assurance (singulier): [id, tabId, pays]
        p.id = params.get(0).cloned();
        p.tab_id = params.get(1).cloned();
        p.pays = params.get(2).cloned();
    } else if path_str.contains("statistique") && params.len() >= 4 {
        // stats_list_nom_actes: [dateDebut, dateFin, tabId, pays]
        p.tab_id = params.get(2).cloned();
        p.pays = params.get(3).cloned();
    } else if path_str.contains("radios") && path_str.contains("pending") && params.len() >= 2 {
        // radios_list_pending: [tabId, pays]
        p.tab_id = params.get(0).cloned();
        p.pays = params.get(1).cloned();
    } else if path_str.contains("radios") && path_str.contains("file") && params.len() >= 3 {
        // radios_download_preview: [radioId, tabId, pays]
        p.id = params.get(0).cloned();
        p.tab_id = params.get(1).cloned();
        p.pays = params.get(2).cloned();
    } else if path_str.contains("trace") && params.len() >= 3 {
        if path_str.contains("loggId") && params.len() >= 4 {
            // trace_list_by_logg_id: [loggId, tabId, pays, limit]
            p.id = params.get(0).cloned();
            p.tab_id = params.get(1).cloned();
            p.pays = params.get(2).cloned();
            p.limit = params.get(3).and_then(|s| s.parse().ok());
        } else if path_str.contains("pagination") && params.len() >= 4 {
            // trace_list_pagination: [tabId, pays, limit, offset]
            p.tab_id = params.get(0).cloned();
            p.pays = params.get(1).cloned();
            p.limit = params.get(2).and_then(|s| s.parse().ok());
            p.offset = params.get(3).and_then(|s| s.parse().ok());
        } else {
            // trace_list_all: [tabId, pays, limit]
            p.tab_id = params.get(0).cloned();
            p.pays = params.get(1).cloned();
            p.limit = params.get(2).and_then(|s| s.parse().ok());
        }
    } else if !params.is_empty() {
        p.tab_id = params.get(0).cloned();
        p.limit = params.get(1).and_then(|s| s.parse().ok());
        p.pays = params.get(2).or_else(|| params.last()).cloned();
        p.id = params.get(0).cloned();
    }

    Ok(p)
}

/// Chiffre une réponse pour le frontend (format { body: encrypted })
pub fn encrypt_response(data: &Value, key: Option<&str>) -> Result<Value, String> {
    let key = key.unwrap_or(DEFAULT_CRIPT_KEY);
    let json_str = serde_json::to_string(data).map_err(|e| e.to_string())?;
    let encrypted = crypto::encrypt_data(&json_str, key)?;
    Ok(serde_json::json!({ "body": encrypted }))
}
