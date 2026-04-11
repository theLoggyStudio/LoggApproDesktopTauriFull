# Audit des contrôleurs vs commandes Rust

Vérification effectuée le 08/03/2025. Chaque contrôleur a été comparé aux commandes Rust appelées.

---

## Légende

| Statut | Signification |
|--------|---------------|
| OK | Commande implémentée et fonctionnelle |
| STUB | Commande existe mais retourne `Ok(Value::Null)` (non implémentée) |
| MANQUANT | Commande appelée par le frontend mais absente du backend Rust |

---

## 1. PageOuvertureController

| Commande | Statut | Remarque |
|----------|--------|----------|
| create_docteur | OK | Implémenté |
| auth_connection | OK | Implémenté |
| create_cabinet | OK | Implémenté |
| auth_message | OK | Implémenté |

**Verdict : Aucun problème**

---

## 2. PagePatientController

| Commande | Statut | Remarque |
|----------|--------|----------|
| upsert_patient | OK | Implémenté |
| list_patients | OK | Implémenté |
| get_qrcode_part | OK | Implémenté |

**Verdict : Aucun problème**

---

## 3. PagePatientDetailController

| Commande | Statut | Remarque |
|----------|--------|----------|
| get_patient_detail | OK | Implémenté |
| update_patient_detail | OK | Implémenté |
| delete_patient | OK | Implémenté |
| add_acte | OK | Implémenté |
| list_actes_by_patient | OK | Implémenté |
| update_acte | STUB | Retourne null |
| delete_acte | STUB | Retourne null |
| get_acte | STUB | Retourne null |
| add_nom_acte_profile | OK | Corrigé : utilise add_nom_acte |
| add_nom_assurance_profile | OK | Corrigé : utilise add_nom_assurance |
| list_nom_assurances | OK | Implémenté |
| list_nom_actes | OK | Implémenté |
| list_nom_materiels | OK | Implémenté |
| get_materiels_by_acte | OK | Implémenté |
| add_nom_materiel | OK | Implémenté |

**Problèmes :**
- `update_acte`, `delete_acte`, `get_acte` sont des stubs → modification/suppression/détail d'acte ne fonctionne pas

---

## 4. NavTopController

| Commande | Statut | Remarque |
|----------|--------|----------|
| search_patients | OK | Implémenté |

**Verdict : Aucun problème**

---

## 5. PageParametreController

| Commande | Statut | Remarque |
|----------|--------|----------|
| add_nom_acte | OK | Implémenté |
| update_nom_acte | STUB | Retourne null |
| list_nom_actes | OK | Implémenté |
| get_nom_acte | STUB | Retourne null |
| delete_nom_acte | STUB | Retourne null |
| add_nom_assurance | OK | Implémenté |
| update_nom_assurance | STUB | Retourne null |
| list_nom_assurances | OK | Implémenté |
| get_nom_assurance | STUB | Retourne null |
| delete_nom_assurance | STUB | Retourne null |

**Problèmes :**
- Modification, suppression et détail des noms d'actes/assurances ne fonctionnent pas

---

## 6. PageProfilController

| Commande | Statut | Remarque |
|----------|--------|----------|
| get_docteur_qrcode | OK | Implémenté |
| get_docteur_profile | OK | Implémenté |
| update_docteur_profile | STUB | Retourne null |
| get_assistant_qrcode | OK | Implémenté |
| get_assistant_profile | STUB | Retourne null |
| update_assistant_profile | STUB | Retourne null |
| create_assistant | STUB | Retourne null |
| list_assistants | STUB | Retourne null |
| delete_assistant | STUB | Retourne null |
| get_comptable_qrcode | OK | Implémenté |
| get_comptable_profile | STUB | Retourne null |
| update_comptable_profile | STUB | Retourne null |
| create_comptable | STUB | Retourne null |
| list_comptables | STUB | Retourne null |
| delete_comptable | STUB | Retourne null |
| get_secretaire_qrcode | OK | Implémenté |
| get_secretaire_profile | STUB | Retourne null |
| update_secretaire_profile | STUB | Retourne null |
| create_secretaire | STUB | Retourne null |
| list_secretaires | STUB | Retourne null |
| delete_secretaire | STUB | Retourne null |
| get_privilege | STUB | Retourne null |
| update_privilege | STUB | Retourne null |

**Problèmes :**
- Toute la gestion des assistants, comptables et secrétaires (sauf QR codes) ne fonctionne pas
- Mise à jour du profil docteur ne fonctionne pas
- Gestion des privilèges ne fonctionne pas

---

## 7. PageStatistiqueController

| Commande | Statut | Remarque |
|----------|--------|----------|
| stats_list_nom_actes | STUB | Retourne null |
| stats_get_info | STUB | Retourne null |

**Problèmes :**
- Les statistiques ne fonctionnent pas

---

## 8. PageEtatController

| Commande | Statut | Remarque |
|----------|--------|----------|
| list_patients | OK | Implémenté |
| list_actes_by_patient | OK | Implémenté |
| get_acte | STUB | Retourne null |
| get_docteur_profile | OK | Implémenté |

**Problèmes :**
- Détail d'un acte ne fonctionne pas

---

## 9. ImgController

| Commande | Statut | Remarque |
|----------|--------|----------|
| get_photo_part | OK | Implémenté (corrigé) |
| save_photo | OK | Implémenté (corrigé) |
| get_radios_by_acte | OK | Implémenté (corrigé) |

**Verdict : Aucun problème (après correction)**

---

## 10. RadioController

| Commande | Statut | Remarque |
|----------|--------|----------|
| radios_list_pending | STUB | Retourne null |
| radios_associer | STUB | Retourne null |
| radios_download_preview | STUB | Retourne null |

**Problèmes :**
- Liste des radios en attente, association et téléchargement ne fonctionnent pas (flux "radios pending" différent des radios par acte)

---

## 11. TraceController

| Commande | Statut | Remarque |
|----------|--------|----------|
| trace_add | STUB | Retourne null |
| trace_list_all | STUB | Retourne null |
| trace_list_by_logg_id | STUB | Retourne null |
| trace_list_pagination | STUB | Retourne null |

**Problèmes :**
- Toutes les traces (audit) ne fonctionnent pas

---

## 12. AutorisationController

| Commande | Statut | Remarque |
|----------|--------|----------|
| get_user_privileges | OK | Implémenté |

**Verdict : Aucun problème**

---

## 13. AdminController

| Commande | Statut | Remarque |
|----------|--------|----------|
| upsert_patient | OK | Implémenté |
| add_acte | OK | Implémenté |

**Verdict : Aucun problème**

---

## Synthèse des problèmes

### Commandes corrigées (frontend)
- `add_nom_acte_profile` → utilise maintenant `add_nom_acte`
- `add_nom_assurance_profile` → utilise maintenant `add_nom_assurance`

### Commandes STUB (à implémenter) – par priorité

**Priorité haute (fonctionnalités principales) :**
1. `get_acte`, `update_acte`, `delete_acte` – gestion des actes

**Priorité moyenne :**
3. `update_docteur_profile` – modification profil docteur
4. `get_nom_acte`, `update_nom_acte`, `delete_nom_acte` – CRUD noms d'actes
5. `get_nom_assurance`, `update_nom_assurance`, `delete_nom_assurance` – CRUD noms d'assurances
6. `get_privilege`, `update_privilege` – gestion des privilèges

**Priorité basse :**
7. Assistants, comptables, secrétaires (create, list, update, delete, profile)
8. `stats_list_nom_actes`, `stats_get_info` – statistiques
9. `radios_list_pending`, `radios_associer`, `radios_download_preview` – flux radios pending
10. `trace_add`, `trace_list_*` – traces/audit
