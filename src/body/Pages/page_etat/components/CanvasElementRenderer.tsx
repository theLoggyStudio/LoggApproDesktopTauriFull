import React from 'react';
import type { CanvasElement } from '../hooks/useCanvasElements';
import { replaceAllVariables } from '../utils/variableRenderer';

interface CanvasElementRendererProps {
  element: CanvasElement;
  isSelected: boolean;
  isPreviewMode: boolean;
  medicalDataContext: any;
  onMouseDown?: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
}

const CanvasElementRenderer: React.FC<CanvasElementRendererProps> = ({
  element,
  isSelected,
  isPreviewMode,
  medicalDataContext,
  onMouseDown,
  onDoubleClick
}) => {
  const commonStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${element.x}px`,
    top: `${element.y}px`,
    width: `${element.width}px`,
    height: `${element.height}px`,
    cursor: isPreviewMode ? 'default' : 'grab',
    border: isSelected && !isPreviewMode ? '2px solid #2196f3' : 'none',
    boxShadow: isSelected && !isPreviewMode ? '0 0 10px rgba(33, 150, 243, 0.5)' : 'none',
    zIndex: element.zIndex || 0,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined
  };

  switch (element.type) {
    case 'text':
      const textContent = isPreviewMode 
        ? replaceAllVariables(element.content, medicalDataContext)
        : element.content;

      return (
        <div
          key={element.id}
          style={{
            ...commonStyle,
            fontSize: `${element.fontSize}px`,
            fontFamily: element.fontFamily,
            color: element.color,
            fontWeight: element.fontWeight,
            fontStyle: element.fontStyle,
            textDecoration: element.textDecoration,
            textAlign: element.textAlign as any,
            backgroundColor: element.backgroundColor,
            borderColor: element.borderColor,
            borderWidth: element.borderWidth,
            borderRadius: element.borderRadius,
            borderStyle: element.borderWidth ? 'solid' : 'none',
            padding: '5px',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            userSelect: isPreviewMode ? 'text' : 'none'
          }}
          onMouseDown={isPreviewMode ? undefined : onMouseDown}
          onDoubleClick={isPreviewMode ? undefined : onDoubleClick}
        >
          {textContent}
        </div>
      );

    case 'variable':
      const displayValue = isPreviewMode 
        ? replaceAllVariables(element.content, medicalDataContext)
        : element.content;

      return (
        <div
          key={element.id}
          style={{
            ...commonStyle,
            fontSize: `${element.fontSize}px`,
            fontFamily: element.fontFamily,
            color: element.color,
            fontWeight: element.fontWeight,
            fontStyle: element.fontStyle,
            textDecoration: element.textDecoration,
            textAlign: element.textAlign as any,
            backgroundColor: isPreviewMode ? 'transparent' : (element.backgroundColor || '#e3f2fd'),
            borderColor: isPreviewMode ? 'transparent' : (element.borderColor || '#2196f3'),
            borderWidth: isPreviewMode ? 0 : (element.borderWidth || 1),
            borderRadius: element.borderRadius,
            borderStyle: !isPreviewMode && element.borderWidth ? 'solid' : 'none',
            padding: '5px',
            overflow: 'hidden',
            userSelect: isPreviewMode ? 'text' : 'none',
            display: 'flex',
            alignItems: 'center'
          }}
          onMouseDown={isPreviewMode ? undefined : onMouseDown}
          onDoubleClick={isPreviewMode ? undefined : onDoubleClick}
        >
          {displayValue}
        </div>
      );

    case 'image':
      return (
        <div
          key={element.id}
          style={{
            ...commonStyle,
            overflow: 'hidden'
          }}
          onMouseDown={isPreviewMode ? undefined : onMouseDown}
        >
          <img 
            src={element.content} 
            alt="Document" 
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'contain',
              pointerEvents: 'none'
            }} 
          />
        </div>
      );

    case 'shape':
      return (
        <div
          key={element.id}
          style={{
            ...commonStyle,
            backgroundColor: element.backgroundColor,
            borderColor: element.borderColor,
            borderWidth: element.borderWidth,
            borderStyle: element.borderWidth ? 'solid' : 'none',
            borderRadius: element.content === 'circle' ? '50%' : `${element.borderRadius || 0}%`
          }}
          onMouseDown={isPreviewMode ? undefined : onMouseDown}
        />
      );

    default:
      return null;
  }
};

export default CanvasElementRenderer;

