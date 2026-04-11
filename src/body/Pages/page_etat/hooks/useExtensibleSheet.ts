/**
 * Hook React pour gérer le mode extensible de la Page des États
 * 
 * Ce hook calcule la hauteur dynamique de la feuille en fonction du contenu
 * et gère le rendu en mode extensible (sans pagination).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Element } from '../PageEtat';
import { ExtensibleSheetEngine } from '../utils/extensibleSheetEngine';
import type { ExtensibleSheetResult } from '../utils/extensibleSheetEngine';
import { DEFAULT_MARGINS, A4_HEIGHT } from '../utils/elementMeasurer';
import type { PageMargins } from '../utils/elementMeasurer';

export interface UseExtensibleSheetOptions {
  margins?: PageMargins;
  debugMode?: boolean;
  autoRecalculate?: boolean;
}

export interface UseExtensibleSheetReturn {
  sheetHeight: number;
  isCalculating: boolean;
  recalculate: () => Promise<void>;
  setDebugMode: (enabled: boolean) => void;
  setMargins: (margins: PageMargins) => void;
  adjustedElements: Element[];
}

/**
 * Hook pour gérer le mode extensible
 */
export function useExtensibleSheet(
  elements: Element[],
  options: UseExtensibleSheetOptions = {}
): UseExtensibleSheetReturn {
  const {
    margins = DEFAULT_MARGINS,
    debugMode = false,
    autoRecalculate = true
  } = options;
  
  const [sheetHeight, setSheetHeight] = useState(A4_HEIGHT); // Hauteur A4 par défaut
  const [isCalculating, setIsCalculating] = useState(false);
  const [adjustedElements, setAdjustedElements] = useState<Element[]>(elements);
  const [currentMargins, setCurrentMargins] = useState<PageMargins>(margins);
  const [currentDebugMode, setCurrentDebugMode] = useState(debugMode);
  
  const engineRef = useRef<ExtensibleSheetEngine | null>(null);
  
  // Initialiser le moteur extensible
  useEffect(() => {
    if (!engineRef.current) {
      engineRef.current = new ExtensibleSheetEngine(currentMargins);
      engineRef.current.setDebugMode(currentDebugMode);
    }
  }, [currentMargins, currentDebugMode]);
  
  // Mettre à jour les marges
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current = new ExtensibleSheetEngine(currentMargins);
      engineRef.current.setDebugMode(currentDebugMode);
    }
  }, [currentMargins, currentDebugMode]);
  
  // Fonction de recalcul de la hauteur
  const recalculate = useCallback(async () => {
    if (!engineRef.current || elements.length === 0) {
      // Si aucun élément, utiliser la hauteur minimale = A4_HEIGHT
      setSheetHeight(A4_HEIGHT);
      setAdjustedElements([]);
      return;
    }
    
    setIsCalculating(true);
    
    try {
      const result: ExtensibleSheetResult = await engineRef.current.computeSheetHeight(elements);
      setSheetHeight(result.sheetHeight);
      setAdjustedElements(result.elements);
    } catch (error) {
      console.error('Erreur lors du calcul de la hauteur extensible:', error);
      // En cas d'erreur, utiliser la hauteur minimale = A4_HEIGHT
      setSheetHeight(A4_HEIGHT);
      setAdjustedElements(elements);
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
    sheetHeight,
    isCalculating,
    recalculate,
    setDebugMode,
    setMargins,
    adjustedElements
  };
}

