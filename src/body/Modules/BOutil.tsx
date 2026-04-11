import { Undo, Redo, PlusCircle, Minus, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Save, Printer, Image, Palette, Highlighter, Search, Replace, Table, MoreHorizontal } from 'lucide-react';

// Ce fichier accueillera tous les modules de la barre d'outils extraits de PageEtat.tsx
// Chaque bouton, menu, groupe, etc. sera déplacé ici sans rien retirer ni négliger

// Props à compléter après validation
const BOutil = (props: any) => {
  const {
    applyFormat,
    fontFamily,
    changeFontFamily,
    fonts,
    fontSize,
    changeFontSize,
    fontSizes,
    generateFontSizes,
    isBold,
    isItalic,
    isUnderline,
    toggleStyle,
    textAlign,
    changeAlignment,
    saveDocument,
    printDocument,
    insertImage,
    textColor,
    backgroundColor,
    showColorPalette,
    toggleSearch,
    toggleReplace,
    searchState,
    insertTable,
    showTableTools
  } = props;

  return (
    <div className="boutil-toolbar">
      {/* 1. Annuler/Refaire */}
      <div className="toolbar-group space-x-1">
        <button onClick={() => applyFormat('undo')} className="toolbar-button">
          <Undo size={18} />
        </button>
        <button onClick={() => applyFormat('redo')} className="toolbar-button">
          <Redo size={18} />
        </button>
      </div>

      {/* 2. Police et taille */}
      <div className="toolbar-group space-x-2">
        <select
          value={fontFamily}
          onChange={(e) => changeFontFamily(e.target.value)}
          className="toolbar-select"
        >
          {fonts.map((font: string) => (
            <option key={font} value={font}>{font}</option>
          ))}
        </select>

        <select
          value={fontSize}
          onChange={(e) => changeFontSize(parseInt(e.target.value))}
          onClick={generateFontSizes}
          className="toolbar-select font-size-select"
        >
          {fontSizes.map((size: number) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>

        <button
          onClick={() => changeFontSize(fontSize + 1)}
          className="toolbar-button"
        >
          <PlusCircle size={18} />
        </button>

        <button
          onClick={() => changeFontSize(Math.max(8, fontSize - 1))}
          className="toolbar-button"
        >
          <Minus size={18} />
        </button>
      </div>

      {/* 3. Formatage de texte */}
      <div className="toolbar-group space-x-1">
        <button
          onClick={() => toggleStyle('bold')}
          className={`toolbar-button ${isBold ? 'active' : ''}`}
        >
          <Bold size={18} />
        </button>
        <button
          onClick={() => toggleStyle('italic')}
          className={`toolbar-button ${isItalic ? 'active' : ''}`}
        >
          <Italic size={18} />
        </button>
        <button
          onClick={() => toggleStyle('underline')}
          className={`toolbar-button ${isUnderline ? 'active' : ''}`}
        >
          <Underline size={18} />
        </button>
      </div>

      {/* 4. Alignement */}
      <div className="toolbar-group space-x-1">
        <button
          onClick={() => changeAlignment('left')}
          className={`toolbar-button ${textAlign === 'left' ? 'active' : ''}`}
        >
          <AlignLeft size={18} />
        </button>
        <button
          onClick={() => changeAlignment('center')}
          className={`toolbar-button ${textAlign === 'center' ? 'active' : ''}`}
        >
          <AlignCenter size={18} />
        </button>
        <button
          onClick={() => changeAlignment('right')}
          className={`toolbar-button ${textAlign === 'right' ? 'active' : ''}`}
        >
          <AlignRight size={18} />
        </button>
      </div>

      {/* 5. Listes */}
      <div className="toolbar-group space-x-1">
        <button
          onClick={() => applyFormat('insertUnorderedList')}
          className="toolbar-button"
        >
          <List size={18} />
        </button>
        <button
          onClick={() => applyFormat('insertOrderedList')}
          className="toolbar-button"
        >
          <ListOrdered size={18} />
        </button>
      </div>

      {/* 6. Imprimer et sauvegarder */}
      <div className="toolbar-group space-x-1">
        <button
          onClick={saveDocument}
          className="toolbar-button"
        >
          <Save size={18} />
        </button>
        <button
          onClick={printDocument}
          className="toolbar-button"
        >
          <Printer size={18} />
        </button>
      </div>

      {/* 7. Insertion d'image */}
      <div className="toolbar-group space-x-1">
        <button
          onClick={insertImage}
          className="toolbar-button"
          title="Insérer une image"
        >
          <Image size={18} />
        </button>
      </div>

      {/* 8. Couleurs */}
      <div className="toolbar-group space-x-1">
        <div className="color-picker-container">
          <button
            className="toolbar-button"
            title="Couleur du texte"
            style={{ backgroundColor: textColor }}
            onClick={(e) => showColorPalette(e, 'text')}
          >
            <Palette size={18} />
          </button>
        </div>
        <button
          className="toolbar-button"
          title="Surbrillance"
          style={{ backgroundColor: backgroundColor }}
          onClick={(e) => showColorPalette(e, 'background')}
        >
          <Highlighter size={18} />
        </button>
      </div>

      {/* 9. Recherche et remplacement */}
      <div className="toolbar-group space-x-1">
        <button
          onClick={toggleSearch}
          className={`toolbar-button ${searchState.isSearchVisible ? 'active' : ''}`}
          title="Rechercher"
        >
          <Search size={18} />
        </button>
        <button
          onClick={toggleReplace}
          className={`toolbar-button ${searchState.isReplaceVisible ? 'active' : ''}`}
          title="Remplacer"
        >
          <Replace size={18} />
        </button>
      </div>

      {/* 10. Insertion de tableau et export */}
      <div className="toolbar-group space-x-1">
        <div className="table-tools-container">
          <button onClick={insertTable} className="toolbar-button" title="Insérer un tableau">
            <Table size={18} />
          </button>
          <button 
            className="toolbar-button dropdown-toggle" 
            title="Outils de tableau"
            onClick={showTableTools}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default BOutil;

// Palette de couleurs flottante
export function ColorPaletteFloating({ colorPaletteState, predefinedColors, changeTextColor, changeBackgroundColor }: { colorPaletteState: { isVisible: boolean; position: { x: number; y: number }; type: string }; predefinedColors: string[]; changeTextColor: (color: string) => void; changeBackgroundColor: (color: string) => void }) {
    if (!colorPaletteState.isVisible) return null;
    return (
        <div
            className="color-palette-floating"
            style={{
                position: 'fixed',
                left: colorPaletteState.position.x,
                top: colorPaletteState.position.y,
                zIndex: 99999
            }}
        >
            {predefinedColors.map((color, index) => (
                <div
                    key={index}
                    className="color-option"
                    style={{ backgroundColor: color }}
                    onClick={() => {
                        if (colorPaletteState.type === 'text') {
                            changeTextColor(color);
                        } else {
                            changeBackgroundColor(color);
                        }
                    }}
                    title={`Couleur ${color}`}
                />
            ))}
        </div>
    );
}

// Outils de tableau flottants
export function TableToolsFloating({ tableToolsState, insertCustomTable, hideTableTools }: { tableToolsState: { isVisible: boolean; position: { x: number; y: number } }; insertCustomTable: (rows: number, cols: number) => void; hideTableTools: () => void }) {
    if (!tableToolsState.isVisible) return null;
    return (
        <div
            className="table-tools-floating"
            style={{
                position: 'fixed',
                left: tableToolsState.position.x,
                top: tableToolsState.position.y,
                zIndex: 99999,
                backgroundColor: 'white',
                border: '1px solid #dee2e6',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                padding: '16px',
                minWidth: '300px'
            }}
        >
            <div className="dropdown-section">
                <h4>Insérer un tableau</h4>
                <div className="table-grid">
                    {[3, 4, 5, 6, 7, 8].map(rows =>
                        [3, 4, 5, 6, 7, 8].map(cols => (
                            <div
                                key={`${rows}-${cols}`}
                                className="table-grid-item"
                                onClick={() => {
                                    insertCustomTable(rows, cols);
                                    hideTableTools();
                                }}
                                title={`${rows} lignes × ${cols} colonnes`}
                            >
                                <div className="table-preview">
                                    {Array(rows).fill(null).map((_, i) => (
                                        <div key={i} className="table-preview-row">
                                            {Array(cols).fill(null).map((_, j) => (
                                                <div key={j} className="table-preview-cell" />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

// Menu contextuel pour les tableaux
export function TableContextMenu({ tableState, addTableRow, deleteTableRow, addTableColumn, deleteTableColumn, mergeCells, splitCells, deleteTable, hideTableMenu }: { tableState: { isTableMenuVisible: boolean; tableMenuPosition: { x: number; y: number } }; addTableRow: () => void; deleteTableRow: () => void; addTableColumn: () => void; deleteTableColumn: () => void; mergeCells: () => void; splitCells: () => void; deleteTable: () => void; hideTableMenu: () => void }) {
    if (!tableState.isTableMenuVisible) return null;
    return (
        <div
            className="table-context-menu"
            style={{
                position: 'fixed',
                left: tableState.tableMenuPosition.x,
                top: tableState.tableMenuPosition.y,
                zIndex: 99999,
                backgroundColor: 'white',
                border: '1px solid #dee2e6',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                padding: '8px 0',
                minWidth: '220px',
                fontSize: '14px',
                maxHeight: '80vh',
                overflowY: 'auto'
            }}
        >
            <div className="context-menu-section">
                <h4>Lignes</h4>
                <button onClick={addTableRow} className="context-menu-item">Ajouter une ligne</button>
                <button onClick={deleteTableRow} className="context-menu-item">Supprimer la ligne</button>
            </div>
            <div className="context-menu-section">
                <h4>Colonnes</h4>
                <button onClick={addTableColumn} className="context-menu-item">Ajouter une colonne</button>
                <button onClick={deleteTableColumn} className="context-menu-item">Supprimer la colonne</button>
            </div>
            <div className="context-menu-section">
                <h4>Cellules</h4>
                <button onClick={mergeCells} className="context-menu-item">Fusionner les cellules</button>
                <button onClick={splitCells} className="context-menu-item">Diviser les cellules</button>
            </div>
            <div className="context-menu-section">
                <h4>Tableau</h4>
                <button onClick={deleteTable} className="context-menu-item danger">Supprimer le tableau</button>
            </div>
            <button onClick={hideTableMenu} className="context-menu-close">✕</button>
        </div>
    );
}

// Menu contextuel pour les images
export function ImageContextMenu({ imageState, fitImageToPage, fitImageToWidth, fitImageToHeight, restoreOriginalSize, resizeImageByPercentage, rotateImage, alignImage, floatImage, deleteImage, toggleFreePosition, bringToFront, sendToBack, closeImageMenu }: { imageState: { isImageMenuVisible: boolean; imageMenuPosition: { x: number; y: number }; isFreePosition: boolean }; fitImageToPage: () => void; fitImageToWidth: () => void; fitImageToHeight: () => void; restoreOriginalSize: () => void; resizeImageByPercentage: (percentage: number) => void; rotateImage: (angle: number) => void; alignImage: (alignment: string) => void; floatImage: (position: string) => void; deleteImage: () => void; toggleFreePosition: () => void; bringToFront: () => void; sendToBack: () => void; closeImageMenu: () => void }) {
    if (!imageState.isImageMenuVisible) return null;
    return (
        <div
            className="image-context-menu"
            style={{
                position: 'fixed',
                left: imageState.imageMenuPosition.x,
                top: imageState.imageMenuPosition.y,
                zIndex: 99999,
                backgroundColor: 'white',
                border: '1px solid #dee2e6',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                padding: '8px 0',
                minWidth: '220px',
                fontSize: '14px',
                maxHeight: '80vh',
                overflowY: 'auto'
            }}
        >
            <div className="context-menu-section">
                <h4>Redimensionner</h4>
                <button onClick={fitImageToPage} className="context-menu-item">Adapter à la page</button>
                <button onClick={fitImageToWidth} className="context-menu-item">Adapter à la largeur</button>
                <button onClick={fitImageToHeight} className="context-menu-item">Adapter à la hauteur</button>
                <button onClick={restoreOriginalSize} className="context-menu-item">Taille originale</button>
            </div>
            <div className="context-menu-section">
                <h4>Redimensionner par pourcentage</h4>
                <button onClick={() => resizeImageByPercentage(25)} className="context-menu-item">25%</button>
                <button onClick={() => resizeImageByPercentage(50)} className="context-menu-item">50%</button>
                <button onClick={() => resizeImageByPercentage(75)} className="context-menu-item">75%</button>
                <button onClick={() => resizeImageByPercentage(100)} className="context-menu-item">100%</button>
            </div>
            <div className="context-menu-section">
                <h4>Rotation</h4>
                <button onClick={() => rotateImage(45)} className="context-menu-item">Pivoter droite</button>
                <button onClick={() => rotateImage(-45)} className="context-menu-item">Pivoter gauche</button>
                <button onClick={() => rotateImage(180)} className="context-menu-item">Pivoter 180°</button>
            </div>
            <div className="context-menu-section">
                <h4>Alignement</h4>
                <button onClick={() => alignImage('left')} className="context-menu-item">Aligner à gauche</button>
                <button onClick={() => alignImage('center')} className="context-menu-item">Centrer</button>
                <button onClick={() => alignImage('right')} className="context-menu-item">Aligner à droite</button>
            </div>
            <div className="context-menu-section">
                <h4>Positionnement</h4>
                <button onClick={() => floatImage('none')} className="context-menu-item">Dans le texte</button>
                <button onClick={() => floatImage('left')} className="context-menu-item">Flotter à gauche</button>
                <button onClick={() => floatImage('right')} className="context-menu-item">Flotter à droite</button>
            </div>
            <div className="context-menu-section">
                <h4>Actions</h4>
                <button onClick={deleteImage} className="context-menu-item danger">Supprimer l'image</button>
            </div>
            <button onClick={toggleFreePosition} className="context-menu-item">{imageState.isFreePosition ? 'Désactiver position libre' : 'Position libre'}</button>
            {imageState.isFreePosition && (
                <>
                    <button onClick={bringToFront} className="context-menu-item">Avant-plan</button>
                    <button onClick={sendToBack} className="context-menu-item">Arrière-plan</button>
                </>
            )}
            <button onClick={closeImageMenu} className="context-menu-close">✕</button>
        </div>
    );
}

// Barres d'état (compteur de mots, caractères, lignes)
export function StatusBar({ wordCount, characterCount, lineCount }: { wordCount: number; characterCount: number; lineCount: number }) {
    return (
        <div className="status-bar">
            <span>Mots : {wordCount}</span>
            <span>Caractères : {characterCount}</span>
            <span>Lignes : {lineCount}</span>
        </div>
    );
} 