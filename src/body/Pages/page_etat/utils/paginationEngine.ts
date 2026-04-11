/**
 * Moteur de pagination pour la Page des États
 * 
 * Ce module implémente l'algorithme de pagination qui :
 * 1. Mesure chaque élément pour obtenir ses dimensions réelles
 * 2. Place les éléments sur les pages en respectant les marges
 * 3. Split les éléments trop grands (tableaux) sur plusieurs pages
 * 4. Gère l'ordre logique des éléments
 * 
 * IMPORTANT : Tous les calculs sont effectués à zoom=1
 */

import type { Element } from '../PageEtat';
import { 
  A4_WIDTH, 
  A4_HEIGHT, 
  DEFAULT_MARGINS, 
  getAvailableContentHeight,
  getAvailableContentWidth,
  measureAllElements
} from './elementMeasurer';
import type { PageMargins } from './elementMeasurer';
import { splitElementIfNeeded, canSplitElement } from './tableSplitter';

export interface PaginatedPage {
  pageIndex: number;
  elements: Element[];
  cursorY: number; // Position Y actuelle sur la page
}

export interface PaginationResult {
  pages: PaginatedPage[];
  totalPages: number;
  measurements: Map<string, { width: number; height: number }>;
}

/**
 * Classe le système de pagination
 */
export class PaginationEngine {
  private margins: PageMargins;
  private availableHeight: number;
  private availableWidth: number;
  private debugMode: boolean = false;
  private contentTop: number;
  private contentHeight: number;
  
  constructor(margins: PageMargins = DEFAULT_MARGINS) {
    this.margins = margins;
    this.availableHeight = getAvailableContentHeight(margins);
    this.availableWidth = getAvailableContentWidth(margins);
    this.contentTop = margins.top;
    this.contentHeight = this.availableHeight;
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
      console.log('[PaginationEngine]', ...args);
    }
  }
  
  /**
   * Pagine les éléments en respectant les contraintes de page
   */
  async paginate(elements: Element[]): Promise<PaginationResult> {
    // ÉTAPE 1 : Mesurer tous les éléments
    this.debug('Mesure des éléments...');
    const measurements = await measureAllElements(elements);
    this.debug(`Mesures terminées pour ${measurements.size} éléments`);
    
    // ÉTAPE 2 : Trier les éléments par leur ordre logique (zIndex ou ordre d'apparition)
    const sortedElements = [...elements].sort((a, b) => {
      const orderA = a.zIndex ?? 0;
      const orderB = b.zIndex ?? 0;
      return orderA - orderB;
    });
    
    // Éléments répétés (mode PAGED): en-tête / pied de page
    const headerElements = sortedElements.filter((e) => e.pageRegion === 'header');
    const footerElements = sortedElements.filter((e) => e.pageRegion === 'footer');
    const flowElements = sortedElements.filter((e) => e.pageRegion !== 'header' && e.pageRegion !== 'footer');

    // Réserver une zone de contenu pour éviter le chevauchement avec en-tête/pied.
    const reservedTop = headerElements.reduce((acc, el) => {
      const measured = measurements.get(el.id);
      if (!measured) return acc;
      const overlap = Math.max(0, (el.y + measured.height + 10) - this.margins.top);
      return Math.max(acc, overlap);
    }, 0);
    const reservedBottom = footerElements.reduce((acc, el) => {
      const measured = measurements.get(el.id);
      if (!measured) return acc;
      const overlap = Math.max(0, (A4_HEIGHT - el.y) - this.margins.bottom);
      return Math.max(acc, overlap);
    }, 0);
    this.contentTop = this.margins.top + reservedTop;
    this.contentHeight = Math.max(60, A4_HEIGHT - this.contentTop - (this.margins.bottom + reservedBottom));

    // ÉTAPE 3 : Paginer les éléments de flux principal
    const pages: PaginatedPage[] = [];
    let currentPage: PaginatedPage | null = null;
    let pageIndex = 0;
    
    for (const element of flowElements) {
      const measured = measurements.get(element.id);
      if (!measured) {
        this.debug(`⚠️ Pas de mesure pour l'élément ${element.id}, utilisation des dimensions par défaut`);
        continue;
      }
      
      const elementHeight = measured.height;
      const elementWidth = measured.width;
      
      // Vérifier si l'élément est trop large pour la page
      if (elementWidth > this.availableWidth) {
        this.debug(`⚠️ Élément ${element.id} trop large (${elementWidth}px > ${this.availableWidth}px), ajustement...`);
        // Ajuster la largeur (sera géré par le rendu)
      }
      
      // Vérifier si l'élément est trop haut pour une page
      if (elementHeight > this.availableHeight) {
        this.debug(`⚠️ Élément ${element.id} trop haut (${elementHeight}px > ${this.availableHeight}px), split nécessaire...`);
        
        // Splitter l'élément si possible
        if (canSplitElement(element)) {
          const splitElements = splitElementIfNeeded(element, this.availableHeight, this.margins);
          
          // Traiter chaque partie splitée
          for (const splitElement of splitElements) {
            const splitMeasured = await this.measureSplitElement(splitElement, element);
            
            // Placer chaque partie sur la/les page(s) appropriée(s)
            currentPage = this.placeElementOnPage(
              splitElement,
              splitMeasured.height,
              splitMeasured.width,
              pages,
              currentPage,
              pageIndex
            );
            
            // Mettre à jour pageIndex si nécessaire
            if (currentPage) {
              pageIndex = currentPage.pageIndex;
            }
          }
          
          continue;
        } else {
          // Élément trop grand mais non splittable : forcer sur une page dédiée
          this.debug(`⚠️ Élément ${element.id} non splittable, placement sur page dédiée`);
        }
      }
      
      // Placer l'élément normalement
      currentPage = this.placeElementOnPage(
        element,
        elementHeight,
        elementWidth,
        pages,
        currentPage,
        pageIndex
      );
      
      if (currentPage) {
        pageIndex = currentPage.pageIndex;
      }
    }

    // Si seulement en-tête/pied existent, produire au moins une page.
    if (pages.length === 0 && (headerElements.length > 0 || footerElements.length > 0)) {
      pages.push({
        pageIndex: 0,
        elements: [],
        cursorY: this.contentTop
      });
    }

    // Ajouter les éléments répétés sur chaque page
    if (headerElements.length > 0 || footerElements.length > 0) {
      for (const page of pages) {
        const repeated: Element[] = [];
        for (const el of headerElements) {
          repeated.push({ ...el, id: `${el.id}__repeat_h_${page.pageIndex}` });
        }
        for (const el of footerElements) {
          repeated.push({ ...el, id: `${el.id}__repeat_f_${page.pageIndex}` });
        }
        page.elements = [...page.elements, ...repeated];
      }
    }
    
    // ÉTAPE 4 : Ajuster les positions X/Y des éléments sur chaque page
    for (const page of pages) {
      for (const element of page.elements) {
        // Ajuster X pour respecter les marges
        element.x = Math.max(this.margins.left, Math.min(element.x, A4_WIDTH - this.margins.right - element.width));
        // Y est déjà ajusté par placeElementOnPage
      }
    }
    
    return {
      pages,
      totalPages: pages.length,
      measurements
    };
  }
  
  /**
   * Mesure un élément splité (pour les tableaux)
   */
  private async measureSplitElement(splitElement: Element, originalElement: Element): Promise<{ width: number; height: number }> {
    if (splitElement.type === 'table' && splitElement.tableData) {
      const rowHeight = 35;
      const headerHeight = 40;
      const rowCount = splitElement.tableData.length;
      return {
        width: splitElement.width || originalElement.width,
        height: headerHeight + (rowCount * rowHeight)
      };
    }
    
    // Pour les autres types, utiliser les dimensions de l'élément
    return {
      width: splitElement.width,
      height: splitElement.height
    };
  }
  
  /**
   * Place un élément sur la page appropriée
   */
  private placeElementOnPage(
    element: Element,
    elementHeight: number,
    elementWidth: number,
    pages: PaginatedPage[],
    currentPage: PaginatedPage | null,
    currentPageIndex: number
  ): PaginatedPage | null {
    // Créer une nouvelle page si nécessaire
    if (!currentPage) {
      currentPage = {
        pageIndex: currentPageIndex,
        elements: [],
        cursorY: this.contentTop
      };
      pages.push(currentPage);
      this.debug(`📄 Création de la page ${currentPageIndex}`);
    }
    
    // Vérifier si l'élément peut tenir sur la page actuelle
    const spaceRemaining = this.contentHeight - (currentPage.cursorY - this.contentTop);
    
    if (elementHeight <= spaceRemaining) {
      // L'élément peut tenir sur la page actuelle
      const placedElement: Element = {
        ...element,
        x: Math.max(this.margins.left, element.x),
        y: currentPage.cursorY,
        ...(element.heightByContent && (element.type === 'text' || element.type === 'variable')
          ? { height: elementHeight, width: elementWidth }
          : {})
      };
      
      currentPage.elements.push(placedElement);
      currentPage.cursorY += elementHeight + 10; // 10px d'espacement entre éléments
      
      this.debug(`✓ Élément ${element.id} placé sur la page ${currentPage.pageIndex} à Y=${placedElement.y}`);
      
      return currentPage;
    } else {
      // L'élément ne peut pas tenir, créer une nouvelle page
      const newPageIndex = currentPageIndex + 1;
      const newPage: PaginatedPage = {
        pageIndex: newPageIndex,
        elements: [],
        cursorY: this.contentTop
      };
      
      const placedElement: Element = {
        ...element,
        x: Math.max(this.margins.left, element.x),
        y: newPage.cursorY,
        ...(element.heightByContent && (element.type === 'text' || element.type === 'variable')
          ? { height: elementHeight, width: elementWidth }
          : {})
      };
      
      newPage.elements.push(placedElement);
      newPage.cursorY += elementHeight + 10;
      
      pages.push(newPage);
      this.debug(`📄 Nouvelle page ${newPageIndex} créée pour l'élément ${element.id}`);
      
      return newPage;
    }
  }
}

/**
 * Fonction utilitaire pour créer une instance du moteur de pagination
 */
export function createPaginationEngine(margins?: PageMargins): PaginationEngine {
  return new PaginationEngine(margins);
}

