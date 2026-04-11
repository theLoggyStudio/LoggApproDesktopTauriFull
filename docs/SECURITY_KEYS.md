# Sécurité — clés et emplacements de données (LoggAppro)

**Périmètre** : documentation et code applicatif dans **`LoggApproDesktopTauriFull`** uniquement (chemins relatifs à ce dépôt).

## Ce qu’il ne faut pas faire

1. **`C:\ProgramData\LoggAppro`**  
   Ne pas y stocker de **clés**, secrets ou fichiers de configuration contenant des clés en clair. `ProgramData` est lisible par plusieurs comptes / services et n’est pas adapté aux secrets applicatifs.

2. **Clé « cachée » ou obfusquée dans le bundle**  
   Tout secret intégré au JavaScript/WebView peut être extrait (outils de build, décompilation, débogage). Ce n’est **pas** une base de sécurité réelle.

3. **Données sensibles non chiffrées** avec une clé pourtant présente dans l’app : la confidentialité repose alors sur une illusion.

## Pratique attendue (desktop / Tauri)

- Définir **`REACT_APP_CRIPT_KEY`** (et variantes si besoin) **au moment du build** via `.env` / variables CI **sans commiter** les valeurs réelles.
- **App mobile LoggAppro (React Native)** : la constante `criptKeyQR` doit être **identique** à `REACT_APP_CRIPT_KEY`. Les QR profil/patient générés par le desktop (Rust `encrypt_data`, format CryptoJS) sont déchiffrés sur mobile avec `decryptData` + cette clé.
- Aligner la **même** clé (ou mécanisme équivalent) côté **Rust / backend** — pas de second défaut divergent en production.
- Pour du stockage local de secrets sur Windows, privilégier en priorité :
  - **Trousseau / Credential Manager** (via plugin Tauri ou API OS),
  - ou répertoire **utilisateur** (`AppData\Local`) avec chiffrement **DPAPI** ou équivalent **côté natif**, pas des fichiers en clair partagés machine.

## Comportement du frontend (après mise à jour)

- **Production** : si les variables de clé ne sont pas injectées au build, **aucune** clé par défaut n’est embarquée dans le bundle (les appels chiffrés échoueront tant que le build n’est pas correctement configuré).
- **Développement** (`import.meta.env.DEV`) : un repli local **documenté** peut être utilisé uniquement pour coller au backend de dev ; il ne doit **jamais** servir en livraison client.

Voir `.env.example` à la racine du projet frontend / Tauri.

## Approche « empreinte PC + `dblaadmin` » (portabilité des bases)

Si vous stockez la **clé effective** dans **`dblaadmin.db`** après un provisionnement lié au poste, vous pouvez **déplacer toutes les bases** (y compris `dblaadmin`) vers un autre PC tout en conservant le déchiffrement. Le détail du flux (table SQL, API, migration) est décrit dans **`ARCHITECTURE_CLE_DBLAADMIN.md`**.
