/**
 * Crée une version carrée du logo pour tauri icon (requis par Tauri)
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fs = await import('fs');
const src = path.join(__dirname, '../src/assets/logo.png');
const dest = path.join(__dirname, '../src-tauri/icons/logo-square.png');
const publicLogo = path.join(__dirname, '../public/opening-logo.png');

const img = await sharp(src);
const meta = await img.metadata();
const { width, height } = meta;
const size = Math.max(width, height);

await sharp({
  create: {
    width: size,
    height: size,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  }
})
  .composite([{
    input: await img.toBuffer(),
    left: Math.floor((size - width) / 2),
    top: Math.floor((size - height) / 2)
  }])
  .png()
  .toFile(dest);

fs.copyFileSync(src, publicLogo);
console.log(`✅ Logo carré créé: ${dest} (${size}x${size})`);
console.log(`✅ Logo splash copié: ${publicLogo}`);
