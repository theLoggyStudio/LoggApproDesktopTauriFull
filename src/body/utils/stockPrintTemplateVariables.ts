/** Variables proposées pour les modèles d’impression `{{ cle }}`. */
export type StockPrintTemplateVariable = {
  key: string;
  label: string;
  category?: string;
};

export const STOCK_PRINT_TEMPLATE_VARIABLES: StockPrintTemplateVariable[] = [
  { key: "titre", label: "Titre du document", category: "Général" },
  { key: "sousTitre", label: "Sous-titre", category: "Général" },
  {
    key: "liste.contenu",
    label: "Contenu (HTML) — tableau généré par l’écran (impression liste)",
    category: "Général",
  },
  { key: "date.aujourdhui", label: "Date du jour (locale)", category: "Général" },
  { key: "date.heure", label: "Heure actuelle", category: "Général" },
  { key: "societe.nom", label: "Nom société / établissement", category: "Général" },
  { key: "societe.adresse", label: "Adresse", category: "Général" },
  { key: "article.nom", label: "Article — libellé", category: "Stock" },
  { key: "article.sku", label: "Article — SKU", category: "Stock" },
  { key: "article.qte", label: "Article — quantité en stock", category: "Stock" },
  { key: "article.unite", label: "Article — unité", category: "Stock" },
  { key: "article.categorie", label: "Article — catégorie", category: "Stock" },
  { key: "mouvement.type", label: "Mouvement — type", category: "Mouvement" },
  { key: "mouvement.qte", label: "Mouvement — quantité", category: "Mouvement" },
  { key: "mouvement.motif", label: "Mouvement — motif", category: "Mouvement" },
  { key: "mouvement.refDoc", label: "Mouvement — réf. document", category: "Mouvement" },
  { key: "mouvement.date", label: "Mouvement — date", category: "Mouvement" },
  { key: "fournisseur.nom", label: "Fournisseur — nom", category: "Tiers" },
  { key: "client.nom", label: "Client — nom", category: "Tiers" },
  { key: "document.nom", label: "Document reçu — nom fichier", category: "Document" },
  { key: "document.type", label: "Document reçu — type (png/jpeg/pdf)", category: "Document" },
];

export function extractPlaceholderKeys(html: string, css: string): string[] {
  const set = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
  for (const s of [html, css]) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, "g");
    while ((m = r.exec(s)) !== null) {
      if (m[1]) set.add(m[1]);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
}

export function substituteMustache(template: string, map: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, rawKey: string) => {
    const key = String(rawKey).trim();
    const v = map[key];
    if (v === undefined || v === null) return `{{${key}}}`;
    return String(v);
  });
}

/** Contexte de saisie : curseur placé après `{{` sans `}}` fermant entre les deux. */
export function findOpenMustacheContext(
  text: string,
  caret: number,
): { braceStart: number; filter: string } | null {
  const before = text.slice(0, caret);
  const open = before.lastIndexOf("{{");
  if (open < 0) return null;
  const inner = before.slice(open + 2);
  if (inner.includes("}}")) return null;
  return { braceStart: open, filter: inner };
}

export function applyMustacheVariableAtCaret(
  text: string,
  caret: number,
  varKey: string,
): { next: string; nextCaret: number } | null {
  const ctx = findOpenMustacheContext(text, caret);
  if (!ctx) return null;
  const before = text.slice(0, ctx.braceStart);
  const after = text.slice(caret);
  const ins = `{{ ${varKey} }}`;
  const next = before + ins + after;
  return { next, nextCaret: before.length + ins.length };
}
