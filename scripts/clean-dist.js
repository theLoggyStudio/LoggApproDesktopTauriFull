/**
 * Supprime les fichiers .tsx et autres sources du dossier dist après le build.
 * Ces fichiers ne sont pas nécessaires pour l'exécution et ne doivent pas être exposés.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  console.log('clean-dist: dist/ non trouvé, skip');
  process.exit(0);
}

// Fichiers source à ne pas exposer (pas nécessaires pour l'exécution)
const toRemove = ['.tsx', '.ts'];
let removed = 0;

function walk(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath);
    } else {
      const ext = path.extname(item);
      if (toRemove.includes(ext)) {
        fs.unlinkSync(fullPath);
        removed++;
        console.log('clean-dist: supprimé', fullPath.replace(distDir, 'dist'));
      }
    }
  }
}

walk(distDir);
if (removed > 0) {
  console.log(`clean-dist: ${removed} fichier(s) supprimé(s)`);
}
