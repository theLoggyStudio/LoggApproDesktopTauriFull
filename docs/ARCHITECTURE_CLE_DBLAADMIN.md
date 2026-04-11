# Clé de chiffrement : empreinte PC + stockage `dblaadmin` (portabilité des bases)

**Périmètre documentaire** : uniquement le dépôt **`LoggApproDesktopTauriFull`** (pas d’autre dossier de projet imposé ici). Ce texte décrit le **contrat** attendu par le code présent dans ce dépôt et où brancher la logique **dans ce même arbre** (front + Tauri quand le code Rust est versionné ici).

## Objectif

- Utiliser une **information liée au poste** lors de la **première mise en service** (traçabilité / ancrage initial).
- **Enregistrer la clé effective** (ou un matériel de clé dérivé) dans **`dblaadmin.db`** pour que, lors d’un **déplacement de toutes les bases** sur un autre PC, le dossier reste déchiffrable **sans** recalculer une nouvelle clé sur le nouveau matériel.

> **Point clé** : si la clé dépendait **uniquement** du PC sans être stockée dans une base copiée, un autre ordinateur ne pourrait **pas** ouvrir les mêmes données. D’où la persistance dans **`dblaadmin`**, qui voyage avec les fichiers `.db`.

## Principe en deux temps

| Étape | Rôle du PC | Rôle de `dblaadmin` |
|--------|------------|---------------------|
| **1 — Provisionnement** (premier lancement / création cabinet) | Fournir un **identifiant machine** (ou un jeton généré côté client) pour journaliser / lier l’installation. | Stocker la **clé symétrique** (ou secret dérivé) utilisée pour chiffrer les payloads / données métier. |
| **2 — Exploitation & migration** | N’importe quel PC qui possède la **copie complète** des bases. | L’app / le backend **lit la clé** dans `dblaadmin` ; pas besoin que le nouveau PC reproduise l’ancienne empreinte. |

## Schéma côté serveur / natif (hors dossier `src/` React)

La persistance **`dblaadmin.db`** et les routes HTTP ne sont **pas** dans le dossier `src/` Vite de ce dépôt : elles relèvent du **processus qui sert l’API** contactée par cette app (souvent le binaire Tauri + modules Rust dans **`src-tauri`**, ou un serveur local livré avec le même installateur). Toute implémentation SQLite / `dblaadmin` doit rester **alignée sur ce dépôt** comme seul lieu de travail que vous utilisez.

### Table suggérée (exemple)

```sql
-- Exemple de nom : à aligner sur vos conventions Sequelize / migrations
CREATE TABLE IF NOT EXISTS cabinet_crypto_keys (
  id            TEXT PRIMARY KEY,           -- ex. tabId / cabinetId
  secret_b64    TEXT NOT NULL,              -- clé AES-256 en base64 OU blob chiffré par une clé maître installateur
  machine_hint  TEXT,                       -- empreinte ou identifiant machine au moment du provisionnement (audit)
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
```

- **`secret_b64`** : soit la clé en clair dans la DB admin (acceptable **uniquement** si `dblaadmin.db` est traité comme secret — droits fichiers, sauvegardes chiffrées), soit **chiffré** avec un secret d’installation connu du déployeur.
- **`machine_hint`** : hash ou ID stable envoyé une fois par le desktop (Tauri) pour trace, **pas** pour recalculer seul la clé après migration.

### Flux API suggérés

1. **`GET /api/env/config`** (déjà consommé par le frontend via `environement.constant.ts`)  
   - Étendre la réponse pour inclure **`REACT_APP_CRIPT_KEY`** (et variantes) **lues depuis `dblaadmin`** une fois le cabinet identifié (session / tabId).
2. **`POST /api/admin/provision-crypto`** (ou équivalent dans votre init repository)  
   - Body : `{ tabId, machineFingerprint }`.  
   - Si aucune ligne pour ce `tabId` : générer `crypto.randomBytes(32)`, enregistrer dans `cabinet_crypto_keys`, retourner la clé **une seule fois** si vous adoptez un modèle « jamais renvoyée en clair après » (sinon seulement via `GET` authentifié).

### Rust / Tauri (optionnel mais cohérent avec « clé grâce au PC »)

- Commande du type `get_machine_provisioning_id` : concat stable (ex. infos matériel hashées) **uniquement** pour le provisionnement / logs — **pas** comme seul secret de chiffrement sans stockage `dblaadmin`.

## Côté frontend (`LoggApproDesktopTauriFull/src`)

- **`loadEnvFromDB()`** dans `src/body/constants/environement.constant.ts` appelle déjà **`/api/env/config`**.  
- Dès que cette route renvoie **`REACT_APP_CRIPT_KEY`** (issue de `dblaadmin` côté serveur / natif), le cache `envConfigCache` remplit les clés **sans `.env`** (tant que l’API est joignable et authentifiée).

## Migration vers un autre PC

1. Copier **l’intégralité** des fichiers SQLite concernés, **y compris `dblaadmin.db`** (et `dbla.db`, bases cabinet, etc.).
2. Réinstaller l’app ou pointer le backend vers le **même dossier `databases/`**.
3. Au premier chargement authentifié, **`GET /api/env/config`** lit la clé dans **`dblaadmin`** → le front et le Rust restent alignés avec les données migrées.

## Sécurité — rappels

- **`dblaadmin.db` contient le secret** : protéger les sauvegardes, droits NTFS, pas de copie sur partage public.
- Ne **pas** placer ce fichier sous `C:\ProgramData\...` en clair accessible à tous les comptes si la politique de sécurité l’interdit (voir `SECURITY_KEYS.md`).

## Prochaine étape concrète **dans ce dépôt uniquement**

1. **Front** : aucun changement obligatoire si `/api/env/config` expose déjà les clés — le fichier `environement.constant.ts` consomme cette route.  
2. **Tauri / Rust** (dossier **`src-tauri`** de ce projet, lorsqu’il est présent) : ouvrir `dblaadmin.db`, créer la table proposée, exposer le provisionnement et faire en sorte que **`GET /api/env/config`** (ou l’équivalent invoqué par le front) lise la clé dans cette base.  
3. Ne pas dépendre d’un autre chemin de travail : tout le code livré pour cette fonctionnalité doit vivre sous **`LoggApproDesktopTauriFull`** selon votre organisation (Rust embarqué + front actuel).
