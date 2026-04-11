// Script pour construire l'EXE silencieux et le placer dans "APK final"
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 Construction de l\'EXE silencieux...');

// Créer le dossier "APK final" s'il n'existe pas
const apkFinalDir = path.join(__dirname, 'APK final');
if (!fs.existsSync(apkFinalDir)) {
  fs.mkdirSync(apkFinalDir, { recursive: true });
  console.log('✅ Dossier "APK final" créé');
}

// Étape 1: Build React
console.log('📦 Étape 1: Build React...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: __dirname });
  console.log('✅ Build React terminé');
} catch (error) {
  console.error('❌ Erreur lors du build React:', error.message);
  process.exit(1);
}

// Étape 2: Créer l'EXE avec pkg
console.log('🔨 Étape 2: Création de l\'EXE silencieux...');
try {
  // Utiliser pkg pour créer l'EXE
  // Note: pkg ne supporte pas directement --win-no-console
  // On va créer l'EXE normalement puis utiliser un wrapper VBS pour le rendre silencieux
  const exePath = path.join(apkFinalDir, 'frontend-silent.exe');
  
  execSync(
    `pkg server-silent.js --targets node18-win-x64 --output "${exePath}"`,
    { stdio: 'inherit', cwd: __dirname }
  );
  
  console.log('✅ EXE créé:', exePath);
} catch (error) {
  console.error('❌ Erreur lors de la création de l\'EXE:', error.message);
  process.exit(1);
}

// Étape 3: Créer un wrapper VBS pour lancer l'EXE en mode silencieux
console.log('📝 Étape 3: Création du wrapper VBS...');
// Utiliser un chemin relatif pour que le VBS fonctionne peu importe où il est déplacé
const vbsContent = `
Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
' Obtenir le répertoire où se trouve ce script VBS
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)
' Construire le chemin vers l'EXE dans le même dossier
exePath = scriptPath & "\\frontend-silent.exe"
' Lancer l'EXE en mode silencieux (0 = caché, False = ne pas attendre)
WshShell.Run """" & exePath & """", 0, False
Set WshShell = Nothing
Set fso = Nothing
`;

const vbsPath = path.join(apkFinalDir, 'frontend-silent-launcher.vbs');
fs.writeFileSync(vbsPath, vbsContent, 'utf8');
console.log('✅ Wrapper VBS créé:', vbsPath);

// Étape 4: Créer un fichier README pour expliquer l'utilisation
console.log('📄 Étape 4: Création du README...');
const readmeContent = `# Frontend Silencieux - LoggAppro

## Fichiers

- \`frontend-silent.exe\`: Exécutable du serveur frontend (s'exécute en arrière-plan)
- \`frontend-silent-launcher.vbs\`: Lanceur silencieux (double-clic pour démarrer sans fenêtre)

## Utilisation

### Option 1: Utiliser le lanceur VBS (recommandé)
Double-cliquez sur \`frontend-silent-launcher.vbs\` pour démarrer le serveur en arrière-plan sans fenêtre visible.

### Option 2: Utiliser directement l'EXE
Double-cliquez sur \`frontend-silent.exe\`. Le serveur démarrera en arrière-plan.

## Port par défaut

Le serveur démarre sur le port **7062** par défaut (configurable via le fichier \`.env\`).

## Accès

Une fois démarré, le frontend est accessible sur:
- http://localhost:7062
- http://<votre-ip>:7062

## Arrêt du serveur

Pour arrêter le serveur, utilisez le Gestionnaire des tâches Windows:
1. Appuyez sur \`Ctrl + Shift + Esc\`
2. Recherchez \`frontend-silent.exe\`
3. Clic droit > Terminer la tâche

## Logs

Les logs sont écrits dans le fichier \`frontend-silent.log\` (si activé dans server-silent.js).
`;

const readmePath = path.join(apkFinalDir, 'README.md');
fs.writeFileSync(readmePath, readmeContent, 'utf8');
console.log('✅ README créé:', readmePath);

console.log('\n✅ Construction terminée avec succès!');
console.log(`📁 Fichiers créés dans: ${apkFinalDir}`);

