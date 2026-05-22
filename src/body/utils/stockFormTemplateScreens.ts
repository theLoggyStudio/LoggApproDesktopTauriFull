import { getPageTexts } from "../../hooks/usePageTexts";

/** Clés d’écran pour les modèles de formulaires (alignées sur `FORM_TEMPLATE_SCREEN_KEYS` côté Rust). */
export const STOCK_FORM_TEMPLATE_SCREEN_KEYS = [
  "dashboard",
  "articles",
  "warehouse",
  "movements",
  "fournisseurs",
  "clients",
  "documents",
  "circuits",
  "general",
] as const;

export type StockFormTemplateScreenKey = (typeof STOCK_FORM_TEMPLATE_SCREEN_KEYS)[number];

const MENU_LABEL_INDEX: Partial<Record<StockFormTemplateScreenKey, number>> = {
  dashboard: 0,
  articles: 1,
  warehouse: 2,
  movements: 3,
  fournisseurs: 4,
  clients: 5,
  documents: 6,
  circuits: 7,
};

export function stockFormTemplateScreenLabel(key?: string): string {
  const k = (key ?? "").trim() as StockFormTemplateScreenKey;
  if (!k) return "—";
  if (k === "general") {
    return getPageTexts("stockFormTemplates")[19] ?? "Générique (circuit / autre)";
  }
  const idx = MENU_LABEL_INDEX[k];
  if (idx !== undefined) {
    return getPageTexts("stockMenu")[idx] ?? k;
  }
  return k;
}

export function isStockFormTemplateScreenKey(v: string): v is StockFormTemplateScreenKey {
  return (STOCK_FORM_TEMPLATE_SCREEN_KEYS as readonly string[]).includes(v);
}

export function normalizeStockFormTemplateScreenType(raw?: string): StockFormTemplateScreenKey {
  const s = (raw ?? "").trim();
  return isStockFormTemplateScreenKey(s) ? s : "general";
}

export function stockFormTemplateScreenOptions(): { value: StockFormTemplateScreenKey; label: string }[] {
  return STOCK_FORM_TEMPLATE_SCREEN_KEYS.map((value) => ({
    value,
    label: stockFormTemplateScreenLabel(value),
  }));
}
