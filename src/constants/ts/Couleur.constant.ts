/**
 * Couleurs sémantiques alignées sur les variables CSS (--primary, --textPrimary, …)
 * injectées par ThemeCssSync dans `main.tsx`. À utiliser dans les styles inline ou Ant Design token.
 */
export const Couleur = {
  primary: "var(--primary)",
  secondary: "var(--secondary)",
  tertiary: "var(--tertiary)",
  textPrimary: "var(--textPrimary)",
  textSecondary: "var(--textSecondary)",
  textTertiary: "var(--textTertiary)",
  textBody: "var(--textBody, #1f2937)",
  textBodySecondary: "var(--textBodySecondary, #4b5563)",
  textBodyTertiary: "var(--textBodyTertiary, #9ca3af)",
} as const;
