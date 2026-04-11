# Architecture du garde-temps PayDunya

## Vue d'ensemble

Le système de gestion du temps/licence hybride (local + serveur) s'applique **uniquement au module PayDunya**. Le reste de l'application fonctionne normalement sans dépendance à cette logique.

## Objectif

Empêcher qu'un simple changement de date/heure du PC permette de contourner les contrôles liés au module PayDunya, en utilisant une stratégie hybride :
1. Source locale (horloge machine)
2. Source serveur (API temps externe : WorldTimeAPI, timeapi.io)
3. Détection d'anomalies si l'heure locale recule artificiellement

## Fichiers créés/modifiés

### Backend (Rust/Tauri)

| Fichier | Action |
|---------|--------|
| `src-tauri/src/paydunya_time_guard.rs` | **Créé** – Module complet du garde-temps |
| `src-tauri/src/commands.rs` | **Modifié** – Intégration du guard dans `payer_paydunya` et `payer_paydunya_mensuel`, nouvelles commandes |
| `src-tauri/src/main.rs` | **Modifié** – Déclaration du module et enregistrement des commandes |
| `src-tauri/src/http_server.rs` | **Modifié** – Route `/api/paydunya/time`, handlers pour les commandes guard |

### Frontend (React/TypeScript)

| Fichier | Action |
|---------|--------|
| `src/body/services/PayDunyaTimeGuardService.ts` | **Créé** – Service centralisé |
| `src/body/GlobalComponents/BoutonPayement.tsx` | **Modifié** – Vérification avant `handlePayer` |
| `src/body/GlobalComponents/ModalPaiementExpire.tsx` | **Modifié** – Vérification avant chargement URL, affichage message si bloqué |

## Stockage local

- **Emplacement** : `{ProgramData}/LoggAppro/lpd_pay.dat` (nom obfusqué)
- **Format** : JSON chiffré (AES-CBC, clé `REACT_APP_CRIPT_KEY`)
- **Données persistées** :
  - `firstUseAt` : première utilisation
  - `lastSeenAt` : dernière date valide observée
  - `lastServerAt` : dernière date serveur
  - `anomalyCount` : nombre d'anomalies
  - `status` : ACTIVE, LIMITED, BLOCKED, OFFLINE_ALLOWED, SUSPICIOUS_CLOCK

## Logique métier

1. **Première utilisation** : Création d'un état initial (serveur si dispo, sinon local)
2. **Utilisation normale** : Récupération heure serveur → comparaison avec `lastSeenAt` → mise à jour si cohérent
3. **Recul détecté** : Si `heure_locale < lastSeenAt - 5 min` → anomalie, incrément `anomalyCount`
4. **Blocage** : À partir de 3 anomalies → statut BLOCKED, PayDunya désactivé
5. **Mode suspect** : 1–2 anomalies → SUSPICIOUS_CLOCK (avertissement)

## Points d'intégration PayDunya

| Point d'entrée | Vérification |
|----------------|--------------|
| `payer_paydunya` (commande Rust) | Guard au début, `register_usage` après succès |
| `payer_paydunya_mensuel` (commande Rust) | Guard au début, `register_usage` après succès |
| `BoutonPayement.handlePayer` | `canUsePayDunya()` avant appel API |
| `ModalPaiementExpire` (chargement URL) | `canUsePayDunya()` avant `payerAvecPaydounia` |

## API exposée

### Commandes Tauri

- `paydunya_can_use` → `{ canUse, status, message }`
- `paydunya_get_status` → `{ status, firstUseAt, lastSeenAt, lastServerAt, anomalyCount }`
- `paydunya_register_usage` → enregistre une utilisation
- `paydunya_sync_time` → synchronise et retourne le résultat

### Endpoint HTTP

- `GET /api/paydunya/time` → `{ success, serverTimeUtc, unixTimestamp }`

### Service frontend

- `canUsePayDunya()` : vérification principale
- `getPayDunyaStatus()` : statut détaillé
- `registerPayDunyaUsage()` : enregistrement (optionnel, le backend le fait)
- `syncPayDunyaServerTime()` : synchronisation proactive

## Résilience

- Serveur temps indisponible → fallback sur dernière date serveur connue, puis heure locale
- Fichier local manquant → création état initial
- Fichier corrompu → erreur, PayDunya bloqué (fail closed)
- Erreur du guard → message clair, pas de crash de l'app

## Scénarios de test recommandés

1. **Première utilisation online** : PayDunya fonctionne, fichier créé
2. **Utilisation normale online** : Pas de blocage
3. **Utilisation offline** : Après synchro serveur réussie, fonctionne avec cache
4. **Recul horaire** : Reculer l'horloge de 10 min → anomalie, après 3 fois → blocage
5. **Serveur indisponible** : Fallback cache/local, PayDunya reste utilisable
6. **Stockage supprimé** : Nouvelle première utilisation
7. **Stockage modifié** : Chiffrement empêche la modification manuelle
8. **PayDunya bloqué** : Reste de l'app (auth, CRUD, etc.) fonctionne normalement
