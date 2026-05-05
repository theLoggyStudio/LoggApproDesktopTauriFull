import { fetchStockDocumentPrintModels, fetchStockDocumentPrintModel } from "../../lib/stockApi";
import { exportFullHtmlDocumentPdf, exportHtmlPagePdf, escapeHtml } from "./stockBrowserPrint";
import { substituteMustache } from "./stockPrintTemplateVariables";

/** Clés d’écran alignées sur les listes d’impression (voir `StockPrintModal`). */
export const DOCUMENT_PRINT_SCREEN_KEYS = [
  "movements",
  "articles",
  "docs",
  "parties",
  "ref",
  "wh",
  "dashboard_recent",
  "dashboard_categories",
] as const;

export type DocumentPrintScreenKey = (typeof DOCUMENT_PRINT_SCREEN_KEYS)[number];

async function fetchDefaultModelIdForScreen(screenKey: string): Promise<string> {
  try {
    const all = await fetchStockDocumentPrintModels();
    const found = all.find((m) => (m.screenKey ?? "").trim() === screenKey.trim());
    return found?.id ?? "";
  } catch {
    return "";
  }
}

function baseSubstitutionMap(documentTitle: string, listeContenuHtml: string): Record<string, string> {
  const now = new Date();
  return {
    titre: documentTitle,
    sousTitre: "",
    "date.aujourdhui": now.toLocaleDateString("fr-FR"),
    "date.heure": now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    "liste.contenu": listeContenuHtml,
  };
}

/**
 * Imprime le HTML tableau ; si un modèle document est associé à `screenKey`, il enveloppe le contenu (variables `{{ titre }}`, `{{ liste.contenu }}`, etc.).
 */
export async function printStockListWithOptionalTemplate(
  screenKey: DocumentPrintScreenKey | string,
  documentTitle: string,
  innerHtmlFromBuildPrintTable: string,
  modelId?: string,
): Promise<string | false> {
  const chosen = (modelId ?? "").trim() || (await fetchDefaultModelIdForScreen(screenKey));
  if (!chosen) {
    return exportHtmlPagePdf(documentTitle, innerHtmlFromBuildPrintTable);
  }
  try {
    const model = await fetchStockDocumentPrintModel(chosen);
    const map = baseSubstitutionMap(documentTitle, innerHtmlFromBuildPrintTable);
    const htmlRaw = (model.htmlContent ?? "").trim() || "<div>{{ liste.contenu }}</div>";
    const cssRaw = model.cssContent ?? "";
    const body = substituteMustache(htmlRaw, map);
    const style = substituteMustache(cssRaw, map);
    const full = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>${escapeHtml(documentTitle)}</title><style>${style}</style></head><body>${body}</body></html>`;
    return exportFullHtmlDocumentPdf(documentTitle, full);
  } catch {
    return exportHtmlPagePdf(documentTitle, innerHtmlFromBuildPrintTable);
  }
}
