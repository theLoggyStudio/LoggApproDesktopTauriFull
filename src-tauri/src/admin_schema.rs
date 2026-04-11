//! Schéma obfusqué pour dblaadmin : noms de colonnes aléatoires (10 lettres)
//! et chiffrement des données. Le mapping est stocké dans un fichier chiffré
//! à la création de dblaadmin.

/// Erreur signalant un échec de déchiffrement (clé incorrecte) → recréation dblaadmin
pub const ADMIN_DECRYPT_FAILED: &str = "ADMIN_DECRYPT_FAILED";

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::crypto;
use crate::db;

/// Noms logiques des colonnes par table (structure fixe)
pub const TAB_TRACE_COLS: &[&str] = &[
    "id", "action", "type_entite", "nom_entite", "id_entite", "date_action",
    "user_id", "user_nom", "user_role", "details", "logg_id",
];
pub const TAB_TASK_COLS: &[&str] = &[
    "id", "titre", "description", "date_rappel", "date_creation",
    "user_id", "user_nom", "logg_id", "statut",
];
pub const TAB_ADMIN_COLS: &[&str] = &[
    "id", "cabinet_id", "url_pdf", "logg_id", "date_creation",
    "nombre_mois", "montant", "type_paiement",
];
pub const TAB_CONFIG_COLS: &[&str] = &["config_key", "config_value", "date_creation"];
pub const TAB_TUTO_COLS: &[&str] = &["id", "titre", "url", "date_creation"];

/// Ancrage paiement : 1 ligne par cabinet ; 10 colonnes dates (toutes chiffrées), dont une seule est la vraie date d'inscription (`pay_anchor_real_slot`).
pub const TAB_PAY_ANCHOR_COLS: &[&str] = &[
    "cabinet_id",
    "anchor_0",
    "anchor_1",
    "anchor_2",
    "anchor_3",
    "anchor_4",
    "anchor_5",
    "anchor_6",
    "anchor_7",
    "anchor_8",
    "anchor_9",
];

const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

fn default_pay_anchor_real_slot() -> u8 {
    0
}

fn random_10_letters() -> String {
    use rand_core::RngCore;
    use rand_core::OsRng;
    let mut s = String::with_capacity(10);
    for _ in 0..10 {
        let b = (OsRng.next_u32() % 52) as u8;
        s.push(CHARSET[b as usize] as char);
    }
    s
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminSchema {
    pub version: u32,
    /// table_name -> { logical_col -> physical_col }
    pub tables: HashMap<String, HashMap<String, String>>,
    /// Index 0..=9 : quelle colonne logique `anchor_N` contient la date d'inscription réelle (chiffrée).
    #[serde(default = "default_pay_anchor_real_slot")]
    pub pay_anchor_real_slot: u8,
}

impl AdminSchema {
    fn generate_new() -> Self {
        let mut tables = HashMap::new();
        for (table, cols) in [
            ("tab_trace", TAB_TRACE_COLS),
            ("tab_task", TAB_TASK_COLS),
            ("tab_admin", TAB_ADMIN_COLS),
            ("tab_config", TAB_CONFIG_COLS),
            ("tab_tuto", TAB_TUTO_COLS),
            ("tab_pay_anchor", TAB_PAY_ANCHOR_COLS),
        ] {
            let mut map = HashMap::new();
            for &col in cols {
                let mut phys = random_10_letters();
                while map.values().any(|v| v == &phys) {
                    phys = random_10_letters();
                }
                map.insert(col.to_string(), phys);
            }
            tables.insert(table.to_string(), map);
        }
        use rand_core::{OsRng, RngCore};
        let mut rng = OsRng;
        let pay_anchor_real_slot = (rng.next_u32() % 10) as u8;
        Self {
            version: 1,
            tables,
            pay_anchor_real_slot,
        }
    }

    fn identity_legacy() -> Self {
        let mut tables = HashMap::new();
        for (table, cols) in [
            ("tab_trace", TAB_TRACE_COLS),
            ("tab_task", TAB_TASK_COLS),
            ("tab_admin", TAB_ADMIN_COLS),
            ("tab_config", TAB_CONFIG_COLS),
            ("tab_tuto", TAB_TUTO_COLS),
            ("tab_pay_anchor", TAB_PAY_ANCHOR_COLS),
        ] {
            let map = cols.iter().map(|&c| (c.to_string(), c.to_string())).collect();
            tables.insert(table.to_string(), map);
        }
        Self {
            version: 0,
            tables,
            pay_anchor_real_slot: 4,
        }
    }

    pub fn col(&self, table: &str, logical: &str) -> Option<&str> {
        self.tables.get(table)?.get(logical).map(String::as_str)
    }

    pub fn col_or_logical(&self, table: &str, logical: &str) -> String {
        self.col(table, logical).map(String::from).unwrap_or_else(|| logical.to_string())
    }

    /// Liste des colonnes pour SELECT avec CAST(col AS TEXT) pour les colonnes DATETIME
    /// (évite l'erreur SQLx Any "Any driver does not support SqliteTypeInfo(Datetime)")
    pub fn select_cols_cast_datetime(&self, table: &str, logical_cols: &[&str], datetime_cols: &[&str]) -> String {
        logical_cols
            .iter()
            .map(|c| {
                let phys = self.col_or_logical(table, c);
                if datetime_cols.contains(c) {
                    format!("CAST({} AS TEXT)", phys)
                } else {
                    phys
                }
            })
            .collect::<Vec<_>>()
            .join(", ")
    }

    /// Liste des colonnes physiques pour INSERT (col1, col2, ...)
    pub fn insert_cols(&self, table: &str, logical_cols: &[&str]) -> String {
        logical_cols
            .iter()
            .map(|c| self.col_or_logical(table, c))
            .collect::<Vec<_>>()
            .join(", ")
    }

    /// Chiffre une valeur pour stockage (colonne utilisée comme hint pour IV déterministe).
    /// Version 0 (legacy) : pas de chiffrement.
    pub fn encrypt_value(&self, _table: &str, logical_col: &str, plain: &str) -> Result<String, String> {
        if plain.is_empty() {
            return Ok(String::new());
        }
        if self.version == 0 {
            return Ok(plain.to_string());
        }
        crypto::encrypt_admin_deterministic(plain, &get_admin_encryption_key(), logical_col)
    }

    /// Déchiffre une valeur lue depuis la base.
    /// Version 0 (legacy) : pas de déchiffrement.
    pub fn decrypt_value(&self, _table: &str, logical_col: &str, encrypted: &str) -> Result<String, String> {
        if encrypted.is_empty() {
            return Ok(String::new());
        }
        if self.version == 0 {
            return Ok(encrypted.to_string());
        }
        crypto::decrypt_admin_deterministic(encrypted, &get_admin_encryption_key(), logical_col)
    }

    /// Déchiffre ou retourne la valeur brute si échec (pour rétrocompat / données corrompues)
    pub fn decrypt_value_or_raw(&self, table: &str, logical_col: &str, encrypted: &str) -> String {
        if encrypted.is_empty() {
            return String::new();
        }
        self.decrypt_value(table, logical_col, encrypted).unwrap_or_else(|_| encrypted.to_string())
    }

    /// Déchiffre ou retourne Err(ADMIN_DECRYPT_FAILED) si la clé ne déchiffre pas.
    /// Utilisé pour déclencher la recréation de dblaadmin en cas d'échec.
    pub fn decrypt_value_or_fail(&self, table: &str, logical_col: &str, encrypted: &str) -> Result<String, String> {
        if encrypted.is_empty() {
            return Ok(String::new());
        }
        self.decrypt_value(table, logical_col, encrypted)
            .map_err(|_| ADMIN_DECRYPT_FAILED.to_string())
    }
}

fn schema_file_path() -> PathBuf {
    let dir = db::get_databases_dir();
    dir.join("lpd_admin_schema.dat")
}

fn get_admin_encryption_key() -> String {
    crate::cript_key::resolve_cript_key()
}

/// Ajoute `tab_pay_anchor` aux schémas créés avant cette fonctionnalité, puis sauvegarde si besoin.
pub fn merge_pay_anchor_if_missing(schema: &mut AdminSchema) -> bool {
    if schema.tables.contains_key("tab_pay_anchor") {
        return false;
    }
    let mut map = HashMap::new();
    if schema.version == 0 {
        for &c in TAB_PAY_ANCHOR_COLS {
            map.insert(c.to_string(), c.to_string());
        }
        schema.pay_anchor_real_slot = 4;
    } else {
        for &col in TAB_PAY_ANCHOR_COLS {
            let mut phys = random_10_letters();
            while map.values().any(|v| v == &phys) {
                phys = random_10_letters();
            }
            map.insert(col.to_string(), phys);
        }
        use rand_core::{OsRng, RngCore};
        let mut rng = OsRng;
        schema.pay_anchor_real_slot = (rng.next_u32() % 10) as u8;
    }
    schema.tables.insert("tab_pay_anchor".to_string(), map);
    true
}

pub fn save_schema(schema: &AdminSchema) -> Result<(), String> {
    let path = schema_file_path();
    let json = serde_json::to_string(schema).map_err(|e| format!("Serialize schéma: {}", e))?;
    let enc = crypto::encrypt_data(&json, &get_admin_encryption_key())
        .map_err(|e| format!("Chiffrement schéma: {}", e))?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, &enc).map_err(|e| format!("Écriture schéma: {}", e))
}

/// Charge le schéma ou l'initialise. Si dblaadmin existe déjà avec l'ancien schéma,
/// utilise un mapping identité (legacy). Sinon génère des noms aléatoires.
pub async fn load_or_init_schema(conn: &mut sqlx::AnyConnection) -> Result<AdminSchema, String> {
    let path = schema_file_path();
    if path.exists() {
        let enc = fs::read_to_string(&path).map_err(|e| format!("Lecture schéma: {}", e))?;
        let json = crypto::decrypt_data(&enc, &get_admin_encryption_key())
            .map_err(|e| format!("Déchiffrement schéma: {}", e))?;
        let mut schema: AdminSchema = serde_json::from_str(&json)
            .map_err(|e| format!("Parse schéma: {}", e))?;
        if merge_pay_anchor_if_missing(&mut schema) {
            save_schema(&schema)?;
        }
        return Ok(schema);
    }

    // Vérifier si tab_admin existe (base existante avec ancien schéma)
    let check: Result<(i64,), _> = sqlx::query_as(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND (name='tab_admin' OR name='tab_adminmain')",
    )
    .fetch_one(&mut *conn)
    .await;

    let schema = match check {
        Ok((n,)) if n > 0 => AdminSchema::identity_legacy(),
        _ => AdminSchema::generate_new(),
    };

    let json = serde_json::to_string(&schema).map_err(|e| format!("Serialize schéma: {}", e))?;
    let enc = crypto::encrypt_data(&json, &get_admin_encryption_key())
        .map_err(|e| format!("Chiffrement schéma: {}", e))?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, &enc).map_err(|e| format!("Écriture schéma: {}", e))?;
    Ok(schema)
}

/// Charge le schéma depuis le fichier (sans connexion DB).
/// Utilisé par les requêtes qui n'ont pas besoin de créer les tables.
pub fn load_schema() -> Result<AdminSchema, String> {
    let path = schema_file_path();
    if !path.exists() {
        return Err("Schéma admin non initialisé".to_string());
    }
    let enc = fs::read_to_string(&path).map_err(|e| format!("Lecture schéma: {}", e))?;
    let json = crypto::decrypt_data(&enc, &get_admin_encryption_key())
        .map_err(|e| format!("Déchiffrement schéma: {}", e))?;
    let mut schema: AdminSchema = serde_json::from_str(&json).map_err(|e| format!("Parse schéma: {}", e))?;
    if merge_pay_anchor_if_missing(&mut schema) {
        save_schema(&schema)?;
    }
    Ok(schema)
}
