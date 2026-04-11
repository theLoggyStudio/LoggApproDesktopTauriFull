// Script silencieux pour démarrer le serveur frontend sans afficher de fenêtre
// Tous les console.log sont supprimés pour un démarrage complètement silencieux

const fs = require('fs');
const path = require('path');

// Désactiver complètement tous les logs console (mode vraiment silencieux)
const noop = () => {};
console.log = noop;
console.error = noop;
console.warn = noop;
console.info = noop;
console.debug = noop;
console.trace = noop;
console.dir = noop;
console.dirxml = noop;
console.group = noop;
console.groupEnd = noop;
console.time = noop;
console.timeEnd = noop;
console.assert = noop;
console.profile = noop;
console.profileEnd = noop;
console.count = noop;
console.timeStamp = noop;

// Rediriger aussi process.stdout et process.stderr vers null
if (process.stdout) {
  process.stdout.write = noop;
}
if (process.stderr) {
  process.stderr.write = noop;
}

// Désactiver l'ouverture automatique du navigateur
process.env.BROWSER = 'none';

// Masquer la fenêtre de console sur Windows
if (process.platform === 'win32') {
  // Sur Windows, on peut essayer de masquer la console
  // Mais cela nécessite généralement un wrapper VBS ou un manifeste Windows
  // Le wrapper VBS sera créé par build-silent-exe.js
}

// Charger le serveur principal (tous les console.log seront silencieux)
try {
  require('./server.js');
} catch (error) {
  // En cas d'erreur critique, on peut optionnellement écrire dans un fichier
  // Mais pour rester silencieux, on ne fait rien
  process.exit(1);
}

