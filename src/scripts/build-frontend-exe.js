import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("\n" + "=".repeat(70));
console.log("🔨 BUILD FRONTEND.EXE");
console.log("=".repeat(70) + "\n");

try {
  // 1. Build React
  console.log("📦 Build React...");
  execSync("npm run build", {
    cwd: rootDir,
    stdio: "inherit",
  });
  console.log("✅ Build React terminé\n");

  // 2. Vérifier que pkg est installé
  console.log("📦 Vérification de pkg...");
  try {
    execSync("pkg --version", { stdio: "pipe" });
    console.log("✅ pkg est installé\n");
  } catch (error) {
    console.log("❌ pkg n'est pas installé. Installation...");
    execSync("npm install -g pkg", { stdio: "inherit" });
    console.log("✅ pkg installé\n");
  }

  // 3. Créer le dossier dist s'il n'existe pas
  const distDir = path.join(rootDir, "dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log("📁 Dossier dist créé\n");
  }

  // 4. Construire l'exécutable
  console.log("🔨 Construction de frontend.exe...");
  console.log("   ⏳ Cela peut prendre quelques minutes...\n");

  const pkgCommand = `pkg server.js --targets node18-win-x64 --output "${path.join(distDir, "frontend.exe")}"`;
  
  execSync(pkgCommand, {
    cwd: rootDir,
    stdio: "inherit",
  });

  console.log("\n✅ frontend.exe créé avec succès !");
  console.log(`   📍 Emplacement: ${path.join(distDir, "frontend.exe")}\n`);

  // 5. Copier le dossier build dans dist
  console.log("📋 Copie du dossier build...");
  const buildDir = path.join(rootDir, "build");
  const buildDestDir = path.join(distDir, "build");
  
  if (fs.existsSync(buildDir)) {
    if (fs.existsSync(buildDestDir)) {
      fs.rmSync(buildDestDir, { recursive: true, force: true });
    }
    fs.cpSync(buildDir, buildDestDir, { recursive: true });
    console.log("   ✅ build → dist/build\n");
  }

  console.log("=".repeat(70));
  console.log("✅ BUILD TERMINÉ AVEC SUCCÈS");
  console.log("=".repeat(70));
  console.log(`\n📍 Fichier créé: ${path.join(distDir, "frontend.exe")}`);
  console.log("💡 Vous pouvez maintenant utiliser cet exe pour démarrer le frontend\n");

} catch (error) {
  console.error("\n❌ ERREUR LORS DU BUILD");
  console.error(`   💡 Détails: ${error.message}`);
  process.exit(1);
}

