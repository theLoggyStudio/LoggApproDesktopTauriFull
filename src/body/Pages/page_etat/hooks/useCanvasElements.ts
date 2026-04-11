import { useState, useCallback } from 'react';

export interface CanvasElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'variable' | 'table';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  textAlign?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  rotation?: number;
  zIndex?: number;
  boxShadow?: string;
  // Propriétés spécifiques aux tableaux
  tableData?: any[];
  tableColumns?: string[];
  tableHeaderBg?: string;
  tableHeaderColor?: string;
  tableBorderColor?: string;
  tableStripedRows?: boolean;
}

export const useCanvasElements = () => {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const selectedElement = elements.find(el => el.id === selectedElementId) || null;

  // Ajouter un élément
  const addElement = useCallback((element: CanvasElement) => {
    setElements(prev => [...prev, element]);
    setSelectedElementId(element.id);
  }, []);

  // Mettre à jour un élément
  const updateElement = useCallback((id: string, updates: Partial<CanvasElement>) => {
    setElements(prev => prev.map(el => 
      el.id === id ? { ...el, ...updates } : el
    ));
  }, []);

  // Supprimer un élément
  const removeElement = useCallback((id: string) => {
    setElements(prev => prev.filter(el => el.id !== id));
    setSelectedElementId(null);
  }, []);

  // Dupliquer un élément
  const duplicateElement = useCallback((id: string) => {
    const element = elements.find(el => el.id === id);
    if (element) {
      const newElement: CanvasElement = {
        ...element,
        id: `${element.type}_${Date.now()}`,
        x: element.x + 20,
        y: element.y + 20,
        zIndex: elements.length
      };
      addElement(newElement);
    }
  }, [elements, addElement]);

  // Changer le z-index
  const changeZIndex = useCallback((id: string, direction: 'up' | 'down') => {
    const element = elements.find(el => el.id === id);
    if (!element) return;

    const currentZ = element.zIndex || 0;
    const newZ = direction === 'up' ? currentZ + 1 : Math.max(0, currentZ - 1);
    updateElement(id, { zIndex: newZ });
  }, [elements, updateElement]);

  // Mettre à jour une propriété
  const updateProperty = useCallback((property: keyof CanvasElement, value: any) => {
    if (selectedElementId) {
      updateElement(selectedElementId, { [property]: value });
    }
  }, [selectedElementId, updateElement]);

  return {
    elements,
    setElements,
    selectedElementId,
    setSelectedElementId,
    selectedElement,
    addElement,
    updateElement,
    removeElement,
    duplicateElement,
    changeZIndex,
    updateProperty
  };
};

