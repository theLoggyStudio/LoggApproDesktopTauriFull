# Accès web à LoggAppro

L'application peut être utilisée depuis un navigateur sur le réseau local (tablette, autre PC, etc.).

## Important : l'exe seul ne suffit pas

L'application installée (exe) **ne sert pas le frontend sur le réseau**. Pour l'accès web, vous devez lancer le serveur de développement.

## Procédure

### 1. Lancer en mode web (obligatoire)

```bash
npm run dev:tauri
```

Cela démarre :
- **Vite** (frontend) sur `http://0.0.0.0:7061` — accessible sur le réseau
- **Tauri** (fenêtre + backend sur le port 7062)

Gardez la fenêtre Tauri ouverte (vous pouvez la réduire). Elle lance le backend.

### 2. Accéder depuis un autre appareil

1. Trouvez l'IP du PC serveur (ex. `192.168.1.100`).
2. Depuis un autre appareil sur le même réseau :
   ```
   http://192.168.1.100:7061
   ```

### 3. Pare-feu Windows (souvent la cause si "sans erreur")

Si la page charge mais rien ne fonctionne, ou si vous ne voyez pas la page :

1. Ouvrez **Pare-feu Windows Defender** → Paramètres avancés
2. Règles de trafic entrant → Nouvelle règle → Port
3. TCP, ports **7061** et **7062**
4. Autoriser la connexion

Ou en PowerShell (admin) :
```powershell
netsh advfirewall firewall add rule name="LoggAppro 7061" dir=in action=allow protocol=TCP localport=7061
netsh advfirewall firewall add rule name="LoggAppro 7062" dir=in action=allow protocol=TCP localport=7062
```

## Indicateurs en mode web

- **Barre verte** "Mode web — Backend connecté" : tout fonctionne
- **Barre rouge** "Backend inaccessible" : lancez `npm run dev:tauri` sur le PC serveur et vérifiez le pare-feu

## Alternative : exe + serveur frontend

Si vous voulez utiliser l'exe compilé :

1. Terminal 1 : `npm run dev` (frontend sur 7061)
2. Lancer l'exe (backend sur 7062)
3. Depuis un autre appareil : `http://<IP>:7061`

## Erreur `POST …:7062/invoke` → 500 (Internal Server Error)

Souvent : **clé de chiffrement différente** entre le **frontend** (fichiers JS du build) et le **backend Rust**.

- Le front envoie des payloads **chiffrés** avec `REACT_APP_CRIPT_KEY` **injectée au moment du `npm run build`**.
- Le back déchiffre avec la variable d’environnement **`REACT_APP_CRIPT_KEY`** au lancement de Tauri, ou sinon la clé **défaut dev** `clechiffredeboutenbout0123456789` (voir `src-tauri`).
- Si le build a été fait **sans** `REACT_APP_CRIPT_KEY` (production), le front peut chiffrer avec une **clé vide** → le back ne peut pas parser le corps → réponse **500** (souvent message du type *Body manquant*).

**Correctif :** dans `.env` à la racine du projet, définir par exemple :

```env
REACT_APP_CRIPT_KEY=clechiffredeboutenbout0123456789
```

Puis **reconstruire** le front (`npm run build`) et servir ce build. Lancez Tauri / l’exe avec la **même** `REACT_APP_CRIPT_KEY` si vous ne utilisez pas la valeur par défaut côté Rust.

Le port **7063** (`/api/env/config`) n’est **pas** utilisé en accès typique LAN + Tauri ; une erreur *connection refused* sur 7063 est normale dans ce scénario (le front retombe sur le `.env` du build).

## Bouton « Envoyer le lien par e-mail » (mailto) sous Windows

Si **Chrome** est installé avec **plusieurs profils**, Windows peut associer le protocole **mailto:** au navigateur au lieu d’**Outlook**, du **Courrier** Windows ou de **Thunderbird**. L’app desktop tente d’ouvrir le mail via le **gestionnaire de protocole Windows** (`rundll32` puis `cmd start`) avant de retomber sur l’API standard.

Si le message ne s’ouvre toujours pas dans le bon programme :

1. **Paramètres Windows** → **Applications** → **Applications par défaut**
2. Cherchez **Courrier** / **E-mail** (ou « Choisir les applications par défaut selon le protocole » → **MAILTO**)
3. Définissez **Outlook**, **Courrier**, **Thunderbird**, etc. — **pas** Chrome, si vous voulez un vrai client mail.
