# Migration du backend Node.js vers Rust (Tauri)

> **Note :** LPB a été supprimé. Le backend est désormais entièrement géré par Tauri (Rust).

## Vue d'ensemble

Ce document décrit la migration effectuée pour que le backend soit entièrement géré par Rust (Tauri). La structure LPB (LoggAppro Backend) a été migrée vers les commandes Tauri.

---

## 1. État actuel

### Backend Node.js (LPB)
- **Express** sur le port 7063
- **6 bases SQLite** par pays (SN, TG) : `dblayellow`, `dblagreen`, `dblablue`, `dblaorange`, `dblapink`, `dblaadmin`
- **Tables dynamiques** par `tabId` : `tab_user{tabId}`, `tab_patient{tabId}`, `tab_acte{tabId}`, etc.
- **Chiffrement** : AES (CryptoJS) avec IV, clé depuis `REACT_APP_CRIPT_KEY`

### Tauri (Rust) actuel
- **commands.rs** : ~45 commandes déclarées mais **toutes retournent `Ok(Value::Null)`** (non implémentées)
- **db.rs** : une seule base `database.db`, schéma minimal (table `meta`)
- **main.rs** : conflit (deux `fn main()`), seul le second est utilisé

---

## 2. Architecture des bases de données (LPB)

### Fichiers SQLite par pays
| Base       | Usage principal                          |
|-----------|-------------------------------------------|
| dbla.db   | tab_pays, tab_env (config globale)       |
| dblayellow| Users, Patients, Docteurs, Secretaires, Comptables, Assistants, Connections |
| dblagreen | Cabinets, Privileges, NomActe, NomAssurance, NomMateriel |
| dblablue  | Actes, Factures, QRCode, ActeMateriel    |
| dblaorange| Photos, Radios                           |
| dblapink  | (optionnel)                              |
| dblaadmin | Admin (paiements)                        |

### Tables dynamiques (suffixe `{tabId}`)
- `tab_user{tabId}`, `tab_patient{tabId}`, `tab_docteur{tabId}`, `tab_secretaire{tabId}`, `tab_comptable{tabId}`, `tab_assistant{tabId}`
- `tab_cabinet{tabId}`, `tab_privilege{tabId}`, `tab_nom_acte{tabId}`, `tab_nom_assurance{tabId}`, `tab_nom_materiel{tabId}`
- `tab_acte{tabId}`, `tab_facture{tabId}`, `tab_qr_code{tabId}`, `tab_photo{tabId}`, `tab_radio{tabId}`, `tab_acte_materiel{tabId}`
- `tab_connection` (sans suffixe, partagée)
- `tab_admin{tabId}`

### Emplacement des fichiers
- **Dev** : `process.cwd()/databases/`
- **Prod (pkg)** : `%ProgramData%/LoggAppro/databases/` ou `%LocalAppData%/LoggAppro/databases/`

---

## 3. API REST → Commandes Tauri (mapping)

| Endpoint LPB | Commande Rust | Paramètres (payload) |
|--------------|---------------|----------------------|
| POST /api/pageOuverture/docteur | create_docteur | body chiffré |
| POST /api/pageOuverture/cabinet | create_cabinet | body chiffré |
| POST /api/pageOuverture/connection | auth_connection | body chiffré |
| POST /api/pageOuverture/auth | auth_message | body chiffré |
| POST /api/pagePatient/patient | upsert_patient | body chiffré |
| GET /api/pagePatient/patients/:tabId/:limit/:pays | list_patients | url/enc(tabId)/enc(limit)/enc(pays) |
| GET /api/pagePatient/qrcode/:userId/:index/:tabId/:pays | get_qrcode_part | url/enc(userId)/enc(index)/enc(tabId)/enc(pays) |
| GET /api/navtop/patients/chercher/:tabId/:search/:pays | search_patients | url/enc(tabId)/enc(search)/enc(pays) |
| GET /api/pagePatientDetail/patient/:id/:tabId/:pays | get_patient_detail | url/enc(id)/enc(tabId)/enc(pays) |
| PUT /api/pagePatientDetail/patient | update_patient_detail | body chiffré |
| DELETE /api/pagePatientDetail/patient/:id/:tabId/:pays | delete_patient | url/enc(id)/enc(tabId)/enc(pays) |
| POST /api/pagePatientDetail/acte | add_acte | body chiffré |
| GET /api/pagePatientDetail/actes/:patientId/:limit/:tabId/:pays | list_actes_by_patient | url/enc(patientId)/enc(limit)/enc(tabId)/enc(pays) |
| ... | ... | ... |

---

## 4. Format du payload (Frontend → Rust)

### Objets (POST/PUT)
```json
{ "body": "<AES_encrypted_JSON_string>" }
```
- Chiffrement : AES-CBC, PKCS7, IV aléatoire (16 bytes)
- Format : `base64(IV):base64(ciphertext)` puis `encodeURIComponent`
- Clé : `REACT_APP_CRIPT_KEY` (32 caractères recommandés)

### URL avec paramètres (GET)
```
/api/pagePatient/patients/<enc_tabId>/<enc_limit>/<enc_pays>
```
- Chaque segment (sauf le premier) est chiffré individuellement
- Rust doit : split sur `/`, décrypter chaque segment (index ≥ 1)

---

## 5. À ajouter en Rust

### 5.1 Dépendances Cargo.toml
```toml
[dependencies]
# Existant
rusqlite = { version = "0.31", features = ["bundled"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2", features = [] }

# À ajouter
aes = "0.8"
block-modes = "0.9"
base64 = "0.21"
uuid = { version = "1", features = ["v4"] }
chrono = "0.4"
bcrypt = "0.16"
```

### 5.2 Module `crypto`
- `decrypt_data(encrypted: &str, key: &str) -> Result<String, String>`
- `encrypt_data(plain: &str, key: &str) -> Result<String, String>`
- Compatible avec CryptoJS (AES-CBC, IV:base64:ciphertext)

### 5.3 Module `db` (refonte)
- `get_db_path(pays: &str, color: &str) -> PathBuf` : chemin vers dbla{color}.db
- `get_dbla_main_path() -> PathBuf` : chemin vers dbla.db (tab_pays, tab_env)
- Support multi-bases (yellow, green, blue, orange, pink, admin)
- `ensure_tables(conn: &Connection, tab_id: &str)` : création des tables dynamiques

### 5.4 Module `payload`
- `parse_payload(payload: &str, key: &str) -> Result<Payload, String>`
  - Détecte format body vs url
  - Déchiffre et extrait tabId, pays, limit, id, etc.
- `Payload` : struct avec champs optionnels (tab_id, pays, limit, id, body_json, etc.)

### 5.5 Implémentation des commandes
Chaque commande doit :
1. Recevoir `payload: String`
2. Récupérer la clé de chiffrement (depuis config/env ou hardcodée pour dev)
3. Parser le payload (`parse_payload`)
4. Ouvrir la bonne base (pays + couleur)
5. Exécuter la requête SQL
6. Chiffrer la réponse si nécessaire (comme le frontend s’y attend)
7. Retourner `Result<Value, String>`

### 5.6 Schéma SQL (migrations)
Reproduire les `CREATE TABLE IF NOT EXISTS` de `initRepository.js` (lignes 798–1010) :
- `tab_user{tabId}`, `tab_connection`, `tab_docteur{tabId}`, `tab_patient{tabId}`
- `tab_cabinet{tabId}`, `tab_privilege{tabId}`, `tab_nom_acte{tabId}`, `tab_nom_assurance{tabId}`
- `tab_acte{tabId}`, `tab_facture{tabId}`, `tab_qr_code{tabId}`, `tab_photo{tabId}`
- `tab_radio{tabId}`, `tab_acte_materiel{tabId}`, `tab_admin{tabId}`

---

## 6. À modifier

### 6.1 `src-tauri/src/main.rs`
- Supprimer le premier `fn main()` (celui avec `ping_db`)
- Garder un seul `main()` avec `invoke_handler` et toutes les commandes
- Ajouter `setup` pour initialiser les bases (dbla.db, dblayellow, etc.) et créer les tables si besoin

### 6.2 `src-tauri/src/commands.rs`
- Changer la signature : `pub async fn xxx(payload: String) -> Result<Value, String>`
- Tauri v2 : vérifier si `params` et `obj` sont utilisés côté frontend
- Actuellement le frontend envoie `{ payload }` → la commande doit accepter un argument nommé `payload`

### 6.3 `src-tauri/capabilities/default.json`
Ajouter les permissions d’invoke pour chaque commande :
```json
{
  "permissions": [
    "core:default",
    "core:invoke:create_docteur",
    "core:invoke:auth_connection",
    "core:invoke:auth_message",
    "core:invoke:create_cabinet",
    "core:invoke:upsert_patient",
    "core:invoke:list_patients",
    "core:invoke:get_qrcode_part",
    "core:invoke:get_photo_part",
    "core:invoke:save_photo",
    "core:invoke:get_patient_detail",
    "core:invoke:update_patient_detail",
    "core:invoke:delete_patient",
    "core:invoke:add_acte",
    "core:invoke:list_actes_by_patient",
    "core:invoke:get_acte",
    "core:invoke:update_acte",
    "core:invoke:delete_acte",
    "core:invoke:get_user_privileges",
    "core:invoke:get_privilege",
    "core:invoke:update_privilege",
    "core:invoke:search_patients",
    "core:invoke:add_nom_acte",
    "core:invoke:update_nom_acte",
    "core:invoke:list_nom_actes",
    "core:invoke:get_nom_acte",
    "core:invoke:delete_nom_acte",
    "core:invoke:add_nom_assurance",
    "core:invoke:update_nom_assurance",
    "core:invoke:list_nom_assurances",
    "core:invoke:get_nom_assurance",
    "core:invoke:delete_nom_assurance",
    "core:invoke:get_docteur_qrcode",
    "core:invoke:get_docteur_profile",
    "core:invoke:update_docteur_profile",
    "core:invoke:get_assistant_*",
    "core:invoke:get_comptable_*",
    "core:invoke:get_secretaire_*",
    "core:invoke:stats_*",
    "core:invoke:radios_*",
    "core:invoke:trace_*"
  ]
}
```

### 6.4 Frontend (optionnel)
- Si le backend Express n’est plus utilisé : retirer les appels `fetch` vers `/api/env/config`
- `environement.constant.ts` : en mode Tauri, ne pas charger la config depuis le serveur HTTP

### 6.5 `tauri.conf.json`
- `build.frontendDist` : pointer vers `dist` (Vite) au lieu de `build` si vous utilisez Vite
- `bundle.resources` : inclure `dbla.db` (ou seed) si nécessaire

---

## 7. Ordre de priorité pour l’implémentation

1. **Phase 1 – Fondations**
   - Module `crypto` (AES compatible CryptoJS)
   - Module `db` multi-bases + chemins
   - Module `payload` (parse body/url)
   - Création des tables (migrations)

2. **Phase 2 – Authentification**
   - `create_docteur`, `create_cabinet`, `auth_connection`, `auth_message`

3. **Phase 3 – Patients**
   - `upsert_patient`, `list_patients`, `get_patient_detail`, `update_patient_detail`, `delete_patient`
   - `search_patients`

4. **Phase 4 – Actes et paramètres**
   - `add_acte`, `list_actes_by_patient`, `get_acte`, `update_acte`, `delete_acte`
   - `add_nom_acte`, `list_nom_actes`, `get_nom_acte`, `update_nom_acte`, `delete_nom_acte`
   - `add_nom_assurance`, `list_nom_assurances`, etc.

5. **Phase 5 – Profils et médias**
   - Docteur, Assistant, Comptable, Secrétaire (CRUD + QR/photo)
   - `get_qrcode_part`, `get_photo_part`, `save_photo`, `get_radios_by_acte`

6. **Phase 6 – Avancé**
   - `trace_*`, `radios_*`, `stats_*`, privilèges, admin

---

## 8. Fichiers LPB à utiliser comme référence

| Fichier | Usage |
|---------|-------|
| `LPB/repository/initRepository.js` | Schéma des tables, `ensureTabTables` |
| `LPB/repository/PatientRepository.js` | Logique patient (create, findAll, findById, update, remove) |
| `LPB/repository/ActeRepository.js` | Logique actes |
| `LPB/services/ServicesDesktop.js` | Orchestration des handlers (pagePatient, pagePatientDetail, etc.) |
| `LPB/security/security.js` | encryptData, decryptData |
| `LPB/constants/deployement.constants.js` | Mapping pays → bases |
| `LPB/constants/privileges.constants.js` | Codes privilèges |
| `LPB/index.js` | Routes Express → mapping vers les commandes |

---

## 9. Compatibilité des données

- Les bases SQLite existantes (Node) doivent rester lisibles par Rust
- Pas de changement de schéma si les `CREATE TABLE` Rust sont identiques à ceux de `initRepository.js`
- Le chemin des bases en prod doit être le même : `%ProgramData%/LoggAppro/databases/` ou équivalent

---

## 10. Tests

- Tester chaque commande avec des payloads chiffrés (comme le frontend)
- Vérifier la compatibilité avec des bases créées par l’ancien backend Node
- Tester le mode "admin" (fichiers locaux) si toujours utilisé
