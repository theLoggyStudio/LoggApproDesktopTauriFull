/**
 * Hook React pour gérer la pagination de la Page des États
 * 
 * Ce hook :
 * - Mesure les éléments lorsque nécessaire
 * - Calcule la pagination
 * - Gère le mode debug
 * - Fournit les pages paginées pour le rendu
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Element } from '../PageEtat';
import { PaginationEngine } from '../utils/paginationEngine';
import type { PaginationResult, PaginatedPage } from '../utils/paginationEngine';
import { DEFAULT_MARGINS } from '../utils/elementMeasurer';
import type { PageMargins } from '../utils/elementMeasurer';

export interface UsePaginationOptions {
  margins?: PageMargins;
  debugMode?: boolean;
  autoRecalculate?: boolean; // Recalculer automatiquement quand les éléments changent
}

export interface UsePaginationReturn {
  pages: PaginatedPage[];
  totalPages: number;
  isCalculating: boolean;
  recalculate: () => Promise<void>;
  setDebugMode: (enabled: boolean) => void;
  setMargins: (margins: PageMargins) => void;
}

/**
 * Hook pour gérer la pagination des éléments
 */
export function usePagination(
  elements: Element[],
  options: UsePaginationOptions = {}
): UsePaginationReturn {
  const {
    margins = DEFAULT_MARGINS,
    debugMode = false,
    autoRecalculate = true
  } = options;
  
  const [pages, setPages] = useState<PaginatedPage[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [isCalculating, setIsCalculating] = useState(false);
  const [currentMargins, setCurrentMargins] = useState<PageMargins>(margins);
  const [currentDebugMode, setCurrentDebugMode] = useState(debugMode);
  
  const engineRef = useRef<PaginationEngine | null>(null);
  
  // Initialiser le moteur de pagination
  useEffect(() => {
    if (!engineRef.current) {
      engineRef.current = new PaginationEngine(currentMargins);
      engineRef.current.setDebugMode(currentDebugMode);
    }
  }, [currentMargins, currentDebugMode]);
  
  // Mettre à jour les marges
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current = new PaginationEngine(currentMargins);
      engineRef.current.setDebugMode(currentDebugMode);
    }
  }, [currentMargins, currentDebugMode]);
  
  // Fonction de recalcul de la pagination
  const recalculate = useCallback(async () => {
    if (!engineRef.current || elements.length === 0) {
      setPages([]);
      setTotalPages(1);
      return;
    }
    
    setIsCalculating(true);
    
    try {
      const result: PaginationResult = await engineRef.current.paginate(elements);
      setPages(result.pages);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error('Erreur lors du calcul de la pagination:', error);
      // En cas d'erreur, créer une page par défaut avec tous les éléments
      setPages([{
        pageIndex: 0,
        elements: elements,
        cursorY: currentMargins.top
      }]);
      setTotalPages(1);
    } finally {
      setIsCalculating(false);
    }
  }, [elements, currentMargins]);
  
  // Recalculer automatiquement si activé
  useEffect(() => {
    if (autoRecalculate) {
      recalculate();
    }
  }, [elements, autoRecalculate, recalculate]);
  
  // Fonction pour activer/désactiver le mode debug
  const setDebugMode = useCallback((enabled: boolean) => {
    setCurrentDebugMode(enabled);
    if (engineRef.current) {
      engineRef.current.setDebugMode(enabled);
    }
  }, []);
  
  // Fonction pour changer les marges
  const setMargins = useCallback((newMargins: PageMargins) => {
    setCurrentMargins(newMargins);
  }, []);
  
  return {
    pages,
    totalPages,
    isCalculating,
    recalculate,
    setDebugMode,
    setMargins
  };
}

