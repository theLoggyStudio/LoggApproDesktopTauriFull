/**
 * Module de mesure des éléments pour la pagination
 * 
 * Ce module mesure les dimensions réelles des éléments en les rendant
 * dans un conteneur invisible (offscreen) à scale=1 pour obtenir
 * les dimensions exactes nécessaires au calcul de pagination.
 * 
 * IMPORTANT : Toutes les mesures sont effectuées à zoom=1 pour garantir
 * que les calculs de pagination ne dépendent pas du niveau de zoom.
 */

import type { Element } from '../PageEtat';

// Dimensions A4 standard (96 DPI)
export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

// Marges par défaut (configurables)
export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_MARGINS: PageMargins = {
  top: 50,
  right: 50,
  bottom: 50,
  left: 50
};

/**
 * Calcule la hauteur de contenu disponible sur une page
 */
export function getAvailableContentHeight(margins: PageMargins = DEFAULT_MARGINS): number {
  return A4_HEIGHT - margins.top - margins.bottom;
}

/**
 * Calcule la largeur de contenu disponible sur une page
 */
export function getAvailableContentWidth(margins: PageMargins = DEFAULT_MARGINS): number {
  return A4_WIDTH - margins.left - margins.right;
}

/**
 * Mesure les dimensions réelles d'un élément texte
 * en créant un élément DOM temporaire
 */
export function measureTextElement(element: Element): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    // Créer un conteneur de mesure invisible
    const measureContainer = document.createElement('div');
    measureContainer.style.position = 'absolute';
    measureContainer.style.visibility = 'hidden';
    measureContainer.style.whiteSpace = 'pre-wrap';
    measureContainer.style.wordWrap = 'break-word';
    measureContainer.style.width = `${element.width}px`;
    measureContainer.style.padding = '0';
    measureContainer.style.margin = '0';
    measureContainer.style.border = 'none';
    measureContainer.style.fontSize = `${element.fontSize || 14}px`;
    measureContainer.style.fontFamily = element.fontFamily || 'Arial, sans-serif';
    measureContainer.style.fontWeight = element.fontWeight || 'normal';
    measureContainer.style.fontStyle = element.fontStyle || 'normal';
    measureContainer.style.lineHeight = '1.4';
    
    // Créer l'élément texte
    const textElement = document.createElement('div');
    textElement.textContent = element.content || '';
    textElement.style.width = `${element.width}px`;
    textElement.style.whiteSpace = 'pre-wrap';
    textElement.style.wordWrap = 'break-word';
    
    measureContainer.appendChild(textElement);
    document.body.appendChild(measureContainer);
    
    // Mesurer après le rendu
    requestAnimationFrame(() => {
      const rect = textElement.getBoundingClientRect();
      const height = element.heightByContent ? rect.height : Math.max(element.height || 20, rect.height);
      const width = Math.min(element.width, rect.width);
      
      document.body.removeChild(measureContainer);
      resolve({ width, height });
    });
  });
}

/**
 * Mesure les dimensions réelles d'un élément image
 */
export function measureImageElement(element: Element): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (!element.content || !element.content.startsWith('data:')) {
      resolve({ width: element.width, height: element.height });
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      // Calculer les dimensions en respectant le ratio
      const aspectRatio = img.width / img.height;
      let width = element.width;
      let height = element.height;
      
      // Si les dimensions sont définies, les utiliser
      // Sinon, calculer à partir du ratio
      if (element.width && element.height) {
        width = element.width;
        height = element.height;
      } else if (element.width) {
        height = element.width / aspectRatio;
      } else if (element.height) {
        width = element.height * aspectRatio;
      } else {
        // Dimensions par défaut si aucune n'est définie
        width = Math.min(400, img.width);
        height = Math.min(300, img.height);
      }
      
      resolve({ width, height });
    };
    
    img.onerror = () => {
      resolve({ width: element.width || 200, height: element.height || 150 });
    };
    
    img.src = element.content;
  });
}

/**
 * Mesure les dimensions réelles d'un tableau
 * en calculant la hauteur totale des lignes
 */
export function measureTableElement(element: Element): { width: number; height: number } {
  if (!element.tableData || element.tableData.length === 0) {
    return { width: element.width || 700, height: element.height || 200 };
  }
  
  const rowHeight = 35; // Hauteur approximative par ligne
  const headerHeight = 40; // Hauteur de l'en-tête
  const rowCount = element.tableData.length;
  const totalHeight = headerHeight + (rowCount * rowHeight);
  
  // Largeur : utiliser la largeur définie ou calculer à partir des colonnes
  const columnCount = element.tableColumns?.length || 1;
  const calculatedWidth = Math.min(700, 100 + (columnCount * 120));
  
  return {
    width: element.width || calculatedWidth,
    height: Math.max(element.height || 200, totalHeight)
  };
}

/**
 * Mesure les dimensions réelles d'un élément variable
 * (similaire au texte, mais avec un fond coloré)
 */
export function measureVariableElement(element: Element): Promise<{ width: number; height: number }> {
  // Les variables sont rendues comme du texte, utiliser la même logique
  return measureTextElement(element);
}

/**
 * Mesure les dimensions réelles d'un élément shape
 */
export function measureShapeElement(element: Element): { width: number; height: number } {
  // Les formes ont des dimensions fixes définies dans l'élément
  return {
    width: element.width || 150,
    height: element.height || 100
  };
}

/**
 * Mesure les dimensions réelles d'un élément
 * Retourne les dimensions mesurées (peut différer des dimensions déclarées)
 */
export async function measureElement(element: Element): Promise<{ width: number; height: number }> {
  switch (element.type) {
    case 'text':
      return await measureTextElement(element);
    
    case 'image':
      return await measureImageElement(element);
    
    case 'table':
      return measureTableElement(element);
    
    case 'variable':
      return await measureVariableElement(element);
    
    case 'shape':
      return measureShapeElement(element);
    
    default:
      return { width: element.width || 200, height: element.height || 100 };
  }
}

/**
 * Mesure tous les éléments d'un tableau
 * Retourne un tableau de résultats de mesure
 */
export async function measureAllElements(elements: Element[]): Promise<Map<string, { width: number; height: number }>> {
  const measurements = new Map<string, { width: number; height: number }>();
  
  // Mesurer tous les éléments en parallèle
  const promises = elements.map(async (element) => {
    const measured = await measureElement(element);
    measurements.set(element.id, measured);
  });
  
  await Promise.all(promises);
  return measurements;
}

