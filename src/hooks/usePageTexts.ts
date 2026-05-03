import pagesJson from "../constants/json/Pages.constant.json";

type PagesRoot = { pages: Record<string, string[]> };

const root = pagesJson as PagesRoot;

/**
 * Textes UI centralisés (ordre documenté dans `Pages.constant.json`).
 * @param page clé sous `pages` du JSON
 */
export function usePageTexts(page: string): string[] {
  return root.pages[page] ?? [];
}

/** Accès statique hors composant (stores, utilitaires). */
export function getPageTexts(page: string): string[] {
  return root.pages[page] ?? [];
}
