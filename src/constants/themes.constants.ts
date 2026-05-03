/** Palette réduite : fonds / accents + hiérarchie de texte. */
export type ThemeColors = {
  primary: string;
  secondary: string;
  tertiary: string;
  /** Texte sur fond `primary` (sidebar, bandeau connexion). */
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  /** Texte sur fond clair (cartes, contenu Ant Design) — optionnel. */
  textBody?: string;
  textBodySecondary?: string;
  textBodyTertiary?: string;
};

export const ActualthemeNumber = 0;

export const themes: ThemeColors[] = [
  {
    primary: "#15803d",
    secondary: "#ffffff",
    tertiary: "#ffffff",
    textPrimary: "#ffffff",
    textSecondary: "#dcfce7",
    textTertiary: "rgba(255,255,255,0.78)",
    textBody: "#14532d",
    textBodySecondary: "#166534",
    textBodyTertiary: "#6b7280",
  },
  {
    primary: "#353535",
    secondary: "#fff",
    tertiary: "#27272a",
    textPrimary: "#fafafa",
    textSecondary: "#d4d4d8",
    textTertiary: "#a1a1aa",
  },
  {
    primary: "#0077b6",
    secondary: "#90e0ef",
    tertiary: "#caf0f8",
    textPrimary: "#ffffff",
    textSecondary: "#e0fbfc",
    textTertiary: "rgba(255,255,255,0.78)",
  },
  {
    primary: "#264653",
    secondary: "#e9c46a",
    tertiary: "#f4a261",
    textPrimary: "#fefae0",
    textSecondary: "#e9c46a",
    textTertiary: "#94d2bd",
  },
  {
    primary: "#181818",
    secondary: "#ffd700",
    tertiary: "#fff",
    textPrimary: "#ffffff",
    textSecondary: "#ffd700",
    textTertiary: "#a3a3a3",
  },
  {
    primary: "#0f2027",
    secondary: "#f72585",
    tertiary: "#fff",
    textPrimary: "#ffffff",
    textSecondary: "#f72585",
    textTertiary: "#8d99ae",
  },
  {
    primary: "#22223b",
    secondary: "#9a8c98",
    tertiary: "#f2e9e4",
    textPrimary: "#f2e9e4",
    textSecondary: "#c9ada7",
    textTertiary: "rgba(242,233,228,0.65)",
  },
  {
    primary: "#0d1b2a",
    secondary: "#e0e1dd",
    tertiary: "#415a77",
    textPrimary: "#e0e1dd",
    textSecondary: "#778da9",
    textTertiary: "#415a77",
  },
  {
    primary: "#222",
    secondary: "#f5f5f5",
    tertiary: "#fff",
    textPrimary: "#fafafa",
    textSecondary: "#a3a3a3",
    textTertiary: "#737373",
  },
];
