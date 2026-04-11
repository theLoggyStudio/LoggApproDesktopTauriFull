// ✅ DataPanel.tsx (optimisé)
import React, { useState, useCallback, useEffect } from 'react';
import { ChevronRight, ChevronDown, Database, FileText } from 'lucide-react';
import PageEtatController from '../controllers/PageEtatController';
import { useNavigationParams } from '../hooks/useNavigationParams';
import type { Docteur, User } from '../Entities/entities';
import { ActualthemeNumber, themes } from '../../constants/index.ts';
import { useTheme } from '../context/ThemeContext';

interface DataItem {
  id: string;
  name: string;
  type: string;
  children?: DataItem[];
}

interface Patient {
  id: string;
  nom: string;
  prenom: string;
  naissance?: string;
  profession?: string;
  adresse?: string;
  [key: string]: any;
}

interface Acte {
  id: string;
  nom?: string;
  description?: string;
  date?: string;
  prix?: number;
  argentRecu?: number;
  argentRestant?: number;
  isDone?: boolean;
  patientId?: string | number;
  sousActes?: Acte[];
  [key: string]: any;
}

interface DataPanelProps {
  onInsertField?: (field: { id: string; name: string }) => void;
  onPatientChange?: (patient: any) => void;
  onActesChange?: (actes: any[]) => void;
  onDocteurChange?: (docteur: any) => void;
  onUserChange?: (user: any) => void;
  onInsertVariablesTable?: (params: { category: string, items: any[], htmlTable: string }) => void;
}

const DataPanel: React.FC<DataPanelProps> = ({onPatientChange, onActesChange, onDocteurChange, onUserChange, onInsertVariablesTable }) => {
  const { userId, tabId, pays, patientId: patientIdUrl } = useNavigationParams();


  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({ patient: true, actes: true });
  const [patients, setPatients] = useState<Patient[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [docteur, setDocteur] = useState<Docteur | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [actes, setActes] = useState<Acte[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingActes, setLoadingActes] = useState(false);

  // État pour le modal de sélection de colonnes et de filtre date
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableModalData, setTableModalData] = useState<{category: string, items: DataItem[], htmlTable: string, dropEvent: DragEvent | null} | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<{start: string, end: string}>({start: '', end: ''});
  const { themeNumber } = useTheme();
  // Ajout : gestion du callback d'insertion de tableau depuis l'éditeur
  const [pendingInsertCallback, setPendingInsertCallback] = useState<null | ((params: { category: string, items: DataItem[], htmlTable: string }) => void)>(null);

  // Sélectionner le patient de l'URL par défaut si présent
  useEffect(() => {
    if (patientIdUrl) {
      setSelectedPatientId(patientIdUrl);
    }
  }, [patientIdUrl]);

  // Charger l'utilisateur au montage
  useEffect(() => {
    const fetchUser = async () => {
      setLoadingPatients(true);
      try {
        const controller = PageEtatController(pays ?? '');
        const data = await controller.voirInfoDocteur(userId, tabId);
        setUser(data.user || data);
      } catch (e) {
        setUser(null);
      } finally {
        setLoadingPatients(false);
      }
    };
    fetchUser();
  }, [tabId, pays]);

  // Charger le docteur au montage
  useEffect(() => {
    const fetchDocteur = async () => {
      setLoadingPatients(true);
      try {
        const controller = PageEtatController(pays ?? '');
        const data = await controller.voirInfoDocteur(tabId, tabId);
        setDocteur(data?.docteur ?? data ?? null);
        
      } catch (e) {
        setDocteur(null);
      } finally {
        setLoadingPatients(false);
      }
    };
    fetchDocteur();
  }, [tabId, pays]);

  // Charger les patients au montage
  useEffect(() => {
    const fetchPatients = async () => {
      setLoadingPatients(true);
      try {
        const controller = PageEtatController(pays ?? '');
        // On passe tabId et pays si disponibles
        const data = await controller.listerPatient('client', tabId, 100);
        setPatients(data);
      } catch (e) {
        setPatients([]);
      } finally {
        setLoadingPatients(false);
      }
    };
    fetchPatients();
  }, [tabId, pays]);

  // Charger les actes quand un patient est sélectionné
  useEffect(() => {
    if (!selectedPatientId) {
      setSelectedPatient(null);
      setActes([]);
      return;
    }
    const fetchActes = async () => {
      setLoadingActes(true);
      try {
        const controller = PageEtatController(pays ?? '');
        const patient = patients.find(p => p.id === selectedPatientId) || null;
        setSelectedPatient(patient);
        if (patient) {
          // On passe patientId, tabId, pays si disponibles
          const actesData = await controller.listerLesActes('client', patient.id, 100, tabId);
          setActes(actesData || []);
        } else {
          setActes([]);
        }
      } catch (e) {
        setActes([]);
      } finally {
        setLoadingActes(false);
      }
    };
    fetchActes();
  }, [selectedPatientId, patients, tabId, pays]);

  useEffect(() => {
    if (onPatientChange) onPatientChange(selectedPatient);
  }, [selectedPatient]);

  useEffect(() => {
    if (onActesChange) onActesChange(actes);
  }, [actes]);

  useEffect(() => {
    if (onDocteurChange) onDocteurChange(docteur);
  }, [docteur]);

  useEffect(() => {
    if (onUserChange) onUserChange(user);
  }, [user]);

  // Construction dynamique de l'arborescence
  const buildPatientNode = (patient: Patient): DataItem => ({
    id: 'patient',
    name: 'Patient',
    type: 'object',
    children: Object.entries(patient || {}).filter(([k]) => k !== 'id').map(([key, value]) => ({
      id: `patient.${key}`,
      name: key.charAt(0).toUpperCase() + key.slice(1),
      type: typeof value
    }))
  });

  const buildActeNode = (acte: Acte, prefix = '', index = 0): DataItem => ({
    id: `${prefix}acte.${acte.id || index}`,
    name: acte.nom || 'Acte',
    type: 'object',
    children: [
      { id: `${prefix}acte.${acte.id || index}.description`, name: 'Description', type: 'string' },
      { id: `${prefix}acte.${acte.id || index}.date`, name: 'Date', type: 'string' },
      { id: `${prefix}acte.${acte.id || index}.prix`, name: 'Prix', type: 'number' },
      { id: `${prefix}acte.${acte.id || index}.argentRecu`, name: 'Argent Reçu', type: 'number' },
      { id: `${prefix}acte.${acte.id || index}.argentRestant`, name: 'Argent Restant', type: 'number' },
      // Bloc Assurance
      {
        id: `${prefix}acte.${acte.id || index}.assurance`,
        name: 'Assurance',
        type: 'object',
        children: [
          { id: `${prefix}acte.${acte.id || index}.assurance.nom`, name: 'Nom', type: 'string' },
          { id: `${prefix}acte.${acte.id || index}.assurance.pourcentage`, name: 'Pourcentage', type: 'number' },
        ]
      },
      // Bloc Facture
      {
        id: `${prefix}acte.${acte.id || index}.facture`,
        name: 'Facture',
        type: 'object',
        children: [
          { id: `${prefix}acte.${acte.id || index}.facture.prixAct`, name: 'Prix Acte', type: 'number' },
          { id: `${prefix}acte.${acte.id || index}.facture.argentRecuActe`, name: 'Argent Reçu Acte', type: 'number' },
          { id: `${prefix}acte.${acte.id || index}.facture.argentRestantActe`, name: 'Argent Restant Acte', type: 'number' },
          { id: `${prefix}acte.${acte.id || index}.facture.argentAssurance`, name: 'Argent Assurance', type: 'number' },
        ]
      },
      // Sous-actes éventuels
      ...(acte.sousActes ? acte.sousActes.map((sous, i) => buildActeNode(sous, `${prefix}acte.${acte.id || index}.sousacte.${sous.id || i}.`, i)) : [])
    ]
  });

  const buildDocteurNode = (docteur: Docteur, prefix = '', index = 0): DataItem => ({
    id: `${prefix}docteur.${docteur.id || index}`,
    name: 'Docteur',
    type: 'object',
    children: Object.entries(docteur || {})
      .filter(([k, v]) => !['id', 'loggId', 'logg_id', 'password', 'privileges'].includes(k) && !Array.isArray(v))
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Pour les objets imbriqués (ex: photo)
          return {
            id: `${prefix}docteur.${key}`,
            name: key.charAt(0).toUpperCase() + key.slice(1),
            type: 'object',
            children: Object.entries(value)
              .filter(([k2, v2]) => !['id', 'loggId', 'logg_id', 'password', 'privileges'].includes(k2) && !Array.isArray(v2))
              .map(([k2, v2]) => ({
                id: `${prefix}docteur.${key}.${k2}`,
                name: k2.charAt(0).toUpperCase() + k2.slice(1),
                type: typeof v2
              }))
          };
        } else {
          return {
            id: `${prefix}docteur.${key}`,
            name: key.charAt(0).toUpperCase() + key.slice(1),
            type: typeof value
          };
        }
      })
  });

  const buildUserNode = (user: User, prefix = '', index = 0): DataItem => ({
    id: `${prefix}user.${user.id || index}`,
    name: 'Utilisateur',
    type: 'object',
    children: Object.entries(user || {})
      .filter(([k, v]) => !['id', 'loggId', 'logg_id', 'password', 'privileges'].includes(k) && !Array.isArray(v))
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Pour les objets imbriqués (ex: photo)
          return {
            id: `${prefix}user.${key}`,
            name: key.charAt(0).toUpperCase() + key.slice(1),
            type: 'object',
            children: Object.entries(value)
              .filter(([k2, v2]) => !['id', 'loggId', 'logg_id', 'password', 'privileges'].includes(k2) && !Array.isArray(v2))
              .map(([k2, v2]) => ({
                id: `${prefix}user.${key}.${k2}`,
                name: k2.charAt(0).toUpperCase() + k2.slice(1),
                type: typeof v2
              }))
          };
        } else {
          return {
            id: `${prefix}user.${key}`,
            name: key.charAt(0).toUpperCase() + key.slice(1),
            type: typeof value
          };
        }
      })
  });

  const dataSources: DataItem[] = [];
  if (selectedPatient) dataSources.push(buildPatientNode(selectedPatient));
  if (docteur) dataSources.push(buildDocteurNode(docteur));
  if (user) dataSources.push(buildUserNode(user));
  if (actes && actes.length > 0) {
    dataSources.push({
      id: 'actes',
      name: 'Actes',
      type: 'object',
      children: actes.map((acte, i) => buildActeNode(acte, '', i))
    });
  }

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, item: DataItem) => {
    if (!item.children) {
      // Détermine le type de variable (patient, acte, etc.)
      let variable = item.id;
      // Si id commence par 'patient.' ou 'acte.' etc., on garde tel quel
      // Sinon, on peut ajouter un fallback
      e.dataTransfer.setData('text/plain', `{{${variable}}}`);
      e.dataTransfer.setData('application/json', JSON.stringify({
        id: item.id,
        name: item.name,
        type: item.type
      }));
    } else {
      e.preventDefault();
    }
  }, []);

  // Ajout : générer un tableau HTML de toutes les variables d'une catégorie
  function generateVariablesTable(category: string, items: DataItem[]): string {
    // Cas spécial pour la catégorie Actes : tableau multi-lignes (une ligne par acte)
    if (category === 'actes') {
      // On suppose que items = tous les actes (DataItem[]), chaque item = un acte
      if (!items.length) return '';
      // On prend les variables du premier acte comme colonnes
      const firstActe = items[0];
      const columns = (firstActe.children || []).filter(child => !child.children);
      const headers = columns.map(col => `<th>${col.name}</th>`).join('');
      // Pour chaque acte, on génère une ligne avec ses variables
      const rows = items.map(acte => {
        const values = (acte.children || []).filter(child => !child.children).map(col => `{{${col.id}}}`);
        return `<tr>${values.map(val => `<td>${val}</td>`).join('')}</tr>`;
      }).join('');
      return `<table border="1" style="border-collapse:collapse;width:100%;margin:10px 0;">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    }
    // Cas général (autres catégories)
    const leaves = items.filter(item => !item.children);
    const headers = leaves.map(item => `<th>${item.name}</th>`).join('');
    const values = leaves.map(item => `<td>{{${item.id}}}</td>`).join('');
    return `<table border="1" style="border-collapse:collapse;width:100%;margin:10px 0;">
      <thead><tr>${headers}</tr></thead>
      <tbody><tr>${values}</tr></tbody>
    </table>`;
  }

  // Utilitaire pour trouver les feuilles (variables simples)
  function getLeaves(items: DataItem[]): DataItem[] {
    return items.filter(item => !item.children);
  }

  // Utilitaire pour détecter les colonnes de type date
  function getDateColumns(items: DataItem[]): DataItem[] {
    return getLeaves(items).filter(item => item.type === 'string' && (item.name.toLowerCase().includes('date') || item.id.toLowerCase().includes('date')));
  }

  // --- MODAL ---
  function TableModal() {
    if (!tableModalData) return null;
    // Correction : pour 'actes', on prend les variables du premier acte comme colonnes
    let leaves: DataItem[] = [];
    let sortedItems = tableModalData.items;
    if (tableModalData.category === 'actes' && tableModalData.items.length > 0) {
      // Trie les actes par date croissante
      sortedItems = [...tableModalData.items].sort((a, b) => {
        const dateA = (a.children || []).find(child => child.name.toLowerCase().includes('date'));
        const dateB = (b.children || []).find(child => child.name.toLowerCase().includes('date'));
        const valA = dateA && dateA.id ? getActeDateFromId(dateA.id) : null;
        const valB = dateB && dateB.id ? getActeDateFromId(dateB.id) : null;
        if (!valA && !valB) return 0;
        if (!valA) return 1;
        if (!valB) return -1;
        return valA.getTime() - valB.getTime();
      });
      const firstActe = sortedItems[0];
      leaves = (firstActe.children || []).filter(child => !child.children);
    } else {
      leaves = getLeaves(tableModalData.items);
    }
    const dateColumns = getDateColumns(tableModalData.items);
    // Fonction utilitaire pour extraire la date d'un acte à partir de son id
    function getActeDateFromId(id: any) {
      // id ex: acte.123.date
      const match = id.match(/acte\.(\d+)\.date/);
      if (match && match[1]) {
        const acteObj = actes.find(a => String(a.id) === match[1]);
        if (acteObj && acteObj.date) return new Date(acteObj.date);
      }
      return null;
    }
    return (
      <div className="modal-overlay">
        <div className="modal-content" style={{ maxWidth: 600 }}>
          <h3>Personnaliser le tableau</h3>
          {/* Bloc de sélection des colonnes et de filtrage par date */}
          <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 12 }}>
            {/* Affiche toujours les filtres date si des colonnes date existent */}
            {getDateColumns(tableModalData.items).length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <label>Date de début :
                  <input type="date" value={dateFilter.start} style={{ marginLeft: 4 }} onChange={e => setDateFilter(d => ({...d, start: e.target.value}))} />
                </label>
                <label>Date de fin :
                  <input type="date" value={dateFilter.end} style={{ marginLeft: 4 }} onChange={e => setDateFilter(d => ({...d, end: e.target.value}))} />
                </label>
              </div>
            )}
            <b>Colonnes à afficher :</b>
            {leaves.length === 0 ? (
              <div style={{ color: themes[ActualthemeNumber].danger, margin: '12px 0' }}>Aucune variable à afficher pour cette catégorie.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {leaves.map(item => (
                  <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 }}>
                    <input
                      type="checkbox"
                      checked={selectedColumns.includes(item.id)}
                      onChange={e => {
                        if (e.target.checked) setSelectedColumns(cols => [...cols, item.id]);
                        else setSelectedColumns(cols => cols.filter(id => id !== item.id));
                      }}
                    />
                    <span>{item.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={handleTableModalValidate}>Valider</button>
            <button className="btn-secondary" onClick={() => setShowTableModal(false)}>Annuler</button>
          </div>
        </div>
      </div>
    );
  }

  // Ajout : gestion de l'appel externe pour ouvrir le modal depuis l'éditeur
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).onInsertVariablesTable = ({ category, items, htmlTable, insertCallback }: any) => {
        setTableModalData({ category, items, htmlTable, dropEvent: null });
        setShowTableModal(true);
        setSelectedColumns(items.map((item: any) => item.id)); // Par défaut, tout cocher
        setPendingInsertCallback(() => insertCallback);
      };
    }
  }, []);

  // Handler pour valider le modal et insérer le tableau filtré
  function handleTableModalValidate() {
    if (!tableModalData) return;
    // --- Filtrage spécial pour la catégorie 'actes' ---
    let items = tableModalData.items;
    if (tableModalData.category === 'actes' && (dateFilter.start || dateFilter.end)) {
      // On filtre les actes selon la date
      const start = dateFilter.start ? new Date(dateFilter.start) : null;
      const end = dateFilter.end ? new Date(dateFilter.end) : null;
      items = items.filter(acte => {
        // On cherche la variable de type date dans chaque acte
        const dateItem = (acte.children || []).find(child => child.name.toLowerCase().includes('date'));
        if (!dateItem) return true;
        // On extrait la date depuis l'id (ex: acte.123.date)
        let acteDate: Date | null = null;
        if (dateItem && dateItem.id) {
          // On tente d'extraire la date depuis l'objet acte si possible
          const match = dateItem.id.match(/acte\.(\d+)\.date/);
          if (match && match[1]) {
            const acteObj = actes.find(a => String(a.id) === match[1]);
            if (acteObj && acteObj.date) acteDate = new Date(acteObj.date);
          }
        }
        if (!acteDate) return true;
        if (start && acteDate instanceof Date && acteDate < start) return false;
        if (end && acteDate instanceof Date && acteDate > end) return false;
        return true;
      });
    }
    // --- Fin filtrage ---
    const leaves = getLeaves(items).filter(item => selectedColumns.includes(item.id));
    // Générer le tableau filtré
    const headers = leaves.map(item => `<th>${item.name}</th>`).join('');
    const values = leaves.map(item => `<td>{{${item.id}}}</td>`).join('');
    let htmlTable = '';
    if (tableModalData.category === 'actes') {
      // Tableau multi-lignes (une ligne par acte filtré)
      if (!items.length) htmlTable = '';
      else {
        const firstActe = items[0];
        const columns = (firstActe.children || []).filter(child => !child.children && selectedColumns.includes(child.id));
        const headers = columns.map(col => `<th>${col.name}</th>`).join('');
        const rows = items.map(acte => {
          const values = (acte.children || []).filter(child => !child.children && selectedColumns.includes(child.id)).map(col => `{{${col.id}}}`);
          return `<tr>${values.map(val => `<td>${val}</td>`).join('')}</tr>`;
        }).join('');
        htmlTable = `<table border="1" style="border-collapse:collapse;width:100%;margin:10px 0;">
          <thead><tr>${headers}</tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      }
    } else {
      htmlTable = `<table border="1" style="border-collapse:collapse;width:100%;margin:10px 0;">
        <thead><tr>${headers}</tr></thead>
        <tbody><tr>${values}</tr></tbody>
      </table>`;
    }
    // Vérification : toutes les variables sélectionnées sont-elles présentes ?
    if (leaves.length !== selectedColumns.length) {
      // Affiche la liste précise des variables manquantes
      const missing = selectedColumns.filter(id => !leaves.find(item => item.id === id));
      const missingLabels = missing.map(id => {
        const found = items.find(item => item.id === id);
        return found ? `${found.name} (id: ${id})` : id;
      });
      // Variables manquantes détectées - pas besoin d'alerte, l'interface montre déjà les variables disponibles
    }
    // Si on vient d'un drop externe, utiliser le callback d'insertion
    if (pendingInsertCallback) {
      pendingInsertCallback({
        category: tableModalData.category,
        items: leaves,
        htmlTable
      });
      setPendingInsertCallback(null);
    } else if (tableModalData.dropEvent) {
      // Ancien comportement (drop interne)
      const editor = document.querySelector('.editor-content');
      if (editor) {
        (editor as HTMLElement).focus();
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = htmlTable;
          Array.from(tempDiv.childNodes).forEach(node => {
            range.insertNode(node);
            range.setStartAfter(node);
            range.setEndAfter(node);
          });
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          editor.innerHTML += htmlTable;
        }
      }
    }
    setShowTableModal(false);
    setTableModalData(null);
    setSelectedColumns([]);
    setDateFilter({start: '', end: ''});
  }

  // --- FIN MODAL ---

  // Drag sur la racine d'une catégorie
  const handleCategoryDragStart = useCallback((e: React.DragEvent, source: DataItem) => {
    if (source.children && source.children.length > 0) {
      let items;
      if (source.id === 'actes') {
        // Pour la catégorie Actes, on passe la liste des actes (DataItem[])
        items = source.children;
      } else {
        // Pour les autres, on aplatit toutes les feuilles
        items = flattenDataItems(source.children);
      }
      // Générer le tableau HTML de toutes les variables de la catégorie
      const htmlTable = generateVariablesTable(source.id, items);
      e.dataTransfer.setData('text/html', htmlTable);
      e.dataTransfer.setData('application/category', source.id);
      // Ajout : stocker les infos pour le modal
      e.dataTransfer.setData('application/category-items', JSON.stringify(items));
    }
  }, []);

  // Fonction utilitaire pour aplatir tous les items d'une catégorie (récursif)
  function flattenDataItems(items: DataItem[]): DataItem[] {
    let result: DataItem[] = [];
    for (const item of items) {
      if (item.children && item.children.length > 0) {
        result = result.concat(flattenDataItems(item.children));
      } else {
        result.push(item);
      }
    }
    return result;
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'string': return <span className="type-icon string">Aa</span>;
      case 'number': return <span className="type-icon number">123</span>;
      case 'date': return <span className="type-icon date">📅</span>;
      case 'object': return <Database size={14} />;
      default: return <span className="type-icon" style={{ fontSize: 17 }}>🖼️</span>;
    }
  };

  const renderDataItems = (items: DataItem[], level: number = 0): React.ReactElement[] => {
    return items.map(item => (
      <div key={item.id} className="data-item" style={{ paddingLeft: `${level * 16}px` }}>
        <div className="data-item-header" onClick={() => item.children && toggleNode(item.id)}>
          {item.children ? (
            expandedNodes[item.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />
          ) : getTypeIcon(item.type)}

          <span
            className="data-item-name"
            draggable={!item.children}
            onDragStart={(e) => handleDragStart(e, item)}
          >
            {item.name}
          </span>
        </div>
        {item.children && expandedNodes[item.id] && (
          <div className="data-item-children">
            {renderDataItems(item.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="data-panel" >
      {showTableModal && <TableModal />}
      <div className="data-panel-header" style={{
        display: 'flex', alignItems: 'center', gap: 8,
        color: themes[themeNumber].secondary, 
        backgroundColor: themes[themeNumber].primary,
        borderRadius: 8,
        padding: '10px 18px',
        marginBottom: 8,
        fontWeight: 600,
        fontSize: 18
      }}>
        <Database size={18} />
        <h3 style={{ margin: 0, fontWeight: 600, fontSize: 18, color: themes[ActualthemeNumber].secondary }}>Variables  médicales:</h3>
      </div>
      <div className='m-1'>
        {loadingPatients ? (
          <span>Chargement des patients...</span>
        ) : (
          <select
            id="txtSelectionMedical"
            className="logg-input"
            name="txtSelectionMedical"
            value={selectedPatientId}
            onChange={e => setSelectedPatientId(e.target.value)}

          >
            <option value="">Sélectionnez un patient :</option>
            {patients.map(p => (
              <option key={p.id} value={p.id}>
                {p.nom} {p.prenom}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="data-panel-content" >
        {loadingActes ? (
          <span>Chargement des actes...</span>
        ) : (
          dataSources.map(source => (
            <div key={source.id} className="data-source">
              <div
                className="data-source-header"
                onClick={() => toggleNode(source.id)}
                draggable={true}
                onDragStart={e => handleCategoryDragStart(e, source)}
              >
                {expandedNodes[source.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <FileText size={16} />
                <span className="data-source-name">{source.name}</span>
              </div>
              {expandedNodes[source.id] && (
                <div className="data-source-items">
                  {renderDataItems(source.children || [])}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      <div className="data-panel-footer">
        <small>Faites glisser les champs sur le document</small>
      </div>
    </div>
  );
};

export default DataPanel;
