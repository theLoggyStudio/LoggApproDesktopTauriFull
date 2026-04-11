/**
 * Couleurs hex centralisées (thème par défaut, index 0).
 * Les thèmes complets restent dans `body/constants/themes.constants` ; ce fichier sert de référence unique pour les imports « code couleur » (cf. `.cursorrules`).
 */
import { themes } from "../body/constants/themes.constants.ts";

const t0 = themes[0];

export const codeCouleur = {
  primary: t0.primary,
  primaryDeg: t0.primaryDeg,
  secondary: t0.secondary,
  tertiary: t0.tertiary,
  quaternary: t0.quaternary,
  quinary: t0.quinary,
  senary: t0.senary,
  septenary: t0.septenary,
  octonary: t0.octonary,
  nonary: t0.nonary,
  success: t0.success,
  danger: t0.danger,
  info: t0.info,
  shadowViolet: t0.shadowViolet,
  shadowYellow: t0.shadowYellow,
} as const;
