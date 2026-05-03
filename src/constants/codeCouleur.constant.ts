/**
 * Couleurs du thème par défaut (index 0) pour imports globaux type « code couleur ».
 */
import { themes } from "./themes.constants";

const t0 = themes[0];

export const codeCouleur = {
  primary: t0.primary,
  secondary: t0.secondary,
  tertiary: t0.tertiary,
  textPrimary: t0.textPrimary,
  textSecondary: t0.textSecondary,
  textTertiary: t0.textTertiary,
  ...(t0.textBody != null ? { textBody: t0.textBody as string } : {}),
  ...(t0.textBodySecondary != null ? { textBodySecondary: t0.textBodySecondary as string } : {}),
  ...(t0.textBodyTertiary != null ? { textBodyTertiary: t0.textBodyTertiary as string } : {}),
} as const;
