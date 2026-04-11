import React, { useEffect, useState, useMemo, useRef } from "react";
import { themes, ActualthemeNumber } from "../../constants/index.ts";
import { useTheme } from '../context/ThemeContext.js';
import { checkPrivilege as checkPrivilegeGlobal } from "../helpers/helpers.js";
import './Tables.css';

interface TableContent {
  columns: string[];
  data: object[];
}

interface TablesProps {
  setLimit: any;
  tableContent: TableContent;
  onRowClick: (row: any) => void;
  reverseColors?: boolean;
  itmsPerPage?: number;
  order?: 'asc' | 'desc';
  /** Nom du fichier pour l'export CSV (doit correspondre au nom du fichier importé) */
  exportFileName?: string;
  /** Callback appelé après import CSV - reçoit les lignes parsées (première ligne = en-têtes) */
  onImportExcel?: (rows: Record<string, any>[]) => void;
  /** Privilèges de l'utilisateur (pour iex01/iex02) */
  privs?: string[];
  /** true = docteur (propriétaire cabinet), a toujours accès import/export */
  isDocteur?: boolean;
  /** Style dynamique par ligne (ex. couleur posologie) */
  getRowStyle?: (item: Record<string, unknown>) => React.CSSProperties | undefined;
}

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
} | null;

export default function Tables({ tableContent, onRowClick, reverseColors = false, setLimit, color, backgroundColor, itmsPerPage = 7, order = 'asc', exportFileName = 'export', onImportExcel, privs = [], isDocteur = false, getRowStyle }: TablesProps & { color?: string, backgroundColor?: string }) {
  const { columns, data } = tableContent;
  const { themeNumber } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canExport = isDocteur || checkPrivilegeGlobal("iex02", privs);
  const canImport = isDocteur || checkPrivilegeGlobal("iex01", privs);
  const showImport = canImport && !!onImportExcel;

  // État pour le tri
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [importError, setImportError] = useState<string>("");
  const [showCheckmark, setShowCheckmark] = useState(false);

  const triggerSuccessAnimation = () => {
    setShowCheckmark(true);
    setTimeout(() => setShowCheckmark(false), 2000);
  };

  // Export CSV - TOUTES les colonnes des données (séparateur ; comme les autres exports)
  const handleExportCsv = () => {
    const excludeKey = (k: string) => k === 'fullData' || k.startsWith('_');
    const visibleCols = columns.filter(c => !excludeKey(c));
    const allKeysSet = new Set<string>(visibleCols);
    data.forEach((item: any) => {
      if (item && typeof item === 'object') {
        Object.keys(item).forEach(k => { if (!excludeKey(k)) allKeysSet.add(k); });
      }
    });
    const exportColumns = [...visibleCols];
    allKeysSet.forEach(k => { if (!exportColumns.includes(k)) exportColumns.push(k); });
    const escape = (s: string) => String(s ?? '').replace(/;/g, ',').replace(/\n/g, ' ').replace(/\r/g, '');
    const header = exportColumns.join(';');
    const rows = data.map((item: any) =>
      exportColumns.map(col => escape((item[col] !== null && item[col] !== undefined && typeof item[col] !== 'object') ? String(item[col]) : '')).join(';')
    );
    const csvContent = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exportFileName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    triggerSuccessAnimation();
  };

  // Vérifie que le nom du fichier correspond à la table exportée (exportFileName)
  const isFileNameValid = (fileName: string): boolean => {
    const base = fileName.replace(/\.(csv|txt)$/i, "").trim();
    return base.toLowerCase().startsWith(exportFileName.toLowerCase()) || base.toLowerCase() === exportFileName.toLowerCase();
  };

  // Import CSV - première ligne = colonnes, séparateur ;, nom fichier doit correspondre à exportFileName
  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportExcel) return;
    setImportError("");
    if (!isFileNameValid(file.name)) {
      setImportError(`Le fichier doit être nommé comme la table (ex: ${exportFileName}.csv)`);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        let text = (ev.target?.result as string) || '';
        text = text.replace(/^\uFEFF/, ''); // BOM UTF-8
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return;
        const headers = lines[0].split(';').map(h => h.trim());
        const parsed = lines.slice(1).map(line => {
          const vals = line.split(';');
          const obj: Record<string, any> = {};
          headers.forEach((h, i) => { obj[h] = vals[i]?.trim() ?? ''; });
          return obj;
        });
        onImportExcel(parsed);
        triggerSuccessAnimation();
      } catch (err) {
        console.error('Erreur import CSV:', err);
        setImportError('Erreur lors de la lecture du fichier CSV.');
      }
      e.target.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Ordre chronologique des jours de la semaine
  const joursOrdreSemaine = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  
  // Fonction pour détecter si une valeur est un jour de la semaine
  const getJourIndex = (val: any): number => {
    const valStr = String(val).trim();
    return joursOrdreSemaine.findIndex(jour => 
      valStr.toLowerCase() === jour.toLowerCase() || 
      valStr.toLowerCase().startsWith(jour.toLowerCase())
    );
  };

  // Fonction de comparaison pour le tri
  const compareValues = (valA: any, valB: any): number => {
    // Gérer les valeurs nulles/undefined
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    // Vérifier si ce sont des jours de la semaine
    const jourIndexA = getJourIndex(valA);
    const jourIndexB = getJourIndex(valB);
    
    if (jourIndexA !== -1 && jourIndexB !== -1) {
      return jourIndexA - jourIndexB;
    }

    // Détecter si les valeurs sont des dates, des nombres ou des chaînes
    if (!isNaN(Date.parse(valA)) && !isNaN(Date.parse(valB))) {
      return new Date(valA).getTime() - new Date(valB).getTime();
    } else if (!isNaN(valA) && !isNaN(valB)) {
      return Number(valA) - Number(valB);
    } else {
      return String(valA).localeCompare(String(valB), 'fr', { numeric: true, sensitivity: 'base' });
    }
  };

  // Trier les données avec useMemo pour optimisation
  const sortedData = useMemo(() => {
    let sortableData = [...data];

    if (sortConfig !== null) {
      sortableData.sort((a, b) => {
        const valA = (a as any)[sortConfig.key];
        const valB = (b as any)[sortConfig.key];
        
        const comparison = compareValues(valA, valB);
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    } else {
      // Tri par défaut sur la première colonne
      sortableData.sort((a, b) => {
        const firstCol = columns[0];
        const valA = (a as any)[firstCol];
        const valB = (b as any)[firstCol];
        
        const comparison = compareValues(valA, valB);
        return order === 'desc' ? -comparison : comparison;
      });
    }

    return sortableData;
  }, [data, sortConfig, columns, order]);

  // Handler pour le clic sur l'en-tête de colonne
  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    
    setSortConfig({ key, direction });
  };

  // Obtenir l'indicateur de tri pour une colonne
  const getSortIndicator = (columnName: string) => {
    if (!sortConfig || sortConfig.key !== columnName) {
      return <span style={{ opacity: 0.3, marginLeft: '5px' }}>⇅</span>;
    }
    return sortConfig.direction === 'asc' 
      ? <span style={{ marginLeft: '5px', color: themes[themeNumber].primary }}>↑</span>
      : <span style={{ marginLeft: '5px', color: themes[themeNumber].primary }}>↓</span>;
  };

  const finalData = sortedData;

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = itmsPerPage;  // Nombre de lignes par page

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = finalData.slice(indexOfFirstItem, indexOfLastItem);

  const totalPages = Math.ceil(finalData.length / itemsPerPage);

  /** Ne pas réduire la limite API au retour page 1 : évite de ne charger que 17 lignes après la page 2. */
  useEffect(() => {
    const needed = currentPage * itemsPerPage;
    setLimit((prev: number) => (typeof prev === "number" ? Math.max(prev, needed) : needed));
  }, [currentPage, itemsPerPage, setLimit]);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prevPage => prevPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prevPage => prevPage - 1);
    }
  };

  const handlePageClick = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // Styles de couleur normaux
  const normalStyles = {
    backgroundColor: themes[themeNumber].primary,  // Violet
    color: themes[themeNumber].secondary, // Jaune
  };

  // Styles de couleur inversés
  const reversedStyles = {
    backgroundColor: themes[themeNumber].secondary,  // Jaune
    color: themes[themeNumber].primary  // Violet
  };

  // Choisir les styles selon le paramètre reverseColors
  const tableHeaderStyle = {
    backgroundColor: themes[themeNumber].primary,
    color: themes[themeNumber].secondary,
    fontWeight: 600
  };
  const tableRowStyle = {
    color: color || '#222',
    backgroundColor: backgroundColor || '#fff'
  };

  return (
    <div>
      {/* Animation ✔ au-dessus de la barre Import/Export */}
      {showCheckmark && (
        <div
          className="tables-checkmark-anim"
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '8px'
          }}
        >
          <span style={{ fontSize: '32px', color: '#27ae60', fontWeight: 'bold' }}>✔</span>
        </div>
      )}
      {/* Barre Import/Export CSV - visible pour docteur ou avec privilèges iex01/iex02 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        {canExport && (
          <button
            type="button"
            onClick={handleExportCsv}
            title="Exporter en CSV"
            style={{
              padding: '6px 12px',
              backgroundColor: themes[themeNumber].primary,
              color: themes[themeNumber].secondary,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            🖨️ Export
          </button>
        )}
        {showImport && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleImportCsv}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => { setImportError(""); fileInputRef.current?.click(); }}
              title={`Importer depuis CSV (fichier nommé ${exportFileName}.csv)`}
              style={{
                padding: '6px 12px',
                backgroundColor: themes[themeNumber].secondary,
                color: themes[themeNumber].primary,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              🖨️ Import
            </button>
          </>
        )}
        {importError && (
          <span style={{ fontSize: '12px', color: '#c0392b', marginLeft: '8px' }}>{importError}</span>
        )}
      </div>
      {/* Scrollable table */}
      <div style={{ overflowX: "auto", overflowY: "auto", marginBottom: "20px" }}>
        <table className="table text-center table-hover table-striped" style={{ minWidth: "90px", backgroundColor: backgroundColor || '#fff', color: color || '#222' }}>
          <thead>
            <tr>
              {columns.map((col, index) => (
                <th 
                  key={index} 
                  style={{
                    ...tableHeaderStyle,
                    cursor: 'pointer',
                    userSelect: 'none',
                    position: 'relative',
                    transition: 'background-color 0.2s'
                  }}
                  onClick={() => requestSort(col)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = sortConfig?.key === col 
                      ? themes[themeNumber].primary 
                      : 'rgba(0, 0, 0, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = sortConfig?.key === col 
                      ? themes[themeNumber].primary 
                      : tableHeaderStyle.backgroundColor;
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {col}
                    {getSortIndicator(col)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentItems.map((item, rowIndex) => {
              const extra = getRowStyle ? getRowStyle(item as Record<string, unknown>) : undefined;
              const trStyle = { ...tableRowStyle, ...extra };
              return (
              <tr key={rowIndex} onClick={() => onRowClick(item)} style={trStyle}>
                {columns.map((col, colIndex) => {
                  const cellContent = (item as any)[col];
                  const isQRCodeColumn = col === "QR Code";
                  return (
                    <td 
                      key={colIndex}
                      onClick={isQRCodeColumn ? (e) => e.stopPropagation() : undefined}
                      style={{
                        ...(isQRCodeColumn ? { cursor: "default" } : {}),
                        ...(extra || {}),
                      }}
                    >
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination after scrollable table */}
      <nav>
        <ul className="pagination justify-content-center" style={{ listStyle: "none", padding: 0 }}>
          <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`} style={{ display: 'inline-block', margin: '0 5px' }}>
            <button
              className="page-link"
              onClick={handlePrevPage}
              style={reverseColors ? reversedStyles : normalStyles}
            >
              Précédent
            </button>
          </li>
          {[...Array(totalPages)].map((_, index) => (
            <li
              key={index}
              className={`page-item ${index + 1 === currentPage ? 'active' : ''}`}
              style={{ display: 'inline-block', margin: '0 5px' }}
            >
              <button
                className="page-link"
                onClick={() => handlePageClick(index + 1)}
                style={{
                  backgroundColor: index + 1 === currentPage ? themes[themeNumber].secondary : themes[themeNumber].primary,
                  color: index + 1 === currentPage ? themes[themeNumber].primary : themes[themeNumber].secondary,
                  borderColor: index + 1 === currentPage ? themes[themeNumber].secondary : themes[themeNumber].primary
                }}
              >
                {index + 1}
              </button>
            </li>
          ))}
          <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`} style={{ display: 'inline-block', margin: '0 5px' }}>
            <button
              className="page-link"
              onClick={handleNextPage}
              style={reverseColors ? reversedStyles : normalStyles}
            >
              Suivant
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

export function EmptyTables() {
  return (
    <div>
      {/* Scrollable table */}
      <div style={{ overflowX: "auto", maxHeight: "400px", overflowY: "auto", marginBottom: "20px" }}>
        <table className="table text-center table-hover table-striped" style={{ minWidth: "900px" }}>
          <thead>
            <tr>
              <th>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Table Vide</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  )
}
