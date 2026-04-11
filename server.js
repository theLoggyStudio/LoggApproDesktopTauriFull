const express = require('express');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();

// Gestionnaires d'erreurs globaux pour éviter que le processus se termine silencieusement
process.on('uncaughtException', (error) => {
  console.error('═══════════════════════════════════════════════════════════');
  console.error('[SERVER] ❌ ERREUR NON CAPTURÉE (uncaughtException)');
  console.error('[SERVER] Erreur:', error.message);
  console.error('[SERVER] Stack:', error.stack);
  console.error('═══════════════════════════════════════════════════════════');
  // Ne pas terminer le processus immédiatement, laisser le serveur continuer si possible
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('═══════════════════════════════════════════════════════════');
  console.error('[SERVER] ❌ PROMESSE REJETÉE NON GÉRÉE (unhandledRejection)');
  console.error('[SERVER] Raison:', reason);
  if (reason instanceof Error) {
    console.error('[SERVER] Stack:', reason.stack);
  }
  console.error('═══════════════════════════════════════════════════════════');
  // Ne pas terminer le processus
});

// Trouver le répertoire de l'exécutable
const getExecutableDir = () => {
  // Si on est dans un exécutable pkg, utiliser process.pkg.entrypoint
  if (process.pkg) {
    // En mode pkg, __dirname pointe vers le snapshot
    // Le répertoire de l'exécutable est le répertoire où se trouve l'exe
    return path.dirname(process.execPath);
  }
  if (typeof require !== 'undefined' && require.main && require.main.filename) {
    return path.dirname(require.main.filename);
  }
  if (process.execPath) {
    return path.dirname(process.execPath);
  }
  return __dirname || process.cwd();
};

const exeDir = getExecutableDir();

// Chercher le fichier .env dans le répertoire de l'exécutable ou le répertoire courant
let envPath = null;
const envInExeDir = path.join(exeDir, '.env');
const envInCwd = path.join(process.cwd(), '.env');

// Charger d'abord depuis le répertoire courant (priorité)
if (fs.existsSync(envInCwd)) {
  envPath = envInCwd;
  require('dotenv').config({ path: envPath });
  console.log(`[ENV] Fichier .env chargé depuis le répertoire courant: ${envPath}`);
} else if (fs.existsSync(envInExeDir)) {
  envPath = envInExeDir;
  require('dotenv').config({ path: envPath });
  console.log(`[ENV] Fichier .env chargé depuis le répertoire de l'exécutable: ${envPath}`);
} else {
  // Charger depuis la racine du projet si disponible
  const projectRoot = path.join(__dirname, '.env');
  if (fs.existsSync(projectRoot)) {
    envPath = projectRoot;
    require('dotenv').config({ path: envPath });
    console.log(`[ENV] Fichier .env chargé depuis la racine du projet: ${envPath}`);
  } else {
    console.log('[ENV] Aucun fichier .env trouvé, utilisation des valeurs par défaut');
    // Charger dotenv sans chemin pour utiliser les variables d'environnement système
    require('dotenv').config();
  }
}

// Afficher les valeurs de PORT et FRONT_URL pour debug
console.log(`[ENV] PORT=${process.env.PORT || 'non défini'}`);
console.log(`[ENV] FRONT_URL=${process.env.FRONT_URL || 'non défini'}`);

// Chercher le dossier build
let buildDir = null;

// Si on est dans un exécutable pkg, chercher dans le snapshot
if (process.pkg) {
  // En mode pkg, les assets sont dans le snapshot
  // Le chemin du snapshot est accessible via __dirname
  const snapshotBuild = path.join(__dirname, 'build');
  if (fs.existsSync(snapshotBuild)) {
    buildDir = snapshotBuild;
    console.log('[PKG] Using build directory from snapshot:', buildDir);
  } else {
    // Si pas dans le snapshot, chercher à côté de l'exécutable
    const exeBuild = path.join(exeDir, 'build');
    if (fs.existsSync(exeBuild)) {
      buildDir = exeBuild;
      console.log('[PKG] Using build directory from exe directory:', buildDir);
    }
  }
}

// Si pas trouvé ou pas en mode pkg, chercher ailleurs
if (!buildDir || !fs.existsSync(buildDir)) {
  // Chercher à côté de l'exécutable
  buildDir = path.join(exeDir, 'build');
  if (fs.existsSync(buildDir)) {
    console.log('Using build directory from exe directory:', buildDir);
  } else {
    // Chercher dans le répertoire parent (pour le mode dev)
    const parentBuild = path.join(exeDir, '..', 'LoggApproFrontReactWeb', 'build');
    if (fs.existsSync(parentBuild)) {
      buildDir = parentBuild;
      console.log('Using build directory from parent:', buildDir);
    } else {
      // Chercher dans le répertoire de travail actuel
      const cwdBuild = path.join(process.cwd(), 'build');
      if (fs.existsSync(cwdBuild)) {
        buildDir = cwdBuild;
        console.log('Using build directory from cwd:', buildDir);
      } else {
        console.error('ERROR: Build directory not found!');
        console.error('Searched in:');
        if (process.pkg) {
          console.error('  -', path.join(__dirname, 'build'), '(snapshot)');
        }
        console.error('  -', path.join(exeDir, 'build'));
        console.error('  -', parentBuild);
        console.error('  -', cwdBuild);
        buildDir = null; // Garder null pour afficher l'erreur plus tard
      }
    }
  }
}

// Fonction principale pour initialiser et démarrer le serveur
function initServer() {
  // Vérifier que buildDir existe avant de continuer
  if (!buildDir || !fs.existsSync(buildDir)) {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('[SERVER] ❌ ERREUR CRITIQUE: Le dossier build n\'a pas été trouvé !');
    console.error('[SERVER] Le serveur ne peut pas démarrer sans le dossier build.');
    console.error('[SERVER] Veuillez exécuter "npm run build" avant de lancer le serveur.');
    console.error('═══════════════════════════════════════════════════════════');
    // Attendre 5 secondes avant de quitter pour que l'utilisateur puisse lire le message
    setTimeout(() => {
      process.exit(1);
    }, 5000);
    return; // Ne pas continuer l'exécution
  }

  const indexPath = path.join(buildDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('[SERVER] ❌ ERREUR CRITIQUE: index.html n\'a pas été trouvé dans le dossier build !');
    console.error('[SERVER] Chemin attendu:', indexPath);
    console.error('[SERVER] Veuillez exécuter "npm run build" avant de lancer le serveur.');
    console.error('═══════════════════════════════════════════════════════════');
    setTimeout(() => {
      process.exit(1);
    }, 5000);
    return;
  }

  console.log('✅ Dossier build trouvé:', buildDir);
  console.log('✅ index.html trouvé:', indexPath);

  const app = express();

  // Middleware pour ajouter les headers nécessaires pour permettre l'iframe
  app.use((req, res, next) => {
  // Permettre l'affichage dans une iframe depuis n'importe quelle origine
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  // Alternative: utiliser Content-Security-Policy pour plus de contrôle
  res.setHeader('Content-Security-Policy', "frame-ancestors *;");
  
  // Headers CORS pour permettre les requêtes depuis l'iframe
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Si pas d'origine, permettre toutes les origines
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Gérer les requêtes OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
    next();
  });

  /**
   * Trouve un port disponible de manière aléatoire
   * Utilise la plage de ports dynamiques (49152-65535)
   */
  function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const minPort = 49152;
    const maxPort = 65535;
    const randomPort = Math.floor(Math.random() * (maxPort - minPort + 1)) + minPort;
    
    const server = net.createServer();
    
    server.listen(randomPort, () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : randomPort;
      server.close(() => {
        resolve(port);
      });
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port déjà utilisé, réessayer avec un autre port aléatoire
        findAvailablePort().then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
  }

  // Utiliser FRONT_URL ou PORT depuis le .env, sinon utiliser le port par défaut 7062
  let PORT;
if (process.env.PORT) {
  PORT = parseInt(process.env.PORT, 10);
} else if (process.env.FRONT_URL) {
  try {
    const url = new URL(process.env.FRONT_URL);
    PORT = parseInt(url.port || '7062', 10);
  } catch (e) {
    PORT = 7062;
  }
} else {
  // Utiliser le port par défaut 7062
  PORT = 7062;
}

  // Désactiver l'ouverture automatique du navigateur
  process.env.BROWSER = 'none';

  console.log('Frontend server starting...');
  console.log('Executable directory:', exeDir);
  console.log('Current working directory:', process.cwd());
  console.log('Build directory:', buildDir);
  console.log('Build directory exists:', fs.existsSync(buildDir));
  if (fs.existsSync(buildDir)) {
    const indexPath = path.join(buildDir, 'index.html');
    console.log('index.html path:', indexPath);
    console.log('index.html exists:', fs.existsSync(indexPath));
    if (fs.existsSync(indexPath)) {
      console.log('index.html size:', fs.statSync(indexPath).size, 'bytes');
    }
  }

  // Configuration du proxy pour les requêtes API
  // Le proxy utilise dynamiquement le hostname de la requête (localhost ou IP)
  const getBackendPort = () => {
  if (process.env.BACK_URL) {
    try {
      const url = new URL(process.env.BACK_URL);
      return url.port || '7063';
    } catch (e) {
      return '7063';
    }
  }
    return '7063';
  };

  const BACKEND_PORT = getBackendPort();

  app.use('/api', createProxyMiddleware({
  target: (req) => {
    // Utiliser le hostname de la requête (localhost ou IP) avec le port du backend
    const hostname = req.headers.host?.split(':')[0] || req.hostname || 'localhost';
    const backendUrl = `http://${hostname}:${BACKEND_PORT}`;
    console.log(`[PROXY] Redirection vers: ${backendUrl}`);
    return backendUrl;
  },
  changeOrigin: false, // Garder le même hostname que la requête
  logLevel: 'warn', // Réduire les logs
  onError: (err, req, res) => {
    console.error('Proxy error:', err.message);
    const hostname = req.headers.host?.split(':')[0] || req.hostname || 'localhost';
    res.status(503).json({ 
      error: 'Backend server is not available',
      message: `Please ensure the backend server is running on http://${hostname}:${BACKEND_PORT}`
    });
    }
  }));

  // Servir les fichiers statiques du build
  try {
    app.use(express.static(buildDir, {
    maxAge: '1y', // Cache les fichiers statiques pendant 1 an
    etag: true,
    lastModified: true
  }));
    console.log('✅ Middleware express.static configuré pour:', buildDir);
  } catch (error) {
    console.error('❌ Erreur lors de la configuration de express.static:', error);
    throw error; // Re-lancer l'erreur pour qu'elle soit capturée par les gestionnaires d'erreurs
  }

  // Toutes les routes non-API renvoient vers index.html (pour React Router)
  app.get('*', (req, res) => {
  try {
    // Ignorer les routes API (déjà gérées par le proxy)
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    
    // Vérifier que buildDir est toujours valide
    if (!buildDir || !fs.existsSync(buildDir)) {
      console.error(`[ROUTE] ERROR: buildDir n'existe plus: ${buildDir}`);
      return res.status(500).send('Erreur serveur: dossier build introuvable');
    }
    
    const indexFile = path.join(buildDir, 'index.html');
    
    if (!fs.existsSync(indexFile)) {
      console.error(`[ROUTE] ERROR: index.html not found at ${indexFile}`);
      console.error(`[ROUTE] buildDir: ${buildDir}`);
      console.error(`[ROUTE] exeDir: ${exeDir}`);
      console.error(`[ROUTE] process.cwd(): ${process.cwd()}`);
      return res.status(500).send(`Erreur serveur: index.html introuvable. Chemin recherché: ${indexFile}`);
    }
    
    res.sendFile(indexFile, (err) => {
      if (err) {
        console.error(`[ROUTE] Erreur lors de l'envoi de index.html:`, err);
        if (!res.headersSent) {
          res.status(500).send('Erreur serveur lors du chargement de la page');
        }
      }
    });
  } catch (error) {
    console.error(`[ROUTE] Erreur dans la route catch-all:`, error);
    if (!res.headersSent) {
      res.status(500).send('Erreur serveur: ' + (error.message || 'Erreur inconnue'));
    }
  }
});

  // Démarrer le serveur sans ouvrir de navigateur
  // Utiliser '0.0.0.0' pour accepter les connexions depuis toutes les interfaces réseau (IPv4)
  function startServer() {
    try {
    // Vérifier que buildDir existe avant de démarrer
    if (!buildDir || !fs.existsSync(buildDir)) {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('[SERVER] ❌ ERREUR: Impossible de démarrer le serveur');
      console.error('[SERVER] Le dossier build n\'a pas été trouvé');
      console.error('═══════════════════════════════════════════════════════════');
      setTimeout(() => {
        process.exit(1);
      }, 5000);
      return;
    }
    
    // Vérifier si le port est disponible, sinon utiliser le port par défaut
    // PORT est déjà défini plus haut (7062 par défaut ou depuis .env)
    console.log(`[PORT] Configuration du port: ${PORT}`);
    
    // Sauvegarder le port dans un fichier pour que l'application desktop puisse le lire
    const portFile = path.join(exeDir, 'frontend-port.txt');
    try {
      fs.writeFileSync(portFile, PORT.toString(), 'utf8');
      console.log(`[PORT] Port sauvegardé dans: ${portFile}`);
    } catch (err) {
      console.error('[PORT] Erreur lors de l\'écriture du fichier de port:', err);
      // Ne pas arrêter le serveur pour cette erreur
    }
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`✅ Frontend server démarré avec succès`);
      console.log(`✅ Serveur accessible sur http://0.0.0.0:${PORT}`);
      console.log(`✅ Accessible depuis le réseau sur http://<votre-ipv4>:${PORT}`);
      console.log('✅ Serveur démarré en mode background (aucun navigateur ne s\'ouvrira)');
      console.log('═══════════════════════════════════════════════════════════');
    });
    
    server.on('error', (err) => {
      console.error('═══════════════════════════════════════════════════════════');
      if (err.code === 'EADDRINUSE') {
        console.error(`[PORT] ❌ Le port ${PORT} est déjà utilisé.`);
        console.error(`[PORT] Veuillez arrêter le processus qui utilise ce port ou changer le port dans le fichier .env`);
        console.error(`[PORT] Pour arrêter le processus: npx kill-port ${PORT}`);
      } else {
        console.error('[PORT] ❌ Erreur lors du démarrage du serveur:', err);
      }
      console.error('═══════════════════════════════════════════════════════════');
      setTimeout(() => {
        process.exit(1);
      }, 5000);
    });
    
    // Gérer l'arrêt propre du serveur
    process.on('SIGTERM', () => {
      console.log('[SERVER] SIGTERM reçu, arrêt du serveur...');
      server.close(() => {
        console.log('[SERVER] Serveur fermé proprement');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      console.log('[SERVER] SIGINT reçu, arrêt du serveur...');
      server.close(() => {
        console.log('[SERVER] Serveur fermé proprement');
        process.exit(0);
      });
    });
    
  } catch (error) {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('[SERVER] ❌ ERREUR CRITIQUE lors du démarrage du serveur:');
    console.error('[SERVER] Erreur:', error.message);
    console.error('[SERVER] Stack:', error.stack);
    console.error('═══════════════════════════════════════════════════════════');
    setTimeout(() => {
      process.exit(1);
    }, 5000);
    }
  }

  startServer();
}

// Démarrer l'initialisation du serveur
initServer();

