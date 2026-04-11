/**
 * Hook pour gérer le zoom d'affichage
 * 
 * IMPORTANT : Le zoom est appliqué uniquement visuellement via CSS transform: scale()
 * Les calculs de layout et pagination sont toujours effectués à zoom=1
 */

import { useState, useCallback } from 'react';

export interface UseZoomOptions {
  minZoom?: number;
  maxZoom?: number;
  initialZoom?: number;
  zoomStep?: number;
}

export interface UseZoomReturn {
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setZoom: (value: number) => void;
  fitToPage: (containerWidth: number, containerHeight: number, pageWidth: number, pageHeight: number) => void;
}

const DEFAULT_MIN_ZOOM = 0.25;
const DEFAULT_MAX_ZOOM = 3.0;
const DEFAULT_INITIAL_ZOOM = 1.0;
const DEFAULT_ZOOM_STEP = 0.1;

/**
 * Hook pour gérer le zoom
 */
export function useZoom(options: UseZoomOptions = {}): UseZoomReturn {
  const {
    minZoom = DEFAULT_MIN_ZOOM,
    maxZoom = DEFAULT_MAX_ZOOM,
    initialZoom = DEFAULT_INITIAL_ZOOM,
    zoomStep = DEFAULT_ZOOM_STEP
  } = options;

  const [zoom, setZoomState] = useState(initialZoom);

  const zoomIn = useCallback(() => {
    setZoomState(prev => Math.min(maxZoom, prev + zoomStep));
  }, [maxZoom, zoomStep]);

  const zoomOut = useCallback(() => {
    setZoomState(prev => Math.max(minZoom, prev - zoomStep));
  }, [minZoom, zoomStep]);

  const resetZoom = useCallback(() => {
    setZoomState(DEFAULT_INITIAL_ZOOM);
  }, []);

  const setZoom = useCallback((value: number) => {
    setZoomState(Math.max(minZoom, Math.min(maxZoom, value)));
  }, [minZoom, maxZoom]);

  const fitToPage = useCallback((
    containerWidth: number,
    containerHeight: number,
    pageWidth: number,
    pageHeight: number
  ) => {
    // Calculer le zoom pour que la page tienne dans le conteneur avec une marge
    const margin = 40; // Marge de 20px de chaque côté
    const availableWidth = containerWidth - margin;
    const availableHeight = containerHeight - margin;
    
    const scaleX = availableWidth / pageWidth;
    const scaleY = availableHeight / pageHeight;
    
    // Utiliser le plus petit scale pour garantir que la page tienne complètement
    const fitScale = Math.min(scaleX, scaleY, maxZoom);
    
    setZoomState(Math.max(minZoom, fitScale));
  }, [minZoom, maxZoom]);

  return {
    zoom,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,
    fitToPage
  };
}

