import type { CanvasElement } from '../hooks/useCanvasElements';

export const createTextElement = (customContent?: string, elementsCount: number = 0): CanvasElement => ({
  id: `text_${Date.now()}`,
  type: 'text',
  x: 50,
  y: 50,
  width: customContent ? 700 : 200,
  height: customContent ? 600 : 40,
  content: customContent || 'Double-cliquez pour éditer',
  fontSize: 14,
  fontFamily: 'Arial, sans-serif',
  color: '#000000',
  fontWeight: 'normal',
  fontStyle: 'normal',
  textDecoration: 'none',
  textAlign: 'left',
  zIndex: elementsCount
});

export const createVariableElement = (variablePath: string, elementsCount: number = 0): CanvasElement => ({
  id: `var_${Date.now()}`,
  type: 'variable',
  x: 50,
  y: 50,
  width: 200,
  height: 30,
  content: `{{${variablePath}}}`,
  fontSize: 14,
  fontFamily: 'Arial, sans-serif',
  color: '#000000',
  backgroundColor: '#e3f2fd',
  borderColor: '#2196f3',
  borderWidth: 1,
  zIndex: elementsCount
});

export const createImageElement = (base64Data: string, elementsCount: number = 0): CanvasElement => ({
  id: `image_${Date.now()}`,
  type: 'image',
  x: 50,
  y: 50,
  width: 200,
  height: 150,
  content: base64Data,
  zIndex: elementsCount
});

export const createShapeElement = (shapeType: 'rectangle' | 'circle', elementsCount: number = 0): CanvasElement => ({
  id: `shape_${Date.now()}`,
  type: 'shape',
  x: 50,
  y: 50,
  width: 150,
  height: shapeType === 'circle' ? 150 : 100,
  content: shapeType,
  backgroundColor: '#ecf0f1',
  borderColor: '#34495e',
  borderWidth: 2,
  borderRadius: shapeType === 'circle' ? 50 : 0,
  zIndex: elementsCount
});

