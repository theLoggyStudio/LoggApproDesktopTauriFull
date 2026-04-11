/**
 * Captures d’écran dans src/assets/apkImg — chargées au build (Vite).
 * Ordre : tri alphabétique du chemin (comme l’explorateur Windows avec tri par nom).
 */

export interface ApkImageEntry {
  /** Nom du fichier pour légende éventuelle */
  fileName: string;
  /** URL résolue par Vite */
  src: string;
}

type GlobModule = { default: string };

const pngJpgModules = import.meta.glob<GlobModule>(
  '../../../assets/apkImg/*.{png,jpg,jpeg,JPG,JPEG,PNG}',
  { eager: true },
);

/**
 * Liste triée alphabétiquement (locale « fr », sensible aux chiffres : 01, 02… 10).
 */
export function getApkImagesSorted(): ApkImageEntry[] {
  const keys = Object.keys(pngJpgModules).sort((a, b) =>
    a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }),
  );
  return keys.map((pathKey) => {
    const mod = pngJpgModules[pathKey];
    const fileName = pathKey.replace(/^.*\//, '');
    return {
      fileName,
      src: mod?.default ?? '',
    };
  });
}
