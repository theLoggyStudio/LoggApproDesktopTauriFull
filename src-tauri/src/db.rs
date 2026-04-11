//! Gestion multi-bases SQLite (dblayellow, dblagreen, dblablue, etc.)

use regex::Regex;
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};

#[allow(dead_code)]
const DB_COLORS: [&str; 6] = ["yellow", "green", "pink", "blue", "orange", "admin"];

/// Chemin de base pour les bases de données
/// Crée le répertoire si nécessaire pour éviter SQLITE_CANTOPEN (code 14)
pub fn get_databases_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let pd = std::env::var("ProgramData").ok();
        if let Some(ref p) = pd {
            let path = Path::new(p).join("LoggAppro").join("databases");
            if path.exists() || fs::create_dir_all(&path).is_ok() {
                return path;
            }
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let path = Path::new(&local).join("LoggAppro").join("databases");
            let _ = fs::create_dir_all(&path);
            return path;
        }
    }
    let path = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("databases");
    let _ = fs::create_dir_all(&path);
    path
}

/// Chemin vers un fichier DB (dblayellow.db, etc.)
/// - color "admin" : bootstrap via get_databases_dir (seul chemin "fixe" pour localiser dblaadmin)
/// - autres couleurs : base_override OBLIGATOIRE depuis tab_config (pas de chemin en dur)
pub fn get_db_path(_pays: &str, color: &str, base_override: Option<&str>) -> PathBuf {
    let dir = if color == "admin" {
        get_databases_dir()
    } else if let Some(ref p) = base_override.filter(|s| !s.is_empty()) {
        let path = PathBuf::from(p);
        if !path.exists() {
            let _ = fs::create_dir_all(&path);
        }
        path
    } else {
        // Fallback uniquement pour rétrocompat : les appels doivent passer le chemin depuis config
        get_databases_dir()
    };
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    let db_name = format!("dbla{}.db", color);
    dir.join(db_name)
}

/// Chemin vers dbla.db (tab_pays, tab_env)
#[allow(dead_code)]
pub fn get_dbla_main_path() -> PathBuf {
    let dir = get_databases_dir();
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir.join("dbla.db")
}

/// Ouvre une connexion à une base (PRAGMA optimisés)
/// base_override: chemin personnalisé pour dblayellow, dblagreen, etc. (ignoré pour admin)
#[allow(dead_code)]
pub fn connect(pays: &str, color: &str, base_override: Option<&str>) -> Result<Connection, String> {
    let path = get_db_path(pays, color, base_override);
    let conn = Connection::open(&path).map_err(|e| format!("Ouverture DB {}: {}", path.display(), e))?;
    conn.execute_batch(
        "PRAGMA foreign_keys = ON; \
         PRAGMA journal_mode = WAL; \
         PRAGMA busy_timeout = 25000; \
         PRAGMA cache_size = -64000; \
         PRAGMA temp_store = MEMORY; \
         PRAGMA synchronous = NORMAL;",
    )
    .map_err(|e| format!("PRAGMA: {}", e))?;
    Ok(conn)
}

/// Ouvre la base principale dbla.db
#[allow(dead_code)]
pub fn connect_main() -> Result<Connection, String> {
    let path = get_dbla_main_path();
    let conn = Connection::open(&path).map_err(|e| format!("Ouverture dbla: {}", e))?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
        .map_err(|e| format!("PRAGMA: {}", e))?;
    Ok(conn)
}

/// Sanitise tab_id pour usage dans les noms de tables SQL.
/// Autorise uniquement lettres, chiffres, tirets et underscores. Longueur max 64.
pub fn sanitize_tab_id(tab_id: &str) -> String {
    const MAX_LEN: usize = 64;
    let re = Regex::new(r"^[a-zA-Z0-9_]+$").expect("regex tab_id");
    let s = tab_id.trim().replace('-', "_");
    let s = if s.len() > MAX_LEN { s[..MAX_LEN].to_string() } else { s };
    if re.is_match(&s) && !s.is_empty() { s } else { "main".to_string() }
}

/// Valide un nom de table contre l'injection SQL. Autorise uniquement [a-zA-Z0-9_], max 64 chars.
pub fn validate_table_name(name: &str) -> Result<String, String> {
    const MAX_LEN: usize = 64;
    let re = Regex::new(r"^[a-zA-Z0-9_]+$").expect("regex table");
    let s = name.trim();
    if s.is_empty() {
        return Err("Nom de table vide".to_string());
    }
    if s.len() > MAX_LEN {
        return Err("Nom de table trop long".to_string());
    }
    if re.is_match(s) {
        Ok(s.to_string())
    } else {
        Err("Nom de table invalide (caractères non autorisés)".to_string())
    }
}

/// Noms de tables « canoniques » (sans suffixe tab_id / uuid) — plus long d’abord pour le nettoyage.
const GLOBAL_TABLE_PREFIXES_LONGEST_FIRST: &[&str] = &[
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

/// Supprime les tables `tab_<nom><suffixe>` obsolètes (main, uuid, etc.) si une table canonique existe déjà ou si le nom est un préfixe connu + suffixe.
fn drop_legacy_suffixed_tables(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let keep_exact = [
        "tab_connection",
        "tab_tuto",
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
    for t in names {
        if keep_exact.iter().any(|&k| k == t.as_str()) {
            continue;
        }
        for prefix in GLOBAL_TABLE_PREFIXES_LONGEST_FIRST {
            if t.starts_with(prefix) && t.len() > prefix.len() {
                let vt = validate_table_name(&t)?;
                let _ = conn.execute(&format!("DROP TABLE IF EXISTS {}", vt), []);
                break;
            }
        }
    }
    Ok(())
}

/// Crée les tables dynamiques pour un tab_id (yellow = users, patients, etc.)
#[allow(dead_code)]
pub fn ensure_tables(conn: &Connection, tab_id: &str) -> Result<(), String> {
    let _ = sanitize_tab_id(tab_id);
    drop_legacy_suffixed_tables(conn)?;
    let tables = [
        r#"CREATE TABLE IF NOT EXISTS tab_user (
                id TEXT PRIMARY KEY,
                nom TEXT, prenom TEXT, login TEXT UNIQUE, password TEXT,
                telephone TEXT UNIQUE, naissance TEXT, role TEXT, adresse TEXT,
                logg_id TEXT, date_creation DATETIME
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_patient (
                id TEXT PRIMARY KEY,
                nom_de_jeune_fille TEXT, profession TEXT, adresserPar TEXT,
                observation TEXT, date_creation DATETIME, avoir_annuelle TEXT DEFAULT '0'
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_docteur (
                id TEXT PRIMARY KEY, date_creation DATETIME, logg_id TEXT
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_assistant (
                id TEXT PRIMARY KEY, date_creation DATETIME, logg_id TEXT
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_comptable (
                id TEXT PRIMARY KEY, date_creation DATETIME, logg_id TEXT
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_secretaire (
                id TEXT PRIMARY KEY, date_creation DATETIME, logg_id TEXT
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_collaborateur (
                id TEXT PRIMARY KEY, type_id TEXT NOT NULL, date_creation DATETIME, logg_id TEXT
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_connection (
            id TEXT PRIMARY KEY, logg_id TEXT, telephone TEXT UNIQUE,
            login TEXT UNIQUE, password TEXT, role TEXT
        )"#
            .to_string(),
    ];

    for sql in &tables {
        conn.execute(sql, []).map_err(|e| format!("Create table: {}", e))?;
    }

    // Index pour optimisation des requêtes auth et lookup
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_tab_connection_login ON tab_connection(login);", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_tab_connection_telephone ON tab_connection(telephone);", []);

    // Pas de triggers : tab_connection est rempli manuellement dans create_docteur/upsert_patient
    // (évite les erreurs avec bases existantes ou schémas divergents)

    Ok(())
}

/// Crée les triggers de synchronisation tab_user -> tab_connection
/// Non utilisé : tab_connection est rempli manuellement dans create_docteur/upsert_patient
#[allow(dead_code)]
fn ensure_user_connection_triggers(conn: &Connection, tab_id: &str) -> Result<(), String> {
    let user_table = "tab_user";
    let trigger_prefix = format!("trg_user_conn_{}", sanitize_tab_id(tab_id).replace('-', "_"));

    // DROP d'abord pour éviter conflits (SQLite < 3.35 n'a pas CREATE TRIGGER IF NOT EXISTS)
    let _ = conn.execute(&format!("DROP TRIGGER IF EXISTS {}_ins;", trigger_prefix), []);
    let _ = conn.execute(&format!("DROP TRIGGER IF EXISTS {}_upd;", trigger_prefix), []);
    let _ = conn.execute(&format!("DROP TRIGGER IF EXISTS {}_del;", trigger_prefix), []);

    // AFTER INSERT : crée la connexion quand un user est créé
    let sql_insert = format!(
        r#"CREATE TRIGGER {}_ins
           AFTER INSERT ON {}
           WHEN NEW.role IS NOT NULL AND NEW.telephone IS NOT NULL AND NEW.login IS NOT NULL AND NEW.password IS NOT NULL
           BEGIN
             INSERT OR IGNORE INTO tab_connection (id, logg_id, telephone, login, password, role)
             VALUES (NEW.id, COALESCE(NEW.logg_id,''), NEW.telephone, NEW.login, NEW.password, NEW.role);
           END"#,
        trigger_prefix, user_table
    );
    conn.execute(&sql_insert, []).map_err(|e| format!("Trigger INSERT: {}", e))?;

    // AFTER UPDATE : met à jour la connexion
    let sql_update = format!(
        r#"CREATE TRIGGER {}_upd
           AFTER UPDATE ON {}
           WHEN NEW.role IS NOT NULL AND OLD.id = NEW.id
           BEGIN
             UPDATE tab_connection SET logg_id=COALESCE(NEW.logg_id,''), telephone=NEW.telephone, login=NEW.login, password=NEW.password
             WHERE id=OLD.id;
           END"#,
        trigger_prefix, user_table
    );
    conn.execute(&sql_update, []).map_err(|e| format!("Trigger UPDATE: {}", e))?;

    // AFTER DELETE : supprime la connexion
    let sql_delete = format!(
        r#"CREATE TRIGGER {}_del
           AFTER DELETE ON {}
           BEGIN
             DELETE FROM tab_connection WHERE id=OLD.id;
           END"#,
        trigger_prefix, user_table
    );
    conn.execute(&sql_delete, []).map_err(|e| format!("Trigger DELETE: {}", e))?;

    Ok(())
}

/// Crée les tables green (cabinet, privilege, nom_acte, nom_assurance)
#[allow(dead_code)]
pub fn ensure_tables_green(pays: &str, tab_id: &str) -> Result<(), String> {
    let tab_id = sanitize_tab_id(tab_id);
    let base = get_db_path_from_config(pays, &tab_id, "green")?;
    let conn = connect(pays, "green", Some(&base))?;
    drop_legacy_suffixed_tables(&conn)?;
    let tables = [
        r#"CREATE TABLE IF NOT EXISTS tab_cabinet (
                id TEXT PRIMARY KEY, nom TEXT, adresse TEXT, pays TEXT, logg_id TEXT, date_creation DATETIME
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_privilege (
                id TEXT PRIMARY KEY, nom TEXT, logg_id TEXT, date_creation DATETIME
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_type_collaborateur (
                id TEXT PRIMARY KEY, nom TEXT NOT NULL, roles_par_defaut TEXT, date_creation DATETIME
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_nom_acte (
                id TEXT PRIMARY KEY, nom TEXT UNIQUE, prix INTEGER, logg_id TEXT, date_creation DATETIME
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_nom_assurance (
                id TEXT PRIMARY KEY, nom TEXT UNIQUE, pourcentage INTEGER, logg_id TEXT, date_creation DATETIME
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_nom_materiel (
                id TEXT PRIMARY KEY, nom TEXT UNIQUE, quantite_defaut INTEGER DEFAULT 0, prix_defaut INTEGER DEFAULT 0, logg_id TEXT, date_creation DATETIME
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_modele_etat (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT DEFAULT '📄',
                description TEXT,
                category TEXT DEFAULT 'administratif',
                elements_json TEXT NOT NULL,
                logg_id TEXT,
                date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
            )"#
        .to_string(),
    ];
    for sql in &tables {
        conn.execute(sql, []).map_err(|e| format!("Create table: {}", e))?;
    }

    // Migration : ajouter date_creation si la table existait sans (bases créées avant)
    let cabinet_table = "tab_cabinet";
    let has_date_creation = conn
        .prepare(&format!("PRAGMA table_info({})", cabinet_table))
        .and_then(|mut stmt| {
            let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
            Ok(rows.filter_map(|r| r.ok()).any(|c| c == "date_creation"))
        })
        .unwrap_or(false);
    if !has_date_creation {
        let _ = conn.execute(
            &format!("ALTER TABLE {} ADD COLUMN date_creation DATETIME;", cabinet_table),
            [],
        );
    }

    // Migration : ajouter password_defaut (mot de passe par défaut pour assistants/comptables/secrétaires)
    let has_password_defaut = conn
        .prepare(&format!("PRAGMA table_info({})", cabinet_table))
        .and_then(|mut stmt| {
            let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
            Ok(rows.filter_map(|r| r.ok()).any(|c| c == "password_defaut"))
        })
        .unwrap_or(false);
    if !has_password_defaut {
        let _ = conn.execute(
            &format!("ALTER TABLE {} ADD COLUMN password_defaut TEXT DEFAULT '';", cabinet_table),
            [],
        );
    }

    // Index pour recherche par logg_id
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tab_privilege_logg ON tab_privilege(logg_id);",
        [],
    );

    Ok(())
}

/// Crée les tables blue (acte, assurance, facture)
#[allow(dead_code)]
pub fn ensure_tables_blue(pays: &str, tab_id: &str) -> Result<(), String> {
    let tab_id = sanitize_tab_id(tab_id);
    let base = get_db_path_from_config(pays, &tab_id, "blue")?;
    let conn = connect(pays, "blue", Some(&base))?;
    drop_legacy_suffixed_tables(&conn)?;
    let tables = [
        r#"CREATE TABLE IF NOT EXISTS tab_acte (
                id TEXT PRIMARY KEY, nom TEXT, description TEXT, date TEXT,
                prix INTEGER, argentRecu INTEGER, argentRestant INTEGER,
                logg_id TEXT, date_creation DATETIME
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_assurance (
                id TEXT PRIMARY KEY, nom TEXT, pourcentage INTEGER, logg_id TEXT, date_creation DATETIME
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_facture (
                id TEXT PRIMARY KEY, prix_acte INTEGER, argent_recu_acte INTEGER,
                argent_restant_acte INTEGER, argent_assurance INTEGER,
                logg_id TEXT, date_creation DATETIME
            )"#
        .to_string(),
        r#"CREATE TABLE IF NOT EXISTS tab_acte_materiel (
                id TEXT PRIMARY KEY, acte_id TEXT, materiel_id TEXT,
                quantite_utilisee INTEGER DEFAULT 1, date_creation DATETIME
            )"#
        .to_string(),
    ];
    for sql in &tables {
        conn.execute(sql, []).map_err(|e| format!("Create table: {}", e))?;
    }
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tab_acte_logg ON tab_acte(logg_id);",
        [],
    );
    Ok(())
}

/// Crée les tables orange (photos, radios - même structure part1..part10)
#[allow(dead_code)]
pub fn ensure_tables_orange(pays: &str, tab_id: &str) -> Result<(), String> {
    let tab_id = sanitize_tab_id(tab_id);
    let base = get_db_path_from_config(pays, &tab_id, "orange")?;
    let conn = connect(pays, "orange", Some(&base))?;
    drop_legacy_suffixed_tables(&conn)?;
    let tables = [
        r#"CREATE TABLE IF NOT EXISTS tab_photo (
                id TEXT PRIMARY KEY,
                logg_id TEXT,
                part1 TEXT, part2 TEXT, part3 TEXT, part4 TEXT, part5 TEXT,
                part6 TEXT, part7 TEXT, part8 TEXT, part9 TEXT, part10 TEXT,
                date_creation DATETIME
            )"#
        .to_string(),
    ];
    for sql in &tables {
        conn.execute(sql, []).map_err(|e| format!("Create table: {}", e))?;
    }
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tab_photo_logg ON tab_photo(logg_id);",
        [],
    );
    Ok(())
}

/// Crée les tables admin (traces + tâches)
#[allow(dead_code)]
pub fn ensure_tables_admin(pays: &str, tab_id: &str) -> Result<(), String> {
    let _ = sanitize_tab_id(tab_id);
    let conn = connect(pays, "admin", None)?;
    drop_legacy_suffixed_tables(&conn)?;
    let trace_sql = r#"CREATE TABLE IF NOT EXISTS tab_trace (
            id TEXT PRIMARY KEY,
            action TEXT,
            type_entite TEXT,
            nom_entite TEXT,
            id_entite TEXT,
            date_action DATETIME,
            user_id TEXT,
            user_nom TEXT,
            user_role TEXT,
            details TEXT,
            logg_id TEXT
        )"#;
    conn.execute(trace_sql, []).map_err(|e| format!("Create tab_trace: {}", e))?;

    let task_sql = r#"CREATE TABLE IF NOT EXISTS tab_task (
            id TEXT PRIMARY KEY,
            titre TEXT NOT NULL,
            description TEXT,
            date_rappel DATETIME,
            date_creation DATETIME,
            user_id TEXT,
            user_nom TEXT,
            logg_id TEXT,
            statut TEXT DEFAULT 'pending'
        )"#;
    conn.execute(task_sql, []).map_err(|e| format!("Create tab_task: {}", e))?;

    // Table admin pour les paiements (tab_admin)
    let admin_sql = r#"CREATE TABLE IF NOT EXISTS tab_admin (
            id TEXT PRIMARY KEY,
            cabinet_id TEXT,
            url_pdf TEXT,
            logg_id TEXT,
            date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
            nombre_mois INTEGER DEFAULT 1,
            montant REAL,
            type_paiement TEXT
        )"#;
    conn.execute(admin_sql, []).map_err(|e| format!("Create tab_admin: {}", e))?;

    // Table config pour clés API (PayDunya, etc.) - clé/valeur par cabinet
    let config_sql = r#"CREATE TABLE IF NOT EXISTS tab_config (
            config_key TEXT PRIMARY KEY,
            config_value TEXT,
            date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
        )"#;
    conn.execute(config_sql, []).map_err(|e| format!("Create tab_config: {}", e))?;

    // Table globale des tutoriels (titre, url YouTube) - visible par tous, modifiable par sadmin
    conn.execute(
        r#"CREATE TABLE IF NOT EXISTS tab_tuto (
            id TEXT PRIMARY KEY,
            titre TEXT NOT NULL,
            url TEXT NOT NULL,
            date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
        )"#,
        [],
    )
    .map_err(|e| format!("Create tab_tuto: {}", e))?;

    // Seed initial si vide
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM tab_tuto", [], |r| r.get(0))
        .unwrap_or(0);
    if count == 0 {
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
        for (id, titre, url) in defaults {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO tab_tuto (id, titre, url, date_creation) VALUES (?1, ?2, ?3, datetime('now'))",
                rusqlite::params![id, titre, url],
            );
        }
    }

    // Intégration automatique des chemins par défaut à la création
    let config_table = "tab_config";
    let default_dir = get_databases_dir().to_string_lossy().to_string();
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
        let sql = format!(
            "INSERT OR IGNORE INTO {} (config_key, config_value, date_creation) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
            config_table
        );
        let _ = conn.execute(&sql, rusqlite::params![k, v]);
    }

    Ok(())
}

/// Lit le chemin d'une base depuis tab_config (dblaadmin).
/// Utilise uniquement les chemins enregistrés, pas de chemin en dur.
/// Vide = même dossier que db_path (admin).
#[allow(dead_code)]
pub fn get_db_path_from_config(pays: &str, tab_id: &str, color: &str) -> Result<String, String> {
    let conn = connect(pays, "admin", None)?;
    ensure_tables_admin(pays, tab_id)?;
    let config_table = "tab_config";
    let config_key = format!("db_path_{}", color);
    let sql = format!("SELECT config_value FROM {} WHERE config_key = ?1", config_table);
    if let Ok(Some(v)) = conn.query_row(&sql, rusqlite::params![&config_key], |r| r.get::<_, Option<String>>(0)) {
        if !v.is_empty() {
            return Ok(v);
        }
    }
    let sql2 = format!("SELECT config_value FROM {} WHERE config_key = 'db_path'", config_table);
    if let Ok(Some(v)) = conn.query_row(&sql2, [], |r| r.get::<_, Option<String>>(0)) {
        if !v.is_empty() {
            return Ok(v);
        }
    }
    Err(format!("Aucun chemin enregistré pour db_path ou db_path_{}. Configurez dans dblaadmin.", color))
}

/// Pays par défaut si non fourni
#[allow(dead_code)]
pub fn default_pays() -> String {
    "sn".to_string()
}
