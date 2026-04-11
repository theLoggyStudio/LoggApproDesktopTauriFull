/**
 * Module de split des tableaux pour la pagination
 * 
 * Ce module gère le découpage des tableaux qui dépassent une page
 * en les divisant ligne par ligne sur plusieurs pages.
 * 
 * RÈGLES DE SPLIT :
 * - L'en-tête du tableau est répété sur chaque page
 * - Les lignes sont réparties de manière équitable
 * - La dernière page peut contenir moins de lignes
 */

import type { Element } from '../PageEtat';
import { A4_HEIGHT, DEFAULT_MARGINS, getAvailableContentHeight } from './elementMeasurer';
import type { PageMargins } from './elementMeasurer';

export interface SplitTableResult {
  pages: Array<{
    pageIndex: number;
    element: Element;
    startRow: number;
    endRow: number;
  }>;
}

/**
 * Calcule le nombre de lignes qui peuvent tenir sur une page
 * en tenant compte de l'en-tête du tableau
 */
function calculateRowsPerPage(
  availableHeight: number,
  headerHeight: number = 40,
  rowHeight: number = 35
): number {
  const contentHeight = availableHeight - headerHeight;
  return Math.max(1, Math.floor(contentHeight / rowHeight));
}

/**
 * Split un tableau en plusieurs éléments pour la pagination
 * 
 * @param element - L'élément tableau à splitter
 * @param availableHeight - Hauteur disponible sur une page
 * @param margins - Marges de la page
 * @returns Un objet contenant les pages avec les éléments splités
 */
export function splitTableAcrossPages(
  element: Element,
  availableHeight: number = getAvailableContentHeight(DEFAULT_MARGINS),
  margins: PageMargins = DEFAULT_MARGINS
): SplitTableResult {
  if (element.type !== 'table' || !element.tableData || element.tableData.length === 0) {
    // Si ce n'est pas un tableau ou s'il est vide, retourner une seule page
    return {
      pages: [{
        pageIndex: 0,
        element: element,
        startRow: 0,
        endRow: element.tableData?.length || 0
      }]
    };
  }
  
  const headerHeight = 40;
  const rowHeight = 35;
  const rowsPerPage = calculateRowsPerPage(availableHeight, headerHeight, rowHeight);
  const totalRows = element.tableData.length;
  
  // Si le tableau tient sur une page, pas besoin de split
  const totalHeight = headerHeight + (totalRows * rowHeight);
  if (totalHeight <= availableHeight) {
    return {
      pages: [{
        pageIndex: 0,
        element: element,
        startRow: 0,
        endRow: totalRows
      }]
    };
  }
  
  // Splitter le tableau en plusieurs pages
  const pages: SplitTableResult['pages'] = [];
  let currentRow = 0;
  let pageIndex = 0;
  
  while (currentRow < totalRows) {
    const endRow = Math.min(currentRow + rowsPerPage, totalRows);
    const rowsOnThisPage = endRow - currentRow;
    
    // Créer un nouvel élément tableau pour cette page
    const pageElement: Element = {
      ...element,
      id: `${element.id}_page_${pageIndex}`,
      tableData: element.tableData.slice(currentRow, endRow),
      tableColumns: element.tableColumns,
      height: headerHeight + (rowsOnThisPage * rowHeight),
      // Position Y sera calculée par le système de pagination
      y: margins.top
    };
    
    pages.push({
      pageIndex,
      element: pageElement,
      startRow: currentRow,
      endRow
    });
    
    currentRow = endRow;
    pageIndex++;
  }
  
  return { pages };
}

/**
 * Vérifie si un élément peut être splité
 */
export function canSplitElement(element: Element): boolean {
  return element.type === 'table';
}

/**
 * Split un élément si nécessaire
 * Retourne soit l'élément original, soit plusieurs éléments splités
 */
export function splitElementIfNeeded(
  element: Element,
  availableHeight: number,
  margins: PageMargins = DEFAULT_MARGINS
): Element[] {
  if (element.type === 'table') {
    const splitResult = splitTableAcrossPages(element, availableHeight, margins);
    return splitResult.pages.map(page => page.element);
  }
  
  // Pour les autres types, retourner l'élément tel quel
  // (on pourrait ajouter le split de texte long plus tard)
  return [element];
}

