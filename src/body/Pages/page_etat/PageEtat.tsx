import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useNavigationParams } from '../../hooks/useNavigationParams.js';
import { useTheme } from '../../context/ThemeContext.js';
import { themes, criptKeyUrl } from '../../../constants/index.ts';
import { Modal } from '../../../items/Modal.tsx';
import { Input } from '../../../items/Input.tsx';
import NavTop from '../../Modules/NavTop.js';
import DataPanel from '../../Modules/DataPanel.js';
import ModelPanel from '../../Modules/ModelPanel.js';
import AccordionSection from './components/AccordionSection.js';
import VariablesSection from './components/VariablesSection.js';
import EtatPreviewSelectionModal from './components/EtatPreviewSelectionModal.js';
import EntityTableColumnsPicker from './components/EntityTableColumnsPicker.js';
import {
  buildInitialTableColumnState,
  getPlaceholderTableColumnKeys,
  getTableColumnLabel,
  inferTableEntityFromElementId,
  isActeTableId,
  type TableColumnsVisibility,
} from './medicalVariables/medicalVariablesHelpers.js';
import type { DocumentTemplate } from './templates/documentTemplates.js';
import PageEtatController from '../../controllers/PageEtatController.js';
import { PageProfilController } from '../../controllers/PageProfilController.js';
import { PagePatientController } from '../../controllers/PagePatientController.js';
import { PosologieController } from '../../controllers/PosologieController.js';
import AutorisationController from '../../controllers/AutorisationController.js';
import { DataImportExportController } from '../../controllers/DataImportExportController.js';
import { ModeleEtatController } from '../../controllers/ModeleEtatController.js';
import NavTopController from '../../controllers/NavTopController.js';
import { decryptData } from '../../controllers/security/security.js';
import { useAlert, useMode } from '../../context/SearchContext.js';
import { canAccessEtatsModule, canManageEtatsPage } from '../../policies/navModulePolicies.js';
import { filterAndSortResults, multiCriteriaSearch, normalizeSearchString } from './utils/searchUtils.js';
import { resolvePosologieEtatForPatient } from './utils/resolvePosologieEtatForPatient.js';
import {
  listCabinetStaffForUserPicker,
  mergeDocteurIntoUserPickerList,
  type EtatStaffRow,
} from './utils/listStaffCollaborateursForEtat.js';
import {
  buildVariableContent,
  elementsContainPosologieOrOrdonnanceVariables,
  elementsUseVariableRoot,
  extractUniqueVariableIndices,
  extractQrcodeVariableSlots,
  formatInexistantVariable,
  getBasePathFromContent,
  isForbiddenEtatVariableBasePath,
  isForbiddenEtatVariableKey,
  isInexistantFormat,
  parseVariableContent,
} from './utils/variableFormat.js';
import { applyPreviewFunctionalOffsets } from './utils/previewFunctionalLayout.js';
import { parseFirstPosologieBulletForEtat } from '../../utils/posologieDisplayFormat.js';
// Imports pour le nouveau système de pagination
import { usePagination } from './hooks/usePagination.js';
import { useZoom } from './hooks/useZoom.js';
import { PaginatedPagesContainer } from './components/PaginatedPageRenderer.js';
import { A4_WIDTH, A4_HEIGHT } from './utils/elementMeasurer.js';
// Imports pour le mode extensible
import { useExtensibleSheet } from './hooks/useExtensibleSheet.js';
import { ExtensibleSheetRenderer } from './components/ExtensibleSheetRenderer.js';
import type { RenderMode } from './utils/extensibleSheetEngine.js';
import { 
  Type, Image, Square, Circle, Trash2, Copy, 
  AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline,
  ZoomIn, ZoomOut, Download, Upload, Save, Eye, Layers,
  Grid, Printer, ChevronDown, ChevronUp, ArrowUp, ArrowDown, EyeOff,
  BookmarkPlus
} from 'lucide-react';
import './pageEtat.css';
import { DEFAULT_MEDICAL_DATA } from './constants/medicalData.js';

export interface Element {
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
  /** Si true, la hauteur est déterminée par le contenu (texte/variable) - même en mode Aperçu */
  heightByContent?: boolean;
  // Propriétés spécifiques aux tableaux
  tableData?: any[];
  tableColumns?: string[];
  tableHeaderBg?: string;
  tableHeaderColor?: string;
  tableBorderColor?: string;
  tableStripedRows?: boolean;
  /** Numéro d'identification pour les variables (#1, #2, ...) */
  variableLabel?: string;
  /** Numéro d'identification pour les tableaux (#1, #2, ...) */
  tableNumber?: string;
  /** Répétition paginée: en-tête/pied présent sur toutes les pages (mode PAGED). */
  pageRegion?: 'header' | 'footer';
}

/** Tri numérique des tableaux par `tableNumber` pour l’ordre #1, #2, … (sans numéro en dernier). */
function sortKeyTableNumber(tableNumber?: string): number {
  if (tableNumber == null || String(tableNumber).trim() === '') return Number.MAX_SAFE_INTEGER;
  const digits = String(tableNumber).replace(/\D/g, '');
  const n = parseInt(digits.slice(0, 12) || '0', 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

function sortTableElementsByNumber(elems: Element[]): Element[] {
  return [...elems].sort((a, b) => sortKeyTableNumber(a.tableNumber) - sortKeyTableNumber(b.tableNumber));
}

// ========= Styles =========

const toolbarButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  padding: '8px 12px',
  backgroundColor: '#34495e',
  color: 'white',
  border: 'none',
  borderRadius: '5px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: '500',
  transition: 'all 0.2s'
};

const toolbarSelectStyle: React.CSSProperties = {
  padding: '8px 12px',
  paddingRight: '35px',
  backgroundColor: '#34495e',
  color: 'white',
  border: 'none',
  borderRadius: '5px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: '500',
  minWidth: '130px',
  transition: 'all 0.2s',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='white' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  backgroundSize: '12px'
};

const propertyLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
  fontSize: '13px',
  color: '#2c3e50',
  fontWeight: '500'
};

const propertyInputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #bdc3c7',
  borderRadius: '4px',
  fontSize: '13px',
  width: '100%'
};

const smallButtonStyle: React.CSSProperties = {
  padding: '6px',
  backgroundColor: '#ecf0f1',
  border: '1px solid #bdc3c7',
  borderRadius: '4px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1
};

// Dimensions A4 (maintenant importées depuis elementMeasurer)
// const A4_WIDTH = 794; // Importé depuis elementMeasurer
// const A4_HEIGHT = 1123; // Importé depuis elementMeasurer

export default function PageEtat() {
    const navigate = useNavigate();
    const location = useLocation();
    const { themeNumber } = useTheme();
    const { setAlertObj } = useAlert();
    const { mode: appMode } = useMode();
    const paramsFromUrl = useParams<{ userId?: string; tabId?: string; pays?: string }>();
    const paramsFromSession = useNavigationParams();
    let userId = paramsFromUrl.userId ?? paramsFromSession.userId;
    let tabId = paramsFromUrl.tabId ?? paramsFromSession.tabId;
    let pays = paramsFromUrl.pays ?? paramsFromSession.pays;
    const sessionRole = (paramsFromSession.role ?? '').trim();
    
    // Décrypter les paramètres uniquement s'ils sont au format chiffré (contiennent ':')
    tabId = tabId ?? "";
    userId = userId ?? "";
    pays = pays ?? "";
    
    // Vérifier si les paramètres sont chiffrés (format: "iv:encrypted")
    if (userId && userId.includes(':')) {
      const decrypted = decryptData(userId, criptKeyUrl);
      userId = decrypted !== null ? decrypted : userId;
    }
    if (tabId && tabId.includes(':')) {
      const decrypted = decryptData(tabId, criptKeyUrl);
      tabId = decrypted !== null ? decrypted : tabId;
    }
    if (pays && pays.includes(':')) {
      const decrypted = decryptData(pays, criptKeyUrl);
      pays = decrypted !== null ? decrypted : pays;
    }
    
    // Créer l'objet theUser pour les appels API
    const theUser = {
      userId,
      tabId,
      pays
    };

    /** pending = avant chargement des privilèges ; full = édition / impression ; consultation = pet01 ou oso01 sans pet02/prt01 */
    const [etatPageMode, setEtatPageMode] = useState<"pending" | "full" | "consultation">("pending");
    const [customColumns, setCustomColumns] = useState<{ patient: string[]; acte: string[] }>({ patient: [], acte: [] });

    // Charger les colonnes personnalisées (créées via import)
    useEffect(() => {
        const loadCustomColumns = async () => {
            if (!pays || !tabId) return;
            try {
                const data = await DataImportExportController(pays).listCustomColumns(tabId);
                setCustomColumns(data);
            } catch {
                setCustomColumns({ patient: [], acte: [] });
            }
        };
        loadCustomColumns();
    }, [pays, tabId]);

    // Vérification de l'authentification et des privilèges
    useEffect(() => {
        const verifierAuthentification = async () => {
            try {
                const privs = await AutorisationController(pays ?? "").recupererPriviliegesDuUser(userId ?? null, tabId ?? null);
                
                if (!privs || privs.length === 0) {
                    navigate('/');
                    setAlertObj({ type: "error", show: true, text: "Session invalide. Veuillez vous reconnecter." });
                    return;
                }

                const bypassImpression =
                    appMode === "admin" || appMode === "superAdmin";

                if (!bypassImpression && !canAccessEtatsModule(privs)) {
                    setAlertObj({
                        type: "warning",
                        show: true,
                        text: "Vous n'avez pas accès à la page des modèles d'état.",
                    });
                    navigate("/");
                    return;
                }

                if (bypassImpression || canManageEtatsPage(privs)) {
                    setEtatPageMode("full");
                } else {
                    setEtatPageMode("consultation");
                }
            } catch (erreur) {
                navigate('/');
                setAlertObj({ type: "error", show: true, text: "Session expirée. Veuillez vous reconnecter." });
                console.error("Erreur d'authentification:", erreur);
            }
        };
        verifierAuthentification();
    }, [userId, tabId, pays, appMode]);

  // États canvas
  const [elements, setElements] = useState<Element[]>([]);
  const elementsRef = useRef<Element[]>(elements);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]); // Sélection multiple
  const [draggedElement, setDraggedElement] = useState<Element | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false); // Pour détecter si on est en train de déplacer
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null); // Position initiale du clic
  // Système de zoom (n'affecte pas les calculs de layout)
  const zoomControls = useZoom({
    minZoom: 0.05,
    maxZoom: 2.0,
    initialZoom: 0.5,
    zoomStep: 0.05
  });
  
  const [showGrid, setShowGrid] = useState(true);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(0); // Page actuelle pour la pagination
  const [showDebugInfo, setShowDebugInfo] = useState(false); // Mode debug pour la pagination
  /** Toujours feuille extensible (mode « Pages multiples » retiré de l’UI). */
  const renderMode = 'EXTENSIBLE' as RenderMode;

  /** Aperçu : décale textes, variables, tableaux et formes pour supprimer les chevauchements (les images restent en calques). */
  const elementsForLayoutEngine = useMemo(
    () => (isPreviewMode ? applyPreviewFunctionalOffsets(elements) : elements),
    [isPreviewMode, elements]
  );
  
  // Système de pagination (calculs à zoom=1) - utilisé uniquement en mode PAGED
  const pagination = usePagination(elementsForLayoutEngine, {
    margins: { top: 50, right: 50, bottom: 50, left: 50 },
    debugMode: showDebugInfo,
    autoRecalculate: isPreviewMode && renderMode === 'PAGED' // Recalculer automatiquement en mode aperçu et mode paginé
  });
  
  // Système extensible (calculs à zoom=1) - utilisé uniquement en mode EXTENSIBLE
  const extensibleSheet = useExtensibleSheet(elementsForLayoutEngine, {
    margins: { top: 50, right: 50, bottom: 50, left: 50 },
    debugMode: showDebugInfo,
    autoRecalculate: renderMode === 'EXTENSIBLE' // Recalculer automatiquement en mode extensible
  });
  
  // Fonction helper pour obtenir la hauteur maximale selon le mode
  const getMaxSheetHeight = useCallback(() => {
    if (renderMode === 'EXTENSIBLE') {
      return extensibleSheet.sheetHeight;
    }
    return A4_HEIGHT;
  }, [renderMode, extensibleSheet.sheetHeight]);
  
  // États des accordéons
  const [accordeonCalques, setAccordeonCalques] = useState(true);
  const [accordeonModeles, setAccordeonModeles] = useState(false);
  const [accordeonDonnees, setAccordeonDonnees] = useState(true);
  const [accordeonProprietes, setAccordeonProprietes] = useState(true);
  
  // Mémoriser les dernières propriétés affichées
  const [lastDisplayedElement, setLastDisplayedElement] = useState<Element | null>(null);
  
  // Données médicales
    const [selectedPatient, setSelectedPatient] = useState<any>(null);
    /** Patients par index pour variables {{patient.xxx #N}} : { 1: patient1, 2: patient2, ... } */
    const [selectedPatientsByIndex, setSelectedPatientsByIndex] = useState<Record<number, any>>({});
    const [actes, setActes] = useState<any[]>([]);
    const [docteur, setDocteur] = useState<any>(null);
    const [user, setUser] = useState<any>(null);
  const [cabinet, setCabinet] = useState<any>(null);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  /** Évite d’ouvrir les modals patient/acte quand l’aperçu vient du modal Posologie */
  const skipNextPreviewDataModalsRef = useRef(false);
  /** Planifie l’ouverture des modals collaborateur / user (défini plus bas, appelé depuis l’effet aperçu). */
  const scheduleEtatProfilModalsForPreviewRef = useRef<() => void>(() => {});
  /** Chaîne aperçu : après patients/actes, tableau collaborateurs vides puis modals profil. */
  const checkAndOpenCollaborateursTableModalRef = useRef<() => void>(() => {});
  /** Après le modal collaborateur, ouvrir celui de user.* si le modèle le demande. */
  const pendingOpenUserAfterCollaborateurRef = useRef(false);
  const prevCollaborateurEtatModalOpenRef = useRef(false);
  /** Cache id → ligne pour la sélection multiple collaborateurs (aperçu #1, #2, …). */
  const collaborateurEtatSelectionMapRef = useRef<Record<string, EtatStaffRow>>({});
  /** Dernière carte collaborateur par # (pour préremplir la modale tableau / auto-lignes). */
  const selectedCollaborateursByIndexRef = useRef<Record<number, EtatStaffRow>>({});
  /** Évite le double traitement (React StrictMode) du même state de navigation posologie */
  /** Évite les doubles exécutions (StrictMode) sans bloquer un nouvel import avec un autre patient / texte. */
  const lastPosologieEtatImportSigRef = useRef<string | null>(null);
  /** Texte posologie injecté depuis la fiche patient (navigation) ou bouton « Appliquer » du modal */
  const [previewPosologieOverride, setPreviewPosologieOverride] = useState<string | null>(null);
  /** Posologie chargée automatiquement en aperçu (pas de texte de démo si patient sélectionné) */
  const [autoPosologiePreviewText, setAutoPosologiePreviewText] = useState<string | null>(null);
  /** Texte ordonnance injecté depuis la fiche patient (navigation) ou modal. */
  const [previewOrdonnanceOverride, setPreviewOrdonnanceOverride] = useState<string | null>(null);
  /** Ordonnance chargée automatiquement en aperçu. */
  const [autoOrdonnancePreviewText, setAutoOrdonnancePreviewText] = useState<string | null>(null);
  /** Aperçu : data URLs des QR (clé `qrcode:<basePath>#<index>`). */
  const [etatQrcodeUrlByKey, setEtatQrcodeUrlByKey] = useState<Record<string, string>>({});
  const selectedElement = elements.find(el => el.id === selectedElementId);
  elementsRef.current = elements;
  
  // Refs pour garder les valeurs à jour dans les listeners (évite les closures obsolètes)
  const draggedElementRef = useRef<Element | null>(null);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const zoomRef = useRef<number>(zoomControls.zoom);
  const isDraggingRef = useRef<boolean>(false);

  useEffect(() => {
    zoomRef.current = zoomControls.zoom;
  }, [zoomControls.zoom]);

  // Charger données cabinet / démo (montage). Ne pas injecter patient & actes fictifs si l’aperçu posologie/ordonnance arrive via la navigation (sinon {{patient}} / {{acte}} restent « FALL » / « Détartrage »).
  useEffect(() => {
    const st = location.state as { posologieEtatPreview?: { template?: { elements?: unknown[] } } } | null;
    const hasPosologieNavPreview = Boolean(
      st?.posologieEtatPreview?.template?.elements &&
        Array.isArray(st.posologieEtatPreview.template.elements) &&
        st.posologieEtatPreview.template.elements.length > 0
    );
    if (hasPosologieNavPreview) return;

    setSelectedPatient({
      id: 'demo-patient',
      nom: 'FALL',
      prenom: 'Aminata',
      naissance: '15/03/1985',
      age: '39 ans',
      adresse: '25 Rue de la République, Dakar',
      telephone: '+221 77 123 45 67',
      login: 'aminata.fall@demo.sn',
      email: 'aminata.fall@demo.sn',
      role: 'patient',
      loggId: '',
      dateCreation: '',
      avoirAnnuelle: '0',
      nomDeJeuneFille: '',
      profession: '',
      adresserPar: '',
      observation: '',
    });
    setActes([
      {
        id: 'demo-acte',
        nom: 'Détartrage complet',
        date: new Date().toLocaleDateString('fr-FR'),
        prix: '25000',
        description: 'Nettoyage professionnel des dents',
        argentRecu: '0',
        argentRestant: '25000',
        loggId: '',
        dateCreation: '',
        posologieId: '',
        quantite: '1',
        remise: '0',
        montantTotal: '25000',
        statut: 'En cours',
        assuranceNom: '',
        assuranceTaux: '0',
        assuranceMontantPrisEnCharge: '0',
        assuranceStatut: '',
        factureNumero: '',
        factureDateEmission: '',
        factureMontantTotal: '25000',
        factureStatutPaiement: '',
        factureDatePaiement: '',
        factureModePaiement: '',
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionnel : une seule fois au montage, `location.state` lu au premier rendu
  }, []);

  /** Cabinet + praticien titulaire : toujours via l’id du cabinet (`tabId`), pas l’utilisateur connecté (collab). */
  useEffect(() => {
    if (!tabId || !pays) {
      setCabinet(DEFAULT_MEDICAL_DATA.cabinet);
      setDocteur(DEFAULT_MEDICAL_DATA.testDocteur);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const raw = await PageEtatController(pays).voirInfoDocteur(tabId, tabId);
        if (cancelled) return;
        const d = raw && typeof raw === 'object' ? (raw as any).docteur : null;
        const c = raw && typeof raw === 'object' ? (raw as any).cabinet : null;
        if (d && typeof d === 'object') {
          setDocteur({
            id: String(d.id ?? tabId),
            nom: String(d.nom ?? ''),
            prenom: String(d.prenom ?? ''),
            login: String(d.login ?? ''),
            telephone: String(d.telephone ?? ''),
            naissance: String(d.naissance ?? ''),
            adresse: String(d.adresse ?? ''),
            loggId: String(d.loggId ?? d.logg_id ?? tabId),
          });
        } else {
          setDocteur(DEFAULT_MEDICAL_DATA.testDocteur);
        }
        if (c && typeof c === 'object' && c !== null && (c.nom != null || c.adresse != null || c.pays != null)) {
          setCabinet({
            id: String(c.id ?? ''),
            nom: String(c.nom ?? ''),
            adresse: String(c.adresse ?? ''),
            pays: String(c.pays ?? ''),
          });
        } else {
          setCabinet(DEFAULT_MEDICAL_DATA.cabinet);
        }
      } catch {
        if (!cancelled) {
          setDocteur(DEFAULT_MEDICAL_DATA.testDocteur);
          setCabinet(DEFAULT_MEDICAL_DATA.cabinet);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tabId, pays]);

  /** Compte connecté ; {{user.*}} peut être surchargé par le modal « Choisir l'utilisateur user.* ». {{collaborateur.*}} : modal dédié. */
  useEffect(() => {
    if (!userId || !tabId || !pays) {
      setUser(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const ctrl = PageProfilController(pays);
        const r = sessionRole.toLowerCase();
        let prof: any = null;
        if (r === 'assistant') {
          const raw = await ctrl.voirInfoAssistant(userId, tabId);
          prof = raw?.assistant ?? raw;
        } else if (r === 'comptable') {
          const raw = await ctrl.voirInfoComptable(userId, tabId);
          prof = raw?.comptable ?? raw;
        } else if (r === 'secretaire') {
          const raw = await ctrl.voirInfoSecretaire(userId, tabId);
          prof = raw?.secretaire ?? raw;
        } else if (r === 'collaborateur') {
          const raw = await ctrl.voirInfoCollaborateur(userId, tabId);
          prof = raw?.collaborateur ?? raw;
        } else if (r === 'docteur' || userId === tabId) {
          const raw = await PageEtatController(pays).voirInfoDocteur(userId, tabId);
          prof = raw?.docteur ?? raw;
        } else {
          const raw = await PageEtatController(pays).voirInfoDocteur(tabId, tabId);
          prof = raw?.docteur ?? raw;
        }
        if (cancelled || !prof || typeof prof !== 'object') {
          if (!cancelled) setUser(null);
          return;
        }
        setUser({
          id: String(prof.id ?? userId),
          nom: prof.nom ?? '',
          prenom: prof.prenom ?? '',
          login: prof.login ?? '',
          telephone: prof.telephone ?? '',
          naissance: prof.naissance ?? '',
          adresse: prof.adresse ?? '',
          role: r || prof.role || '',
          loggId: prof.loggId ?? prof.logg_id ?? tabId,
        });
      } catch {
        if (!cancelled) setUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, tabId, pays, sessionRole]);

  // Mémoriser l'élément sélectionné pour afficher ses propriétés même après désélection
  useEffect(() => {
    if (selectedElement) {
      setLastDisplayedElement(selectedElement);
    }
  }, [selectedElement]);

  // Quand on passe en mode aperçu, vérifier s'il faut charger les données
  // Quand on quitte le mode aperçu, vider les tableaux pour permettre une nouvelle sélection
  useEffect(() => {
    if (isPreviewMode) {
      if (skipNextPreviewDataModalsRef.current) {
        skipNextPreviewDataModalsRef.current = false;
        return;
      }
      // ENTRER en mode aperçu : détecter si on a besoin de données
      // Scan de chaque élément pour extraire les indices uniques (éviter doublons)
      const { patientIndices, acteIndices } = extractUniqueVariableIndices(elements);
      setRequiredPatientIndices(patientIndices);
      
      // 1. Chercher les tableaux vides
      const emptyTables = elements.filter(el => 
        el.type === 'table' && (!el.tableData || el.tableData.length === 0)
      );
      
      const emptyPatientsTables = emptyTables.filter(t => t.id.includes('patients'));
      const emptyActesTables = emptyTables.filter(t => isActeTableId(t.id));
      if (emptyPatientsTables.length > 0) {
        setSelectedElementId(sortTableElementsByNumber(emptyPatientsTables)[0].id);
      }
      
      // 2. Variables patient/acte : patientIndices/acteIndices viennent du scan
      const hasPatientVariables = patientIndices.length > 0;
      const hasActeVariables = acteIndices.length > 0 || elements.some(el => 
        (el.type === 'text' || el.type === 'variable') && 
        el.content && 
        (el.content.includes('{{acte.') || el.content.includes('{{actes.'))
      );
      
      // 3. Déterminer le mode et ouvrir les modals nécessaires
      // PATIENTS
      if (hasPatientVariables || emptyPatientsTables.length > 0) {
        if (hasPatientVariables && emptyPatientsTables.length > 0) {
          // Les deux : variables + tableau
          setPatientsModalMode(patientIndices.length > 1 ? 'multiple' : 'single');
          setPatientsModalPurpose('both');
        } else if (hasPatientVariables) {
          // Uniquement variables : si plusieurs indices (#1, #2), demander N patients
          setPatientsModalMode(patientIndices.length > 1 ? 'multiple' : 'single');
          setPatientsModalPurpose('variables');
        } else {
          // Uniquement tableau
          setPatientsModalMode('multiple');
          setPatientsModalPurpose('table');
        }
        setRequiredPatientIndices(patientIndices);
        setShowPatientsModal(true);
      } 
      // ACTES (seulement si pas de patients à traiter d'abord)
      else if (hasActeVariables || emptyActesTables.length > 0) {
        if (hasActeVariables && emptyActesTables.length > 0) {
          // Les deux : variables + tableau
          setActesModalMode('single');
          setActesModalPurpose('both');
        } else if (hasActeVariables) {
          // Uniquement variables
          setActesModalMode('single');
          setActesModalPurpose('variables');
        } else {
          // Uniquement tableau
          setActesModalMode('multiple');
          setActesModalPurpose('table');
        }
        
        if (emptyActesTables.length > 0) {
          setSelectedElementId(sortTableElementsByNumber(emptyActesTables)[0].id);
        }
        setShowActesModal(true);
      } else {
        checkAndOpenCollaborateursTableModalRef.current();
      }
    } else {
      pendingOpenUserAfterCollaborateurRef.current = false;
      setPreviewPosologieOverride(null);
      setAutoPosologiePreviewText(null);
      setPreviewOrdonnanceOverride(null);
      setAutoOrdonnancePreviewText(null);
      setSelectedCollaborateurEtat(null);
      setSelectedUserForEtat(null);
      setShowCollaborateurEtatModal(false);
      setShowPosologieEtatModal(false);
      setRequiredCollaborateurIndices([]);
      setSelectedCollaborateursByIndex({});
      setSelectedCollaborateursEtatIds([]);
      collaborateurEtatSelectionMapRef.current = {};
      setEtatQrcodeUrlByKey({});
      // QUITTER le mode aperçu : vider tous les tableaux et patients par index
      setSelectedPatientsByIndex({});
      setElements(prev => prev.map(el => {
        if (el.type === 'table' && el.tableData && el.tableData.length > 0) {
          // Vider le tableau mais garder la structure
          return {
            ...el,
            tableData: [],
            // Réinitialiser les dimensions par défaut
            width: 700,
            height: 200
          };
        }
        return el;
      }));
    }
  }, [isPreviewMode]); // Déclenché uniquement quand on change de mode

  // Élément à afficher dans les propriétés (actuel ou dernier)
  const displayedElement = selectedElement || lastDisplayedElement;

  // ========= Calcul de la hauteur totale et pagination =========
  
  /**
   * Calcule la hauteur totale occupée par tous les éléments
   * Retourne la position Y la plus basse + la hauteur de l'élément le plus bas
   */
  const calculateTotalContentHeight = useCallback((): number => {
    if (elements.length === 0) return A4_HEIGHT;
    
    let maxBottom = 0;
    elements.forEach(element => {
      const bottom = element.y + element.height;
      if (bottom > maxBottom) {
        maxBottom = bottom;
      }
    });
    
    // Ajouter une marge de sécurité (20px)
    return Math.max(A4_HEIGHT, maxBottom + 20);
  }, [elements]);

  /**
   * Calcule le nombre de pages nécessaires pour afficher tout le contenu
   */
  const calculateTotalPages = useCallback((): number => {
    const totalHeight = calculateTotalContentHeight();
    return Math.max(1, Math.ceil(totalHeight / A4_HEIGHT));
  }, [calculateTotalContentHeight]);

  /**
   * Filtre les éléments visibles sur la page actuelle
   */
  const getElementsForCurrentPage = useCallback((pageIndex: number): Element[] => {
    const pageTop = pageIndex * A4_HEIGHT;
    const pageBottom = (pageIndex + 1) * A4_HEIGHT;
    
    return elements.filter(element => {
      const elementTop = element.y;
      const elementBottom = element.y + element.height;
      
      // Un élément est visible si :
      // - Il commence avant la fin de la page ET
      // - Il se termine après le début de la page
      return elementBottom > pageTop && elementTop < pageBottom;
    }).map(element => {
      // Ajuster la position Y relative à la page
      return {
        ...element,
        y: element.y - pageTop
      };
    });
  }, [elements]);

  // Mettre à jour la page courante si elle dépasse le nombre total de pages
  useEffect(() => {
    if (currentPage >= pagination.totalPages && pagination.totalPages > 0) {
      setCurrentPage(Math.max(0, pagination.totalPages - 1));
    }
  }, [pagination.totalPages, currentPage]);

  // État pour le modal de sauvegarde de modèle
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState('administratif');
  const [newTemplateIcon, setNewTemplateIcon] = useState('📄');
  const [modelesVersion, setModelesVersion] = useState(0);
  
  // État pour le modal de confirmation d'insertion de modèle
  const [showInsertTemplateModal, setShowInsertTemplateModal] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<DocumentTemplate | null>(null);

  // État pour le modal d'édition de texte
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingElement, setEditingElement] = useState<Element | null>(null);
  const [editModalContent, setEditModalContent] = useState('');
  /** Pour variable : toutes les propriétés éditables (initialisées à l'ouverture) */
  const [editModalVariableProps, setEditModalVariableProps] = useState<Partial<Element>>({});

  // État pour le modal d'export
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFileName, setExportFileName] = useState('');
  const [exportFilePath, setExportFilePath] = useState('');

  // État pour le modal des patients
  const [showPatientsModal, setShowPatientsModal] = useState(false);
  const [patientsModalMode, setPatientsModalMode] = useState<'single' | 'multiple'>('multiple'); // Mode de sélection
  const [patientsModalPurpose, setPatientsModalPurpose] = useState<'variables' | 'table' | 'both'>('table'); // Objectif
  /** Indices patients requis pour variables (ex: [1, 2] si {{patient.nom #1}} et {{patient.nom #2}}) */
  const [requiredPatientIndices, setRequiredPatientIndices] = useState<number[]>([]);
  const [patientsSearchQuery, setPatientsSearchQuery] = useState(''); // Pour la recherche
  const [patientsData, setPatientsData] = useState<any[]>([]); // Tous les patients
  const [selectedPatientsIds, setSelectedPatientsIds] = useState<string[]>([]); // IDs des patients sélectionnés
  /** Cache des objets patients sélectionnés (id -> patient) pour éviter de les perdre quand patientsData change (recherche) */
  const selectedPatientsMapRef = useRef<Record<string, any>>({});
  const [selectedSinglePatientId, setSelectedSinglePatientId] = useState<string>(''); // Pour mode single
  const [patientsColumns, setPatientsColumns] = useState<TableColumnsVisibility>(() =>
    buildInitialTableColumnState('patient')
  );

  // État pour le modal des actes
  const [showActesModal, setShowActesModal] = useState(false);
  const [actesModalMode, setActesModalMode] = useState<'single' | 'multiple'>('multiple'); // Mode de sélection
  const [actesModalPurpose, setActesModalPurpose] = useState<'variables' | 'table' | 'both'>('table'); // Objectif
  const [actesPatientId, setActesPatientId] = useState('');
  const [actesPatientSearch, setActesPatientSearch] = useState(''); // Pour l'autocomplétion
  const [showPatientsSuggestions, setShowPatientsSuggestions] = useState(false);
  const [actesDateDebut, setActesDateDebut] = useState('');
  const [actesDateFin, setActesDateFin] = useState('');
  const [actesData, setActesData] = useState<any[]>([]);
  const [isLoadingActes, setIsLoadingActes] = useState(false);
  const [selectedActes, setSelectedActes] = useState<string[]>([]);
  const [selectedSingleActeId, setSelectedSingleActeId] = useState<string>(''); // Pour mode single
  const [actesColumns, setActesColumns] = useState<TableColumnsVisibility>(() =>
    buildInitialTableColumnState('acte')
  );

  const [showCollaborateursTableModal, setShowCollaborateursTableModal] = useState(false);
  const [collaborateursTableModalLoading, setCollaborateursTableModalLoading] = useState(false);
  const [collaborateursTableModalList, setCollaborateursTableModalList] = useState<EtatStaffRow[]>([]);
  const [collaborateursTableModalSearch, setCollaborateursTableModalSearch] = useState('');
  const [selectedCollaborateursTableIds, setSelectedCollaborateursTableIds] = useState<string[]>([]);
  const [collaborateursColumns, setCollaborateursColumns] = useState<TableColumnsVisibility>(() =>
    buildInitialTableColumnState('collaborateur')
  );

  /** Modal Page État : charger posologie / ordonnance du patient sélectionné pour les variables {{posologie…}} */
  const [showPosologieEtatModal, setShowPosologieEtatModal] = useState(false);
  const [posologieEtatModalLoading, setPosologieEtatModalLoading] = useState(false);
  const [posologieEtatModalHint, setPosologieEtatModalHint] = useState<string | null>(null);
  const [posologieEtatModalOrdonnance, setPosologieEtatModalOrdonnance] = useState('');
  const [posologieEtatModalPosologie, setPosologieEtatModalPosologie] = useState('');

  /** Membre du personnel choisi pour {{collaborateur.*}} (hors docteur). */
  const [showCollaborateurEtatModal, setShowCollaborateurEtatModal] = useState(false);
  /** collaborateur = même liste personnel (sans docteur) ; user = cette liste + docteur en tête. */
  const [etatProfilPickerTarget, setEtatProfilPickerTarget] = useState<'collaborateur' | 'user'>('collaborateur');
  const [collaborateurEtatModalLoading, setCollaborateurEtatModalLoading] = useState(false);
  const [collaborateurEtatModalError, setCollaborateurEtatModalError] = useState<string | null>(null);
  const [collaborateurEtatModalList, setCollaborateurEtatModalList] = useState<EtatStaffRow[]>([]);
  const [collaborateurEtatModalSearch, setCollaborateurEtatModalSearch] = useState('');
  const [selectedCollaborateurEtat, setSelectedCollaborateurEtat] = useState<EtatStaffRow | null>(null);
  /** Indices {{collaborateur.* #N}} présents sur le canevas (ex. [1, 2]). */
  const [requiredCollaborateurIndices, setRequiredCollaborateurIndices] = useState<number[]>([]);
  /** Personnes choisies par index pour l’aperçu : {{collaborateur.nom #2}} → [2]. */
  const [selectedCollaborateursByIndex, setSelectedCollaborateursByIndex] = useState<
    Record<number, EtatStaffRow>
  >({});
  /** Ordre de clic pour le mode multi (aligné sur requiredCollaborateurIndices). */
  const [selectedCollaborateursEtatIds, setSelectedCollaborateursEtatIds] = useState<string[]>([]);
  /** Surcharge {{user.*}} en aperçu ; si null, profil = compte connecté (`user`). */
  const [selectedUserForEtat, setSelectedUserForEtat] = useState<EtatStaffRow | null>(null);

  useEffect(() => {
    selectedCollaborateursByIndexRef.current = selectedCollaborateursByIndex;
  }, [selectedCollaborateursByIndex]);

  /** Aperçu : remplir le 1er tableau collaborateurs vide avec les lignes #1, #2, … (mêmes personnes que {{collaborateur.*}}). */
  useEffect(() => {
    if (!isPreviewMode) return;
    const by = selectedCollaborateursByIndex;
    const sortedIdx = Object.keys(by)
      .map(Number)
      .filter((k) => by[k]?.id)
      .sort((a, b) => a - b);
    if (sortedIdx.length === 0) return;

    const visibleCols = Object.entries(collaborateursColumns)
      .filter(([, vis]) => vis)
      .map(([k]) => k);
    if (visibleCols.length === 0) return;

    const tableRows = sortedIdx.map((idx) => {
      const row = by[idx]!;
      const o: Record<string, string> = {};
      for (const c of visibleCols) {
        o[c] = String((row as unknown as Record<string, unknown>)[c] ?? '');
      }
      return o;
    });

    setElements((prev) => {
      const anyCollabHasRows = prev.some(
        (el) =>
          el.type === 'table' &&
          el.id.includes('collaborateurs') &&
          el.tableData &&
          el.tableData.length > 0
      );
      // Ne pas injecter si un tableau collaborateurs a déjà des lignes (évite doublons / 2e tableau vide).
      if (anyCollabHasRows) return prev;

      const emptySorted = sortTableElementsByNumber(
        prev.filter(
          (el) =>
            el.type === 'table' &&
            el.id.includes('collaborateurs') &&
            (!el.tableData || el.tableData.length === 0)
        )
      );
      if (emptySorted.length === 0) return prev;
      const targetId = emptySorted[0].id;
      return prev.map((el) => {
        if (el.id !== targetId) return el;
        return {
          ...el,
          tableData: tableRows,
          tableColumns: visibleCols,
          width: Math.min(700, 100 + visibleCols.length * 120),
          height: 50 + tableRows.length * 35,
        };
      });
    });
  }, [isPreviewMode, selectedCollaborateursByIndex, collaborateursColumns]);

  const [patientsList, setPatientsList] = useState<any[]>([
    { id: '1700000000001', nom: 'FALL', prenom: 'Aminata' },
    { id: '1700000000002', nom: 'DIOP', prenom: 'Moussa' },
    { id: '1700000000003', nom: 'NDIAYE', prenom: 'Fatou' },
    { id: '1700000000004', nom: 'SARR', prenom: 'Ibrahima' },
    { id: '1700000000005', nom: 'SY', prenom: 'Aïssatou' }
  ]);

  // ========= Charger la liste des patients au premier affichage de la modal des actes =========

  useEffect(() => {
    if (showActesModal && patientsList.length <= 5) {
      const loadPatientsList = async () => {
        try {
          // Utiliser l'API de recherche améliorée
          const navTopController = NavTopController(theUser.pays || '');
          // Rechercher avec "a" pour obtenir beaucoup de résultats
          const patients = await navTopController.chercherPatients(
            String(theUser.tabId),
            'a'
          );
          
          const patientsListSimple = patients.map((p: any) => ({
            id: p.id,
            nom: p.nom || '',
            prenom: p.prenom || '',
            telephone: p.telephone || '',
            email: p.email || '',
            nomDeJeuneFille: p.nomDeJeuneFille || ''
          }));
          setPatientsList(patientsListSimple);
        } catch (error) {
          console.error('Erreur chargement liste patients:', error);
        }
      };
      loadPatientsList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showActesModal]);

  // Charger automatiquement les actes quand le modal s'ouvre avec un patient pré-rempli
  useEffect(() => {
    if (showActesModal && actesPatientId) {
      loadActesForPatient();
    }
  }, [showActesModal, actesPatientId]); // loadActesForPatient est stable (pas de deps pour éviter boucles)

  // Recherche de patients pour le champ patient du modal actes (appel API)
  const actesSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!showActesModal) return;
    const query = actesPatientSearch?.trim() || '';
    if (query.length < 1) {
      // Recherche vide : charger liste initiale si peu de patients
      if (patientsList.length <= 5) {
        NavTopController(theUser.pays || '').chercherPatients(String(theUser.tabId), 'a')
          .then(patients => {
            setPatientsList(patients.map((p: any) => ({
              id: p.id,
              nom: p.nom || '',
              prenom: p.prenom || '',
              telephone: p.telephone || '',
              email: p.email || '',
              nomDeJeuneFille: p.nomDeJeuneFille || ''
            })));
          })
          .catch(() => {});
      }
      return;
    }
    if (actesSearchTimeoutRef.current) clearTimeout(actesSearchTimeoutRef.current);
    actesSearchTimeoutRef.current = setTimeout(() => {
      NavTopController(theUser.pays || '').chercherPatients(String(theUser.tabId), query)
        .then(patients => {
          const list = patients.map((p: any) => ({
            id: p.id,
            nom: p.nom || '',
            prenom: p.prenom || '',
            telephone: p.telephone || '',
            email: p.email || '',
            nomDeJeuneFille: p.nomDeJeuneFille || ''
          }));
          setPatientsList(filterAndSortResults(list, query, 1));
        })
        .catch(() => setPatientsList([]));
    }, 300);
    return () => {
      if (actesSearchTimeoutRef.current) clearTimeout(actesSearchTimeoutRef.current);
    };
  }, [showActesModal, actesPatientSearch, theUser.pays, theUser.tabId]);

  // ========= Raccourcis clavier =========

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete : Supprimer l'élément sélectionné ou les éléments multiples
      if (e.key === 'Delete' && (selectedElementId || selectedElementIds.length > 0)) {
        deleteElement();
      }

      // Escape : Désélectionner tout
      if (e.key === 'Escape') {
        setSelectedElementId(null);
        setSelectedElementIds([]);
      }

      // Ctrl+A : Tout sélectionner
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const allIds = elements.map(el => el.id);
        setSelectedElementIds(allIds);
        if (allIds.length > 0) {
          setSelectedElementId(allIds[0]);
        }
      }

      // Ctrl+D : Dupliquer
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (selectedElement) duplicateElement();
      }

      // Ctrl+S : Sauvegarder
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleOpenExportModal();
      }

      // Flèches : Déplacer pixel par pixel
      if (selectedElement && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        const step = 1;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          updateElementProperty('x', Math.max(0, selectedElement.x - step));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          updateElementProperty('x', Math.min(A4_WIDTH - selectedElement.width, selectedElement.x + step));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          updateElementProperty('y', Math.max(0, selectedElement.y - step));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const maxHeight = getMaxSheetHeight();
          updateElementProperty('y', Math.min(maxHeight - selectedElement.height, selectedElement.y + step));
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementId, selectedElementIds, selectedElement, elements]);

  const loadPosologieEtatModal = useCallback(async () => {
    const pid = String(selectedPatient?.id ?? "").trim();
    const tab = String(theUser.tabId ?? "");
    const py = theUser.pays || "sn";
    if (!pid || !tab) {
      setPosologieEtatModalHint(
        "Sélectionnez d’abord un patient (section Données : variables patient ou tableau des patients)."
      );
      setPosologieEtatModalOrdonnance("");
      setPosologieEtatModalPosologie("");
      setPosologieEtatModalLoading(false);
      return;
    }
    setPosologieEtatModalLoading(true);
    setPosologieEtatModalHint(null);
    try {
      const res = await resolvePosologieEtatForPatient({ patientId: pid, tabId: tab, pays: py });
      if (res.hint) {
        setPosologieEtatModalHint(res.hint);
      } else {
        setPosologieEtatModalHint(null);
      }
      setPosologieEtatModalOrdonnance(res.ordonnance);
      setPosologieEtatModalPosologie(res.posologie);
    } catch (e) {
      console.error(e);
      setPosologieEtatModalHint("Erreur lors du chargement. Réessayez.");
      setPosologieEtatModalOrdonnance("");
      setPosologieEtatModalPosologie("");
    } finally {
      setPosologieEtatModalLoading(false);
    }
  }, [selectedPatient, theUser.pays, theUser.tabId]);

  const loadEtatProfilPickerList = useCallback(
    async (target: 'collaborateur' | 'user') => {
      const tab = String(theUser.tabId ?? '');
      const py = theUser.pays || 'sn';
      if (!tab) {
        setCollaborateurEtatModalError('Cabinet (tabId) manquant.');
        setCollaborateurEtatModalList([]);
        return;
      }
      setCollaborateurEtatModalLoading(true);
      setCollaborateurEtatModalError(null);
      try {
        const base = await listCabinetStaffForUserPicker(tab, py);
        const rows =
          target === 'user' ? mergeDocteurIntoUserPickerList(base, docteur, tab) : base;
        setCollaborateurEtatModalList(rows);
      } catch (e) {
        console.error(e);
        setCollaborateurEtatModalError('Impossible de charger la liste du personnel.');
        setCollaborateurEtatModalList([]);
      } finally {
        setCollaborateurEtatModalLoading(false);
      }
    },
    [theUser.pays, theUser.tabId, docteur]
  );

  const loadCollaborateursTableModalList = useCallback(async () => {
    const tab = String(theUser.tabId ?? '');
    const py = theUser.pays || 'sn';
    if (!tab) {
      setCollaborateursTableModalList([]);
      return;
    }
    setCollaborateursTableModalLoading(true);
    try {
      const list = await listCabinetStaffForUserPicker(tab, py);
      setCollaborateursTableModalList(list);
    } catch (e) {
      console.error(e);
      setCollaborateursTableModalList([]);
    } finally {
      setCollaborateursTableModalLoading(false);
    }
  }, [theUser.pays, theUser.tabId]);

  useEffect(() => {
    if (!showCollaborateursTableModal) return;
    void loadCollaborateursTableModalList();
  }, [showCollaborateursTableModal, loadCollaborateursTableModalList]);

  const filteredCollaborateurEtatModalList = useMemo(() => {
    const q = collaborateurEtatModalSearch.trim().toLowerCase();
    if (!q) return collaborateurEtatModalList;
    return collaborateurEtatModalList.filter((r) =>
      `${r.nom} ${r.prenom} ${r.login} ${r.sourceLabel}`.toLowerCase().includes(q)
    );
  }, [collaborateurEtatModalList, collaborateurEtatModalSearch]);

  const filteredCollaborateursTableModalList = useMemo(() => {
    const q = collaborateursTableModalSearch.trim().toLowerCase();
    if (!q) return collaborateursTableModalList;
    return collaborateursTableModalList.filter((r) =>
      `${r.nom} ${r.prenom} ${r.login} ${r.sourceLabel} ${r.telephone}`.toLowerCase().includes(q)
    );
  }, [collaborateursTableModalList, collaborateursTableModalSearch]);

  const scheduleEtatProfilModalsForPreview = useCallback(() => {
    if (!isPreviewMode) return;
    const els = elementsRef.current;
    const extractedIdx = extractUniqueVariableIndices(els);
    const needCollab =
      elementsUseVariableRoot(els, 'collaborateur') || extractedIdx.collaborateurIndices.length > 0;
    const needUser = elementsUseVariableRoot(els, 'user');
    if (!needCollab && !needUser) return;

    if (needCollab) {
      const { collaborateurIndices } = extractedIdx;
      const indices =
        collaborateurIndices.length > 0 ? collaborateurIndices : [1];
      pendingOpenUserAfterCollaborateurRef.current = needUser;
      window.setTimeout(() => {
        setRequiredCollaborateurIndices(indices);
        setSelectedCollaborateursEtatIds([]);
        collaborateurEtatSelectionMapRef.current = {};
        setEtatProfilPickerTarget('collaborateur');
        setCollaborateurEtatModalSearch('');
        setAlertObj({
          type: 'warning',
          show: true,
          text:
            indices.length > 1
              ? `👥 Sélectionnez ${indices.length} collaborateurs pour les variables {{collaborateur.*}} (${indices.map((i) => `#${i}`).join(', ')}).`
              : '👥 Sélectionnez une personne pour les variables {{collaborateur.*}}.',
        });
        setShowCollaborateurEtatModal(true);
        void loadEtatProfilPickerList('collaborateur');
      }, 300);
      return;
    }
    window.setTimeout(() => {
      setEtatProfilPickerTarget('user');
      setCollaborateurEtatModalSearch('');
      setAlertObj({
        type: 'info',
        show: true,
        text: '👤 Choisissez le profil pour {{user.*}} (ou fermez pour garder le compte connecté).',
      });
      setShowCollaborateurEtatModal(true);
      void loadEtatProfilPickerList('user');
    }, 300);
  }, [isPreviewMode, loadEtatProfilPickerList, setAlertObj]);

  scheduleEtatProfilModalsForPreviewRef.current = scheduleEtatProfilModalsForPreview;

  useEffect(() => {
    const wasOpen = prevCollaborateurEtatModalOpenRef.current;
    prevCollaborateurEtatModalOpenRef.current = showCollaborateurEtatModal;
    if (!isPreviewMode) return;
    if (wasOpen && !showCollaborateurEtatModal && pendingOpenUserAfterCollaborateurRef.current) {
      pendingOpenUserAfterCollaborateurRef.current = false;
      if (elementsUseVariableRoot(elementsRef.current, 'user')) {
        window.setTimeout(() => {
          setEtatProfilPickerTarget('user');
          setCollaborateurEtatModalSearch('');
          setAlertObj({
            type: 'info',
            show: true,
            text: '👤 Choisissez le profil pour {{user.*}} (ou fermez pour garder le compte connecté).',
          });
          setShowCollaborateurEtatModal(true);
          void loadEtatProfilPickerList('user');
        }, 300);
      }
    }
  }, [showCollaborateurEtatModal, isPreviewMode, loadEtatProfilPickerList, setAlertObj]);

  const handleCloseActesPreviewModal = useCallback(() => {
    setShowActesModal(false);
    setActesData([]);
    setSelectedActes([]);
    setActesPatientId('');
    setActesPatientSearch('');
    checkAndOpenCollaborateursTableModalRef.current();
  }, []);

  const actesPreviewModalTitle = useMemo(() => {
    const emptyActeSorted = sortTableElementsByNumber(
      elements.filter(
        (el) =>
          el.type === 'table' &&
          isActeTableId(el.id) &&
          (!el.tableData || el.tableData.length === 0)
      )
    );
    const acteTableEl =
      (selectedElementId && emptyActeSorted.find((e) => e.id === selectedElementId)) ||
      emptyActeSorted[0];
    const acteVarEl = elements.find(
      (el) =>
        (el.type === 'variable' || el.type === 'text') &&
        el.content &&
        (el.content.includes('{{acte.') || el.content.includes('{{actes.'))
    );
    const acteLabel = acteVarEl?.variableLabel || acteTableEl?.tableNumber;
    const labelSuffix = acteLabel ? ` #${acteLabel}` : '';
    if (actesModalPurpose === 'variables') {
      return `🦷 Sélectionner l'acte${labelSuffix} pour les variables`;
    }
    if (actesModalPurpose === 'both') {
      return `🦷 Étape 1/2 : Sélectionner l'acte${labelSuffix} pour les variables`;
    }
    return `📋 Sélectionner les actes pour le tableau${acteTableEl?.tableNumber ? ` #${acteTableEl.tableNumber}` : ''}`;
  }, [elements, actesModalPurpose, selectedElementId]);

  const collaborateursTableModalTitle = useMemo(() => {
    const emptySorted = sortTableElementsByNumber(
      elements.filter(
        (el) =>
          el.type === 'table' &&
          el.id.includes('collaborateurs') &&
          (!el.tableData || el.tableData.length === 0)
      )
    );
    const t =
      (selectedElementId && emptySorted.find((e) => e.id === selectedElementId)) ||
      emptySorted[0];
    return `👥 Sélectionner les collaborateurs pour le tableau${t?.tableNumber ? ` #${t.tableNumber}` : ''}`;
  }, [elements, selectedElementId]);

  const closeCollaborateurEtatModal = useCallback(() => {
    setShowCollaborateurEtatModal(false);
    setCollaborateurEtatModalSearch('');
  }, []);

  const toggleCollaborateurEtatSelection = useCallback((row: EtatStaffRow) => {
    const sid = String(row.id);
    const max = requiredCollaborateurIndices.length;
    setSelectedCollaborateursEtatIds((prev) => {
      const at = prev.findIndex((id) => String(id) === sid);
      if (at >= 0) {
        delete collaborateurEtatSelectionMapRef.current[sid];
        return prev.filter((id) => String(id) !== sid);
      }
      if (prev.length >= max) return prev;
      collaborateurEtatSelectionMapRef.current[sid] = row;
      return [...prev, row.id];
    });
  }, [requiredCollaborateurIndices.length]);

  const applyCollaborateurMultiSelection = useCallback(() => {
    const byIndex: Record<number, EtatStaffRow> = {};
    requiredCollaborateurIndices.forEach((idx, i) => {
      const id = selectedCollaborateursEtatIds[i];
      if (id == null) return;
      const row =
        collaborateurEtatSelectionMapRef.current[String(id)] ??
        collaborateurEtatModalList.find((r) => String(r.id) === String(id));
      if (row) byIndex[idx] = row;
    });
    setSelectedCollaborateursByIndex(byIndex);
    setSelectedCollaborateurEtat(byIndex[1] ?? null);
    setSelectedCollaborateursEtatIds([]);
    collaborateurEtatSelectionMapRef.current = {};
    setShowCollaborateurEtatModal(false);
    setCollaborateurEtatModalSearch('');
    setAlertObj({
      type: 'success',
      show: true,
      text: `Aperçu : ${Object.keys(byIndex).length} collaborateur(s) assigné(s) aux indices {{collaborateur.*}}.`,
    });
  }, [
    requiredCollaborateurIndices,
    selectedCollaborateursEtatIds,
    collaborateurEtatModalList,
    setAlertObj,
  ]);

  const collaborateurPreviewModalTitle =
    etatProfilPickerTarget === 'user'
      ? "👤 Sélectionner l'utilisateur pour les variables {{user.*}}"
      : requiredCollaborateurIndices.length > 1
        ? `👥 Sélectionner ${requiredCollaborateurIndices.length} collaborateurs (${requiredCollaborateurIndices.map((i) => `#${i}`).join(', ')})`
        : '👥 Sélectionner le collaborateur pour les variables {{collaborateur.*}}';

  /** En mode aperçu : charger les vrais textes posologie/ordonnance dès qu’un patient est connu. */
  useEffect(() => {
    let cancelled = false;
    if (!isPreviewMode) {
      setAutoPosologiePreviewText(null);
      setAutoOrdonnancePreviewText(null);
      return;
    }
    const hasPosologieOrOrdonnanceVars = elements.some(
      (el) =>
        (el.type === 'text' || el.type === 'variable') &&
        typeof el.content === 'string' &&
        /\{\{\s*(posologie|ordonnance)\b/i.test(el.content)
    );
    if (!hasPosologieOrOrdonnanceVars) {
      setAutoPosologiePreviewText(null);
      setAutoOrdonnancePreviewText(null);
      return;
    }
    const hasManualPos = previewPosologieOverride != null && String(previewPosologieOverride).trim() !== '';
    const hasManualOrd = previewOrdonnanceOverride != null && String(previewOrdonnanceOverride).trim() !== '';
    if (hasManualPos || hasManualOrd) {
      setAutoPosologiePreviewText(null);
      setAutoOrdonnancePreviewText(null);
      return;
    }
    const pid = String(selectedPatient?.id ?? '').trim();
    const tab = String(theUser.tabId ?? '');
    const py = theUser.pays || 'sn';
    if (!pid || !tab) {
      setAutoPosologiePreviewText(null);
      setAutoOrdonnancePreviewText(null);
      return;
    }
    setAutoPosologiePreviewText(null);
    setAutoOrdonnancePreviewText(null);
    void (async () => {
      const res = await resolvePosologieEtatForPatient({ patientId: pid, tabId: tab, pays: py });
      if (cancelled) return;
      setAutoPosologiePreviewText(res.posologie.trim());
      setAutoOrdonnancePreviewText(res.ordonnance.trim());
    })();
    return () => {
      cancelled = true;
    };
  }, [isPreviewMode, elements, selectedPatient, theUser.tabId, theUser.pays, previewPosologieOverride, previewOrdonnanceOverride]);

  // ========= Fonction de rendu des variables =========
  
  const renderVariableValue = useCallback((variablePath: string, variableLabel?: string | null): string => {
    const parsed = parseVariableContent(variablePath, variableLabel);
    if (!parsed) return formatInexistantVariable(variablePath.replace(/[{}]/g, '').trim() || 'variable');
    const { basePath, index } = parsed;
    if (isForbiddenEtatVariableBasePath(basePath)) {
      return '';
    }
    const parts = basePath.split('.');
    const innerVar = variablePath.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').trim();

    if (basePath.startsWith('qrcode.')) {
      const pk = `qrcode:${basePath}#${index}`;
      const url = etatQrcodeUrlByKey[pk];
      if (url && url.startsWith('data:image')) return url;
      return formatInexistantVariable(innerVar);
    }

    // Patient par index : {{patient.nom #2}} → selectedPatientsByIndex[2] — pas de repli sur le patient #1 si #2 manque
    let patient: Record<string, unknown> = {};
    if (index >= 1) {
      if (index === 1) {
        patient = (selectedPatientsByIndex[1] ?? selectedPatient ?? {}) as Record<string, unknown>;
      } else {
        patient = (selectedPatientsByIndex[index] ?? {}) as Record<string, unknown>;
      }
    }
    // Acte par index : {{acte.nom #2}} → actes[1] — pas de repli sur le 1er acte si le Nième manque
    const acte =
      actes && index >= 1 && actes.length >= index ? actes[index - 1] : {};

    const patientUserMerged = {
      ...patient,
      email: (patient as any)?.email || (patient as any)?.login || '',
      login: (patient as any)?.login || (patient as any)?.email || '',
    };
    const todayFr = new Date().toLocaleDateString('fr-FR');
    const manualPos =
      previewPosologieOverride != null && String(previewPosologieOverride).trim() !== ''
        ? String(previewPosologieOverride).trim()
        : null;
    const autoPos =
      autoPosologiePreviewText !== null ? String(autoPosologiePreviewText) : null;
    const manualOrd =
      previewOrdonnanceOverride != null && String(previewOrdonnanceOverride).trim() !== ''
        ? String(previewOrdonnanceOverride).trim()
        : null;
    const autoOrd =
      autoOrdonnancePreviewText !== null ? String(autoOrdonnancePreviewText) : null;
    const effectivePosText = manualPos ?? autoPos ?? manualOrd ?? autoOrd;
    const effectiveOrdText = manualOrd ?? autoOrd ?? manualPos ?? autoPos;
    const posParsed = effectivePosText ? parseFirstPosologieBulletForEtat(effectivePosText) : null;
    const posFromModal =
      effectivePosText != null && effectivePosText !== ''
        ? {
            texte: effectivePosText,
            date: todayFr,
            lignes: effectivePosText,
            acte: posParsed?.acte ?? '',
            medicament: posParsed?.medicament ?? '',
            boites: posParsed?.boites ?? '',
            dose: posParsed?.dose ?? '',
            prises: posParsed?.prises ?? '',
          }
        : null;
    const ordFromModal =
      effectiveOrdText != null && effectiveOrdText !== ''
        ? {
            texte: effectiveOrdText,
            date: todayFr,
            lignes: effectiveOrdText,
          }
        : null;
    const sessionUser = user && typeof user === 'object' ? user : {};
    const u =
      selectedUserForEtat && selectedUserForEtat.id
        ? {
            id: selectedUserForEtat.id,
            nom: selectedUserForEtat.nom,
            prenom: selectedUserForEtat.prenom,
            login: selectedUserForEtat.login,
            telephone: selectedUserForEtat.telephone,
            naissance: selectedUserForEtat.naissance,
            adresse: selectedUserForEtat.adresse,
            role: selectedUserForEtat.role,
            loggId: selectedUserForEtat.loggId,
          }
        : sessionUser;
    /** {{collaborateur.champ #N}} : Nième personne choisie (comme patient #N). */
    const collaborateurRowForIndex: EtatStaffRow | null | undefined =
      index === 1
        ? (selectedCollaborateursByIndex[1] ?? selectedCollaborateurEtat ?? undefined)
        : selectedCollaborateursByIndex[index];
    const collaborateurData =
      collaborateurRowForIndex && collaborateurRowForIndex.id
        ? {
            id: collaborateurRowForIndex.id,
            nom: collaborateurRowForIndex.nom,
            prenom: collaborateurRowForIndex.prenom,
            login: collaborateurRowForIndex.login,
            telephone: collaborateurRowForIndex.telephone,
            naissance: collaborateurRowForIndex.naissance,
            adresse: collaborateurRowForIndex.adresse,
            role: collaborateurRowForIndex.role,
            loggId: collaborateurRowForIndex.loggId,
          }
        : {};

    const data: any = {
      patient: patientUserMerged,
      actes: actes || [],
      acte,
      posologie:
        posFromModal ??
        {
          texte: '',
          date: '',
          lignes: '',
          acte: '',
          medicament: '',
          boites: '',
          dose: '',
          prises: '',
        },
      ordonnance: ordFromModal ?? { texte: '', date: '', lignes: '' },
      docteur: docteur || {},
      user: { ...u },
      collaborateur: collaborateurData,
      cabinet: cabinet || {}
    };

    // {{actes.champ #N}} : Nième acte du tableau chargé (aligné sur {{acte.champ #N}} qui utilise l’objet `acte`)
    if (parts[0] === 'actes' && parts.length >= 2) {
      const row =
        actes && index >= 1 && actes.length >= index ? actes[index - 1] : undefined;
      if (row === undefined || row === null) {
        return formatInexistantVariable(innerVar);
      }
      let value: any = row;
      for (const part of parts.slice(1)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return formatInexistantVariable(innerVar);
        }
      }
      if (value === undefined || value === null) {
        return formatInexistantVariable(innerVar);
      }
      return String(value);
    }

    if (parts.length === 1 && parts[0] === 'posologie') {
      const po = data.posologie;
      if (typeof po === 'string') return po;
      if (po && typeof po === 'object' && (po as any).texte != null) return String((po as any).texte);
    }
    if (parts.length === 1 && parts[0] === 'ordonnance') {
      const ord = data.ordonnance;
      if (typeof ord === 'string') return ord;
      if (ord && typeof ord === 'object' && (ord as any).texte != null) return String((ord as any).texte);
    }

    let value: any = data;
    for (const part of parts) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        value = value[part];
      } else {
        return formatInexistantVariable(innerVar);
      }
    }

    if (value === undefined || value === null) {
      return formatInexistantVariable(innerVar);
    }
    return String(value);
  }, [
    selectedPatient,
    selectedPatientsByIndex,
    actes,
    docteur,
    user,
    cabinet,
    previewPosologieOverride,
    autoPosologiePreviewText,
    previewOrdonnanceOverride,
    autoOrdonnancePreviewText,
    selectedCollaborateurEtat,
    selectedCollaborateursByIndex,
    selectedUserForEtat,
    etatQrcodeUrlByKey,
  ]);

  // Aperçu : images QR pour {{qrcode.*}} (mêmes endpoints que la fiche patient / profil / posologie).
  useEffect(() => {
    if (!isPreviewMode) return;
    const py = String(pays ?? 'sn');
    const tid = String(tabId ?? '');
    const uid = String(userId ?? '');
    if (!tid || !uid) {
      setEtatQrcodeUrlByKey({});
      return;
    }
    const slots = extractQrcodeVariableSlots(elements);
    if (slots.length === 0) {
      setEtatQrcodeUrlByKey({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const built: Record<string, string> = {};
      const profil = PageProfilController(py);
      const patientCtrl = PagePatientController(py);
      const posoCtrl = PosologieController(py);
      for (const { basePath, index } of slots) {
        const pk = `qrcode:${basePath}#${index}`;
        try {
          if (basePath === 'qrcode.docteur') {
            const data = await profil.voirQRCodeDocteur(uid, tid);
            const b64 = data?.base64 ?? '';
            if (b64.startsWith('data:')) built[pk] = b64;
          } else if (basePath === 'qrcode.patient') {
            const p =
              index === 1
                ? ((selectedPatientsByIndex[1] ?? selectedPatient) as Record<string, unknown> | undefined)
                : (selectedPatientsByIndex[index] as Record<string, unknown> | undefined);
            const pid = String(p?.id ?? '').trim();
            if (!pid) continue;
            const q = await patientCtrl.voirQrCode(pid, tid);
            const b64 =
              (q.part1 ?? '') +
              (q.part2 ?? '') +
              (q.part3 ?? '') +
              (q.part4 ?? '') +
              (q.part5 ?? '') +
              (q.part6 ?? '') +
              (q.part7 ?? '') +
              (q.part8 ?? '') +
              (q.part9 ?? '') +
              (q.part10 ?? '');
            if (b64.startsWith('data:')) built[pk] = b64;
          } else if (basePath === 'qrcode.collaborateur') {
            const row =
              index === 1
                ? selectedCollaborateursByIndex[1] ?? selectedCollaborateurEtat
                : selectedCollaborateursByIndex[index];
            if (!row?.id) continue;
            const roleLabel = String(row.sourceLabel ?? row.role ?? 'collaborateur').trim() || 'collaborateur';
            const data = await profil.voirQRCodeCollaborateur(row.id, tid, roleLabel);
            const b64 = data?.base64 ?? '';
            if (b64.startsWith('data:')) built[pk] = b64;
          } else if (basePath === 'qrcode.posologie') {
            const p =
              index === 1
                ? ((selectedPatientsByIndex[1] ?? selectedPatient) as Record<string, unknown> | undefined)
                : (selectedPatientsByIndex[index] as Record<string, unknown> | undefined);
            const pid = String(p?.id ?? '').trim();
            if (!pid) continue;
            const url = await posoCtrl.getPosologieQrcodeDataUrl({ patientId: pid, tabId: tid });
            if (url) built[pk] = url;
          }
        } catch {
          /* slot ignoré */
        }
      }
      if (!cancelled) setEtatQrcodeUrlByKey(built);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isPreviewMode,
    elements,
    selectedPatientsByIndex,
    selectedPatient,
    selectedCollaborateursByIndex,
    selectedCollaborateurEtat,
    userId,
    tabId,
    pays,
  ]);

  // ========= Gestion des éléments =========

  const addTextElement = useCallback((customContent?: string) => {
    // Limiter les dimensions initiales aux dimensions de la feuille
    const maxHeight = getMaxSheetHeight();
    const initialWidth = customContent ? Math.min(700, A4_WIDTH - 100) : Math.min(200, A4_WIDTH - 100);
    const initialHeight = customContent ? Math.min(600, maxHeight - 100) : Math.min(40, maxHeight - 100);
    
    const newElement: Element = {
      id: `text_${Date.now()}`,
      type: 'text',
      x: 50,
      y: 50,
      width: initialWidth,
      height: initialHeight,
      content: customContent || 'Double-cliquez pour éditer',
      fontSize: 14,
      fontFamily: 'Arial, sans-serif',
      color: '#000000',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'left',
      zIndex: elements.length
    };
    setElements([...elements, newElement]);
    setSelectedElementId(newElement.id);
  }, [elements, getMaxSheetHeight]);

  const addImageElement = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        // Limiter les dimensions initiales aux dimensions de la feuille
        const maxHeight = getMaxSheetHeight();
        const initialWidth = Math.min(200, A4_WIDTH - 100);
        const initialHeight = Math.min(150, maxHeight - 100);
        
        const newElement: Element = {
          id: `image_${Date.now()}`,
          type: 'image',
          x: 50,
          y: 50,
          width: initialWidth,
          height: initialHeight,
          content: base64,
          zIndex: elements.length
        };
        setElements(prev => [...prev, newElement]);
        setSelectedElementId(newElement.id);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [elements.length, getMaxSheetHeight]);

  const addShapeElement = useCallback((shapeType: 'rectangle' | 'circle') => {
    // Limiter les dimensions initiales aux dimensions de la feuille
    const maxHeight = getMaxSheetHeight();
    const initialWidth = Math.min(150, A4_WIDTH - 100);
    const initialHeight = Math.min(shapeType === 'circle' ? 150 : 100, maxHeight - 100);
    
    const newElement: Element = {
      id: `shape_${Date.now()}`,
      type: 'shape',
      x: 50,
      y: 50,
      width: initialWidth,
      height: initialHeight,
      content: shapeType,
      backgroundColor: '#ecf0f1',
      borderColor: '#34495e',
      borderWidth: 2,
      borderRadius: shapeType === 'circle' ? 50 : 0,
      zIndex: elements.length
    };
    setElements(prev => [...prev, newElement]);
    setSelectedElementId(newElement.id);
  }, [elements.length, getMaxSheetHeight]);

  const addVariableElement = useCallback((variablePath: string) => {
    // Limiter les dimensions initiales aux dimensions de la feuille
    const maxHeight = getMaxSheetHeight();
    const isQrcodeVar = variablePath.startsWith('qrcode.');
    const initialWidth = isQrcodeVar ? Math.min(220, A4_WIDTH - 80) : Math.min(200, A4_WIDTH - 100);
    const initialHeight = isQrcodeVar ? Math.min(220, maxHeight - 80) : Math.min(30, maxHeight - 100);
    
    const newElement: Element = {
      id: `var_${Date.now()}`,
      type: 'variable',
      x: 50,
      y: 50,
      width: initialWidth,
      height: initialHeight,
      content: `{{${variablePath}}}`,
      fontSize: 14,
      fontFamily: 'Arial, sans-serif',
      color: '#000000',
      backgroundColor: '#e3f2fd',
      borderColor: '#2196f3',
      borderWidth: 1,
      zIndex: elements.length
    };
    setElements(prev => [...prev, newElement]);
    setSelectedElementId(newElement.id);
  }, [elements, getMaxSheetHeight]);

  // Fonction pour préparer l'insertion d'un modèle (affiche le modal de confirmation)
  const prepareInsertTemplate = useCallback((template: DocumentTemplate) => {
    // Si la feuille est vide, insérer directement
    if (elements.length === 0) {
      // Insérer directement sans modal
      const maxHeight = getMaxSheetHeight();
      const adjustedElements = template.elements.map((el, index) => {
        let adjustedWidth = Math.min(el.width, A4_WIDTH);
        let adjustedHeight = Math.min(el.height, maxHeight);
        let adjustedX = Math.max(0, Math.min(el.x, A4_WIDTH - adjustedWidth));
        let adjustedY = Math.max(0, Math.min(el.y, maxHeight - adjustedHeight));
        adjustedWidth = Math.max(10, Math.min(adjustedWidth, A4_WIDTH - adjustedX));
        adjustedHeight = Math.max(10, Math.min(adjustedHeight, maxHeight - adjustedY));
        
        return {
          ...el,
          x: adjustedX,
          y: adjustedY,
          width: adjustedWidth,
          height: adjustedHeight,
          id: `${el.type}_${Date.now()}_${index}`,
          zIndex: index
        };
      });
      
      setElements(adjustedElements);
      if (adjustedElements.length > 0) {
        setSelectedElementId(adjustedElements[0].id);
      }
      return;
    }
    
    // Sinon, afficher le modal de confirmation
    setPendingTemplate(template);
    setShowInsertTemplateModal(true);
  }, [elements.length, getMaxSheetHeight]);

  // Insérer un template multi-éléments
  const insertDocumentTemplate = useCallback((template: DocumentTemplate, mode: 'replace' | 'append' = 'append') => {
    // Obtenir la hauteur maximale selon le mode
    const maxHeight = getMaxSheetHeight();
    
    // Ajuster les éléments du template pour qu'ils respectent STRICTEMENT les limites
    const adjustedElements = template.elements.map((el, index) => {
      // ÉTAPE 1: Limiter directement les largeurs et hauteurs aux valeurs maximales
      // La largeur ne peut JAMAIS dépasser A4_WIDTH (794px)
      let adjustedWidth = Math.min(el.width, A4_WIDTH);
      // La hauteur ne peut JAMAIS dépasser la hauteur maximale de la feuille
      let adjustedHeight = Math.min(el.height, maxHeight);
      
      // ÉTAPE 2: Ajuster les positions X et Y
      let adjustedX = el.x;
      let adjustedY = el.y;
      
      // S'assurer que les positions sont positives
      adjustedX = Math.max(0, adjustedX);
      adjustedY = Math.max(0, adjustedY);
      
      // ÉTAPE 3: Vérifier que x + width ne dépasse pas A4_WIDTH
      if (adjustedX + adjustedWidth > A4_WIDTH) {
        // Ajuster la position X pour que l'élément reste dans les limites
        adjustedX = Math.max(0, A4_WIDTH - adjustedWidth);
        // Si l'élément est trop large même à x=0, réduire sa largeur
        if (adjustedWidth > A4_WIDTH) {
          adjustedWidth = A4_WIDTH;
          adjustedX = 0;
        }
      }
      
      // ÉTAPE 4: Vérifier que y + height ne dépasse pas la hauteur maximale
      if (adjustedY + adjustedHeight > maxHeight) {
        // Ajuster la position Y pour que l'élément reste dans les limites
        adjustedY = Math.max(0, maxHeight - adjustedHeight);
        // Si l'élément est trop haut même à y=0, réduire sa hauteur
        if (adjustedHeight > maxHeight) {
          adjustedHeight = maxHeight;
          adjustedY = 0;
        }
      }
      
      // ÉTAPE 5: Vérification finale de sécurité
      // S'assurer que les dimensions minimales sont respectées
      adjustedWidth = Math.max(10, Math.min(adjustedWidth, A4_WIDTH));
      adjustedHeight = Math.max(10, Math.min(adjustedHeight, maxHeight));
      
      // S'assurer que les positions finales respectent les limites
      adjustedX = Math.max(0, Math.min(adjustedX, A4_WIDTH - adjustedWidth));
      adjustedY = Math.max(0, Math.min(adjustedY, maxHeight - adjustedHeight));
      
      return {
        ...el,
        x: adjustedX,
        y: adjustedY,
        width: adjustedWidth,
        height: adjustedHeight,
        id: `${el.type}_${Date.now()}_${index}`,
        zIndex: index
      };
    });
    
    // Vérifier si le template nécessite plusieurs pages
    const maxY = Math.max(...adjustedElements.map(el => el.y + el.height));
    if (maxY > A4_HEIGHT) {
      // Avertir l'utilisateur que le template dépasse une page
      setAlertObj({ 
        type: "warning", 
        show: true, 
        text: `Le modèle "${template.name}" contient ${adjustedElements.length} éléments. Certains éléments peuvent nécessiter plusieurs pages.` 
      });
    }
    
    // Créer les nouveaux éléments avec les positions ajustées
    let newElements: Element[] = adjustedElements.map((el, index) => ({
      ...el,
      zIndex: (mode === 'replace' ? 0 : elements.length) + index
    }));
    
    // Si mode 'append', décaler les éléments du modèle vers le bas
    if (mode === 'append' && elements.length > 0) {
      // Calculer la hauteur maximale du contenu existant
      const maxExistingY = Math.max(...elements.map(el => el.y + el.height));
      // En mode EXTENSIBLE, décaler simplement après le contenu existant
      // En mode PAGED, aligner sur la page suivante
      const offsetY = renderMode === 'EXTENSIBLE' 
        ? maxExistingY + 50 // Ajouter un espacement de 50px
        : Math.ceil(maxExistingY / A4_HEIGHT) * A4_HEIGHT; // Aligner sur la page suivante
      
      // Décaler tous les éléments du modèle vers le bas
      newElements = newElements.map(el => ({
        ...el,
        y: el.y + offsetY,
        zIndex: elements.length + (el.zIndex ?? 0)
      }));
    }
    
    // Appliquer selon le mode
    if (mode === 'replace') {
      setElements(newElements);
    } else {
      setElements(prev => [...prev, ...newElements]);
    }
    
    // Sélectionner le premier élément du template
    if (newElements.length > 0) {
      setSelectedElementId(newElements[0].id);
    }
    
    // Fermer le modal si ouvert
    setShowInsertTemplateModal(false);
    setPendingTemplate(null);
    
  }, [elements, setAlertObj, getMaxSheetHeight, renderMode]);

  // Aperçu depuis le modal Posologie (fiche patient) : charger le modèle + patient + texte posologie
  useEffect(() => {
    const st = location.state as {
      posologieEtatPreview?: {
        template: DocumentTemplate;
        patient: any;
        posologieText: string;
        actesPreview?: any[];
      };
    } | null;
    const pack = st?.posologieEtatPreview;
    if (!pack?.template?.elements?.length) {
      lastPosologieEtatImportSigRef.current = null;
      return;
    }
    const importSig = `${pack.template.elements.length}_${(pack.template as { id?: string }).id ?? ''}_${pack.patient?.id ?? ''}_${(pack.posologieText ?? '').length}_${String(pack.posologieText ?? '').slice(0, 160)}`;
    if (lastPosologieEtatImportSigRef.current === importSig) return;
    lastPosologieEtatImportSigRef.current = importSig;

    skipNextPreviewDataModalsRef.current = true;
    insertDocumentTemplate(pack.template, 'replace');
    if (pack.patient) {
      setSelectedPatient(pack.patient);
      setSelectedPatientsByIndex({ 1: pack.patient });
    }
    if (pack.actesPreview && pack.actesPreview.length > 0) {
      setActes(pack.actesPreview);
    } else {
      setActes([]);
    }
    setPreviewPosologieOverride(pack.posologieText ?? '');
    setPreviewOrdonnanceOverride(pack.posologieText ?? '');
    setIsPreviewMode(true);
    setAlertObj({
      type: 'success',
      show: true,
      text: 'Aperçu ouvert (posologie / ordonnance). Utilisez Imprimer ou Télécharger dans la barre d’outils de la Page État.',
    });
    navigate(`${location.pathname}${location.search || ''}`, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule prise en charge au chargement avec state
  }, [location.state]);

  // Sauvegarder le canvas actuel comme modèle (en base de données)
  const saveAsTemplate = useCallback(async () => {
    if (elements.length === 0) return;
    if (!newTemplateName.trim()) return;
    if (!theUser.tabId || !theUser.pays) {
      setAlertObj({ type: 'error', show: true, text: 'Contexte manquant (tabId/pays). Impossible de sauvegarder.' });
      return;
    }

    const newTemplate: DocumentTemplate = {
      id: `custom_${Date.now()}`,
      name: newTemplateName.trim(),
      icon: newTemplateIcon || '📄',
      description: newTemplateDescription.trim() || `Modèle personnalisé créé le ${new Date().toLocaleDateString('fr-FR')}`,
      category: newTemplateCategory,
      elements: elements.map(el => {
        const { id, zIndex, ...elementWithoutId } = el;
        return elementWithoutId as any;
      })
    };

    try {
      await ModeleEtatController(theUser.pays).saveModele(theUser.tabId, newTemplate);
      setNewTemplateName('');
      setNewTemplateDescription('');
      setNewTemplateCategory('administratif');
      setNewTemplateIcon('📄');
      setShowSaveTemplateModal(false);
      setModelesVersion(v => v + 1);
    } catch (err) {
      console.error('Erreur sauvegarde modèle:', err);
      setAlertObj({ type: 'error', show: true, text: 'Erreur lors de la sauvegarde du modèle.' });
    }
  }, [elements, newTemplateName, newTemplateDescription, newTemplateCategory, newTemplateIcon, setAlertObj, theUser.tabId, theUser.pays]);

  const deleteElement = useCallback(() => {
    // Supprimer les éléments sélectionnés (multiple ou simple)
    if (selectedElementIds.length > 0) {
      setElements(prev => prev.filter(el => !selectedElementIds.includes(el.id)));
      setSelectedElementId(null);
      setSelectedElementIds([]);
    } else if (selectedElementId) {
      setElements(prev => prev.filter(el => el.id !== selectedElementId));
      setSelectedElementId(null);
    }
  }, [selectedElementId, selectedElementIds]);

  const duplicateElement = useCallback(() => {
    if (!selectedElement) return;
    const newElement: Element = {
      ...selectedElement,
      id: `${selectedElement.type}_${Date.now()}`,
      x: selectedElement.x + 20,
      y: selectedElement.y + 20,
      zIndex: elements.length
    };
    setElements(prev => [...prev, newElement]);
    setSelectedElementId(newElement.id);
  }, [selectedElement, elements.length]);

  const moveElementUp = useCallback((elementId?: string) => {
    const targetId = elementId || selectedElementId;
    if (!targetId) return;
    
    const maxZ = Math.max(...elements.map(el => el.zIndex || 0));
    setElements(prev => prev.map(el => 
      el.id === targetId ? { ...el, zIndex: maxZ + 1 } : el
    ));
  }, [selectedElementId, elements]);

  const moveElementDown = useCallback((elementId?: string) => {
    const targetId = elementId || selectedElementId;
    if (!targetId) return;
    
    const element = elements.find(el => el.id === targetId);
    const currentZ = element?.zIndex || 0;
    if (currentZ > 0) {
      setElements(prev => prev.map(el => 
        el.id === targetId ? { ...el, zIndex: currentZ - 1 } : el
      ));
    }
  }, [selectedElementId, elements]);

  // ========= Gestion du drag & drop =========

  const handleMouseDown = (e: React.MouseEvent, element: Element) => {
    if (e.button !== 0) return; // Seulement clic gauche
    
    // IMPORTANT: Empêcher la propagation pour ne pas déclencher le onClick du canvas !
    e.stopPropagation();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Gestion de la sélection multiple avec Ctrl/Cmd
    if (e.ctrlKey || e.metaKey) {
      if (selectedElementIds.includes(element.id)) {
        // Désélectionner si déjà sélectionné
        setSelectedElementIds(prev => prev.filter(id => id !== element.id));
        if (selectedElementId === element.id) {
          setSelectedElementId(null);
        }
      } else {
        // Ajouter à la sélection
        setSelectedElementIds(prev => [...prev, element.id]);
        setSelectedElementId(element.id);
      }
      return; // Ne pas démarrer le drag en mode sélection multiple
    }

    // Sélection simple immédiate
    setSelectedElementId(element.id);
    setSelectedElementIds([element.id]);
    
    // Enregistrer la position et l'élément pour un drag potentiel
    const mousePos = { x: e.clientX, y: e.clientY };
    setMouseDownPos(mousePos);
    setDraggedElement(element);
    setIsDragging(false);
    
    // Mettre à jour les refs
    mouseDownPosRef.current = mousePos;
    draggedElementRef.current = element;
    isDraggingRef.current = false;
    
    // Préparer le drag offset (offset = position du clic dans l'élément)
    const offset = {
      x: (e.clientX - rect.left) / zoomControls.zoom - element.x,
      y: (e.clientY - rect.top) / zoomControls.zoom - element.y
    };
    setDragOffset(offset);
    dragOffsetRef.current = offset;
  };

  const handleGlobalMouseMove = (e: MouseEvent) => {
    // Utiliser les refs pour avoir les valeurs à jour
    const draggedEl = draggedElementRef.current;
    const mousePos = mouseDownPosRef.current;
    const dragging = isDraggingRef.current;
    
    // Si pas d'élément préparé pour le drag, ne rien faire
    if (!draggedEl || !canvasRef.current || !mousePos) {
      return;
    }

    // Si on n'est pas encore en mode drag, vérifier le seuil
    if (!dragging) {
      const dragThreshold = 5; // Seuil de 5 pixels
      const deltaX = Math.abs(e.clientX - mousePos.x);
      const deltaY = Math.abs(e.clientY - mousePos.y);
      
      if (deltaX > dragThreshold || deltaY > dragThreshold) {
        // On dépasse le seuil, démarrer le drag
        isDraggingRef.current = true;
        setIsDragging(true);
      } else {
        // Pas encore de drag
        return;
      }
    }

    // Mode drag actif : déplacer l'élément
    const rect = canvasRef.current.getBoundingClientRect();
    if (!rect) return;
    
    const zoom = zoomRef.current;
    // Calculer la nouvelle position en tenant compte du zoom
    const mouseX = (e.clientX - rect.left) / zoom;
    const mouseY = (e.clientY - rect.top) / zoom;
    
    // Calculer la nouvelle position avec l'offset (point sous le curseur reste sous le curseur)
    const offset = dragOffsetRef.current;
    let newX = mouseX - offset.x;
    let newY = mouseY - offset.y;
    
    // BLOQUER strictement aux limites de la feuille
    // L'élément ne peut JAMAIS dépasser les limites visibles de la feuille blanche
    const maxHeight = getMaxSheetHeight();
    newX = Math.max(0, Math.min(A4_WIDTH - draggedEl.width, newX));
    newY = Math.max(0, Math.min(maxHeight - draggedEl.height, newY));
    
    // Si l'élément est trop grand pour la feuille, le repositionner au maximum autorisé
    if (draggedEl.width > A4_WIDTH) {
      newX = 0; // Forcer à gauche si trop large
    }
    if (draggedEl.height > maxHeight) {
      newY = 0; // Forcer en haut si trop haut
    }

    setElements(prev => prev.map(el => 
      el.id === draggedEl.id 
        ? { ...el, x: newX, y: newY }
        : el
    ));
  };

  const handleGlobalMouseUp = () => {
    // IMPORTANT: On nettoie UNIQUEMENT les états de drag
    // On NE touche PAS à selectedElementId qui doit rester sélectionné !
    draggedElementRef.current = null;
    mouseDownPosRef.current = null;
    isDraggingRef.current = false;
    
    setDraggedElement(null);
    setIsDragging(false);
    setMouseDownPos(null);
  };

  // Listeners globaux installés une seule fois
  useEffect(() => {
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []); // Pas de dépendances - installés une fois pour toutes

  // ========= Modification des propriétés =========

  const updateElementProperty = useCallback((property: string, value: any) => {
    // Empêcher les débordements lors de la modification des propriétés
    if (property === 'x' || property === 'y' || property === 'width' || property === 'height') {
      const element = elements.find(el => el.id === selectedElementId);
      if (element) {
        if (property === 'x') {
          value = Math.max(0, Math.min(value, A4_WIDTH - element.width));
        } else if (property === 'y') {
          const maxHeight = getMaxSheetHeight();
          value = Math.max(0, Math.min(value, maxHeight - element.height));
        } else if (property === 'width') {
          // Largeur maximale = largeur de la feuille A4 (794px)
          // La largeur ne peut pas dépasser A4_WIDTH, même si l'élément est à x=0
          value = Math.max(10, Math.min(value, A4_WIDTH));
          // Ajuster aussi la position X si nécessaire pour rester dans les limites
          if (element.x + value > A4_WIDTH) {
            const newX = Math.max(0, A4_WIDTH - value);
            setElements(prev => prev.map(el => 
              el.id === selectedElementId 
                ? { ...el, x: newX, width: value }
                : el
            ));
            return;
          }
        } else if (property === 'height') {
          // Hauteur maximale = hauteur de la feuille A4 (1123px)
          const maxHeight = getMaxSheetHeight();
          // La hauteur ne peut pas dépasser la hauteur maximale de la feuille
          value = Math.max(10, Math.min(value, maxHeight));
          // Ajuster aussi la position Y si nécessaire pour rester dans les limites
          if (element.y + value > maxHeight) {
            const newY = Math.max(0, maxHeight - value);
            setElements(prev => prev.map(el => 
              el.id === selectedElementId 
                ? { ...el, y: newY, height: value }
                : el
            ));
            return;
          }
        }
      }
    }
    // variableLabel : synchroniser le contenu au format {{path #N}}
    if (property === 'variableLabel' && selectedElementId) {
      const el = elements.find(e => e.id === selectedElementId);
      if (el?.type === 'variable' && el.content) {
        const basePath = getBasePathFromContent(el.content);
        const newContent = buildVariableContent(basePath, value);
        setElements(prev => prev.map(e => 
          e.id === selectedElementId ? { ...e, variableLabel: value || undefined, content: newContent } : e
        ));
        return;
      }
    }
    if (!selectedElementId) return;
    setElements(prev => prev.map(el => 
      el.id === selectedElementId 
        ? { ...el, [property]: value }
        : el
    ));
  }, [selectedElementId, elements]);

  const handleDoubleClick = (e: React.MouseEvent, element: Element) => {
    e.stopPropagation(); // Empêcher la propagation
    
    if (element.type === 'text' || element.type === 'variable') {
      setEditingElement(element);
      setEditModalContent(element.content);
      if (element.type === 'variable') {
        const parsed = parseVariableContent(element.content || '', element.variableLabel);
        const variableLabel = parsed && parsed.index > 1 ? String(parsed.index) : element.variableLabel;
        setEditModalVariableProps({
          x: element.x, y: element.y, width: element.width, height: element.height,
          fontSize: element.fontSize ?? 16, fontFamily: element.fontFamily ?? 'Arial, sans-serif',
          color: element.color ?? '#000000', fontWeight: element.fontWeight, fontStyle: element.fontStyle,
          textDecoration: element.textDecoration, textAlign: element.textAlign ?? 'left',
          backgroundColor: element.backgroundColor ?? '#ffffff', borderColor: element.borderColor ?? '#000000',
          borderWidth: element.borderWidth ?? 0, borderRadius: element.borderRadius ?? 0,
          rotation: element.rotation ?? 0, boxShadow: element.boxShadow ?? '',
          heightByContent: element.heightByContent, variableLabel
        });
      } else {
        setEditModalVariableProps({});
      }
      setShowEditModal(true);
    }
  };

  const handleSaveEdit = () => {
    if (editingElement) {
      const parsed = editingElement.type === 'variable' ? parseVariableContent(editModalContent, editModalVariableProps.variableLabel) : null;
      const variableLabel = editingElement.type === 'variable' 
        ? (parsed && parsed.index > 1 ? String(parsed.index) : editModalVariableProps.variableLabel || undefined)
        : undefined;
      const { variableLabel: _vl, ...restProps } = editModalVariableProps;
      const variableProps = editingElement.type === 'variable' ? { ...restProps, variableLabel } : {};
      setElements(prev => prev.map(el => 
        el.id === editingElement.id 
          ? { ...el, content: editModalContent, ...variableProps }
          : el
      ));
      setShowEditModal(false);
      setEditingElement(null);
      setEditModalContent('');
      setEditModalVariableProps({});
    }
  };

  const handleCancelEdit = () => {
    setShowEditModal(false);
    setEditingElement(null);
    setEditModalContent('');
    setEditModalVariableProps({});
  };

  // ========= Gestion des Patients =========

  const handleOpenPatientsModal = () => {
    // En mode édition : juste insérer un tableau vide/placeholder
    if (!isPreviewMode) {
      const newElement: Element = {
        id: `table_patients_${Date.now()}`,
        type: 'table',
        x: 50,
        y: 100,
        width: 700,
        height: 200,
        content: 'Tableau des Patients',
        fontSize: 11,
        fontFamily: 'Arial, sans-serif',
        color: '#000000',
        backgroundColor: '#ffffff',
        borderColor: '#2c3e50',
        borderWidth: 1,
        borderRadius: 0,
        rotation: 0,
        zIndex: elements.length,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        tableData: [],
        tableColumns: getPlaceholderTableColumnKeys('patient'),
        tableHeaderBg: themes[themeNumber].primary,
        tableHeaderColor: '#ffffff',
        tableBorderColor: '#dee2e6',
        tableStripedRows: true
      };
      
      setElements(prev => [...prev, newElement]);
      return;
    }
    
    // En mode aperçu : ouvrir le modal pour sélectionner les patients
    setShowPatientsModal(true);
  };

  // Charger les patients uniquement en fonction de la recherche (optimisation mémoire)
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Déclencher la recherche avec un délai (debounce) pour éviter trop d'appels API
  useEffect(() => {
    if (!showPatientsModal) return;

    // Annuler le timeout précédent
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const query = patientsSearchQuery?.trim() || '';
    // Si la recherche est vide : charger une liste initiale (ex: "a" pour avoir des résultats)
    if (query.length < 1) {
      searchPatients('a');
      return;
    }

    // Attendre 300ms après la dernière frappe avant de chercher
    searchTimeoutRef.current = setTimeout(() => {
      searchPatients(query);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [patientsSearchQuery, showPatientsModal]);

  const searchPatients = async (query: string) => {
    if (!query || query.trim().length < 1) return;

    setIsLoadingPatients(true);
    try {
      // Utiliser l'API de recherche améliorée au lieu de listerPatient
      const navTopController = NavTopController(theUser.pays || '');
      const patients = await navTopController.chercherPatients(
        String(theUser.tabId),
        query
      );
      
      // Mapper les données pour correspondre aux colonnes attendues
      const mappedPatients = patients.map((patient: any) => {
        let ageStr = '';
        try {
          if (patient.naissance) {
            const y = new Date(patient.naissance).getFullYear();
            if (!Number.isNaN(y)) ageStr = `${new Date().getFullYear() - y} ans`;
          }
        } catch {
          ageStr = '';
        }
        return {
          id: patient.id,
          nom: patient.nom || '',
          prenom: patient.prenom || '',
          naissance: patient.naissance || '',
          age: ageStr,
          adresse: patient.adresse || '',
          telephone: patient.telephone || '',
          email: patient.email || patient.login || '',
          login: patient.login || patient.email || '',
          profession: patient.profession || '',
          nomDeJeuneFille: patient.nomDeJeuneFille || '',
          adresserPar: patient.adresserPar || '',
          observation: patient.observation || '',
          dateCreation: patient.dateCreation || '',
          avoirAnnuelle: patient.avoirAnnuelle != null ? String(patient.avoirAnnuelle) : '',
          loggId: patient.loggId || '',
          role: patient.role || 'patient',
        };
      });
      
      // Appliquer un filtrage et tri amélioré côté frontend pour affiner les résultats
      const filteredAndSorted = filterAndSortResults(mappedPatients, query, 1);
      
      setPatientsData(filteredAndSorted);
      
      // Mettre à jour la liste des patients pour la modal des actes
      const patientsListSimple = filteredAndSorted.map((p: any) => ({
        id: p.id,
        nom: p.nom,
        prenom: p.prenom,
        telephone: p.telephone || '',
        email: p.email || '',
        nomDeJeuneFille: p.nomDeJeuneFille || ''
      }));
      setPatientsList(patientsListSimple);
      
    } catch (error) {
      console.error('Erreur recherche patients:', error);
      setPatientsData([]);
      // Erreur silencieuse, gérée par le système d'alertes du contexte si nécessaire
    } finally {
      setIsLoadingPatients(false);
    }
  };

  // Filtrer localement avec recherche améliorée (multi-critères et tri par pertinence)
  const filteredPatientsForSelection = React.useMemo(() => {
    if (!patientsSearchQuery || patientsSearchQuery.trim().length < 1) {
      return patientsData;
    }
    
    // Recherche multi-critères améliorée
    return filterAndSortResults(
      patientsData,
      patientsSearchQuery,
      1 // Score minimum pour afficher le résultat
    );
  }, [patientsData, patientsSearchQuery]);

  // Toggle sélection d'un patient (patient optionnel : si fourni, on le met en cache pour éviter de le perdre quand patientsData change)
  const togglePatientSelection = (patientId: string, patient?: any) => {
    const sid = String(patientId);
    setSelectedPatientsIds(prev => {
      const isSelected = prev.some(id => String(id) === sid);
      if (isSelected) {
        delete selectedPatientsMapRef.current[sid];
        return prev.filter(id => String(id) !== sid);
      }
      if (patient) selectedPatientsMapRef.current[sid] = patient;
      return [...prev, patientId];
    });
  };

  // Obtenir la liste des patients sélectionnés (priorité au cache, puis patientsData)
  const selectedPatientsList = React.useMemo(() => {
    const result: any[] = [];
    const idSet = new Set(selectedPatientsIds.map(id => String(id)));
    for (const id of selectedPatientsIds) {
      const sid = String(id);
      const cached = selectedPatientsMapRef.current[sid];
      if (cached) {
        result.push(cached);
      } else {
        const fromData = patientsData.find(p => String(p.id) === sid);
        if (fromData) result.push(fromData);
      }
    }
    return result;
  }, [selectedPatientsIds, patientsData]);

  const insertPatientsTable = () => {
    // Mode single : utiliser selectedSinglePatientId
    if (patientsModalMode === 'single') {
      if (!selectedSinglePatientId) {
        // Validation silencieuse - l'interface montre déjà qu'aucun patient n'est sélectionné
        return;
      }

      const selectedPatient = patientsData.find(p => p.id === selectedSinglePatientId);
      if (!selectedPatient) return;

      // Mettre à jour le patient pour les variables (index 1 par défaut)
      setSelectedPatient(selectedPatient);
      setSelectedPatientsByIndex({ 1: selectedPatient });

      // Si purpose = 'both', fermer ce modal et ouvrir le modal pour le tableau
      if (patientsModalPurpose === 'both') {
        setShowPatientsModal(false);
        setPatientsSearchQuery('');
        setPatientsData([]);
        setSelectedSinglePatientId('');
        
        // Ouvrir le modal en mode multiple pour le tableau
        setTimeout(() => {
          const empty = sortTableElementsByNumber(
            elementsRef.current.filter(
              (el) =>
                el.type === 'table' &&
                el.id.includes('patients') &&
                (!el.tableData || el.tableData.length === 0)
            )
          );
          if (empty.length > 0) {
            setSelectedElementId(empty[0].id);
          }
          setPatientsModalMode('multiple');
          setPatientsModalPurpose('table');
          setShowPatientsModal(true);
        }, 300);
        
        return;
      }

      // Si purpose = 'variables' uniquement, fermer et terminer
      setShowPatientsModal(false);
      setPatientsSearchQuery('');
      setPatientsData([]);
      setSelectedSinglePatientId('');
      
      // Patient sélectionné avec succès - pas besoin d'alerte, l'action est visible dans l'interface
      
      // Vérifier s'il y a des actes à traiter
      checkAndOpenActesModal(selectedPatient);
      
      return;
    }

    // Mode multiple : utiliser selectedPatientsIds
    if (selectedPatientsIds.length === 0) {
      // Validation silencieuse - l'interface montre déjà qu'aucun patient n'est sélectionné
      return;
    }

    // Mode multiple + purpose variables (ou both étape 1) : N patients pour indices #1, #2, ...
    if ((patientsModalPurpose === 'variables' || patientsModalPurpose === 'both') && requiredPatientIndices.length > 1) {
      const needed = requiredPatientIndices.length;
      if (selectedPatientsIds.length !== needed) return;
      // Préserver l'ordre de sélection : 1er sélectionné = #1, 2e = #2 (priorité cache, puis selectedPatientsList)
      const patientsToInsert = selectedPatientsIds
        .slice(0, needed)
        .map(id => {
          const sid = String(id);
          return selectedPatientsMapRef.current[sid]
            ?? selectedPatientsList.find((p: any) => String(p.id) === sid)
            ?? patientsData.find((p: any) => String(p.id) === sid);
        })
        .filter(Boolean);
      if (patientsToInsert.length !== needed) return;
      const byIndex: Record<number, any> = {};
      requiredPatientIndices.forEach((idx, i) => { byIndex[idx] = patientsToInsert[i]; });
      setSelectedPatientsByIndex(byIndex);
      setSelectedPatient(patientsToInsert[0]); // rétrocompat
      setShowPatientsModal(false);
      setSelectedPatientsIds([]);
      setPatientsData([]);
      setPatientsSearchQuery('');
      selectedPatientsMapRef.current = {};
      if (patientsModalPurpose === 'both') {
        setTimeout(() => {
          const empty = sortTableElementsByNumber(
            elementsRef.current.filter(
              (el) =>
                el.type === 'table' &&
                el.id.includes('patients') &&
                (!el.tableData || el.tableData.length === 0)
            )
          );
          if (empty.length > 0) {
            setSelectedElementId(empty[0].id);
          }
          setPatientsModalMode('multiple');
          setPatientsModalPurpose('table');
          setShowPatientsModal(true);
        }, 300);
      } else {
        checkAndOpenActesModal(patientsToInsert[0]);
      }
      return;
    }

    // Colonnes sélectionnées
    const columns = Object.entries(patientsColumns)
      .filter(([_, visible]) => visible)
      .map(([col, _]) => col);

    if (columns.length === 0) {
      // Validation silencieuse - l'interface montre déjà qu'aucune colonne n'est sélectionnée
      return;
    }

    // Données filtrées
    const patientsToInsert = patientsData.filter(patient => selectedPatientsIds.includes(patient.id));

    // Mettre à jour selectedPatient pour le rendu des variables (prendre le premier patient sélectionné)
    if (patientsToInsert.length > 0) {
      setSelectedPatient(patientsToInsert[0]);
    }

    // Un seul tableau patient à la fois (ordre # selon tableNumber / sélection courante)
    const emptyPatientsTables = sortTableElementsByNumber(
      elements.filter(
        (el) =>
          el.type === 'table' &&
          el.id.includes('patients') &&
          (!el.tableData || el.tableData.length === 0)
      )
    );
    const targetPatientTableId =
      selectedElementId && emptyPatientsTables.some((t) => t.id === selectedElementId)
        ? selectedElementId
        : emptyPatientsTables[0]?.id;

    if (emptyPatientsTables.length > 0 && targetPatientTableId) {
      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== targetPatientTableId) return el;
          if (
            el.type !== 'table' ||
            !el.id.includes('patients') ||
            (el.tableData && el.tableData.length > 0)
          ) {
            return el;
          }
          return {
            ...el,
            tableData: patientsToInsert,
            tableColumns: columns,
            width: Math.min(700, 100 + columns.length * 120),
            height: 50 + patientsToInsert.length * 35,
          };
        })
      );

      setShowPatientsModal(false);
      setSelectedPatientsIds([]);
      setPatientsData([]);
      setPatientsSearchQuery('');
      selectedPatientsMapRef.current = {};

      setTimeout(() => {
        const nextEmpty = sortTableElementsByNumber(
          elementsRef.current.filter(
            (el) =>
              el.type === 'table' &&
              el.id.includes('patients') &&
              (!el.tableData || el.tableData.length === 0)
          )
        );
        if (nextEmpty.length > 0) {
          setSelectedElementId(nextEmpty[0].id);
          setPatientsModalMode('multiple');
          setPatientsModalPurpose('table');
          setShowPatientsModal(true);
    } else {
          checkAndOpenActesModal(patientsToInsert[0]);
        }
      }, 300);
      return;
    }

    // Aucun emplacement vide : créer un nouveau tableau
      const newElement: Element = {
        id: `table_patients_${Date.now()}`,
        type: 'table',
        x: 50,
        y: 100,
      width: Math.min(700, 100 + columns.length * 120),
      height: 50 + patientsToInsert.length * 35,
        content: 'Tableau des Patients',
        fontSize: 11,
        fontFamily: 'Arial, sans-serif',
        color: '#000000',
        backgroundColor: '#ffffff',
        borderColor: '#2c3e50',
        borderWidth: 1,
        borderRadius: 0,
        rotation: 0,
        zIndex: elements.length,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        tableData: patientsToInsert,
        tableColumns: columns,
        tableHeaderBg: themes[themeNumber].primary,
        tableHeaderColor: '#ffffff',
        tableBorderColor: '#dee2e6',
      tableStripedRows: true,
      };

    setElements((prev) => [...prev, newElement]);

    setShowPatientsModal(false);
    setSelectedPatientsIds([]);
    setPatientsData([]);
    setPatientsSearchQuery('');
    
    checkAndOpenActesModal(patientsToInsert[0]);
  };

  // Fonction pour vérifier et ouvrir le modal des actes si nécessaire
  const checkAndOpenActesModal = (patientToPreFill?: any) => {
    const els = elementsRef.current;
    const emptyActesTables = sortTableElementsByNumber(
      els.filter(
        (el) =>
      el.type === 'table' && 
      (!el.tableData || el.tableData.length === 0) && 
          isActeTableId(el.id)
      )
    );
    
    const hasActeVariables = els.some(
      (el) =>
      (el.type === 'text' || el.type === 'variable') && 
      el.content && 
      (el.content.includes('{{acte.') || el.content.includes('{{actes.'))
    );

    if (hasActeVariables || emptyActesTables.length > 0) {
      setTimeout(() => {
        if (hasActeVariables && emptyActesTables.length > 0) {
          setActesModalMode('single');
          setActesModalPurpose('both');
        } else if (hasActeVariables) {
          setActesModalMode('single');
          setActesModalPurpose('variables');
        } else {
          setActesModalMode('multiple');
          setActesModalPurpose('table');
        }
        
        if (emptyActesTables.length > 0) {
          setSelectedElementId(emptyActesTables[0].id);
        }
        // Pré-remplir le patient si on vient du modal patients
        const patient = patientToPreFill || selectedPatient;
        if (patient?.id) {
          setActesPatientId(patient.id);
          setActesPatientSearch(`${patient.nom || ''} ${patient.prenom || ''}`.trim());
        }
        setShowActesModal(true);
      }, 300);
    } else {
      checkAndOpenCollaborateursTableModalRef.current();
    }
  };

  const checkAndOpenCollaborateursTableModal = useCallback(() => {
    const emptyCollab = sortTableElementsByNumber(
      elementsRef.current.filter(
        (el) =>
          el.type === 'table' &&
          el.id.includes('collaborateurs') &&
          (!el.tableData || el.tableData.length === 0)
      )
    );
    if (emptyCollab.length > 0) {
      window.setTimeout(() => {
        setSelectedElementId(emptyCollab[0].id);
        setCollaborateursTableModalSearch('');
        const by = selectedCollaborateursByIndexRef.current;
        const prefilledIds = Object.keys(by)
          .map(Number)
          .sort((a, b) => a - b)
          .map((idx) => by[idx]?.id)
          .filter((id): id is string => Boolean(id && String(id).trim() !== ''));
        setSelectedCollaborateursTableIds(prefilledIds);
        setCollaborateursColumns(buildInitialTableColumnState('collaborateur'));
        setShowCollaborateursTableModal(true);
      }, 300);
    } else {
      scheduleEtatProfilModalsForPreviewRef.current();
    }
  }, []);

  checkAndOpenCollaborateursTableModalRef.current = checkAndOpenCollaborateursTableModal;

  // ========= Gestion des Actes =========

  const handleOpenActesModal = () => {
    // En mode édition : juste insérer un tableau vide/placeholder
    if (!isPreviewMode) {
      const newElement: Element = {
        id: `table_${Date.now()}`,
        type: 'table',
        x: 50,
        y: 100,
        width: 700,
        height: 200,
        content: 'Tableau des Actes',
        fontSize: 11,
        fontFamily: 'Arial, sans-serif',
        color: '#000000',
        backgroundColor: '#ffffff',
        borderColor: '#2c3e50',
        borderWidth: 1,
        borderRadius: 0,
        rotation: 0,
        zIndex: elements.length,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        tableData: [],
        tableColumns: getPlaceholderTableColumnKeys('acte'),
        tableHeaderBg: themes[themeNumber].primary,
        tableHeaderColor: '#ffffff',
        tableBorderColor: '#dee2e6',
        tableStripedRows: true
      };
      
      setElements(prev => [...prev, newElement]);
      return;
    }
    
    // En mode aperçu : ouvrir le modal pour sélectionner patient et actes
    const today = new Date();
    const lastMonth = new Date(today);
    lastMonth.setMonth(today.getMonth() - 1);
    
    setActesDateFin(today.toISOString().split('T')[0]);
    setActesDateDebut(lastMonth.toISOString().split('T')[0]);
    setShowActesModal(true);
  };

  // Fonction pour gérer le changement de recherche de patient (la recherche API est dans le useEffect)
  const handlePatientSearchChange = useCallback((value: string) => {
    setActesPatientSearch(value);
    setActesPatientId('');
    setShowPatientsSuggestions(value.trim().length > 0);
  }, []);

  // Fonction pour sélectionner un patient dans les suggestions
  const selectPatient = (patient: any) => {
    setActesPatientId(patient.id);
    setActesPatientSearch(`${patient.nom} ${patient.prenom}`);
    setShowPatientsSuggestions(false); // Cacher les suggestions après sélection
  };

  // Filtrer les patients selon la recherche avec recherche améliorée
  const filteredPatients = React.useMemo(() => {
    if (!actesPatientSearch || actesPatientSearch.trim().length < 1) {
      return [];
    }
    
    // Recherche multi-critères améliorée (nom, prénom, téléphone, email, ID)
    const results = multiCriteriaSearch(
      patientsList,
      actesPatientSearch,
      ['nom', 'prenom', 'telephone', 'email', 'id', 'nomDeJeuneFille']
    );
    
    // Trier par pertinence et limiter à 10 suggestions (augmenté de 5)
    return filterAndSortResults(results, actesPatientSearch, 1).slice(0, 10);
  }, [patientsList, actesPatientSearch]);

  const loadActesForPatient = async () => {
    // Utiliser actesPatientId ou, si vide, le patient unique correspondant à la recherche
    let patientIdToUse = actesPatientId;
    if (!patientIdToUse && actesPatientSearch?.trim() && filteredPatients.length === 1) {
      patientIdToUse = filteredPatients[0].id;
      setActesPatientId(patientIdToUse);
    }
    if (!patientIdToUse) {
      return;
    }

    setIsLoadingActes(true);
    try {
      const controller = PageEtatController(theUser.pays || '');
      const actes = await controller.listerLesActes('', patientIdToUse, 1000, String(theUser.tabId));
      
      
      if (!actes || !Array.isArray(actes)) {
        console.error('❌ Format de données invalide:', actes);
        // Erreur silencieuse, gérée par le système d'alertes du contexte si nécessaire
        return;
      }
      
      
      // Filtrer par dates si spécifiées
      let filteredActes = actes;
      if (actesDateDebut || actesDateFin) {
        filteredActes = actes.filter((item: any) => {
          // Accéder à la date dans la sous-structure
          const acteData = item.acte || item;
          const dateActe = new Date(acteData.date_creation || acteData.date);
          const debut = actesDateDebut ? new Date(actesDateDebut) : null;
          const fin = actesDateFin ? new Date(actesDateFin) : null;
          
          if (debut && fin) {
            return dateActe >= debut && dateActe <= fin;
          } else if (debut) {
            return dateActe >= debut;
          } else if (fin) {
            return dateActe <= fin;
          }
          return true;
        });
      }
      
      // Mapper les données pour correspondre aux colonnes attendues
      // La structure du backend est: { acte: {...}, assurance: {...}, facture: {...} }
      const mappedActes = filteredActes.map((item: any) => {
        const acteData = item.acte || item;
        const assuranceData = item.assurance || {};
        const factureData = item.facture || {};
        
        return {
          id: acteData.id || '',
          date: acteData.date || acteData.date_creation || '',
          nom: acteData.nomActe || acteData.nom || '',
          prix: acteData.prix != null ? String(acteData.prix) : '0',
          argentRecu: acteData.argentRecu != null ? String(acteData.argentRecu) : '0',
          argentRestant: acteData.argentRestant != null ? String(acteData.argentRestant) : '0',
          loggId: acteData.loggId || acteData.logg_id || '',
          posologieId: acteData.posologieId || acteData.posologie_id || '',
          quantite: acteData.quantite ? String(acteData.quantite) : '1',
          remise: acteData.remise ? String(acteData.remise) : '0',
          montantTotal: acteData.montantTotal ? String(acteData.montantTotal) : (acteData.prix != null ? String(acteData.prix) : '0'),
          description: acteData.description || '',
          statut: acteData.statut || 'En cours',
          dateCreation: acteData.dateCreation || acteData.date_creation || acteData.date || '',
          dateModification: acteData.date_modification || '',
          assuranceNom: assuranceData.nom || '',
          assuranceTaux: assuranceData.taux || assuranceData.pourcentage || '0',
          assuranceMontantPrisEnCharge: assuranceData.montantPrisEnCharge || '0',
          assuranceStatut: assuranceData.statut || '',
          factureNumero: factureData.numero || '',
          factureDateEmission: factureData.dateEmission || '',
          factureMontantTotal: factureData.montantTotal || factureData.prixActe || '0',
          factureStatutPaiement: factureData.statutPaiement || '',
          factureDatePaiement: factureData.datePaiement || '',
          factureModePaiement: factureData.modePaiement || ''
        };
      });
      setActesData(mappedActes);
    } catch (error) {
      console.error('❌ Erreur chargement actes:', error);
    } finally {
      setIsLoadingActes(false);
    }
  };

  const insertActesTable = () => {
    if (selectedActes.length === 0) {
      // Validation silencieuse - l'interface montre déjà qu'aucun acte n'est sélectionné
      return;
    }

    // Données filtrées
    const actesToInsert = actesData.filter(acte => selectedActes.includes(acte.id));

    // Mettre à jour les actes pour le rendu des variables
    setActes(actesToInsert);

    // Mode variables uniquement : pas de tableau, juste fermer
    if (actesModalPurpose === 'variables') {
      setShowActesModal(false);
      setSelectedActes([]);
      setActesData([]);
      checkAndOpenCollaborateursTableModalRef.current();
      return;
    }

    // Mode tableau (ou both) : colonnes requises
    const columns = Object.entries(actesColumns)
      .filter(([_, visible]) => visible)
      .map(([col, _]) => col);

    if (columns.length === 0) {
      // Validation silencieuse - l'interface montre déjà qu'aucune colonne n'est sélectionnée
      return;
    }

    const emptyActesTables = sortTableElementsByNumber(
      elements.filter(
        (el) =>
          el.type === 'table' &&
          isActeTableId(el.id) &&
          (!el.tableData || el.tableData.length === 0)
      )
    );
    const targetActesId =
      selectedElementId && emptyActesTables.some((t) => t.id === selectedElementId)
        ? selectedElementId
        : emptyActesTables[0]?.id;

    if (emptyActesTables.length > 0 && targetActesId) {
      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== targetActesId) return el;
          if (
            el.type !== 'table' ||
            !isActeTableId(el.id) ||
            (el.tableData && el.tableData.length > 0)
          ) {
            return el;
          }
          return {
            ...el,
            tableData: actesToInsert,
            tableColumns: columns,
            width: Math.min(700, 100 + columns.length * 120),
            height: 50 + actesToInsert.length * 35,
          };
        })
      );

      setShowActesModal(false);
      setSelectedActes([]);
      setActesData([]);

      setTimeout(() => {
        const nextEmpty = sortTableElementsByNumber(
          elementsRef.current.filter(
            (el) =>
              el.type === 'table' &&
              isActeTableId(el.id) &&
              (!el.tableData || el.tableData.length === 0)
          )
        );
        if (nextEmpty.length > 0) {
          setSelectedElementId(nextEmpty[0].id);
          setActesModalMode('multiple');
          setActesModalPurpose('table');
          setShowActesModal(true);
    } else {
          checkAndOpenCollaborateursTableModalRef.current();
        }
      }, 300);
      return;
    }

      const newElement: Element = {
        id: `table_${Date.now()}`,
        type: 'table',
        x: 50,
        y: 100,
      width: Math.min(700, 100 + columns.length * 120),
      height: 50 + actesToInsert.length * 35,
        content: 'Tableau des Actes',
        fontSize: 11,
        fontFamily: 'Arial, sans-serif',
        color: '#000000',
        backgroundColor: '#ffffff',
        borderColor: '#2c3e50',
        borderWidth: 1,
        borderRadius: 0,
        rotation: 0,
        zIndex: elements.length,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        tableData: actesToInsert,
        tableColumns: columns,
        tableHeaderBg: themes[themeNumber].primary,
        tableHeaderColor: '#ffffff',
        tableBorderColor: '#dee2e6',
      tableStripedRows: true,
      };

    setElements((prev) => [...prev, newElement]);

    setShowActesModal(false);
    setSelectedActes([]);
    setActesData([]);
    checkAndOpenCollaborateursTableModalRef.current();
  };

  const handleOpenCollaborateursTableModal = () => {
    if (!isPreviewMode) {
      const newElement: Element = {
        id: `table_collaborateurs_${Date.now()}`,
        type: 'table',
        x: 50,
        y: 100,
        width: 700,
        height: 200,
        content: 'Tableau des Collaborateurs',
        fontSize: 11,
        fontFamily: 'Arial, sans-serif',
        color: '#000000',
        backgroundColor: '#ffffff',
        borderColor: '#2c3e50',
        borderWidth: 1,
        borderRadius: 0,
        rotation: 0,
        zIndex: elements.length,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        tableData: [],
        tableColumns: getPlaceholderTableColumnKeys('collaborateur'),
        tableHeaderBg: themes[themeNumber].primary,
        tableHeaderColor: '#ffffff',
        tableBorderColor: '#dee2e6',
        tableStripedRows: true,
      };
      setElements((prev) => [...prev, newElement]);
      return;
    }
    setCollaborateursTableModalSearch('');
    const by = selectedCollaborateursByIndexRef.current;
    const prefilledIds = Object.keys(by)
      .map(Number)
      .sort((a, b) => a - b)
      .map((idx) => by[idx]?.id)
      .filter((id): id is string => Boolean(id && String(id).trim() !== ''));
    setSelectedCollaborateursTableIds(prefilledIds);
    setCollaborateursColumns(buildInitialTableColumnState('collaborateur'));
    setShowCollaborateursTableModal(true);
  };

  const handleCloseCollaborateursTablePreviewModal = useCallback(() => {
    setShowCollaborateursTableModal(false);
    setCollaborateursTableModalList([]);
    setSelectedCollaborateursTableIds([]);
    setCollaborateursTableModalSearch('');
    scheduleEtatProfilModalsForPreviewRef.current();
  }, []);

  const insertCollaborateursTable = () => {
    if (selectedCollaborateursTableIds.length === 0) return;
    const columns = Object.entries(collaborateursColumns)
      .filter(([_, visible]) => visible)
      .map(([col]) => col);
    if (columns.length === 0) return;

    const staffById = new Map(collaborateursTableModalList.map((r) => [r.id, r]));
    const rowsToInsert = selectedCollaborateursTableIds
      .map((id) => staffById.get(id))
      .filter(Boolean) as EtatStaffRow[];
    if (rowsToInsert.length === 0) return;

    const tableRows: Record<string, string>[] = rowsToInsert.map((row) => {
      const o: Record<string, string> = {};
      for (const c of columns) {
        o[c] = String((row as unknown as Record<string, unknown>)[c] ?? '');
      }
      return o;
    });

    const emptyCollabTables = sortTableElementsByNumber(
      elements.filter(
        (el) =>
          el.type === 'table' &&
          el.id.includes('collaborateurs') &&
          (!el.tableData || el.tableData.length === 0)
      )
    );
    const targetCollabId =
      selectedElementId && emptyCollabTables.some((t) => t.id === selectedElementId)
        ? selectedElementId
        : emptyCollabTables[0]?.id;

    if (emptyCollabTables.length > 0 && targetCollabId) {
      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== targetCollabId) return el;
          if (
            el.type !== 'table' ||
            !el.id.includes('collaborateurs') ||
            (el.tableData && el.tableData.length > 0)
          ) {
            return el;
          }
          return {
            ...el,
            tableData: tableRows,
            tableColumns: columns,
            width: Math.min(700, 100 + columns.length * 120),
            height: 50 + tableRows.length * 35,
          };
        })
      );

      setShowCollaborateursTableModal(false);
      setCollaborateursTableModalList([]);
      setSelectedCollaborateursTableIds([]);
      setCollaborateursTableModalSearch('');

      setTimeout(() => {
        const nextEmpty = sortTableElementsByNumber(
          elementsRef.current.filter(
            (el) =>
              el.type === 'table' &&
              el.id.includes('collaborateurs') &&
              (!el.tableData || el.tableData.length === 0)
          )
        );
        if (nextEmpty.length > 0) {
          setSelectedElementId(nextEmpty[0].id);
          setCollaborateursTableModalSearch('');
          setSelectedCollaborateursTableIds([]);
          setCollaborateursColumns(buildInitialTableColumnState('collaborateur'));
          setShowCollaborateursTableModal(true);
        } else {
          scheduleEtatProfilModalsForPreviewRef.current();
        }
      }, 300);
      return;
    }

    const newElement: Element = {
      id: `table_collaborateurs_${Date.now()}`,
      type: 'table',
      x: 50,
      y: 100,
      width: Math.min(700, 100 + columns.length * 120),
      height: 50 + tableRows.length * 35,
      content: 'Tableau des Collaborateurs',
      fontSize: 11,
      fontFamily: 'Arial, sans-serif',
      color: '#000000',
      backgroundColor: '#ffffff',
      borderColor: '#2c3e50',
      borderWidth: 1,
      borderRadius: 0,
      rotation: 0,
      zIndex: elements.length,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      tableData: tableRows,
      tableColumns: columns,
      tableHeaderBg: themes[themeNumber].primary,
      tableHeaderColor: '#ffffff',
      tableBorderColor: '#dee2e6',
      tableStripedRows: true,
    };
    setElements((prev) => [...prev, newElement]);

    setShowCollaborateursTableModal(false);
    setCollaborateursTableModalList([]);
    setSelectedCollaborateursTableIds([]);
    setCollaborateursTableModalSearch('');
    scheduleEtatProfilModalsForPreviewRef.current();
  };

  // ========= Export / Import =========

  const handleOpenExportModal = () => {
    // Générer un nom par défaut
    const defaultName = `etat_${new Date().toISOString().split('T')[0]}`;
    setExportFileName(defaultName);
    setExportFilePath('');
    setShowExportModal(true);
  };

  const handleExportJSON = async () => {
    if (!exportFileName.trim()) {
      // Validation silencieuse - l'interface montre déjà qu'aucun nom n'est fourni
      return;
    }

    const fileName = exportFileName.endsWith('.json') 
      ? exportFileName 
      : `${exportFileName}.json`;

    const dataStr = JSON.stringify(elements, null, 2);
    const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

    if (isTauri) {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const filePath = await save({
          filters: [{ name: "JSON", extensions: ["json"] }],
          defaultPath: fileName,
        });
        if (filePath) {
          await writeTextFile(filePath, dataStr);
        }
      } catch (e) {
        console.error(e);
        setAlertObj({
          type: "error",
          show: true,
          text: "Export JSON impossible depuis le bureau. Réessayez ou ouvrez la page dans le navigateur.",
        });
        return;
      }
    } else {
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    setShowExportModal(false);
    setExportFileName('');
    setExportFilePath('');

    // Fichier exporté avec succès - pas besoin d'alerte, l'action est visible dans l'interface
  };

  const exportToJSON = async () => {
    const dataStr = JSON.stringify(elements, null, 2);
    const defaultName = `etat_${Date.now()}.json`;
    const isTauri = typeof window !== "undefined" && "__TAURI__" in window;
    if (isTauri) {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const filePath = await save({
          filters: [{ name: "JSON", extensions: ["json"] }],
          defaultPath: defaultName,
        });
        if (filePath) {
          await writeTextFile(filePath, dataStr);
        }
      } catch (e) {
        console.error(e);
        setAlertObj({ type: "error", show: true, text: "Export JSON impossible." });
      }
      return;
    }
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFromJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target?.result as string);
          setElements(imported);
        } catch (err) {
          // Erreur silencieuse, gérée par le système d'alertes du contexte si nécessaire
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // ========= Rendu =========

  /** Rend un texte en mettant les variables inexistantes {{<X>:"inexistant"}} en gras et rouge */
  const renderTextWithInexistant = (content: string): React.ReactNode => {
    const regex = /\{\{<[^>]+>:"inexistant"\}\}/g;
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let key = 0;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        result.push(content.slice(lastIndex, match.index));
      }
      result.push(
        <span key={`inex-${key++}`} style={{ fontWeight: 'bold', color: '#c62828' }}>{match[0]}</span>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      result.push(content.slice(lastIndex));
    }
    return result.length === 1 ? result[0] : <>{result}</>;
  };

  const renderElement = (element: Element, previewMode: boolean = false, pageIndex: number = 0) => {
    const isSelected = !previewMode && element.id === selectedElementId;
    const isMultiSelected = !previewMode && selectedElementIds.includes(element.id) && selectedElementIds.length > 1;
    
    // Ajuster les positions pour s'assurer qu'elles restent strictement dans les limites
    // Les éléments ne peuvent JAMAIS être visibles en dehors de la feuille blanche
    const maxHeight = getMaxSheetHeight();
    const elemHeight = element.height ?? 20;
    const adjustedX = Math.max(0, Math.min(A4_WIDTH - element.width, element.x));
    const adjustedY = Math.max(0, Math.min(maxHeight - elemHeight, element.y));
    
    // Ajuster les dimensions si nécessaire pour rester dans les limites
    const adjustedWidth = Math.min(element.width, A4_WIDTH - adjustedX);
    const useHeightByContent = element.heightByContent && (element.type === 'text' || element.type === 'variable');
    const adjustedHeight = useHeightByContent ? undefined : Math.min(element.height, A4_HEIGHT - adjustedY);
    
    const commonStyle: React.CSSProperties = {
      position: 'absolute',
      left: `${adjustedX}px`,
      top: `${adjustedY}px`,
      width: `${adjustedWidth}px`,
      ...(useHeightByContent ? { height: 'auto' as const, minHeight: '20px' } : { height: `${adjustedHeight}px` }),
      cursor: previewMode ? 'default' : (isDragging && draggedElement?.id === element.id ? 'grabbing' : 'pointer'),
      // Empêcher tout débordement visuel - les éléments ne peuvent pas dépasser
      overflow: 'hidden',
      // BoxShadow : priorité à la sélection, sinon boxShadow personnalisé de l'élément
      boxShadow: isSelected && !previewMode ? '0 0 10px rgba(33, 150, 243, 0.5)' : 
                 isMultiSelected ? '0 0 8px rgba(156, 39, 176, 0.5)' : 
                 element.boxShadow || 'none',
      zIndex: element.zIndex || 0,
      transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
      // Bordure de sélection (utiliser les propriétés détaillées)
      ...(isSelected && !previewMode ? {
        borderColor: '#2196f3',
        borderWidth: '2px',
        borderStyle: 'solid'
      } : isMultiSelected ? {
        borderColor: '#9c27b0',
        borderWidth: '2px',
        borderStyle: 'dashed'
      } : {})
    };

    switch (element.type) {
      case 'text':
        // En mode aperçu, remplacer les variables dans le texte aussi
        let textContent = element.content;
        if (previewMode) {
          // Remplacer toutes les variables {{xxx}} dans le texte
          textContent = element.content.replace(/\{\{([^}]+)\}\}/g, (match, varPath) => {
            return renderVariableValue(match);
          });
        }

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
              // Bordure de l'élément (override commonStyle si nécessaire)
              ...(!isSelected && {
                borderColor: element.borderColor,
                borderWidth: element.borderWidth ? `${element.borderWidth}px` : '0px',
                borderStyle: element.borderWidth ? 'solid' : 'none'
              }),
              borderRadius: element.borderRadius,
              padding: '5px',
              overflow: 'auto', // Permettre le scroll pour les longs textes
              whiteSpace: 'pre-wrap', // Respecter les sauts de ligne
              userSelect: previewMode ? 'text' : 'none'
            }}
            onMouseDown={previewMode ? undefined : (e) => handleMouseDown(e, element)}
            onClick={previewMode ? undefined : (e) => e.stopPropagation()}
            onDoubleClick={previewMode ? undefined : (e) => handleDoubleClick(e, element)}
          >
            {previewMode ? renderTextWithInexistant(textContent) : textContent}
                </div>
        );

      case 'variable':
        // En mode aperçu : valeur résolue. En édition : contenu tel quel (format {{path #N}})
        let displayValue = element.content;
        if (previewMode) {
          displayValue = renderVariableValue(element.content, element.variableLabel);
        }
        // Rétrocompat : si ancien format {{path}} avec variableLabel externe, afficher {{path #N}}
        else if (element.variableLabel && !element.content?.includes(' #')) {
          const basePath = getBasePathFromContent(element.content || '');
          displayValue = buildVariableContent(basePath, element.variableLabel);
        }

        const parsedVarForQr = parseVariableContent(element.content, element.variableLabel);
        const isQrcodeImgPreview =
          previewMode &&
          Boolean(parsedVarForQr?.basePath.startsWith('qrcode.')) &&
          typeof displayValue === 'string' &&
          displayValue.startsWith('data:image');

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
              backgroundColor: previewMode ? 'rgba(0,0,0,0)' : (element.backgroundColor || '#e3f2fd'),
              // Bordure de l'élément (override commonStyle si nécessaire)
              ...(!isSelected && {
                borderColor: previewMode ? 'rgba(0,0,0,0)' : (element.borderColor || '#2196f3'),
                borderWidth: previewMode ? '0px' : `${element.borderWidth || 1}px`,
                borderStyle: !previewMode && element.borderWidth ? 'solid' : 'none'
              }),
              borderRadius: element.borderRadius,
              padding: '5px',
              /* Aperçu : posologie / ordonnance et autres champs multi-lignes — respecter \n (comme les éléments texte). */
              ...(previewMode
                ? isQrcodeImgPreview
                  ? {
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }
                  : {
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      display: 'block',
                    }
                : {
              overflow: 'hidden',
              display: 'flex',
                    alignItems: 'center',
                  }),
              userSelect: previewMode ? 'text' : 'none'
            }}
            onMouseDown={previewMode ? undefined : (e) => handleMouseDown(e, element)}
            onClick={previewMode ? undefined : (e) => e.stopPropagation()}
            onDoubleClick={previewMode ? undefined : (e) => handleDoubleClick(e, element)}
          >
            {isQrcodeImgPreview ? (
              <img
                src={displayValue}
                alt="QR code"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                draggable={false}
              />
            ) : previewMode && isInexistantFormat(String(displayValue)) ? (
              <span style={{ fontWeight: 'bold', color: '#c62828', whiteSpace: 'inherit' }}>{displayValue}</span>
            ) : (
              displayValue
            )}
                </div>
        );

      case 'image':
        return (
          <img
            key={element.id}
            src={element.content}
            alt=""
            style={{
              ...commonStyle,
              objectFit: 'cover'
            }}
            onMouseDown={previewMode ? undefined : (e) => handleMouseDown(e, element)}
            onClick={previewMode ? undefined : (e) => e.stopPropagation()}
            draggable={false}
          />
        );

      case 'shape':
        return (
          <div
            key={element.id}
            style={{
              ...commonStyle,
              backgroundColor: element.backgroundColor,
              // Bordure de l'élément (override commonStyle si nécessaire)
              ...(!isSelected && {
                borderColor: element.borderColor,
                borderWidth: `${element.borderWidth}px`,
                borderStyle: 'solid'
              }),
              borderRadius: `${element.borderRadius}%`
            }}
            onMouseDown={previewMode ? undefined : (e) => handleMouseDown(e, element)}
            onClick={previewMode ? undefined : (e) => e.stopPropagation()}
          />
        );

      case 'table': {
        const tableEntity = inferTableEntityFromElementId(element.id);
        // Si tableau vide en mode édition, afficher un message placeholder
        if (!previewMode && (!element.tableData || element.tableData.length === 0)) {
          return (
            <div
              key={element.id}
              style={{
                ...commonStyle,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                backgroundColor: '#f8f9fa',
                border: '2px dashed #bdc3c7'
              }}
              onMouseDown={previewMode ? undefined : (e) => handleMouseDown(e, element)}
              onClick={previewMode ? undefined : (e) => e.stopPropagation()}
            >
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>📋</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#2c3e50', marginBottom: '5px' }}>
                {element.content || 'Tableau'}{element.tableNumber ? ` #${element.tableNumber}` : ''}
              </div>
              <div style={{ fontSize: '11px', color: '#7f8c8d', textAlign: 'center' }}>
                Passez en mode aperçu pour charger les données
              </div>
            </div>
          );
        }
        
        return (
          <div
            key={element.id}
            style={{
              ...commonStyle,
              overflow: 'auto',
              padding: '0'
            }}
            onMouseDown={previewMode ? undefined : (e) => handleMouseDown(e, element)}
            onClick={previewMode ? undefined : (e) => e.stopPropagation()}
          >
            {(element.content || element.tableNumber) && (
              <div style={{ fontSize: '12px', fontWeight: '600', color: element.color || '#2c3e50', marginBottom: '6px' }}>
                {element.content || 'Tableau'}{element.tableNumber ? ` #${element.tableNumber}` : ''}
              </div>
            )}
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: `${element.fontSize}px`,
              fontFamily: element.fontFamily,
              color: element.color
            }}>
              <thead>
                <tr style={{
                  backgroundColor: element.tableHeaderBg || themes[themeNumber].primary,
                  color: element.tableHeaderColor || '#ffffff'
                }}>
                  {element.tableColumns?.map((col, idx) => (
                    <th key={idx} style={{
                      padding: '8px',
                      textAlign: 'left',
                      borderBottom: `2px solid ${element.tableBorderColor || '#dee2e6'}`,
                      fontWeight: 'bold',
                      fontSize: `${(element.fontSize || 11) + 1}px`
                    }}>
                      {getTableColumnLabel(tableEntity, col).toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {element.tableData && element.tableData.length > 0 ? (
                  element.tableData.map((row, rowIdx) => (
                    <tr key={rowIdx} style={{
                      backgroundColor: element.tableStripedRows && rowIdx % 2 === 1 
                        ? '#f8f9fa' 
                        : element.backgroundColor || '#ffffff'
                    }}>
                      {element.tableColumns?.map((col, colIdx) => (
                        <td key={colIdx} style={{
                          padding: '8px',
                          borderBottom: `1px solid ${element.tableBorderColor || '#dee2e6'}`,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {isForbiddenEtatVariableKey(col) ? '—' : row[col] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={element.tableColumns?.length || 1} style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: '#7f8c8d',
                      fontStyle: 'italic'
                    }}>
                      Aucune donnée disponible
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      }

      default:
        return null;
    }
  };

  // ========= Impression avec rendu des variables =========

  const handlePrint = () => {
    // Vérifier qu'on est en mode aperçu
    if (!isPreviewMode) {
      // Validation silencieuse - l'interface montre déjà qu'on n'est pas en mode aperçu
      return;
    }
    
    // Utiliser le mode de rendu actuel pour déterminer le nombre de pages
    let pagesToPrint: number;
    let elementsToPrint: Element[];
    
    if (renderMode === 'EXTENSIBLE') {
      // En mode extensible, calculer le nombre de pages nécessaires pour l'impression
      // (on divise la hauteur totale par la hauteur A4)
      const totalHeight = extensibleSheet.sheetHeight;
      pagesToPrint = Math.max(1, Math.ceil(totalHeight / A4_HEIGHT));
      elementsToPrint = extensibleSheet.adjustedElements.length > 0 ? extensibleSheet.adjustedElements : elements;
    } else {
      // En mode paginé, utiliser les pages calculées
      pagesToPrint = pagination.totalPages;
      elementsToPrint = elements;
    }
    
    // Générer le contenu HTML pour toutes les pages
    let printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Impression - État Médical</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          
          body {
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .print-page {
            width: 794px;
            height: 1123px;
            position: relative;
            background: white;
            page-break-after: always;
            margin-bottom: 0;
          }
          
          .print-page:last-child {
            page-break-after: auto;
          }
          
          @media print {
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .print-page {
              page-break-after: always;
            }
            .print-page:last-child {
              page-break-after: auto;
            }
          }
        </style>
      </head>
      <body>
        ${renderMode === 'PAGED' && pagination.pages.length > 0 ? (
          // Mode PAGED : utiliser les pages paginées
          pagination.pages.map((page, pageIndex) => {
            const pageElements = page.elements;
            return `
              <div class="print-page">
                ${pageElements.map(el => {
                  const content = el.type === 'variable' ? renderVariableValue(el.content, el.variableLabel) : el.content;
                
                if (el.type === 'image') {
                  return `<img src="${el.content}" style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;transform:rotate(${el.rotation || 0}deg);z-index:${el.zIndex || 0};box-shadow:${el.boxShadow || 'none'};" />`;
                } else if (el.type === 'shape') {
                  return `<div style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;background-color:${el.backgroundColor || 'transparent'};border:${el.borderWidth || 0}px solid ${el.borderColor || 'transparent'};border-radius:${el.borderRadius || 0}%;transform:rotate(${el.rotation || 0}deg);z-index:${el.zIndex || 0};box-shadow:${el.boxShadow || 'none'};-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>`;
                } else if (el.type === 'table') {
                  // Tableau
                  const tableHTML = `
                    <div style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;overflow:auto;z-index:${el.zIndex || 0};box-shadow:${el.boxShadow || 'none'};">
                      <table style="width:100%;border-collapse:collapse;font-size:${el.fontSize || 11}px;font-family:${el.fontFamily || 'Arial'};color:${el.color || '#000000'};-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                        <thead>
                          <tr style="background-color:${el.tableHeaderBg || '#2c3e50'};color:${el.tableHeaderColor || '#ffffff'};-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                            ${el.tableColumns?.map(col => `<th style="padding:8px;text-align:left;border-bottom:2px solid ${el.tableBorderColor || '#dee2e6'};font-weight:bold;font-size:${(el.fontSize || 11) + 1}px;">${getTableColumnLabel(inferTableEntityFromElementId(el.id), col).toUpperCase()}</th>`).join('')}
                          </tr>
                        </thead>
                        <tbody>
                          ${el.tableData?.map((row, idx) => `
                            <tr style="background-color:${el.tableStripedRows && idx % 2 === 1 ? '#f8f9fa' : (el.backgroundColor || '#ffffff')};-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                              ${el.tableColumns?.map(col => `<td style="padding:8px;border-bottom:1px solid ${el.tableBorderColor || '#dee2e6'};white-space:nowrap;">${isForbiddenEtatVariableKey(col) ? '—' : (row[col] || '-')}</td>`).join('')}
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  `;
                  return tableHTML;
                } else {
                  // Texte et Variable
                  return `<div style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;font-size:${el.fontSize || 14}px;font-family:${el.fontFamily || 'Arial'};color:${el.color || '#000000'};font-weight:${el.fontWeight || 'normal'};font-style:${el.fontStyle || 'normal'};text-decoration:${el.textDecoration || 'none'};text-align:${el.textAlign || 'left'};background-color:${el.backgroundColor || 'transparent'};border-color:${el.borderColor || 'transparent'};border-width:${el.borderWidth || 0}px;border-style:${el.borderWidth ? 'solid' : 'none'};border-radius:${el.borderRadius || 0}px;padding:5px;transform:rotate(${el.rotation || 0}deg);z-index:${el.zIndex || 0};box-shadow:${el.boxShadow || 'none'};white-space:pre-wrap;overflow:auto;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${content}</div>`;
                  }
                }).join('')}
              </div>
            `;
          }).join('')
        ) : (
          // Mode EXTENSIBLE : diviser en pages A4 pour l'impression
          (() => {
            const totalHeight = extensibleSheet.sheetHeight;
            const pagesNeeded = Math.max(1, Math.ceil(totalHeight / A4_HEIGHT));
            
            return Array.from({ length: pagesNeeded }, (_, pageIndex) => {
              const pageStartY = pageIndex * A4_HEIGHT;
              const pageEndY = (pageIndex + 1) * A4_HEIGHT;
              
              // Filtrer les éléments qui appartiennent à cette page
              const pageElements = elementsToPrint.filter(el => {
                const elBottom = el.y + (el.height || 0);
                const elTop = el.y;
                // L'élément appartient à la page s'il chevauche la zone de la page
                return (elTop < pageEndY && elBottom > pageStartY);
              });
              
              return `
                <div class="print-page">
                  ${pageElements.map(el => {
                    // Ajuster les positions relatives à la page
                    const adjustedY = el.y - pageStartY;
                    const adjustedEl = { ...el, y: adjustedY };
                    
                    const content = adjustedEl.type === 'variable' ? renderVariableValue(adjustedEl.content, adjustedEl.variableLabel) : adjustedEl.content;
                    
                    if (adjustedEl.type === 'image') {
                      return `<img src="${adjustedEl.content}" style="position:absolute;left:${adjustedEl.x}px;top:${adjustedEl.y}px;width:${adjustedEl.width}px;height:${adjustedEl.height}px;transform:rotate(${adjustedEl.rotation || 0}deg);z-index:${adjustedEl.zIndex || 0};box-shadow:${adjustedEl.boxShadow || 'none'};" />`;
                    } else if (adjustedEl.type === 'shape') {
                      return `<div style="position:absolute;left:${adjustedEl.x}px;top:${adjustedEl.y}px;width:${adjustedEl.width}px;height:${adjustedEl.height}px;background-color:${adjustedEl.backgroundColor || 'transparent'};border:${adjustedEl.borderWidth || 0}px solid ${adjustedEl.borderColor || 'transparent'};border-radius:${adjustedEl.borderRadius || 0}%;transform:rotate(${adjustedEl.rotation || 0}deg);z-index:${adjustedEl.zIndex || 0};box-shadow:${adjustedEl.boxShadow || 'none'};-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>`;
                    } else if (adjustedEl.type === 'table') {
                      const tableHTML = `
                        <div style="position:absolute;left:${adjustedEl.x}px;top:${adjustedEl.y}px;width:${adjustedEl.width}px;height:${adjustedEl.height}px;overflow:auto;z-index:${adjustedEl.zIndex || 0};box-shadow:${adjustedEl.boxShadow || 'none'};">
                          <table style="width:100%;border-collapse:collapse;font-size:${adjustedEl.fontSize || 11}px;font-family:${adjustedEl.fontFamily || 'Arial'};color:${adjustedEl.color || '#000000'};-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                            <thead>
                              <tr style="background-color:${adjustedEl.tableHeaderBg || '#2c3e50'};color:${adjustedEl.tableHeaderColor || '#ffffff'};-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                                ${adjustedEl.tableColumns?.map(col => `<th style="padding:8px;text-align:left;border-bottom:2px solid ${adjustedEl.tableBorderColor || '#dee2e6'};font-weight:bold;font-size:${(adjustedEl.fontSize || 11) + 1}px;">${getTableColumnLabel(inferTableEntityFromElementId(adjustedEl.id), col).toUpperCase()}</th>`).join('')}
                              </tr>
                            </thead>
                            <tbody>
                              ${adjustedEl.tableData?.map((row, idx) => `
                                <tr style="background-color:${adjustedEl.tableStripedRows && idx % 2 === 1 ? '#f8f9fa' : (adjustedEl.backgroundColor || '#ffffff')};-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                                  ${adjustedEl.tableColumns?.map(col => `<td style="padding:8px;border-bottom:1px solid ${adjustedEl.tableBorderColor || '#dee2e6'};white-space:nowrap;">${isForbiddenEtatVariableKey(col) ? '—' : (row[col] || '-')}</td>`).join('')}
                                </tr>
                              `).join('')}
                            </tbody>
                          </table>
                        </div>
                      `;
                      return tableHTML;
                    } else {
                      return `<div style="position:absolute;left:${adjustedEl.x}px;top:${adjustedEl.y}px;width:${adjustedEl.width}px;height:${adjustedEl.height}px;font-size:${adjustedEl.fontSize || 14}px;font-family:${adjustedEl.fontFamily || 'Arial'};color:${adjustedEl.color || '#000000'};font-weight:${adjustedEl.fontWeight || 'normal'};font-style:${adjustedEl.fontStyle || 'normal'};text-decoration:${adjustedEl.textDecoration || 'none'};text-align:${adjustedEl.textAlign || 'left'};background-color:${adjustedEl.backgroundColor || 'transparent'};border-color:${adjustedEl.borderColor || 'transparent'};border-width:${adjustedEl.borderWidth || 0}px;border-style:${adjustedEl.borderWidth ? 'solid' : 'none'};border-radius:${adjustedEl.borderRadius || 0}px;padding:5px;transform:rotate(${adjustedEl.rotation || 0}deg);z-index:${adjustedEl.zIndex || 0};box-shadow:${adjustedEl.boxShadow || 'none'};white-space:pre-wrap;overflow:auto;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${content}</div>`;
                    }
                  }).join('')}
                </div>
              `;
            }).join('')
          })()
        )}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      return;
    }

    // Fenêtre nulle (Tauri / bloqueur de pop-ups) : iframe cachée + print()
    const printHtmlSansScript = printContent.replace(/<script>[\s\S]*?<\/script>\s*/i, "");
    try {
      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      Object.assign(iframe.style, {
        position: "fixed",
        right: "0",
        bottom: "0",
        width: "0",
        height: "0",
        border: "0",
        opacity: "0",
        pointerEvents: "none",
      });
      document.body.appendChild(iframe);
      const idoc = iframe.contentDocument;
      const iwin = iframe.contentWindow;
      if (!idoc || !iwin) {
        document.body.removeChild(iframe);
        setAlertObj({
          type: "warning",
          show: true,
          text: "Impossible d'ouvrir l'impression. Vérifiez les pop-ups ou réessayez.",
        });
        return;
      }
      idoc.open();
      idoc.write(printHtmlSansScript);
      idoc.close();
      const lancerImpression = () => {
        try {
          iwin.focus();
          iwin.print();
        } catch (e) {
          console.error(e);
        }
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch {
            /* ignore */
          }
        }, 60000);
      };
      setTimeout(lancerImpression, 200);
    } catch (e) {
      console.error(e);
      setAlertObj({
        type: "warning",
        show: true,
        text: "Impossible d'ouvrir l'impression (export PDF navigateur). Réessayez ou copiez le document.",
      });
    }
  };

    return (
    <div className="page-etat" style={{ backgroundColor: themes[themeNumber].tertiary, minHeight: '100vh' }}>
            <NavTop userId={userId ?? '0'} id={'nav-top'} tabId={tabId ?? '0'} pays={pays ?? ''} />
      
      {etatPageMode === "pending" ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "calc(100vh - 60px)",
            padding: "40px",
            color: themes[themeNumber].secondary,
          }}
        >
          Vérification des droits…
        </div>
      ) : etatPageMode === "consultation" ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "calc(100vh - 60px)",
            padding: "40px",
          }}
        >
          <div
            className="alert alert-info text-center"
            style={{
              maxWidth: "640px",
              fontSize: "16px",
              padding: "28px",
              boxShadow: "0 4px 6px rgba(0,0,0,0.08)",
            }}
          >
            <h4 className="mb-3">Accès consultation</h4>
            <p className="mb-2">
              Vous pouvez ouvrir cette page avec le droit « Voir les états » (pet01) ou l’ordonnance PDF (oso01), mais la
              création, la modification et l’impression des modèles nécessitent « Gérer les états » (pet02) ou le droit
              d’impression (prt01).
            </p>
            <p className="mb-0">Demandez au gestionnaire du cabinet d’ajouter l’un de ces codes si besoin.</p>
          </div>
        </div>
      ) : (
        <>
      {/* Bannière d'aide sélection multiple */}
      {!isPreviewMode && (
        <div className="page-etat-banner-astuce" style={{
          backgroundColor: '#f3e5f5',
          color: '#6a1b9a',
          padding: '8px 20px',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '15px',
          borderBottom: '2px solid #9c27b0'
        }}>
          <span style={{ fontWeight: 'bold' }}>💡 Astuce :</span>
          <span><kbd style={{ padding: '2px 6px', backgroundColor: 'white', borderRadius: '3px', border: '1px solid #9c27b0', color: '#000000' }}>Ctrl+Clic</kbd> = Sélection multiple</span>
          <span><kbd style={{ padding: '2px 6px', backgroundColor: 'white', borderRadius: '3px', border: '1px solid #9c27b0', color: '#000000' }}>Ctrl+A</kbd> = Tout sélectionner</span>
          <span><kbd style={{ padding: '2px 6px', backgroundColor: 'white', borderRadius: '3px', border: '1px solid #9c27b0', color: '#000000' }}>Suppr</kbd> = Supprimer</span>
          <span><kbd style={{ padding: '2px 6px', backgroundColor: 'white', borderRadius: '3px', border: '1px solid #9c27b0', color: '#000000' }}>Échap</kbd> = Désélectionner</span>
                </div>
      )}
      
      {/* Barre d'outils principale */}
      <div className="page-etat-toolbar" style={{
        backgroundColor: themes[themeNumber].primary,
        color: 'white',
        padding: '10px 20px',
        display: 'flex',
        flexWrap: 'nowrap',
        gap: '15px',
        alignItems: 'center',
        borderBottom: `3px solid ${themes[themeNumber].secondary}`,
        overflowX: 'auto',
        overflowY: 'hidden'
      }}>
        
        {/* Section Insertion */}
        <div style={{ display: 'flex', gap: '5px', borderRight: `2px solid ${themes[themeNumber].secondary}`, paddingRight: '15px', alignItems: 'center' }}>
          <button onClick={() => addTextElement()} style={toolbarButtonStyle} title="Ajouter du texte">
            <Type size={18} /> Texte
          </button>
          <button onClick={addImageElement} style={toolbarButtonStyle} title="Ajouter une image">
            <Image size={18} /> Image
          </button>
          <select
            onChange={(e) => {
              if (e.target.value) {
                addShapeElement(e.target.value as 'rectangle' | 'circle');
                e.target.value = ''; // Réinitialiser après sélection
              }
            }}
            style={toolbarSelectStyle}
            title="Ajouter une forme"
            defaultValue=""
          >
            <option value="" disabled>🔷 Formes</option>
            <option value="rectangle">▭ Rectangle</option>
            <option value="circle">⭕ Cercle</option>
          </select>
        </div>

        {/* Section Actions */}
        <div style={{ display: 'flex', gap: '5px', borderRight: `2px solid ${themes[themeNumber].secondary}`, paddingRight: '15px', alignItems: 'center' }}>
          {/* Compteur de sélection multiple */}
          {selectedElementIds.length > 1 && (
            <div style={{
              padding: '6px 10px',
              backgroundColor: '#9c27b0',
              color: 'white',
              borderRadius: '5px',
              fontSize: '13px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}>
              <Layers size={16} />
              {selectedElementIds.length} sélectionnés
            </div>
          )}
          
          <select
            onChange={(e) => {
              const action = e.target.value;
              if (action === 'duplicate') {
                duplicateElement();
              } else if (action === 'delete') {
                deleteElement();
              } else if (action === 'moveUp') {
                moveElementUp();
              } else if (action === 'moveDown') {
                moveElementDown();
              }
              e.target.value = ''; // Réinitialiser après action
            }}
            style={{
              ...toolbarSelectStyle,
              opacity: (!selectedElement && selectedElementIds.length === 0) ? 0.5 : 1,
              cursor: (!selectedElement && selectedElementIds.length === 0) ? 'not-allowed' : 'pointer'
            }}
            disabled={!selectedElement && selectedElementIds.length === 0}
            title="Actions sur l'élément sélectionné"
            defaultValue=""
          >
            <option value="" disabled>⚙️ Actions</option>
            <option value="duplicate" disabled={!selectedElement}>📋 Dupliquer</option>
            <option value="delete" disabled={!selectedElement && selectedElementIds.length === 0}>
              🗑️ Supprimer {selectedElementIds.length > 1 ? `(${selectedElementIds.length})` : ''}
            </option>
            <option value="moveUp" disabled={!selectedElement}>⬆️ Monter</option>
            <option value="moveDown" disabled={!selectedElement}>⬇️ Descendre</option>
          </select>
        </div>

        {/* Section Affichage */}
        <div style={{ display: 'flex', gap: '5px', borderRight: `2px solid ${themes[themeNumber].secondary}`, paddingRight: '15px', alignItems: 'center' }}>
          <span
            style={{ ...toolbarSelectStyle, display: 'inline-flex', alignItems: 'center', cursor: 'default' }}
            title="Mode de rendu : feuille extensible"
          >
            📄 Feuille extensible
          </span>
          <button onClick={() => setShowGrid(!showGrid)} style={toolbarButtonStyle} title={showGrid ? 'Masquer grille' : 'Afficher grille'}>
            {showGrid ? <Grid size={18} /> : <EyeOff size={18} />}
          </button>
          <button 
            onClick={() => {
              if (isPreviewMode) {
                setIsPreviewMode(false);
                return;
              }
              if (elementsContainPosologieOrOrdonnanceVariables(elements)) {
                window.alert(
                  "Les états contenant des variables de posologie ou d'ordonnance ne peuvent être créés que via la page des actes."
                );
                setIsPreviewMode(false);
                return;
              }
              setIsPreviewMode(true);
            }} 
            style={{
              ...toolbarButtonStyle, 
              backgroundColor: isPreviewMode ? '#27ae60' : '#34495e' 
            }} 
            title={isPreviewMode ? 'Retour édition' : 'Mode aperçu'}
          >
            {isPreviewMode ? <Eye size={18} /> : <Eye size={18} />} 
            {isPreviewMode ? 'Édition' : 'Aperçu'}
          </button>
        </div>

        {/* Section Zoom - 5% à 200% par pas de 5 */}
        <div style={{ display: 'flex', gap: '5px', borderRight: `2px solid ${themes[themeNumber].secondary}`, paddingRight: '15px', alignItems: 'center' }}>
          <select
            value={Math.min(200, Math.max(5, Math.round(zoomControls.zoom * 100 / 5) * 5))}
            onChange={(e) => {
              const zoomValue = parseInt(e.target.value) / 100;
              zoomControls.setZoom(zoomValue);
            }}
            style={toolbarSelectStyle}
            title="Niveau de zoom"
          >
            {Array.from({ length: 40 }, (_, i) => {
              const pct = 5 + i * 5;
              return <option key={pct} value={pct}>🔍 {pct}%</option>;
            })}
          </select>
          <button 
            onClick={zoomControls.zoomOut}
            style={{ ...toolbarButtonStyle, padding: '6px 10px' }} 
            title="Zoom - (ajustement fin)"
          >
            <ZoomOut size={16} />
          </button>
          <button 
            onClick={zoomControls.zoomIn} 
            style={{ ...toolbarButtonStyle, padding: '6px 10px' }} 
            title="Zoom + (ajustement fin)"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => {
              const container = canvasRef.current?.parentElement;
              if (container) {
                zoomControls.fitToPage(
                  container.clientWidth,
                  container.clientHeight,
                  A4_WIDTH,
                  A4_HEIGHT
                );
              }
            }}
            style={{ ...toolbarButtonStyle, padding: '6px 10px' }}
            title="Ajuster à la page"
          >
            📐 Fit
          </button>
        </div>

        {/* Section Pagination - Utilise le nouveau système de pagination (uniquement en mode PAGED) */}
        {renderMode === 'PAGED' && pagination.totalPages > 1 && (
          <div style={{ display: 'flex', gap: '5px', borderRight: `2px solid ${themes[themeNumber].secondary}`, paddingRight: '15px', alignItems: 'center' }}>
            <select
              value={currentPage}
              onChange={(e) => setCurrentPage(parseInt(e.target.value))}
              style={toolbarSelectStyle}
              title="Naviguer entre les pages"
            >
              {Array.from({ length: pagination.totalPages }, (_, i) => (
                <option key={i} value={i}>
                  📄 Page {i + 1} / {pagination.totalPages}
                </option>
              ))}
            </select>
            <button
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              style={{ 
                ...toolbarButtonStyle, 
                padding: '6px 10px',
                opacity: currentPage === 0 ? 0.5 : 1,
                cursor: currentPage === 0 ? 'not-allowed' : 'pointer'
              }}
              title="Page précédente"
            >
              <ArrowUp size={16} />
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(pagination.totalPages - 1, currentPage + 1))}
              disabled={currentPage === pagination.totalPages - 1}
              style={{ 
                ...toolbarButtonStyle, 
                padding: '6px 10px',
                opacity: currentPage === pagination.totalPages - 1 ? 0.5 : 1,
                cursor: currentPage === pagination.totalPages - 1 ? 'not-allowed' : 'pointer'
              }}
              title="Page suivante"
            >
              <ArrowDown size={16} />
            </button>
          </div>
        )}
        
        {/* Bouton Debug (optionnel) */}
        {!isPreviewMode && (
          <button
            onClick={() => setShowDebugInfo(!showDebugInfo)}
            style={{ 
              ...toolbarButtonStyle, 
              backgroundColor: showDebugInfo ? '#ff9800' : '#34495e',
              marginLeft: '10px'
            }}
            title="Mode debug pagination"
          >
            🐛 Debug
          </button>
        )}

        {/* Section Fichier */}
        <div style={{ display: 'flex', gap: '5px', marginLeft: 'auto', alignItems: 'center' }}>
          <select
            onChange={(e) => {
              const action = e.target.value;
              if (action === 'createTemplate') {
                setShowSaveTemplateModal(true);
              } else if (action === 'open') {
                importFromJSON();
              } else if (action === 'save') {
                handleOpenExportModal();
              } else if (action === 'print') {
                handlePrint();
              }
              e.target.value = ''; // Réinitialiser après action
            }}
            style={{
              ...toolbarSelectStyle,
              minWidth: '140px'
            }}
            title="Actions sur le fichier"
            defaultValue=""
          >
            <option value="" disabled>📁 Fichier</option>
            <option value="createTemplate" disabled={elements.length === 0}>
              📄 Créer modèle
            </option>
            <option value="open">📂 Ouvrir</option>
            <option value="save">💾 Sauvegarder</option>
            <option value="print">🖨️ Imprimer</option>
          </select>
        </div>
                            </div>

      {/* Barre d'info Mode Aperçu */}
      {isPreviewMode && (
        <div style={{
          backgroundColor: '#27ae60',
          color: 'white',
          padding: '10px 20px',
          textAlign: 'center',
          fontWeight: 'bold'
        }}>
          👁️ MODE APERÇU - Les variables sont rendues avec les données réelles
        </div>
      )}

      {/* Container principal */}
      <div className="page-etat-container" style={{ display: 'flex', height: 'calc(100vh - 140px)' }}>
        
        {/* Sidebar gauche - Propriétés & Calques (masqué en mode aperçu) */}
        {!isPreviewMode && (
          <div className="page-etat-sidebar-left" style={{
            width: '280px',
            backgroundColor: themes[themeNumber].secondary,
            padding: '15px',
            overflowY: 'auto',
            borderRight: `2px solid ${themes[themeNumber].primary}`
          }}>
            
            {/* Accordéon Propriétés - Toujours visible */}
            <div style={{ marginBottom: '10px' }}>
              <div 
                onClick={() => setAccordeonProprietes(!accordeonProprietes)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px',
                  backgroundColor: themes[themeNumber].primary,
                  color: themes[themeNumber].secondary,
                  borderRadius: '5px',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚙️</span> Propriétés
                </h3>
                {accordeonProprietes ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
              
              {accordeonProprietes && (
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: 'white', borderRadius: '5px' }}>
                  {!displayedElement ? (
                    <p style={{ 
                      color: themes[themeNumber].primary, 
                      fontSize: '12px', 
                      fontStyle: 'italic', 
                      margin: 0,
                      textAlign: 'center',
                      padding: '20px 10px'
                    }}>
                      Ajoutez un élément pour commencer
                    </p>
                        ) : (
                            <>
                  {/* Info élément affiché */}
                  {!selectedElement && displayedElement && (
                    <div style={{ 
                      padding: '8px', 
                      backgroundColor: '#fff3cd', 
                      border: '1px solid #ffc107',
                      borderRadius: '4px', 
                      marginBottom: '10px',
                      fontSize: '11px',
                      color: '#856404'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>
                        📌 Dernières valeurs affichées
                      </div>
                      <div style={{ fontSize: '10px' }}>
                        {displayedElement.type === 'text' && '📝 TEXT'} 
                        {displayedElement.type === 'image' && '🖼️ IMAGE'} 
                        {displayedElement.type === 'shape' && '🔷 SHAPE'} 
                        {displayedElement.type === 'variable' && '📊 VARIABLE'}
                        {displayedElement.type === 'variable' &&
                          (() => {
                            const pe = parseVariableContent(
                              displayedElement.content || '',
                              displayedElement.variableLabel
                            );
                            return pe && pe.index > 1 ? ` #${pe.index}` : '';
                          })()}
                        {' - '}
                        {displayedElement.content.substring(0, 20)}
                        {displayedElement.content.length > 20 ? '...' : ''}
                      </div>
                      <div style={{ fontSize: '9px', marginTop: '2px', fontStyle: 'italic' }}>
                        (Élément désélectionné - champs en lecture seule)
                      </div>
                    </div>
                  )}

                  {/* Position & Taille */}
                  <div style={{ marginBottom: '15px' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: themes[themeNumber].primary, fontWeight: 'bold' }}>📐 Position & Taille</h4>
                  
                    <label style={propertyLabelStyle}>
                      X:
                      <Input 
                        type="number" 
                        min="0"
                        max={A4_WIDTH}
                        value={Math.round(displayedElement.x || 0)} 
                        onChange={(e) => updateElementProperty('x', Number(e.target.value))}
                        style={propertyInputStyle}
                        disabled={!selectedElement}
                      />
                    </label>
                    
                    <label style={propertyLabelStyle}>
                      Y:
                      <Input 
                        type="number" 
                        min="0"
                        max={getMaxSheetHeight()}
                        value={Math.round(displayedElement.y || 0)} 
                        onChange={(e) => updateElementProperty('y', Number(e.target.value))}
                        style={propertyInputStyle}
                        disabled={!selectedElement}
                        title={`Position Y maximale: ${getMaxSheetHeight() - displayedElement.height}px`}
                      />
                    </label>

                    <label style={propertyLabelStyle}>
                      Largeur (max: {A4_WIDTH}px):
                      <Input 
                        type="number" 
                        min="10"
                        max={A4_WIDTH}
                        value={Math.round(displayedElement.width || 0)} 
                        onChange={(e) => updateElementProperty('width', Number(e.target.value))}
                        style={propertyInputStyle}
                        disabled={!selectedElement}
                        title={`Largeur maximale: ${A4_WIDTH}px (largeur de la feuille A4)`}
                      />
                    </label>

                    <label style={propertyLabelStyle}>
                      Hauteur (max: {getMaxSheetHeight()}px):
                      <Input 
                        type="number" 
                        min="10"
                        max={getMaxSheetHeight()}
                        value={Math.round(displayedElement.height || 0)} 
                        onChange={(e) => updateElementProperty('height', Number(e.target.value))}
                        style={propertyInputStyle}
                        disabled={!selectedElement || (!!displayedElement.heightByContent && (displayedElement.type === 'text' || displayedElement.type === 'variable'))}
                        title={displayedElement.heightByContent ? 'Désactivé : hauteur déterminée par le contenu' : `Hauteur maximale: ${getMaxSheetHeight()}px (hauteur de la feuille ${renderMode === 'EXTENSIBLE' ? 'extensible' : 'A4'})`}
                      />
                    </label>

                    {(displayedElement.type === 'text' || displayedElement.type === 'variable') && (
                      <label style={{ ...propertyLabelStyle, display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                        <Input 
                          type="checkbox" 
                          checked={!!displayedElement.heightByContent} 
                          onChange={(e) => updateElementProperty('heightByContent', (e.target as HTMLInputElement).checked)}
                          disabled={!selectedElement}
                        />
                        Longueur par contenu
                      </label>
                    )}

                    <label style={propertyLabelStyle}>
                      Rotation (°):
                      <Input 
                        type="number" 
                        value={displayedElement.rotation || 0} 
                        onChange={(e) => updateElementProperty('rotation', Number(e.target.value))}
                        style={propertyInputStyle}
                        disabled={!selectedElement}
                      />
                    </label>

                    <label style={propertyLabelStyle}>
                      Répétition paginée:
                      <select
                        value={displayedElement.pageRegion ?? 'normal'}
                        onChange={(e) =>
                          updateElementProperty(
                            'pageRegion',
                            e.target.value === 'normal'
                              ? undefined
                              : (e.target.value as 'header' | 'footer')
                          )
                        }
                        style={propertyInputStyle}
                        disabled={!selectedElement}
                        title="Mode PAGED : répéter cet élément sur toutes les pages à l'impression"
                      >
                        <option value="normal">Normal (page courante)</option>
                        <option value="header">En-tête (toutes les pages)</option>
                        <option value="footer">Pied de page (toutes les pages)</option>
                      </select>
                    </label>
                  </div>

                  {/* Texte */}
                  {displayedElement.type === 'variable' && (
                    <div style={{ marginBottom: '15px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#2c3e50', marginBottom: '4px' }}>Numéro (format: {'{{patient.nom #2}}'})</div>
                      <label style={{ ...propertyLabelStyle, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 'bold', minWidth: '24px' }}>#</span>
                        <Input 
                          type="number" 
                          min="1"
                          value={(() => {
                            const parsed = parseVariableContent(
                              displayedElement.content || '',
                              displayedElement.variableLabel
                            );
                            if (parsed && parsed.index > 1) return String(parsed.index);
                            return displayedElement.variableLabel && !isNaN(Number(displayedElement.variableLabel))
                              ? displayedElement.variableLabel
                              : '';
                          })()} 
                          onChange={(e) => updateElementProperty('variableLabel', e.target.value || '')}
                          placeholder="1"
                          style={{ ...propertyInputStyle, width: '70px' }}
                          disabled={!selectedElement}
                        />
                      </label>
                    </div>
                  )}

                  {displayedElement.type === 'table' && (
                    <div style={{ marginBottom: '15px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#2c3e50', marginBottom: '4px' }}>Numéro</div>
                      <label style={{ ...propertyLabelStyle, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 'bold', minWidth: '24px' }}>#</span>
                        <Input 
                          type="number" 
                          min="1"
                          value={displayedElement.tableNumber ?? ''} 
                          onChange={(e) => updateElementProperty('tableNumber', e.target.value === '' ? undefined : e.target.value)}
                          placeholder="1"
                          style={{ ...propertyInputStyle, width: '70px' }}
                          disabled={!selectedElement}
                        />
                      </label>
                    </div>
                  )}

                  {(displayedElement.type === 'text' || displayedElement.type === 'variable') && (
                    <div style={{ marginBottom: '15px' }}>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: themes[themeNumber].primary, fontWeight: 'bold' }}>✍️ Texte</h4>
                      
                      <label style={propertyLabelStyle}>
                        Police:
                        <select 
                          value={displayedElement.fontFamily} 
                          onChange={(e) => updateElementProperty('fontFamily', e.target.value)}
                          style={propertyInputStyle}
                          disabled={!selectedElement}
                        >
                          <option value="Arial, sans-serif">Arial</option>
                          <option value="'Times New Roman', serif">Times New Roman</option>
                                        <option value="Georgia, serif">Georgia</option>
                          <option value="'Courier New', monospace">Courier New</option>
                          <option value="Verdana, sans-serif">Verdana</option>
                                    </select>
                      </label>

                      <label style={propertyLabelStyle}>
                        Taille:
                        <Input 
                          type="number" 
                          value={displayedElement.fontSize || 16} 
                          onChange={(e) => updateElementProperty('fontSize', Number(e.target.value))}
                          style={propertyInputStyle}
                          disabled={!selectedElement}
                        />
                      </label>

                      <label style={propertyLabelStyle}>
                        Couleur:
                        <Input 
                          type="color" 
                          value={displayedElement.color || '#000000'} 
                          onChange={(e) => updateElementProperty('color', e.target.value)}
                          style={{ ...propertyInputStyle, height: '35px' }}
                          disabled={!selectedElement}
                        />
                      </label>

                      <div style={{ display: 'flex', gap: '5px', marginTop: '8px' }}>
                        <button 
                          onClick={() => selectedElement && updateElementProperty('fontWeight', displayedElement.fontWeight === 'bold' ? 'normal' : 'bold')}
                          disabled={!selectedElement}
                          style={{
                            ...smallButtonStyle,
                            backgroundColor: displayedElement.fontWeight === 'bold' ? themes[themeNumber].primary : '#ecf0f1',
                            color: displayedElement.fontWeight === 'bold' ? 'white' : '#2c3e50',
                            opacity: !selectedElement ? 0.5 : 1,
                            cursor: !selectedElement ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <Bold size={14} />
                        </button>
                        <button 
                          onClick={() => selectedElement && updateElementProperty('fontStyle', displayedElement.fontStyle === 'italic' ? 'normal' : 'italic')}
                          disabled={!selectedElement}
                          style={{
                            ...smallButtonStyle,
                            backgroundColor: displayedElement.fontStyle === 'italic' ? themes[themeNumber].primary : '#ecf0f1',
                            color: displayedElement.fontStyle === 'italic' ? 'white' : '#2c3e50',
                            opacity: !selectedElement ? 0.5 : 1,
                            cursor: !selectedElement ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <Italic size={14} />
                        </button>
                        <button 
                          onClick={() => selectedElement && updateElementProperty('textDecoration', displayedElement.textDecoration === 'underline' ? 'none' : 'underline')}
                          disabled={!selectedElement}
                          style={{
                            ...smallButtonStyle,
                            backgroundColor: displayedElement.textDecoration === 'underline' ? themes[themeNumber].primary : '#ecf0f1',
                            color: displayedElement.textDecoration === 'underline' ? 'white' : '#2c3e50',
                            opacity: !selectedElement ? 0.5 : 1,
                            cursor: !selectedElement ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <Underline size={14} />
                        </button>
                                </div>

                      <div style={{ display: 'flex', gap: '5px', marginTop: '8px' }}>
                        <button 
                          onClick={() => selectedElement && updateElementProperty('textAlign', 'left')} 
                          disabled={!selectedElement}
                                        style={{
                            ...smallButtonStyle,
                            opacity: !selectedElement ? 0.5 : 1,
                            cursor: !selectedElement ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <AlignLeft size={14} />
                        </button>
                        <button 
                          onClick={() => selectedElement && updateElementProperty('textAlign', 'center')} 
                          disabled={!selectedElement}
                          style={{
                            ...smallButtonStyle,
                            opacity: !selectedElement ? 0.5 : 1,
                            cursor: !selectedElement ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <AlignCenter size={14} />
                        </button>
                        <button 
                          onClick={() => selectedElement && updateElementProperty('textAlign', 'right')} 
                          disabled={!selectedElement}
                          style={{
                            ...smallButtonStyle,
                            opacity: !selectedElement ? 0.5 : 1,
                            cursor: !selectedElement ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <AlignRight size={14} />
                        </button>
                      </div>
                                </div>
                  )}

                  {/* Apparence */}
                  {displayedElement.type !== 'image' && (
                    <div>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: themes[themeNumber].primary, fontWeight: 'bold' }}>🎨 Apparence</h4>
                    
                      <label style={propertyLabelStyle}>
                        Fond:
                        <Input 
                          type="color" 
                          value={displayedElement.backgroundColor || '#ffffff'} 
                          onChange={(e) => updateElementProperty('backgroundColor', e.target.value)}
                          style={{ ...propertyInputStyle, height: '35px' }}
                          disabled={!selectedElement}
                        />
                      </label>

                      <label style={propertyLabelStyle}>
                        Bordure:
                        <Input 
                          type="color" 
                          value={displayedElement.borderColor || '#000000'} 
                          onChange={(e) => updateElementProperty('borderColor', e.target.value)}
                          style={{ ...propertyInputStyle, height: '35px' }}
                          disabled={!selectedElement}
                        />
                      </label>

                      <label style={propertyLabelStyle}>
                        Épaisseur bordure:
                        <Input 
                          type="number" 
                          value={displayedElement.borderWidth || 0} 
                          onChange={(e) => updateElementProperty('borderWidth', Number(e.target.value))}
                          style={propertyInputStyle}
                          disabled={!selectedElement}
                        />
                      </label>

                      <label style={propertyLabelStyle}>
                        Ombre (Box Shadow):
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                          <Input 
                            type="text" 
                            value={displayedElement.boxShadow || ''} 
                            onChange={(e) => updateElementProperty('boxShadow', e.target.value)}
                            placeholder="Ex: 0 4px 6px rgba(0,0,0,0.1)"
                            style={{ ...propertyInputStyle, flex: 1 }}
                            disabled={!selectedElement}
                          />
                          <button
                            onClick={() => {
                              if (selectedElement) {
                                updateElementProperty('boxShadow', '0 4px 6px rgba(0,0,0,0.1)');
                              }
                            }}
                            disabled={!selectedElement}
                            style={{
                              padding: '6px 10px',
                              backgroundColor: selectedElement ? themes[themeNumber].primary : '#bdc3c7',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: selectedElement ? 'pointer' : 'not-allowed',
                              fontSize: '11px',
                              fontWeight: '500'
                            }}
                            title="Appliquer une ombre par défaut"
                          >
                            Par défaut
                          </button>
                                </div>
                        <div style={{ 
                          fontSize: '10px', 
                          color: '#7f8c8d', 
                          marginTop: '3px',
                          lineHeight: '1.3'
                        }}>
                          💡 Exemples : <br />
                          <code style={{ 
                            backgroundColor: '#f8f9fa', 
                            padding: '1px 4px', 
                            borderRadius: '2px',
                            fontFamily: 'monospace',
                            fontSize: '9px'
                          }}>0 2px 4px rgba(0,0,0,0.1)</code> (légère)<br />
                          <code style={{ 
                            backgroundColor: '#f8f9fa', 
                            padding: '1px 4px', 
                            borderRadius: '2px',
                            fontFamily: 'monospace',
                            fontSize: '9px'
                          }}>0 10px 20px rgba(0,0,0,0.3)</code> (forte)
                        </div>
                      </label>

                      {displayedElement.type === 'shape' && (
                        <label style={propertyLabelStyle}>
                          Arrondi (%):
                          <Input 
                            type="range" 
                            min="0" 
                            max="50" 
                            value={displayedElement.borderRadius || 0} 
                            onChange={(e) => updateElementProperty('borderRadius', Number(e.target.value))}
                            style={propertyInputStyle}
                            disabled={!selectedElement}
                          />
                          <span style={{ fontSize: '12px' }}>{displayedElement.borderRadius || 0}%</span>
                        </label>
                        )}
                                </div>
                  )}
                            </>
                        )}
                    </div>
              )}
                </div>

            {/* Accordéon Calques */}
            <AccordionSection
              title={`Calques (${elements.length})`}
              icon={<Layers size={18} />}
              isOpen={accordeonCalques}
              onToggle={() => setAccordeonCalques(!accordeonCalques)}
              themeColor={{ primary: themes[themeNumber].primary, secondary: themes[themeNumber].secondary }}
            >
              <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '5px' }}>
                {elements.length === 0 ? (
                  <p style={{ color: themes[themeNumber].primary, fontSize: '13px', fontStyle: 'italic', margin: 0 }}>
                    Aucun élément. Utilisez la barre d'outils pour ajouter des éléments.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {[...elements].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0)).map((el, index) => (
                      <div
                        key={el.id}
                        style={{
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px',
                          backgroundColor: el.id === selectedElementId ? themes[themeNumber].primary : 
                                          selectedElementIds.includes(el.id) && selectedElementIds.length > 1 ? '#f3e5f5' : '#f8f9fa',
                          color: el.id === selectedElementId ? themes[themeNumber].secondary : themes[themeNumber].primary,
                          borderRadius: '5px',
                          fontSize: '12px',
                          border: `1px solid ${el.id === selectedElementId ? themes[themeNumber].primary : 
                                                selectedElementIds.includes(el.id) && selectedElementIds.length > 1 ? '#9c27b0' : '#dee2e6'}`,
                          transition: 'all 0.2s',
                          minHeight: '50px'
                        }}
                      >
                        {/* Info élément */}
                        <div 
                          onClick={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                              // Sélection multiple avec Ctrl
                              if (selectedElementIds.includes(el.id)) {
                                setSelectedElementIds(prev => prev.filter(id => id !== el.id));
                                if (selectedElementId === el.id) setSelectedElementId(null);
                              } else {
                                setSelectedElementIds(prev => [...prev, el.id]);
                                setSelectedElementId(el.id);
                              }
                            } else {
                              // Sélection simple
                              setSelectedElementId(el.id);
                              setSelectedElementIds([el.id]);
                            }
                          }}
                          style={{ 
                            cursor: 'pointer', 
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden'
                          }}
                        >
                          <div style={{ 
                            fontWeight: 'bold', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '5px',
                            marginBottom: '3px'
                          }}>
                            <span style={{ fontSize: '14px' }}>
                              {el.type === 'text' && '📝'} 
                              {el.type === 'image' && '🖼️'} 
                              {el.type === 'shape' && '🔷'} 
                              {el.type === 'variable' && '📊'}
                              {el.type === 'table' && '📋'}
                            </span>
                            <span style={{ fontSize: '10px', fontWeight: '600' }}>{el.type.toUpperCase()}</span>
                            {selectedElementIds.includes(el.id) && selectedElementIds.length > 1 && (
                              <span style={{ 
                                fontSize: '8px', 
                                backgroundColor: '#9c27b0', 
                                color: 'white',
                                padding: '2px 5px',
                                borderRadius: '3px',
                                fontWeight: 'bold'
                              }}>✓</span>
                            )}
                            <span style={{ fontSize: '8px', opacity: 0.6, marginLeft: 'auto' }}>Z:{el.zIndex || 0}</span>
                          </div>
                          <div style={{ 
                            fontSize: '9px', 
                            opacity: 0.8,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {(() => {
                              let txt = el.content || '';
                              if (el.type === 'variable' && el.variableLabel && !txt.includes(' #')) {
                                txt = buildVariableContent(getBasePathFromContent(txt), el.variableLabel);
                              }
                              if (el.type === 'table' && el.tableNumber) {
                                txt = `${el.content || 'Tableau'} #${el.tableNumber}`;
                              }
                              return txt.length > 30 ? txt.substring(0, 30) + '...' : txt;
                            })()}
                          </div>
                        </div>

                        {/* Boutons d'action - Icônes verticales */}
                        <div style={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: '2px',
                          flexShrink: 0
                        }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveElementUp(el.id);
                            }}
                            disabled={index === 0}
                            style={{
                              width: '28px',
                              height: '28px',
                              padding: '0',
                              backgroundColor: index === 0 ? '#e0e0e0' : '#e3f2fd',
                              border: `1px solid ${index === 0 ? '#bdbdbd' : '#2196f3'}`,
                              borderRadius: '4px',
                              cursor: index === 0 ? 'not-allowed' : 'pointer',
                              color: index === 0 ? '#9e9e9e' : '#1976d2',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s'
                            }}
                            title="Monter d'un niveau"
                          >
                            <ArrowUp size={16} />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveElementDown(el.id);
                            }}
                            disabled={index === elements.length - 1}
                            style={{
                              width: '28px',
                              height: '28px',
                              padding: '0',
                              backgroundColor: index === elements.length - 1 ? '#e0e0e0' : '#fff3e0',
                              border: `1px solid ${index === elements.length - 1 ? '#bdbdbd' : '#ff9800'}`,
                              borderRadius: '4px',
                              cursor: index === elements.length - 1 ? 'not-allowed' : 'pointer',
                              color: index === elements.length - 1 ? '#9e9e9e' : '#f57c00',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s'
                            }}
                            title="Descendre d'un niveau"
                          >
                            <ArrowDown size={16} />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setElements(prev => prev.filter(item => item.id !== el.id));
                              if (selectedElementId === el.id) setSelectedElementId(null);
                            }}
                            style={{
                              width: '28px',
                              height: '28px',
                              padding: '0',
                              backgroundColor: '#ffebee',
                              border: '1px solid #f44336',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              color: '#c62828',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s'
                            }}
                            title="Supprimer l'élément"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </AccordionSection>
          </div>
        )}

        {/* Zone centrale - Canvas A4 avec pagination (feuille centrée) */}
        <div className="page-etat-main" style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '30px',
          overflow: 'auto',
          backgroundColor: '#95a5a6',
          gap: '20px'
        }}>
          {/* Conteneur pour la feuille avec zoom - reste centré */}
          {/* IMPORTANT : Le zoom est appliqué uniquement visuellement via CSS transform
              Les calculs de layout sont toujours effectués à zoom=1 */}
          <div className="page-etat-sheet-wrapper" style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '20px',
            transform: `scale(${zoomControls.zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease'
          }}>
            {/* Mode EXTENSIBLE : Feuille avec hauteur dynamique */}
            {renderMode === 'EXTENSIBLE' ? (
              <ExtensibleSheetRenderer
                elements={extensibleSheet.adjustedElements.length > 0 ? extensibleSheet.adjustedElements : elements}
                sheetHeight={extensibleSheet.sheetHeight}
                renderElement={renderElement}
                previewMode={isPreviewMode}
                showGrid={showGrid}
                zoom={zoomControls.zoom}
                canvasRef={canvasRef}
                onSheetClick={isPreviewMode ? undefined : () => {
                  setSelectedElementId(null);
                  setSelectedElementIds([]);
                }}
              />
            ) : (
              /* Mode PAGED : Pages multiples avec pagination */
              <>
                {/* Rendu paginé en mode aperçu */}
                {isPreviewMode && pagination.pages.length > 0 ? (
                  <PaginatedPagesContainer
                    pages={pagination.pages}
                    renderElement={renderElement}
                    previewMode={true}
                    showGrid={false}
                    currentPage={currentPage}
                    showDebugInfo={showDebugInfo}
                    onPageClick={(pageIndex) => setCurrentPage(pageIndex)}
                  />
                ) : (
                  /* Mode édition : afficher toutes les pages ou une seule page */
                  pagination.pages.length > 0 ? (
                    <PaginatedPagesContainer
                      pages={pagination.pages}
                      renderElement={renderElement}
                      previewMode={false}
                      showGrid={showGrid}
                      currentPage={currentPage}
                      showDebugInfo={showDebugInfo}
                      onPageClick={(pageIndex) => {
                        setCurrentPage(pageIndex);
                        setSelectedElementId(null);
                        setSelectedElementIds([]);
                      }}
                    />
                  ) : (
                    /* Fallback : afficher une page vide si pas de pagination */
                    <div
                      ref={canvasRef}
                      style={{
                        width: `${A4_WIDTH}px`,
                        height: `${A4_HEIGHT}px`,
                        backgroundColor: 'white',
                        position: 'relative',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                        cursor: 'default',
                        overflow: 'hidden'
                      }}
                      onClick={isPreviewMode ? undefined : () => {
                        setSelectedElementId(null);
                        setSelectedElementIds([]);
                      }}
                    >
                      <div
                        className="page-region-guide"
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: '140px',
                          borderTop: '2px dashed #e53935',
                          zIndex: 12000,
                          pointerEvents: 'none'
                        }}
                      />
                      <div
                        className="page-region-guide-label"
                        style={{
                          position: 'absolute',
                          top: '124px',
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
                          top: `${A4_HEIGHT - 140}px`,
                          borderTop: '2px dashed #e53935',
                          zIndex: 12000,
                          pointerEvents: 'none'
                        }}
                      />
                      <div
                        className="page-region-guide-label"
                        style={{
                          position: 'absolute',
                          top: `${A4_HEIGHT - 156}px`,
                          left: '8px',
                          zIndex: 12001,
                          pointerEvents: 'none'
                        }}
                      >
                        PIED
                      </div>
                      {showGrid && !isPreviewMode && (
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
                      {[...(isPreviewMode ? elementsForLayoutEngine : elements)].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(element => {
                        const adjustedElement = {
                          ...element,
                          y: Math.max(0, Math.min(element.y, A4_HEIGHT - (element.height ?? 20))),
                          x: Math.max(0, Math.min(element.x, A4_WIDTH - element.width))
                        };
                        return (
                          <div key={element.id} style={{ position: 'relative', zIndex: element.zIndex ?? 0 }}>
                            {renderElement(adjustedElement, isPreviewMode, 0)}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </div>

        {/* Sidebar droite - Modèles & Données en accordéons (masqué en mode aperçu) */}
        {!isPreviewMode && (
        <div className="page-etat-sidebar-right" style={{
          width: '320px',
          backgroundColor: themes[themeNumber].secondary,
          padding: '15px',
          overflowY: 'auto',
          borderLeft: `2px solid ${themes[themeNumber].primary}`
        }}>
          
          {/* Accordéon Modèles */}
          <div style={{ marginBottom: '10px' }}>
            <div 
              onClick={() => setAccordeonModeles(!accordeonModeles)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                backgroundColor: themes[themeNumber].primary,
                color: themes[themeNumber].secondary,
                borderRadius: '5px',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>📄 Modèles</h3>
              {accordeonModeles ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>

            {accordeonModeles && (
              <div style={{ marginTop: '10px' }}>
                <ModelPanel 
                  onInsertTemplate={prepareInsertTemplate}
                  onCreateModelClick={() => setShowSaveTemplateModal(true)}
                  tabId={theUser.tabId}
                  pays={theUser.pays}
                  modelesVersion={modelesVersion}
                />
                </div>
            )}
            </div>

          {/* Accordéon Données (Variables) */}
          <div style={{ marginBottom: '10px' }}>
            <div 
              onClick={() => setAccordeonDonnees(!accordeonDonnees)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                backgroundColor: themes[themeNumber].primary,
                color: themes[themeNumber].secondary,
                borderRadius: '5px',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>📊 Données</h3>
              {accordeonDonnees ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
            
            {accordeonDonnees && (
              <div style={{ marginTop: '10px' }}>
                {/* Variables Médicales - Composant optimisé */}
                <VariablesSection 
                  onInsertVariable={addVariableElement}
                  themeColor={themes[themeNumber].primary}
                  onOpenActesModal={handleOpenActesModal}
                  onOpenPatientsModal={handleOpenPatientsModal}
                  onOpenCollaborateursTableModal={handleOpenCollaborateursTableModal}
                  customPatientVars={customColumns.patient}
                  customActeVars={customColumns.acte}
                />
              </div>
            )}
          </div>

          
        </div>
        )}
      </div>

      {/* Modal Confirmation Insertion de Modèle */}
      {showInsertTemplateModal && pendingTemplate && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '10px',
            padding: '25px',
            width: '90%',
            maxWidth: '500px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}>
            <h2 style={{ 
              margin: '0 0 20px 0', 
              color: themes[themeNumber].primary,
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              {pendingTemplate.icon} {pendingTemplate.name}
            </h2>

            <p style={{ 
              margin: '0 0 20px 0', 
              color: '#2c3e50',
              fontSize: '14px',
              lineHeight: '1.6'
            }}>
              La feuille contient actuellement <strong>{elements.length} élément(s)</strong>.
              <br />
              Comment souhaitez-vous insérer ce modèle ?
            </p>

            <div style={{
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '5px',
              marginBottom: '20px',
              fontSize: '12px',
              color: '#495057'
            }}>
              <strong>💡 Astuce :</strong> Si vous choisissez "Ajouter en dessous", le modèle sera placé sur une nouvelle page si nécessaire.
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowInsertTemplateModal(false);
                  setPendingTemplate(null);
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ecf0f1',
                  border: '2px solid #bdc3c7',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#2c3e50'
                }}
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  if (pendingTemplate) {
                    insertDocumentTemplate(pendingTemplate, 'append');
                  }
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3498db',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'white'
                }}
              >
                ➕ Ajouter en dessous
              </button>
              <button
                onClick={() => {
                  if (pendingTemplate) {
                    insertDocumentTemplate(pendingTemplate, 'replace');
                  }
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#e74c3c',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'white'
                }}
              >
                🗑️ Remplacer le contenu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sauvegarde de Modèle */}
      {showSaveTemplateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '10px',
            padding: '25px',
            width: '90%',
            maxWidth: '500px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}>
            <h2 style={{ 
              margin: '0 0 20px 0', 
              color: themes[themeNumber].primary,
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <BookmarkPlus size={24} />
              Enregistrer comme Modèle
            </h2>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#2c3e50', fontSize: '13px' }}>
                Nom du modèle * :
              </label>
              <Input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Ex: Certificat médical personnalisé"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '2px solid #bdc3c7',
                  borderRadius: '5px',
                  fontSize: '14px'
                }}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#2c3e50', fontSize: '13px' }}>
                Description :
              </label>
              <textarea
                value={newTemplateDescription}
                onChange={(e) => setNewTemplateDescription(e.target.value)}
                placeholder="Description courte de votre modèle"
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '2px solid #bdc3c7',
                  borderRadius: '5px',
                  fontSize: '13px',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#2c3e50', fontSize: '13px' }}>
                  Catégorie :
                </label>
                <select
                  value={newTemplateCategory}
                  onChange={(e) => setNewTemplateCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '2px solid #bdc3c7',
                    borderRadius: '5px',
                    fontSize: '13px'
                  }}
                >
                  <option value="prescription">💊 Ordonnance</option>
                  <option value="devis">💰 Devis</option>
                  <option value="certificat">📋 Certificat</option>
                  <option value="consultation">👨‍⚕️ Consultation</option>
                  <option value="administratif">📄 Administratif</option>
                                    </select>
                                </div>

              <div style={{ width: '100px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#2c3e50', fontSize: '13px' }}>
                  Icône :
                </label>
                <Input
                  type="text"
                  value={newTemplateIcon}
                  onChange={(e) => setNewTemplateIcon(e.target.value)}
                  placeholder="📄"
                  maxLength={2}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '2px solid #bdc3c7',
                    borderRadius: '5px',
                    fontSize: '20px',
                    textAlign: 'center'
                  }}
                />
              </div>
            </div>

            <div style={{
              padding: '12px',
              backgroundColor: '#e3f2fd',
              borderRadius: '5px',
              marginBottom: '20px',
              fontSize: '12px',
              color: '#1565c0'
            }}>
              <strong>📊 Résumé :</strong> {elements.length} élément(s) seront sauvegardés dans ce modèle.
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowSaveTemplateModal(false);
                  setNewTemplateName('');
                  setNewTemplateDescription('');
                  setNewTemplateIcon('📄');
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ecf0f1',
                  border: '2px solid #bdc3c7',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#2c3e50'
                }}
              >
                Annuler
              </button>
              <button
                onClick={saveAsTemplate}
                style={{
                  padding: '10px 20px',
                  backgroundColor: themes[themeNumber].primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <BookmarkPlus size={18} />
                Enregistrer le modèle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'Édition de Texte/Variable */}
      {showEditModal && (
        <div 
                                        style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCancelEdit();
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
            backgroundColor: 'white',
            borderRadius: '10px',
            padding: '25px',
            width: '90%',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}>
            <h2 style={{ 
              margin: '0 0 20px 0', 
              color: themes[themeNumber].primary,
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              {editingElement?.type === 'text' ? '📝' : '📊'} 
              {editingElement?.type === 'text' ? 'Modifier le Texte' : 'Modifier la Variable'}
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: 'bold', 
                color: '#2c3e50', 
                fontSize: '14px' 
              }}>
                {editingElement?.type === 'text' ? 'Contenu du texte :' : 'Référence de la variable :'}
              </label>
              
              {editingElement?.type === 'text' ? (
                <textarea
                  value={editModalContent}
                  onChange={(e) => setEditModalContent(e.target.value)}
                  placeholder="Saisissez votre texte..."
                  rows={8}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #bdc3c7',
                    borderRadius: '5px',
                    fontSize: '14px',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      handleSaveEdit();
                    } else if (e.key === 'Escape') {
                      handleCancelEdit();
                    }
                  }}
                />
              ) : (
                <>
                <Input
                  type="text"
                  value={editModalContent}
                  onChange={(e) => setEditModalContent(e.target.value)}
                  placeholder="Ex: {{patient.nom}}"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #bdc3c7',
                    borderRadius: '5px',
                    fontSize: '14px',
                    fontFamily: 'monospace'
                  }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveEdit();
                    } else if (e.key === 'Escape') {
                      handleCancelEdit();
                    }
                  }}
                />
                <div style={{
                  marginTop: '10px',
                  padding: '10px',
                  backgroundColor: '#e3f2fd',
                  borderRadius: '5px',
                  fontSize: '12px',
                  color: '#1565c0'
                }}>
                  <strong>💡 Astuce :</strong> Format <code style={{
                    backgroundColor: 'white',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontFamily: 'monospace'
                  }}>{'{{objet.propriété #N}}'}</code> (le #N est à l'intérieur)
                  <br />
                  Ex: <code style={{
                    backgroundColor: 'white',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontFamily: 'monospace'
                  }}>{'{{patient.nom}}'}</code>, <code style={{
                    backgroundColor: 'white',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontFamily: 'monospace'
                  }}>{'{{patient.nom #2}}'}</code>, <code style={{
                    backgroundColor: 'white',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontFamily: 'monospace'
                  }}>{'{{docteur.telephone}}'}</code>
                </div>

                {/* Propriétés complètes pour la variable */}
                <div style={{ marginTop: '20px', borderTop: '1px solid #e0e0e0', paddingTop: '15px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: themes[themeNumber].primary, fontWeight: 'bold' }}>📐 Position & Taille</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px' }}>
                    <label style={propertyLabelStyle}>
                      X: <Input type="number" min="0" max={A4_WIDTH} value={editModalVariableProps.x ?? 0} onChange={(e) => setEditModalVariableProps(p => ({ ...p, x: Number(e.target.value) }))} style={propertyInputStyle} />
                    </label>
                    <label style={propertyLabelStyle}>
                      Y: <Input type="number" min="0" value={editModalVariableProps.y ?? 0} onChange={(e) => setEditModalVariableProps(p => ({ ...p, y: Number(e.target.value) }))} style={propertyInputStyle} />
                    </label>
                    <label style={propertyLabelStyle}>
                      Largeur: <Input type="number" min="10" max={A4_WIDTH} value={editModalVariableProps.width ?? 0} onChange={(e) => setEditModalVariableProps(p => ({ ...p, width: Number(e.target.value) }))} style={propertyInputStyle} />
                    </label>
                    <label style={propertyLabelStyle}>
                      Hauteur: <Input type="number" min="10" value={editModalVariableProps.height ?? 0} onChange={(e) => setEditModalVariableProps(p => ({ ...p, height: Number(e.target.value) }))} style={propertyInputStyle} />
                    </label>
                    <label style={propertyLabelStyle}>
                      Rotation (°): <Input type="number" value={editModalVariableProps.rotation ?? 0} onChange={(e) => setEditModalVariableProps(p => ({ ...p, rotation: Number(e.target.value) }))} style={propertyInputStyle} />
                    </label>
                    <label style={{ ...propertyLabelStyle, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                      <Input type="checkbox" checked={!!editModalVariableProps.heightByContent} onChange={(e) => setEditModalVariableProps(p => ({ ...p, heightByContent: (e.target as HTMLInputElement).checked }))} />
                      Longueur par contenu
                    </label>
                  </div>

                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: themes[themeNumber].primary, fontWeight: 'bold' }}>✍️ Texte</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px' }}>
                    <label style={propertyLabelStyle}>
                      Police:
                      <select value={editModalVariableProps.fontFamily ?? 'Arial, sans-serif'} onChange={(e) => setEditModalVariableProps(p => ({ ...p, fontFamily: e.target.value }))} style={propertyInputStyle}>
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="'Times New Roman', serif">Times New Roman</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="'Courier New', monospace">Courier New</option>
                        <option value="Verdana, sans-serif">Verdana</option>
                      </select>
                    </label>
                    <label style={propertyLabelStyle}>
                      Taille: <Input type="number" min="6" value={editModalVariableProps.fontSize ?? 16} onChange={(e) => setEditModalVariableProps(p => ({ ...p, fontSize: Number(e.target.value) }))} style={propertyInputStyle} />
                    </label>
                    <label style={propertyLabelStyle}>
                      Couleur: <Input type="color" value={editModalVariableProps.color ?? '#000000'} onChange={(e) => setEditModalVariableProps(p => ({ ...p, color: e.target.value }))} style={{ ...propertyInputStyle, height: '35px' }} />
                    </label>
                    <label style={propertyLabelStyle}>
                      Numéro #: <Input type="text" value={editModalVariableProps.variableLabel ?? ''} onChange={(e) => {
                        const v = e.target.value || undefined;
                        setEditModalVariableProps(p => ({ ...p, variableLabel: v }));
                        const basePath = getBasePathFromContent(editModalContent);
                        setEditModalContent(buildVariableContent(basePath, v));
                      }} placeholder="1" style={propertyInputStyle} />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setEditModalVariableProps(p => ({ ...p, fontWeight: (p.fontWeight === 'bold' ? 'normal' : 'bold') }))} style={{ ...smallButtonStyle, backgroundColor: editModalVariableProps.fontWeight === 'bold' ? themes[themeNumber].primary : '#ecf0f1', color: editModalVariableProps.fontWeight === 'bold' ? 'white' : '#2c3e50' }}><Bold size={14} /></button>
                    <button type="button" onClick={() => setEditModalVariableProps(p => ({ ...p, fontStyle: (p.fontStyle === 'italic' ? 'normal' : 'italic') }))} style={{ ...smallButtonStyle, backgroundColor: editModalVariableProps.fontStyle === 'italic' ? themes[themeNumber].primary : '#ecf0f1', color: editModalVariableProps.fontStyle === 'italic' ? 'white' : '#2c3e50' }}><Italic size={14} /></button>
                    <button type="button" onClick={() => setEditModalVariableProps(p => ({ ...p, textDecoration: (p.textDecoration === 'underline' ? 'none' : 'underline') }))} style={{ ...smallButtonStyle, backgroundColor: editModalVariableProps.textDecoration === 'underline' ? themes[themeNumber].primary : '#ecf0f1', color: editModalVariableProps.textDecoration === 'underline' ? 'white' : '#2c3e50' }}><Underline size={14} /></button>
                    <button type="button" onClick={() => setEditModalVariableProps(p => ({ ...p, textAlign: 'left' }))} style={{ ...smallButtonStyle, backgroundColor: editModalVariableProps.textAlign === 'left' ? themes[themeNumber].primary : '#ecf0f1', color: editModalVariableProps.textAlign === 'left' ? 'white' : '#2c3e50' }}><AlignLeft size={14} /></button>
                    <button type="button" onClick={() => setEditModalVariableProps(p => ({ ...p, textAlign: 'center' }))} style={{ ...smallButtonStyle, backgroundColor: editModalVariableProps.textAlign === 'center' ? themes[themeNumber].primary : '#ecf0f1', color: editModalVariableProps.textAlign === 'center' ? 'white' : '#2c3e50' }}><AlignCenter size={14} /></button>
                    <button type="button" onClick={() => setEditModalVariableProps(p => ({ ...p, textAlign: 'right' }))} style={{ ...smallButtonStyle, backgroundColor: editModalVariableProps.textAlign === 'right' ? themes[themeNumber].primary : '#ecf0f1', color: editModalVariableProps.textAlign === 'right' ? 'white' : '#2c3e50' }}><AlignRight size={14} /></button>
                  </div>

                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: themes[themeNumber].primary, fontWeight: 'bold' }}>🎨 Apparence</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px' }}>
                    <label style={propertyLabelStyle}>
                      Fond: <Input type="color" value={editModalVariableProps.backgroundColor ?? '#ffffff'} onChange={(e) => setEditModalVariableProps(p => ({ ...p, backgroundColor: e.target.value }))} style={{ ...propertyInputStyle, height: '35px' }} />
                    </label>
                    <label style={propertyLabelStyle}>
                      Bordure: <Input type="color" value={editModalVariableProps.borderColor ?? '#000000'} onChange={(e) => setEditModalVariableProps(p => ({ ...p, borderColor: e.target.value }))} style={{ ...propertyInputStyle, height: '35px' }} />
                    </label>
                    <label style={propertyLabelStyle}>
                      Épaisseur bordure: <Input type="number" min="0" value={editModalVariableProps.borderWidth ?? 0} onChange={(e) => setEditModalVariableProps(p => ({ ...p, borderWidth: Number(e.target.value) }))} style={propertyInputStyle} />
                    </label>
                    <label style={propertyLabelStyle}>
                      Rayon bordure: <Input type="number" min="0" value={editModalVariableProps.borderRadius ?? 0} onChange={(e) => setEditModalVariableProps(p => ({ ...p, borderRadius: Number(e.target.value) }))} style={propertyInputStyle} />
                    </label>
                    <label style={{ ...propertyLabelStyle, gridColumn: '1 / -1' }}>
                      Ombre (Box Shadow): <Input type="text" value={editModalVariableProps.boxShadow ?? ''} onChange={(e) => setEditModalVariableProps(p => ({ ...p, boxShadow: e.target.value }))} placeholder="Ex: 0 4px 6px rgba(0,0,0,0.1)" style={propertyInputStyle} />
                    </label>
                  </div>
                </div>
                </>
              )}
            </div>

            <div style={{
              padding: '10px',
              backgroundColor: '#f8f9fa',
              borderRadius: '5px',
              marginBottom: '20px',
              fontSize: '11px',
              color: '#6c757d',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span>⌨️ Raccourcis :</span>
              <kbd style={{
                padding: '2px 6px',
                backgroundColor: 'white',
                borderRadius: '3px',
                border: '1px solid #dee2e6',
                fontFamily: 'monospace',
                color: '#000000'
              }}>Ctrl+Entrée</kbd>
              <span>= Valider</span>
              <kbd style={{
                padding: '2px 6px',
                backgroundColor: 'white',
                borderRadius: '3px',
                border: '1px solid #dee2e6',
                fontFamily: 'monospace',
                color: '#000000'
              }}>Échap</kbd>
              <span>= Annuler</span>
                </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCancelEdit}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ecf0f1',
                  border: '2px solid #bdc3c7',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#2c3e50',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#bdc3c7'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ecf0f1'}
              >
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editModalContent.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: editModalContent.trim() ? themes[themeNumber].primary : '#bdc3c7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: editModalContent.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (editModalContent.trim()) {
                    e.currentTarget.style.opacity = '0.9';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                ✓ Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'Export JSON */}
      {showExportModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowExportModal(false);
              setExportFileName('');
              setExportFilePath('');
            }
          }}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '10px',
            padding: '25px',
            width: '90%',
            maxWidth: '500px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}>
            <h2 style={{ 
              margin: '0 0 20px 0', 
              color: themes[themeNumber].primary,
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              💾 Sauvegarder le Document
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: 'bold', 
                color: '#2c3e50', 
                fontSize: '14px' 
              }}>
                Nom du fichier :
              </label>
              
              <Input
                type="text"
                value={exportFileName}
                onChange={(e) => setExportFileName(e.target.value)}
                placeholder="Ex: certificat_medical"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #bdc3c7',
                  borderRadius: '5px',
                  fontSize: '14px'
                }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleExportJSON();
                  } else if (e.key === 'Escape') {
                    setShowExportModal(false);
                    setExportFileName('');
                    setExportFilePath('');
                  }
                }}
              />
              
              <div style={{
                marginTop: '8px',
                fontSize: '12px',
                color: '#7f8c8d'
              }}>
                💡 Le fichier sera enregistré avec l'extension <code>.json</code>
                </div>
            </div>

            <div style={{
              padding: '12px',
              backgroundColor: '#e3f2fd',
              borderRadius: '5px',
              marginBottom: '20px',
              fontSize: '13px',
              color: '#1565c0'
            }}>
              <strong>📊 Résumé :</strong> {elements.length} élément(s) seront sauvegardés.
            </div>

            <div style={{
              padding: '10px',
              backgroundColor: '#f8f9fa',
              borderRadius: '5px',
              marginBottom: '20px',
              fontSize: '11px',
              color: '#6c757d',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span>⌨️ Raccourcis :</span>
              <kbd style={{
                padding: '2px 6px',
                backgroundColor: 'white',
                borderRadius: '3px',
                border: '1px solid #dee2e6',
                fontFamily: 'monospace',
                color: '#000000'
              }}>Entrée</kbd>
              <span>= Valider</span>
              <kbd style={{
                padding: '2px 6px',
                backgroundColor: 'white',
                borderRadius: '3px',
                border: '1px solid #dee2e6',
                fontFamily: 'monospace',
                color: '#000000'
              }}>Échap</kbd>
              <span>= Annuler</span>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowExportModal(false);
                  setExportFileName('');
                  setExportFilePath('');
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ecf0f1',
                  border: '2px solid #bdc3c7',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#2c3e50',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#bdc3c7'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ecf0f1'}
              >
                Annuler
              </button>
              <button
                onClick={handleExportJSON}
                disabled={!exportFileName.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: exportFileName.trim() ? themes[themeNumber].primary : '#bdc3c7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: exportFileName.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (exportFileName.trim()) {
                    e.currentTarget.style.opacity = '0.9';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                <Save size={18} />
                Exporter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal des Actes — coque partagée avec les autres sélections d’aperçu */}
      <EtatPreviewSelectionModal
        show={showActesModal}
        onBackdropClick={handleCloseActesPreviewModal}
        themePrimary={themes[themeNumber].primary}
        title={actesPreviewModalTitle}
        banner={
          actesModalPurpose === 'both' ? (
        <div 
          style={{
                padding: '12px',
                backgroundColor: '#e8f5e9',
                borderLeft: '4px solid #4caf50',
                borderRadius: '5px',
                marginBottom: '15px',
                fontSize: '13px',
                color: '#2e7d32',
              }}
            >
              <strong>ℹ️ Sélection en 2 étapes :</strong>
              <br />
              • <strong>Étape 1 :</strong> Choisissez un acte pour remplir les variables
              <br />
              • <strong>Étape 2 :</strong> Vous pourrez ensuite sélectionner plusieurs actes pour le tableau
            </div>
          ) : undefined
        }
        maxWidth="800px"
        zIndex={10000}
        footer={
          <>
            <button
              type="button"
              onClick={handleCloseActesPreviewModal}
              style={{
                padding: '10px 20px',
                backgroundColor: '#ecf0f1',
                border: '2px solid #bdc3c7',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                color: '#2c3e50',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#bdc3c7';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ecf0f1';
              }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={insertActesTable}
              disabled={selectedActes.length === 0}
              style={{
                padding: '10px 20px',
                backgroundColor: selectedActes.length > 0 ? themes[themeNumber].primary : '#bdc3c7',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: selectedActes.length > 0 ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (selectedActes.length > 0) e.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              {actesModalPurpose === 'variables'
                ? `✓ Valider l'acte sélectionné`
                : `✓ Insérer le Tableau des Actes (${selectedActes.length} acte${selectedActes.length > 1 ? 's' : ''})`}
            </button>
          </>
        }
      >
            {/* Section Filtres */}
            <div style={{ 
              padding: '15px', 
              backgroundColor: '#f8f9fa', 
              borderRadius: '8px',
              marginBottom: '20px' 
            }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '15px', color: '#2c3e50' }}>🔍 Filtres</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c3e50' }}>Date de début :</span>
                  <Input
                    type="date"
                    value={actesDateDebut}
                    onChange={(e) => setActesDateDebut(e.target.value)}
                    style={{
                      padding: '8px',
                      border: '2px solid #bdc3c7',
                      borderRadius: '5px',
                      fontSize: '13px'
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c3e50' }}>Date de fin :</span>
                  <Input
                    type="date"
                    value={actesDateFin}
                    onChange={(e) => setActesDateFin(e.target.value)}
                    style={{
                      padding: '8px',
                      border: '2px solid #bdc3c7',
                      borderRadius: '5px',
                      fontSize: '13px'
                    }}
                  />
                </label>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '15px', position: 'relative' }}>
                <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c3e50' }}>Patient :</span>
                <Input
                  type="text"
                  value={actesPatientSearch}
                  onChange={(e) => handlePatientSearchChange(e.target.value)}
                  onFocus={() => {
                    // Afficher les suggestions uniquement si aucun patient n'est sélectionné
                    if (actesPatientSearch.length > 0 && !actesPatientId) {
                      setShowPatientsSuggestions(true);
                    }
                  }}
                  placeholder="Tapez le nom, prénom, téléphone ou ID d'un patient..."
                  style={{
                    padding: '10px',
                    border: '2px solid #bdc3c7',
                    borderRadius: '5px',
                    fontSize: '13px',
                    backgroundColor: 'white'
                  }}
                />
                
                {/* Liste de suggestions (ne s'affiche pas si un patient est déjà sélectionné) */}
                {showPatientsSuggestions && !actesPatientId && filteredPatients.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    border: '2px solid #bdc3c7',
                    borderRadius: '5px',
                    marginTop: '5px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1000,
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                  }}>
                    {filteredPatients.map(patient => (
                      <div
                        key={patient.id}
                        onMouseDown={(e) => { e.preventDefault(); selectPatient(patient); }}
                        style={{
                          padding: '10px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #ecf0f1',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e8f5e9'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                      >
                        <div style={{ fontWeight: 'bold', color: '#2c3e50', marginBottom: '2px' }}>
                          {patient.nom} {patient.prenom}
                          {patient.nomDeJeuneFille && <span style={{ fontSize: '10px', color: '#7f8c8d', fontWeight: 'normal' }}> ({patient.nomDeJeuneFille})</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: '#7f8c8d', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {patient.telephone && <span>📞 {patient.telephone}</span>}
                          {patient.email && <span>✉️ {patient.email}</span>}
                          {patient.id && <span>🆔 {patient.id}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Afficher aucun résultat (ne s'affiche pas si un patient est déjà sélectionné) */}
                {showPatientsSuggestions && !actesPatientId && actesPatientSearch.length > 0 && filteredPatients.length === 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    border: '2px solid #bdc3c7',
                    borderRadius: '5px',
                    marginTop: '5px',
                    padding: '10px',
                    zIndex: 1000,
                    color: '#7f8c8d',
                    textAlign: 'center',
                    fontSize: '12px'
                  }}>
                    Aucun patient trouvé
                  </div>
                )}
              </label>

              <button
                onClick={loadActesForPatient}
                disabled={!actesPatientId && !(actesPatientSearch?.trim() && filteredPatients.length === 1)}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: (actesPatientId || (actesPatientSearch?.trim() && filteredPatients.length === 1)) ? themes[themeNumber].primary : '#bdc3c7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: (actesPatientId || (actesPatientSearch?.trim() && filteredPatients.length === 1)) ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (actesPatientId || (actesPatientSearch?.trim() && filteredPatients.length === 1)) {
                    e.currentTarget.style.opacity = '0.9';
                  }
                }}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                title={!actesPatientId && !(actesPatientSearch?.trim() && filteredPatients.length === 1) ? 'Sélectionnez un patient dans la liste ou tapez un nom pour rechercher' : ''}
              >
                {isLoadingActes ? '⏳ Chargement...' : '🔍 Charger les Actes'}
              </button>
            </div>

            {/* Section Colonnes (masquée en mode variables uniquement) — registre médical */}
            {actesModalPurpose !== 'variables' && (
              <EntityTableColumnsPicker
                entity="acte"
                variant="acte"
                columns={actesColumns}
                onChange={setActesColumns}
              />
            )}

            {/* Section Tableau des Actes */}
            {actesData.length > 0 && (
              <div style={{ 
                padding: '15px', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '8px',
                marginBottom: '20px',
                maxHeight: '300px',
                overflow: 'auto'
              }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '15px', color: '#2c3e50' }}>
                  ✅ Actes trouvés ({actesData.length})
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {actesData.map(acte => (
                    <label key={acte.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px',
                      backgroundColor: (actesModalPurpose === 'variables' ? selectedActes[0] === acte.id : selectedActes.includes(acte.id)) ? '#e3f2fd' : 'white',
                      border: `2px solid ${(actesModalPurpose === 'variables' ? selectedActes[0] === acte.id : selectedActes.includes(acte.id)) ? themes[themeNumber].primary : '#dee2e6'}`,
                      borderRadius: '5px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}>
                      <Input
                        type={actesModalPurpose === 'variables' ? 'radio' : 'checkbox'}
                        name={actesModalPurpose === 'variables' ? 'acteSelection' : undefined}
                        checked={actesModalPurpose === 'variables' ? selectedActes[0] === acte.id : selectedActes.includes(acte.id)}
                        onChange={(e) => {
                          const checked = (e.target as HTMLInputElement).checked;
                          if (actesModalPurpose === 'variables') {
                            setSelectedActes(checked ? [acte.id] : []);
                          } else {
                            if (checked) {
                              setSelectedActes(prev => [...prev, acte.id]);
                            } else {
                              setSelectedActes(prev => prev.filter(id => id !== acte.id));
                            }
                          }
                        }}
                        style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', color: '#2c3e50', marginBottom: '3px' }}>
                          {acte.nom}
                        </div>
                        <div style={{ fontSize: '12px', color: '#7f8c8d' }}>
                          📅 {acte.date} • 💰 {acte.prix} FCFA
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                  {actesModalPurpose !== 'variables' && (
                  <>
                  <button
                    onClick={() => setSelectedActes(actesData.map(a => a.id))}
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: '#e3f2fd',
                      border: '2px solid #2196f3',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: '#1976d2'
                    }}
                  >
                    ✓ Tout sélectionner
                  </button>
                  <button
                    onClick={() => setSelectedActes([])}
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: '#ffebee',
                      border: '2px solid #f44336',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: '#d32f2f'
                    }}
                  >
                    ✗ Tout désélectionner
                  </button>
                  </>
                  )}
                </div>
              </div>
            )}
      </EtatPreviewSelectionModal>

      <EtatPreviewSelectionModal
        show={showCollaborateursTableModal}
        onBackdropClick={handleCloseCollaborateursTablePreviewModal}
        themePrimary={themes[themeNumber].primary}
        title={collaborateursTableModalTitle}
        maxWidth="800px"
        zIndex={10000}
        footer={
          <>
              <button
              type="button"
              onClick={handleCloseCollaborateursTablePreviewModal}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ecf0f1',
                  border: '2px solid #bdc3c7',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#2c3e50',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#bdc3c7';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ecf0f1';
              }}
              >
                Annuler
              </button>
              <button
              type="button"
              onClick={insertCollaborateursTable}
              disabled={
                selectedCollaborateursTableIds.length === 0 ||
                !Object.values(collaborateursColumns).some(Boolean)
              }
                style={{
                  padding: '10px 20px',
                backgroundColor:
                  selectedCollaborateursTableIds.length > 0 &&
                  Object.values(collaborateursColumns).some(Boolean)
                    ? themes[themeNumber].primary
                    : '#bdc3c7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                cursor:
                  selectedCollaborateursTableIds.length > 0 &&
                  Object.values(collaborateursColumns).some(Boolean)
                    ? 'pointer'
                    : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                if (
                  selectedCollaborateursTableIds.length > 0 &&
                  Object.values(collaborateursColumns).some(Boolean)
                ) {
                    e.currentTarget.style.opacity = '0.9';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
              {`✓ Insérer le tableau (${selectedCollaborateursTableIds.length} collaborateur${
                selectedCollaborateursTableIds.length > 1 ? 's' : ''
              })`}
              </button>
          </>
        }
      >
        <div
          style={{
            padding: '15px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            marginBottom: '20px',
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#2c3e50' }}>
            🔍 Recherche
          </h3>
          <Input
            type="text"
            value={collaborateursTableModalSearch}
            onChange={(e) => setCollaborateursTableModalSearch(e.target.value)}
            placeholder="Nom, prénom, login, téléphone, type…"
            style={{
              width: '100%',
              padding: '10px',
              border: '2px solid #bdc3c7',
              borderRadius: '5px',
              fontSize: '13px',
              boxSizing: 'border-box',
            }}
          />
            </div>

        <EntityTableColumnsPicker
          entity="collaborateur"
          variant="collaborateur"
          columns={collaborateursColumns}
          onChange={setCollaborateursColumns}
        />

        {Object.keys(selectedCollaborateursByIndex).length > 0 && selectedCollaborateursTableIds.length > 0 ? (
          <div
            style={{
              marginTop: '10px',
              marginBottom: '4px',
              padding: '10px 12px',
              backgroundColor: '#e8f5e9',
              borderLeft: '4px solid #4caf50',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#2e7d32',
              lineHeight: 1.45,
            }}
          >
            <strong>Alignement variables :</strong> la sélection reprend l’ordre des personnes choisies pour{' '}
            <code>{'{{collaborateur.*}}'}</code> (indices{' '}
            <code>
              {Object.keys(selectedCollaborateursByIndex)
                .map(Number)
                .sort((a, b) => a - b)
                .map((i) => `#${i}`)
                .join(', ')}
            </code>
            ). Vous pouvez modifier avant insertion. Si aucun tableau collaborateurs n’avait encore de lignes, le
            premier tableau vide est aussi rempli automatiquement après la sélection des variables.
          </div>
        ) : null}

        {collaborateursTableModalLoading ? (
          <p style={{ textAlign: 'center', padding: '24px', color: '#666' }}>Chargement du personnel…</p>
        ) : filteredCollaborateursTableModalList.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '24px', color: '#7f8c8d' }}>
            Aucun collaborateur trouvé pour ce cabinet.
          </p>
        ) : (
          <div
            style={{
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              marginTop: '12px',
              maxHeight: '320px',
              overflow: 'auto',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#2c3e50' }}>
              👥 Personnel ({filteredCollaborateursTableModalList.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredCollaborateursTableModalList.map((row, idx) => (
                <label
                  key={`${row.id}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px',
                    backgroundColor: selectedCollaborateursTableIds.includes(row.id) ? '#e0f7fa' : 'white',
                    border: `2px solid ${
                      selectedCollaborateursTableIds.includes(row.id) ? '#00838f' : '#dee2e6'
                    }`,
                    borderRadius: '5px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <Input
                    type="checkbox"
                    checked={selectedCollaborateursTableIds.includes(row.id)}
                    onChange={(e) => {
                      if ((e.target as HTMLInputElement).checked) {
                        setSelectedCollaborateursTableIds((prev) => [...prev, row.id]);
                      } else {
                        setSelectedCollaborateursTableIds((prev) => prev.filter((id) => id !== row.id));
                      }
                    }}
                    style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', color: '#2c3e50', marginBottom: '3px' }}>
                      {row.prenom} {row.nom}
                    </div>
                    <div style={{ fontSize: '12px', color: '#7f8c8d' }}>
                      {row.sourceLabel}
                      {row.login ? ` · ${row.login}` : ''}
                      {row.telephone ? ` · ${row.telephone}` : ''}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() =>
                  setSelectedCollaborateursTableIds(filteredCollaborateursTableModalList.map((r) => r.id))
                }
                style={{
                  flex: 1,
                  padding: '8px',
                  backgroundColor: '#e0f7fa',
                  border: '2px solid #00838f',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: '#006064',
                }}
              >
                ✓ Tout sélectionner (liste filtrée)
              </button>
              <button
                type="button"
                onClick={() => setSelectedCollaborateursTableIds([])}
                style={{
                  flex: 1,
                  padding: '8px',
                  backgroundColor: '#ffebee',
                  border: '2px solid #e57373',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: '#c62828',
                }}
              >
                ✗ Tout désélectionner
              </button>
          </div>
        </div>
      )}
      </EtatPreviewSelectionModal>

      <Modal
        show={showPosologieEtatModal}
        onClose={() => setShowPosologieEtatModal(false)}
        title="💊 Posologie & ordonnance — aperçu Page État"
        maxWidth="640px"
        zIndex={10050}
      >
        <p style={{ fontSize: "13px", color: "#444", margin: "0 0 12px 0", lineHeight: 1.45 }}>
          Les textes ci-dessous proviennent de la <strong>posologie enregistrée</strong> pour le{" "}
          <strong>patient sélectionné</strong> dans la section Données. Cliquez sur « Appliquer » pour remplir les
          variables <code>{"{{posologie}}"}</code>, <code>{"{{posologie.texte}}"}</code>, etc. en{" "}
          <strong>mode aperçu</strong>.
        </p>
        {selectedPatient && (
          <p style={{ fontSize: "12px", margin: "0 0 10px 0", color: themes[themeNumber].primary }}>
            Patient :{" "}
            <strong>
              {(selectedPatient.nom ?? "") + " " + (selectedPatient.prenom ?? "")}
            </strong>
          </p>
        )}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            disabled={posologieEtatModalLoading}
            onClick={() => void loadPosologieEtatModal()}
            style={{
              padding: "6px 12px",
              cursor: posologieEtatModalLoading ? "wait" : "pointer",
              borderRadius: "6px",
              border: `1px solid ${themes[themeNumber].primary}`,
              background: "#fff",
              color: themes[themeNumber].primary,
            }}
          >
            Actualiser
          </button>
        </div>
        {posologieEtatModalLoading ? (
          <p style={{ textAlign: "center", padding: "24px" }}>Chargement…</p>
        ) : (
          <>
            {posologieEtatModalHint && (
              <div className="alert alert-info" style={{ fontSize: "13px" }}>
                {posologieEtatModalHint}
              </div>
            )}
            {posologieEtatModalOrdonnance ? (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontWeight: "bold", fontSize: "12px", marginBottom: "6px", color: "#333" }}>
                  Ordonnance (texte type pharmacie)
                </div>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: "11px",
                    maxHeight: "180px",
                    overflow: "auto",
                    padding: "10px",
                    background: "#f5f9fc",
                    borderRadius: "6px",
                    margin: 0,
                  }}
                >
                  {posologieEtatModalOrdonnance}
                </pre>
              </div>
            ) : null}
            {posologieEtatModalPosologie ? (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontWeight: "bold", fontSize: "12px", marginBottom: "6px", color: "#333" }}>
                  Détail posologie
                </div>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: "11px",
                    maxHeight: "140px",
                    overflow: "auto",
                    padding: "10px",
                    background: "#f0f7f0",
                    borderRadius: "6px",
                    margin: 0,
                  }}
                >
                  {posologieEtatModalPosologie}
                </pre>
              </div>
            ) : null}
          </>
        )}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowPosologieEtatModal(false)}
          >
            Fermer
          </button>
          <button
            type="button"
            disabled={
              posologieEtatModalLoading ||
              (!posologieEtatModalOrdonnance.trim() && !posologieEtatModalPosologie.trim())
            }
            onClick={() => {
              const ordText =
                posologieEtatModalOrdonnance.trim() || posologieEtatModalPosologie.trim() || "";
              const posText =
                posologieEtatModalPosologie.trim() || posologieEtatModalOrdonnance.trim() || "";
              setPreviewPosologieOverride(posText);
              setPreviewOrdonnanceOverride(ordText);
              setAutoPosologiePreviewText(null);
              setAutoOrdonnancePreviewText(null);
              setShowPosologieEtatModal(false);
              setAlertObj({
                type: "success",
                show: true,
                text: "Textes posologie et ordonnance appliqués. Activez le mode aperçu pour voir {{posologie}} et {{ordonnance}} remplis.",
              });
            }}
            style={{
              padding: "8px 18px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: themes[themeNumber].primary,
              color: themes[themeNumber].secondary,
              fontWeight: 600,
              cursor:
                posologieEtatModalLoading ||
                (!posologieEtatModalOrdonnance.trim() && !posologieEtatModalPosologie.trim())
                  ? "not-allowed"
                  : "pointer",
              opacity:
                posologieEtatModalLoading ||
                (!posologieEtatModalOrdonnance.trim() && !posologieEtatModalPosologie.trim())
                  ? 0.55
                  : 1,
            }}
          >
            Appliquer à l&apos;aperçu
          </button>
        </div>
      </Modal>

      <EtatPreviewSelectionModal
        show={showCollaborateurEtatModal}
        onBackdropClick={closeCollaborateurEtatModal}
        themePrimary={themes[themeNumber].primary}
        title={collaborateurPreviewModalTitle}
        maxWidth="560px"
        zIndex={10050}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeCollaborateurEtatModal}>
              Fermer
            </button>
            {etatProfilPickerTarget === 'collaborateur' && requiredCollaborateurIndices.length > 1 ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={selectedCollaborateursEtatIds.length !== requiredCollaborateurIndices.length}
                onClick={applyCollaborateurMultiSelection}
                style={{
                  opacity:
                    selectedCollaborateursEtatIds.length !== requiredCollaborateurIndices.length ? 0.55 : 1,
                }}
              >
                Valider ({selectedCollaborateursEtatIds.length}/{requiredCollaborateurIndices.length})
              </button>
            ) : null}
            {etatProfilPickerTarget === 'collaborateur' &&
            (selectedCollaborateurEtat?.id ||
              Object.keys(selectedCollaborateursByIndex).length > 0 ||
              selectedCollaborateursEtatIds.length > 0) ? (
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => {
                  setSelectedCollaborateurEtat(null);
                  setSelectedCollaborateursByIndex({});
                  setSelectedCollaborateursEtatIds([]);
                  collaborateurEtatSelectionMapRef.current = {};
                  setAlertObj({
                    type: 'info',
                    show: true,
                    text: 'Collaborateur pour l’aperçu réinitialisé. Les {{collaborateur.*}} seront vides tant qu’aucun choix n’est fait.',
                  });
                }}
              >
                Effacer collaborateur
              </button>
            ) : null}
            {etatProfilPickerTarget === 'user' && selectedUserForEtat?.id ? (
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => {
                  setSelectedUserForEtat(null);
                  setAlertObj({
                    type: 'info',
                    show: true,
                    text: 'Surcharge {{user.*}} supprimée : l’aperçu utilisera à nouveau le compte connecté.',
                  });
                }}
              >
                Effacer user.* (revenir au compte connecté)
              </button>
            ) : null}
          </>
        }
      >
        {etatProfilPickerTarget === 'user' ? (
          <p style={{ fontSize: '13px', color: '#444', margin: '0 0 12px 0', lineHeight: 1.45 }}>
            Choisissez le profil utilisé pour les variables <code>{'{{user.nom}}'}</code>,{' '}
            <code>{'{{user.prenom}}'}</code>, etc. en <strong>mode aperçu</strong> :{' '}
            <strong>docteur du cabinet</strong> ou <strong>membre du personnel</strong>. Sans choix explicite,
            c&apos;est le <strong>compte connecté</strong> qui s&apos;applique.
          </p>
        ) : (
          <p style={{ fontSize: '13px', color: '#444', margin: '0 0 12px 0', lineHeight: 1.45 }}>
            Liste du <strong>personnel du cabinet</strong> : assistants, comptables, secrétaires et fiches
            créées sous les <strong>types de collaborateur</strong> (Profil). Le <strong>docteur</strong> n’y
            figure pas (utilisez le choix <code>user.*</code> pour le médecin). Les données sont chargées pour
            l’onglet du cabinet et pour <code>main</code> si besoin. Les variables{' '}
            <code>{'{{collaborateur.nom}}'}</code>, <code>{'{{collaborateur.nom #2}}'}</code>, etc. utilisent la
            ou les personnes choisies en <strong>mode aperçu</strong>.
          </p>
        )}
        {etatProfilPickerTarget === 'collaborateur' && requiredCollaborateurIndices.length > 1 ? (
          <div
            style={{
              padding: '10px 12px',
              backgroundColor: '#fff3e0',
              borderLeft: '4px solid #ff9800',
              borderRadius: '6px',
              marginBottom: '12px',
              fontSize: '12px',
              color: '#e65100',
              lineHeight: 1.45,
            }}
          >
            <strong>Ordre de sélection :</strong> indices demandés{' '}
            {requiredCollaborateurIndices.map((i) => (
              <code key={i} style={{ marginRight: '4px' }}>
                #{i}
              </code>
            ))}
            — le 1ᵉʳ clic = 1ᵉʳ indice, etc. Cliquez à nouveau sur une ligne pour la retirer. Validez quand le
            compteur est complet.
          </div>
        ) : null}
        {etatProfilPickerTarget === 'collaborateur' &&
        Object.keys(selectedCollaborateursByIndex).length > 0 ? (
          <div
            style={{ fontSize: '12px', margin: '0 0 6px 0', color: themes[themeNumber].primary, lineHeight: 1.45 }}
          >
            <strong>
              {Object.keys(selectedCollaborateursByIndex).length > 1
                ? 'Collaborateurs (aperçu) :'
                : 'Collaborateur (aperçu) :'}
            </strong>
            {Object.entries(selectedCollaborateursByIndex)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([k, r]) => (
                <div key={k} style={{ marginTop: '4px' }}>
                  <code style={{ marginRight: '6px' }}>#{k}</code>
                  <strong>
                    {(r.prenom ?? '') + ' ' + (r.nom ?? '')}
                  </strong>
                  <span style={{ color: '#666', fontWeight: 400 }}> ({r.sourceLabel})</span>
                </div>
              ))}
          </div>
        ) : selectedCollaborateurEtat?.id ? (
          <p style={{ fontSize: '12px', margin: '0 0 6px 0', color: themes[themeNumber].primary }}>
            Collaborateur (aperçu) :{' '}
            <strong>
              {(selectedCollaborateurEtat.prenom ?? '') + ' ' + (selectedCollaborateurEtat.nom ?? '')}
            </strong>
            <span style={{ color: '#666', fontWeight: 400 }}> ({selectedCollaborateurEtat.sourceLabel})</span>
          </p>
        ) : null}
        {selectedUserForEtat?.id ? (
          <p style={{ fontSize: '12px', margin: '0 0 10px 0', color: themes[themeNumber].primary }}>
            Utilisateur <code>user.*</code> (aperçu) :{' '}
            <strong>
              {(selectedUserForEtat.prenom ?? '') + ' ' + (selectedUserForEtat.nom ?? '')}
            </strong>
            <span style={{ color: '#666', fontWeight: 400 }}> ({selectedUserForEtat.sourceLabel})</span>
          </p>
        ) : (
          <p style={{ fontSize: '12px', margin: '0 0 10px 0', color: '#666' }}>
            Utilisateur <code>user.*</code> : <strong>compte connecté</strong> (pas de surcharge).
          </p>
        )}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            type="search"
            placeholder="Filtrer par nom, prénom, login, rôle…"
            value={collaborateurEtatModalSearch}
            onChange={(e) => setCollaborateurEtatModalSearch(e.target.value)}
            style={{
              flex: '1 1 200px',
              padding: '8px 10px',
              borderRadius: '6px',
              border: '1px solid #ccc',
              fontSize: '13px',
            }}
          />
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            disabled={collaborateurEtatModalLoading}
            onClick={() => void loadEtatProfilPickerList(etatProfilPickerTarget)}
            style={{
              padding: '6px 12px',
              cursor: collaborateurEtatModalLoading ? 'wait' : 'pointer',
              borderRadius: '6px',
              border: `1px solid ${themes[themeNumber].primary}`,
              background: '#fff',
              color: themes[themeNumber].primary,
            }}
          >
            Actualiser
          </button>
        </div>
        {collaborateurEtatModalError ? (
          <div className="alert alert-warning" style={{ fontSize: '13px' }}>
            {collaborateurEtatModalError}
          </div>
        ) : null}
        {collaborateurEtatModalLoading ? (
          <p style={{ textAlign: 'center', padding: '24px' }}>Chargement…</p>
        ) : (
          <div
            style={{
              maxHeight: '320px',
              overflow: 'auto',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
            }}
          >
            {filteredCollaborateurEtatModalList.length === 0 ? (
              <p style={{ padding: '16px', margin: 0, color: '#666', fontSize: '13px' }}>
                {etatProfilPickerTarget === 'user'
                  ? 'Aucun profil disponible. Vérifiez le chargement du docteur / du personnel ou actualisez.'
                  : 'Aucun membre du personnel trouvé pour ce cabinet. Vérifiez les droits API ou que les fiches existent (Profil).'}
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {filteredCollaborateurEtatModalList.map((row) => {
                  const multiCollabPick =
                    etatProfilPickerTarget === 'collaborateur' && requiredCollaborateurIndices.length > 1;
                  const orderPick = selectedCollaborateursEtatIds.findIndex(
                    (id) => String(id) === String(row.id)
                  );
                  const active =
                    etatProfilPickerTarget === 'user'
                      ? selectedUserForEtat?.id === row.id
                      : multiCollabPick
                        ? orderPick >= 0
                        : selectedCollaborateurEtat?.id === row.id;
                  return (
                    <li key={`${row.id}__${row.sourceLabel}`}>
                      <button
                        type="button"
                        onClick={() => {
                          if (etatProfilPickerTarget === 'user') {
                            setSelectedUserForEtat(row);
                            setAlertObj({
                              type: 'success',
                              show: true,
                              text: `Utilisateur user.* : ${row.prenom} ${row.nom}. Activez l’aperçu pour voir {{user.*}}.`,
                            });
                            closeCollaborateurEtatModal();
                          } else if (multiCollabPick) {
                            toggleCollaborateurEtatSelection(row);
                          } else {
                            const idx = requiredCollaborateurIndices[0] ?? 1;
                            setSelectedCollaborateursByIndex({ [idx]: row });
                            setSelectedCollaborateurEtat(idx === 1 ? row : null);
                            setAlertObj({
                              type: 'success',
                              show: true,
                              text: `Collaborateur #${idx} : ${row.prenom} ${row.nom}. Activez l’aperçu pour voir {{collaborateur.*}}.`,
                            });
                            closeCollaborateurEtatModal();
                          }
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          border: 'none',
                          borderBottom: '1px solid #eee',
                          background: active ? '#e0f7fa' : '#fff',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        <strong>
                          {row.prenom} {row.nom}
                        </strong>
                        {orderPick >= 0 && requiredCollaborateurIndices[orderPick] != null ? (
                          <span
                            style={{
                              marginLeft: '8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: themes[themeNumber].primary,
                            }}
                          >
                            {`→ #${requiredCollaborateurIndices[orderPick]}`}
                          </span>
                        ) : null}
                        <span style={{ color: '#666', fontSize: '12px', display: 'block', marginTop: '2px' }}>
                          {row.sourceLabel}
                          {row.login ? ` · ${row.login}` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </EtatPreviewSelectionModal>

      {/* Modal des Patients */}
      {showPatientsModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPatientsModal(false);
              setPatientsData([]);
              setSelectedPatientsIds([]);
              setPatientsSearchQuery('');
              selectedPatientsMapRef.current = {};
            }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
            backgroundColor: 'white',
            borderRadius: '10px',
            padding: '25px',
            width: '90%',
            maxWidth: '900px',
            maxHeight: '85vh',
            overflow: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}>
            {(() => {
              const emptyPatientSorted = sortTableElementsByNumber(
                elements.filter(
                  (el) =>
                    el.type === 'table' &&
                    el.id.includes('patients') &&
                    (!el.tableData || el.tableData.length === 0)
                )
              );
              const patientTableEl =
                (selectedElementId &&
                  emptyPatientSorted.find((e) => e.id === selectedElementId)) ||
                emptyPatientSorted[0];
              const indicesLabel = requiredPatientIndices.length > 1 
                ? ` (${requiredPatientIndices.map(i => `#${i}`).join(', ')})` 
                : '';
              return (
                <>
            <h2 style={{ 
              margin: '0 0 20px 0', 
              color: themes[themeNumber].primary,
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              {patientsModalMode === 'single' 
                ? (patientsModalPurpose === 'both' 
                    ? `👤 Étape 1/2 : Sélectionner le patient pour les variables` 
                    : `👤 Sélectionner le patient pour les variables`)
                : patientsModalPurpose === 'variables'
                  ? `👥 Sélectionner ${requiredPatientIndices.length} patient(s) pour les variables${indicesLabel}`
                  : `👥 Sélectionner les patients pour le tableau${patientTableEl?.tableNumber ? ` #${patientTableEl.tableNumber}` : ''}`}
            </h2>
            
            {/* Bandeau informatif */}
            {patientsModalMode === 'single' && patientsModalPurpose === 'both' && (
              <div style={{ 
                padding: '12px', 
                backgroundColor: '#e3f2fd', 
                borderLeft: '4px solid #2196f3',
                borderRadius: '5px',
                marginBottom: '15px',
                fontSize: '13px',
                color: '#1565c0'
              }}>
                <strong>ℹ️ Sélection en 2 étapes :</strong><br/>
                • <strong>Étape 1 :</strong> Choisissez le patient pour remplir les variables<br/>
                • <strong>Étape 2 :</strong> Vous pourrez ensuite sélectionner plusieurs patients pour le tableau{patientTableEl?.tableNumber ? ` #${patientTableEl.tableNumber}` : ''}
              </div>
            )}
            {patientsModalMode === 'multiple' && patientsModalPurpose === 'variables' && requiredPatientIndices.length > 1 && (
              <div style={{ 
                padding: '12px', 
                backgroundColor: '#fff3e0', 
                borderLeft: '4px solid #ff9800',
                borderRadius: '5px',
                marginBottom: '15px',
                fontSize: '13px',
                color: '#e65100'
              }}>
                <strong>ℹ️ Ordre de sélection :</strong> Le 1er patient sélectionné = #1, le 2e = #2, etc.
              </div>
            )}
                </>
              );
            })()}

            {/* Section Recherche et Sélection */}
            <div style={{ 
              padding: '15px', 
              backgroundColor: '#f8f9fa', 
              borderRadius: '8px',
              marginBottom: '20px' 
            }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '15px', color: '#2c3e50' }}>🔍 Recherche et Sélection de Patients</h3>
              
              {/* Barre de recherche */}
              <div style={{ marginBottom: '15px' }}>
                <Input
                  type="text"
                  placeholder="🔍 Rechercher par nom, prénom, téléphone, email ou ID..."
                  value={patientsSearchQuery}
                  onChange={(e) => setPatientsSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #bdc3c7',
                    borderRadius: '5px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Liste avec checkboxes */}
              <div style={{ 
                maxHeight: '250px', 
                overflowY: 'auto', 
                border: '1px solid #ddd', 
                borderRadius: '5px',
                backgroundColor: 'white',
                marginBottom: '15px'
              }}>
                {isLoadingPatients ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#3498db' }}>
                    <div style={{ marginBottom: '10px' }}>⏳ Recherche en cours...</div>
                  </div>
                ) : filteredPatientsForSelection.length === 0 && patientsSearchQuery.trim().length < 1 ? (
                  <div style={{ padding: '30px 20px', textAlign: 'center', color: '#7f8c8d' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔍</div>
                    <div style={{ fontSize: '14px', marginBottom: '5px', fontWeight: 'bold' }}>
                      Rechercher un patient
                    </div>
                    <div style={{ fontSize: '12px', color: '#95a5a6' }}>
                      Tapez un nom, prénom, téléphone, email ou ID pour commencer la recherche
                    </div>
                  </div>
                ) : filteredPatientsForSelection.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#95a5a6' }}>
                    Aucun patient trouvé pour "{patientsSearchQuery}"
                  </div>
                ) : (
                  filteredPatientsForSelection.map((patient: any) => (
                    <label 
                      key={patient.id}
                      style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #f0f0f0',
                        transition: 'background-color 0.2s',
                        backgroundColor: (patientsModalMode === 'single' 
                          ? selectedSinglePatientId === patient.id 
                          : selectedPatientsIds.includes(patient.id)) ? '#e3f2fd' : 'white'
                      }}
                      onMouseEnter={(e) => {
                        const isSelected = patientsModalMode === 'single' 
                          ? selectedSinglePatientId === patient.id 
                          : selectedPatientsIds.includes(patient.id);
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = '#f8f9fa';
                        }
                      }}
                      onMouseLeave={(e) => {
                        const isSelected = patientsModalMode === 'single' 
                          ? selectedSinglePatientId === patient.id 
                          : selectedPatientsIds.includes(patient.id);
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'white';
                        }
                      }}
                    >
                      <Input
                        type={patientsModalMode === 'single' ? 'radio' : 'checkbox'}
                        name={patientsModalMode === 'single' ? 'patientSelection' : undefined}
                        checked={patientsModalMode === 'single' 
                          ? selectedSinglePatientId === patient.id 
                          : selectedPatientsIds.includes(patient.id)}
                        onChange={() => {
                          if (patientsModalMode === 'single') {
                            setSelectedSinglePatientId(patient.id);
                          } else {
                            togglePatientSelection(patient.id, patient);
                          }
                        }}
                        style={{ 
                          marginRight: '10px',
                          cursor: 'pointer',
                          width: '16px',
                          height: '16px'
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          fontSize: '13px', 
                          fontWeight: (patientsModalMode === 'single' 
                            ? selectedSinglePatientId === patient.id 
                            : selectedPatientsIds.includes(patient.id)) ? 'bold' : 'normal',
                          color: '#2c3e50',
                          marginBottom: '2px'
                        }}>
                          {patient.nom} {patient.prenom}
                          {patient.nomDeJeuneFille && <span style={{ fontSize: '11px', color: '#7f8c8d', fontWeight: 'normal' }}> ({patient.nomDeJeuneFille})</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: '#7f8c8d', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {patient.telephone && <span>📞 {patient.telephone}</span>}
                          {patient.email && <span>✉️ {patient.email}</span>}
                          {patient.id && <span>🆔 {patient.id}</span>}
                          {patient.naissance && <span>📅 {new Date(patient.naissance).toLocaleDateString('fr-FR')}</span>}
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>

              {/* Compteur de sélection et info */}
              {patientsModalMode === 'multiple' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ 
                    padding: '8px 12px', 
                    backgroundColor: (() => {
                      const needed = patientsModalPurpose === 'variables' ? requiredPatientIndices.length : 0;
                      const ok = needed > 0 ? selectedPatientsIds.length === needed : selectedPatientsIds.length > 0;
                      return ok ? '#d4edda' : '#fff3cd';
                    })(),
                    borderRadius: '5px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    color: selectedPatientsIds.length > 0 ? '#155724' : '#856404',
                    textAlign: 'center'
                  }}>
                    {patientsModalPurpose === 'variables' && requiredPatientIndices.length > 1
                      ? `${selectedPatientsIds.length} / ${requiredPatientIndices.length} patient(s) pour #${requiredPatientIndices.join(', #')}`
                      : `${selectedPatientsIds.length} patient(s) sélectionné(s)`}
                  </div>
                  {patientsData.length >= 50 && (
                    <div style={{ 
                      padding: '6px 10px', 
                      backgroundColor: '#e3f2fd',
                      borderRadius: '5px',
                      fontSize: '11px',
                      color: '#1565c0',
                      textAlign: 'center'
                    }}>
                      ℹ️ Résultats limités à 50 patients. Affinez votre recherche.
                    </div>
                  )}
                </div>
              )}
              
              {/* Info sélection simple */}
              {patientsModalMode === 'single' && selectedSinglePatientId && (
                <div style={{ 
                  padding: '8px 12px', 
                  backgroundColor: '#d4edda',
                  borderRadius: '5px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  color: '#155724',
                  textAlign: 'center'
                }}>
                  ✓ 1 patient sélectionné
                </div>
              )}
            </div>

            {/* Tableau récapitulatif des patients sélectionnés (uniquement en mode multiple) */}
            {patientsModalMode === 'multiple' && selectedPatientsList.length > 0 && (
              <div style={{ 
                padding: '15px', 
                backgroundColor: '#e8f4f8', 
                borderRadius: '8px',
                marginBottom: '20px' 
              }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '15px', color: '#2c3e50' }}>✅ Patients Sélectionnés</h3>
                <div style={{ 
                  maxHeight: '200px', 
                  overflowY: 'auto',
                  border: '1px solid #b3d9e6',
                  borderRadius: '5px',
                  backgroundColor: 'white'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: themes[themeNumber].primary, color: 'white' }}>
                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Nom</th>
                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Prénom</th>
                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Téléphone</th>
                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPatientsList.map((patient: any) => (
                        <tr key={patient.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '8px' }}>{patient.nom}</td>
                          <td style={{ padding: '8px' }}>{patient.prenom}</td>
                          <td style={{ padding: '8px' }}>{patient.telephone || '-'}</td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <button
                              onClick={() => togglePatientSelection(patient.id, patient)}
                              style={{
                                padding: '4px 8px',
                                backgroundColor: '#e74c3c',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontSize: '11px'
                              }}
                            >
                              ✗
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Section Colonnes (uniquement en mode multiple pour tableau) — registre médical */}
            {patientsModalMode === 'multiple' && patientsModalPurpose !== 'variables' && (
              <EntityTableColumnsPicker
                entity="patient"
                variant="patient"
                columns={patientsColumns}
                onChange={setPatientsColumns}
              />
            )}

            {/* Section Liste des Patients (uniquement en mode multiple) */}
            {patientsModalMode === 'multiple' && patientsData.length > 0 && (
              <div style={{ 
                padding: '15px', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '8px',
                marginBottom: '20px',
                maxHeight: '300px',
                overflow: 'auto'
              }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '15px', color: '#2c3e50' }}>
                  ✅ Patients trouvés ({patientsData.length})
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {patientsData.map(patient => (
                    <label key={patient.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px',
                      backgroundColor: selectedPatientsIds.includes(patient.id) ? '#e8f5e9' : 'white',
                      border: `2px solid ${selectedPatientsIds.includes(patient.id) ? '#4caf50' : '#dee2e6'}`,
                      borderRadius: '5px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}>
                      <Input
                        type="checkbox"
                        checked={selectedPatientsIds.includes(patient.id)}
                        onChange={() => togglePatientSelection(patient.id, patient)}
                        style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', color: '#2c3e50', marginBottom: '3px' }}>
                          {patient.nom} {patient.prenom}
                        </div>
                        <div style={{ fontSize: '12px', color: '#7f8c8d' }}>
                          📅 {patient.naissance} • 📞 {patient.telephone} • {patient.age}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => {
                      patientsData.forEach(p => { selectedPatientsMapRef.current[String(p.id)] = p; });
                      setSelectedPatientsIds(patientsData.map(p => p.id));
                    }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: '#e8f5e9',
                      border: '2px solid #4caf50',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: '#2e7d32'
                    }}
                  >
                    ✓ Tout sélectionner
                  </button>
                  <button
                    onClick={() => {
                      selectedPatientsMapRef.current = {};
                      setSelectedPatientsIds([]);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: '#ffebee',
                      border: '2px solid #f44336',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: '#d32f2f'
                    }}
                  >
                    ✗ Tout désélectionner
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowPatientsModal(false);
                  setPatientsData([]);
                  setSelectedPatientsIds([]);
                  setPatientsSearchQuery('');
                  selectedPatientsMapRef.current = {};
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ecf0f1',
                  border: '2px solid #bdc3c7',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#2c3e50',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#bdc3c7'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ecf0f1'}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  insertPatientsTable();
                }}
                disabled={(() => {
                  if (patientsModalMode === 'single') return !selectedSinglePatientId;
                  if (patientsModalPurpose === 'variables' && requiredPatientIndices.length > 1) {
                    return selectedPatientsIds.length !== requiredPatientIndices.length;
                  }
                  return selectedPatientsIds.length === 0;
                })()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: (() => {
                    const ok = patientsModalMode === 'single' ? !!selectedSinglePatientId : 
                      (patientsModalPurpose === 'variables' && requiredPatientIndices.length > 1 
                        ? selectedPatientsIds.length === requiredPatientIndices.length 
                        : selectedPatientsIds.length > 0);
                    return ok ? themes[themeNumber].primary : '#bdc3c7';
                  })(),
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: (() => {
                    const ok = patientsModalMode === 'single' ? !!selectedSinglePatientId : 
                      (patientsModalPurpose === 'variables' && requiredPatientIndices.length > 1 
                        ? selectedPatientsIds.length === requiredPatientIndices.length 
                        : selectedPatientsIds.length > 0);
                    return ok ? 'pointer' : 'not-allowed';
                  })(),
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  const ok = patientsModalMode === 'single' ? !!selectedSinglePatientId : selectedPatientsIds.length > 0;
                  if (ok) e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                {patientsModalMode === 'single' 
                  ? (patientsModalPurpose === 'both' 
                      ? '✓ Continuer → Étape 2/2' 
                      : '✓ Valider la sélection')
                  : patientsModalPurpose === 'variables'
                    ? `✓ Valider (${selectedPatientsIds.length}/${requiredPatientIndices.length} patients)`
                    : `✓ Insérer le Tableau des Patients (${selectedPatientsIds.length} patient${selectedPatientsIds.length > 1 ? 's' : ''})`}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
        </div>
    );
}

