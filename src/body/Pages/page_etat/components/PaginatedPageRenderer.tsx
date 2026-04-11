/**
 * Composant de rendu paginé pour la Page des États
 * 
 * Ce composant gère le rendu strict des pages en mode aperçu/impression
 * avec clipping strict pour éviter tout débordement visuel.
 */

import React from 'react';
import type { Element } from '../PageEtat';
import type { PaginatedPage } from '../utils/paginationEngine';
import { A4_WIDTH, A4_HEIGHT } from '../utils/elementMeasurer';

interface PaginatedPageRendererProps {
  page: PaginatedPage;
  pageIndex: number;
  totalPages: number;
  renderElement: (element: Element, previewMode: boolean, pageIndex: number) => React.ReactNode;
  previewMode: boolean;
  showGrid?: boolean;
  isCurrentPage?: boolean;
  showDebugInfo?: boolean;
  onPageClick?: () => void;
}

/**
 * Composant pour rendre une page paginée
 */
export const PaginatedPageRenderer: React.FC<PaginatedPageRendererProps> = ({
  page,
  pageIndex,
  totalPages,
  renderElement,
  previewMode,
  showGrid = false,
  isCurrentPage = false,
  showDebugInfo = false,
  onPageClick
}) => {
  const headerLimitY = React.useMemo(() => {
    const headerEls = page.elements.filter((e) => e.pageRegion === 'header');
    if (headerEls.length === 0) return null;
    return Math.max(...headerEls.map((e) => (e.y || 0) + (e.height || 20)));
  }, [page.elements]);

  const footerStartY = React.useMemo(() => {
    const footerEls = page.elements.filter((e) => e.pageRegion === 'footer');
    if (footerEls.length === 0) return null;
    return Math.min(...footerEls.map((e) => e.y || 0));
  }, [page.elements]);
  const guideHeaderY = headerLimitY ?? 140;
  const guideFooterY = footerStartY ?? (A4_HEIGHT - 140);

  return (
    <div
      style={{
        width: `${A4_WIDTH}px`,
        height: `${A4_HEIGHT}px`,
        backgroundColor: 'white',
        position: 'relative',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        cursor: previewMode ? 'default' : 'pointer',
        marginBottom: pageIndex < totalPages - 1 ? '20px' : '0',
        // Bordure pour indiquer la page actuelle
        border: isCurrentPage ? '3px solid #2196f3' : '1px solid #e0e0e0',
        // Clipping strict en mode aperçu pour éviter tout débordement
        overflow: previewMode ? 'hidden' : 'hidden',
        // Clip-path pour garantir le clipping même en cas de débordement
        clipPath: previewMode ? `inset(0 0 0 0)` : undefined
      }}
      onClick={onPageClick}
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

      {/* Indicateur de numéro de page */}
      {totalPages > 1 && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          backgroundColor: 'rgba(33, 150, 243, 0.9)',
          color: 'white',
          padding: '4px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 'bold',
          zIndex: 10000,
          pointerEvents: 'none'
        }}>
          Page {pageIndex + 1}
        </div>
      )}

      {/* Informations de debug */}
      {showDebugInfo && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          backgroundColor: 'rgba(255, 193, 7, 0.9)',
          color: '#000',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '10px',
          fontFamily: 'monospace',
          zIndex: 10001,
          pointerEvents: 'none'
        }}>
          <div>Éléments: {page.elements.length}</div>
          <div>CursorY: {Math.round(page.cursorY)}px</div>
        </div>
      )}

      {/* Guides visuels écran (édition + aperçu) : séparation en-tête / corps / pied */}
      {(
        <>
          <div
            className="page-region-guide"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${Math.max(0, Math.min(A4_HEIGHT - 1, guideHeaderY))}px`,
              borderTop: '2px dashed #e53935',
              zIndex: 12000,
              pointerEvents: 'none'
            }}
          />
          <div
            className="page-region-guide-label"
            style={{
              position: 'absolute',
              top: `${Math.max(0, Math.min(A4_HEIGHT - 18, guideHeaderY - 16))}px`,
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
              top: `${Math.max(0, Math.min(A4_HEIGHT - 1, guideFooterY))}px`,
              borderTop: '2px dashed #e53935',
              zIndex: 12000,
              pointerEvents: 'none'
            }}
          />
          <div
            className="page-region-guide-label"
            style={{
              position: 'absolute',
              top: `${Math.max(0, Math.min(A4_HEIGHT - 18, guideFooterY - 16))}px`,
              left: '8px',
              zIndex: 12001,
              pointerEvents: 'none'
            }}
          >
            PIED
          </div>
        </>
      )}

      {/* Rendu des éléments de cette page - triés par zIndex pour respecter l'ordre des calques */}
      {[...page.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(element => {
        const useHeightByContent = element.heightByContent && (element.type === 'text' || element.type === 'variable');
        // En mode aperçu, garantir que l'élément ne dépasse pas de la page (sauf heightByContent)
        const adjustedElement = previewMode ? {
          ...element,
          y: Math.max(0, Math.min(element.y, A4_HEIGHT - (element.height || 20))),
          x: Math.max(0, Math.min(element.x, A4_WIDTH - element.width)),
          width: Math.min(element.width, A4_WIDTH - element.x),
          ...(useHeightByContent ? {} : { height: Math.min(element.height, A4_HEIGHT - element.y) })
        } : element;

        return (
          <div key={element.id} style={{ position: 'relative', zIndex: element.zIndex ?? 0 }}>
            {renderElement(adjustedElement, previewMode, pageIndex)}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Composant pour rendre toutes les pages paginées
 */
interface PaginatedPagesContainerProps {
  pages: PaginatedPage[];
  renderElement: (element: Element, previewMode: boolean, pageIndex: number) => React.ReactNode;
  previewMode: boolean;
  showGrid?: boolean;
  currentPage?: number;
  showDebugInfo?: boolean;
  onPageClick?: (pageIndex: number) => void;
}

export const PaginatedPagesContainer: React.FC<PaginatedPagesContainerProps> = ({
  pages,
  renderElement,
  previewMode,
  showGrid = false,
  currentPage = 0,
  showDebugInfo = false,
  onPageClick
}) => {
  if (pages.length === 0) {
    return null;
  }

  return (
    <>
      {pages.map((page, index) => (
        <PaginatedPageRenderer
          key={`page_${page.pageIndex}`}
          page={page}
          pageIndex={page.pageIndex}
          totalPages={pages.length}
          renderElement={renderElement}
          previewMode={previewMode}
          showGrid={showGrid}
          isCurrentPage={index === currentPage}
          showDebugInfo={showDebugInfo}
          onPageClick={() => onPageClick?.(page.pageIndex)}
        />
      ))}
    </>
  );
};

