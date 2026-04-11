/**
 * Moteur de rendu extensible pour la Page des États
 * 
 * Ce module gère le mode "EXTENSIBLE" où la feuille n'a pas de limite de hauteur
 * et s'étend automatiquement selon le contenu.
 * 
 * PRINCIPE :
 * - Largeur fixe (A4_WIDTH)
 * - Hauteur dynamique calculée à partir du contenu
 * - Aucune pagination, surface continue
 */

import type { Element } from '../PageEtat';
import { A4_WIDTH, A4_HEIGHT, DEFAULT_MARGINS, measureAllElements } from './elementMeasurer';
import type { PageMargins } from './elementMeasurer';

export type RenderMode = 'PAGED' | 'EXTENSIBLE';

export interface ExtensibleSheetResult {
  sheetHeight: number;
  elements: Element[];
  measurements: Map<string, { width: number; height: number }>;
}

/**
 * Classe pour gérer le rendu extensible
 */
export class ExtensibleSheetEngine {
  private margins: PageMargins;
  private debugMode: boolean = false;
  
  constructor(margins: PageMargins = DEFAULT_MARGINS) {
    this.margins = margins;
  }
  
  /**
   * Active/désactive le mode debug
   */
  setDebugMode(enabled: boolean) {
    this.debugMode = enabled;
  }
  
  /**
   * Log un message si le mode debug est activé
   */
  private debug(...args: any[]) {
    if (this.debugMode) {
      console.log('[ExtensibleSheetEngine]', ...args);
    }
  }
  
  /**
   * Calcule la hauteur dynamique de la feuille en mode extensible
   * 
   * @param elements - Les éléments à placer sur la feuille
   * @returns La hauteur totale nécessaire pour afficher tous les éléments
   */
  async computeSheetHeight(elements: Element[]): Promise<ExtensibleSheetResult> {
    if (elements.length === 0) {
      // Feuille vide : hauteur minimale = A4_HEIGHT
      return {
        sheetHeight: A4_HEIGHT, // Hauteur minimale = A4 (1123px)
        elements: [],
        measurements: new Map()
      };
    }
    
    // ÉTAPE 1 : Mesurer tous les éléments pour obtenir leurs dimensions réelles
    this.debug('Mesure des éléments pour le mode extensible...');
    const measurements = await measureAllElements(elements);
    this.debug(`Mesures terminées pour ${measurements.size} éléments`);
    
    // ÉTAPE 2 : Trier les éléments par leur ordre logique (zIndex)
    const sortedElements = [...elements].sort((a, b) => {
      const orderA = a.zIndex ?? 0;
      const orderB = b.zIndex ?? 0;
      return orderA - orderB;
    });
    
    // ÉTAPE 3 : Calculer la position Y la plus basse
    let maxBottom = this.margins.top; // Commencer avec la marge du haut
    
    for (const element of sortedElements) {
      const measured = measurements.get(element.id);
      if (!measured) {
        this.debug(`⚠️ Pas de mesure pour l'élément ${element.id}, utilisation des dimensions par défaut`);
        continue;
      }
      
      const elementBottom = element.y + measured.height;
      if (elementBottom > maxBottom) {
        maxBottom = elementBottom;
        this.debug(`Élément ${element.id} : bottom = ${elementBottom}px (nouveau max)`);
      }
    }
    
    // ÉTAPE 4 : Calculer la hauteur totale de la feuille
    // Hauteur = position la plus basse + marge du bas + padding de sécurité
    // MAIS avec une hauteur minimale = A4_HEIGHT
    const paddingBottom = 50; // Padding de sécurité pour éviter que les éléments touchent le bord
    const calculatedHeight = maxBottom + this.margins.bottom + paddingBottom;
    const sheetHeight = Math.max(A4_HEIGHT, calculatedHeight); // Hauteur minimale = A4_HEIGHT
    
    this.debug(`Hauteur calculée de la feuille : ${sheetHeight}px`);
    this.debug(`  - Position la plus basse : ${maxBottom}px`);
    this.debug(`  - Marge du bas : ${this.margins.bottom}px`);
    this.debug(`  - Padding de sécurité : ${paddingBottom}px`);
    this.debug(`  - Hauteur calculée : ${calculatedHeight}px`);
    this.debug(`  - Hauteur minimale (A4) : ${A4_HEIGHT}px`);
    if (calculatedHeight < A4_HEIGHT) {
      this.debug(`  - ⚠️ Hauteur calculée inférieure à A4, utilisation de A4_HEIGHT`);
    }
    
    // ÉTAPE 5 : Ajuster les positions X et hauteur (pour heightByContent)
    const adjustedElements = sortedElements.map(element => {
      const measured = measurements.get(element.id);
      const adjustedX = Math.max(this.margins.left, Math.min(element.x, A4_WIDTH - this.margins.right - (element.width || 200)));
      const base = { ...element, x: adjustedX };
      // Pour text/variable avec heightByContent, injecter la hauteur mesurée
      if (element.heightByContent && measured && (element.type === 'text' || element.type === 'variable')) {
        return { ...base, height: measured.height };
      }
      return base;
    });
    
    return {
      sheetHeight,
      elements: adjustedElements,
      measurements
    };
  }
}

/**
 * Fonction utilitaire pour créer une instance du moteur extensible
 */
export function createExtensibleSheetEngine(margins?: PageMargins): ExtensibleSheetEngine {
  return new ExtensibleSheetEngine(margins);
}

