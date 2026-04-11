/**
 * Composant de rendu extensible pour la Page des États
 * 
 * Ce composant gère le rendu d'une feuille extensible (hauteur illimitée)
 * où le contenu détermine la hauteur de la feuille.
 */

import React, { type RefObject } from 'react';
import type { Element } from '../PageEtat';
import { A4_WIDTH } from '../utils/elementMeasurer';

interface ExtensibleSheetRendererProps {
  elements: Element[];
  sheetHeight: number;
  renderElement: (element: Element, previewMode: boolean, pageIndex: number) => React.ReactNode;
  previewMode: boolean;
  showGrid?: boolean;
  onSheetClick?: () => void;
  zoom?: number;
  canvasRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Composant pour rendre une feuille extensible
 */
export const ExtensibleSheetRenderer: React.FC<ExtensibleSheetRendererProps> = ({
  elements,
  sheetHeight,
  renderElement,
  previewMode,
  showGrid = false,
  onSheetClick,
  zoom = 1,
  canvasRef
}) => {
  const guideHeaderY = 140;
  const guideFooterY = Math.max(guideHeaderY + 80, sheetHeight - 140);

  return (
    <div
      ref={canvasRef}
      style={{
        width: `${A4_WIDTH}px`,
        height: `${sheetHeight}px`, // Hauteur dynamique calculée
        backgroundColor: 'white',
        position: 'relative',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        cursor: previewMode ? 'default' : 'pointer',
        overflow: 'hidden', // Empêcher tout débordement visuel
        // Clipping strict pour garantir que rien ne dépasse
        clipPath: previewMode ? `inset(0 0 0 0)` : undefined
      }}
      onClick={onSheetClick}
    >
      {/* Grille optionnelle pour aide au positionnement (uniquement en mode édition) */}
      {showGrid && !previewMode && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          pointerEvents: 'none',
          opacity: 0.3,
          zIndex: 0
        }} />
      )}

      {/* Guides visuels écran (édition + aperçu) : séparation en-tête / corps / pied */}
      <div
        className="page-region-guide"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${guideHeaderY}px`,
          borderTop: '2px dashed #e53935',
          zIndex: 12000,
          pointerEvents: 'none'
        }}
      />
      <div
        className="page-region-guide-label"
        style={{
          position: 'absolute',
          top: `${Math.max(0, guideHeaderY - 16)}px`,
          left: '8px',
          zIndex: 12001,
          pointerEvents: 'none'
        }}
      >
        EN-TETE
      </div>
      <div
        className="page-region-guide"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${guideFooterY}px`,
          borderTop: '2px dashed #e53935',
          zIndex: 12000,
          pointerEvents: 'none'
        }}
      />
      <div
        className="page-region-guide-label"
        style={{
          position: 'absolute',
          top: `${Math.max(0, guideFooterY - 16)}px`,
          left: '8px',
          zIndex: 12001,
          pointerEvents: 'none'
        }}
      >
        PIED
      </div>

      {/* Rendu des éléments - triés par zIndex pour respecter l'ordre des calques */}
      {[...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(element => {
        const useHeightByContent = element.heightByContent && (element.type === 'text' || element.type === 'variable');
        // En mode aperçu, garantir que l'élément ne dépasse pas de la feuille (sauf heightByContent)
        const adjustedElement = previewMode ? {
          ...element,
          y: Math.max(0, Math.min(element.y, sheetHeight - (element.height || 20))),
          x: Math.max(0, Math.min(element.x, A4_WIDTH - element.width)),
          width: Math.min(element.width, A4_WIDTH - element.x),
          ...(useHeightByContent ? {} : { height: Math.min(element.height, sheetHeight - element.y) })
        } : element;

        return (
          <div key={element.id} style={{ position: 'relative', zIndex: element.zIndex ?? 0 }}>
            {renderElement(adjustedElement, previewMode, 0)}
          </div>
        );
      })}
    </div>
  );
};

