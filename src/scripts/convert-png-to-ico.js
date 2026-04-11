import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemin du logo source
const logoPath = path.join(__dirname, '..', 'src', 'body', 'assets', 'logo.png');
const outputPath = path.join(__dirname, '..', 'public', 'favicon.ico');

// Vérifier si le fichier source existe
if (!fs.existsSync(logoPath)) {
  console.error(`❌ Fichier source introuvable: ${logoPath}`);
  process.exit(1);
}

console.log(`📁 Conversion de ${logoPath} vers ${outputPath}`);

try {
  console.log(`🔄 Redimensionnement et conversion PNG → ICO en cours...`);
  
  // Créer différentes tailles avec sharp
  const sizes = [16, 32, 48];
  const buffers = await Promise.all(
    sizes.map(size => 
      sharp(logoPath)
        .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );
  
  console.log(`✅ Images redimensionnées: ${sizes.join(', ')}px`);
  
  // Convertir en ICO
  const icoBuffer = await toIco(buffers);
  
  // Écrire le fichier ICO
  fs.writeFileSync(outputPath, icoBuffer);
  
  console.log(`✅ favicon.ico créé avec succès !`);
  console.log(`   📁 Emplacement: ${outputPath}`);
  console.log(`   📏 Tailles incluses: ${sizes.join('x, ')}x`);
} catch (error) {
  console.error(`❌ Erreur lors de la conversion:`, error.message);
  
  // Fallback: utiliser logo1.ico s'il existe
  const logo1IcoPath = path.join(__dirname, '..', 'src', 'body', 'assets', 'logo1.ico');
  if (fs.existsSync(logo1IcoPath)) {
    console.log(`⚠️ Utilisation de logo1.ico comme fallback...`);
    fs.copyFileSync(logo1IcoPath, outputPath);
    console.log(`✅ favicon.ico créé depuis logo1.ico`);
  } else {
    console.error(`❌ Aucun fallback disponible`);
    process.exit(1);
  }
}

