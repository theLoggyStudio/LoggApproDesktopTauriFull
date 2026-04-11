/**
 * Copie `src/assets/logo.png` → `public/opening-logo.png` pour que le splash (index.html)
 * et l’UI utilisent la même image sans relancer `npm run icon`.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "../src/assets/logo.png");
const dest = path.join(__dirname, "../public/opening-logo.png");

if (!fs.existsSync(src)) {
  console.warn("sync-opening-logo: fichier absent:", src);
  process.exit(0);
}
fs.copyFileSync(src, dest);
console.log("sync-opening-logo: copié vers public/opening-logo.png");
