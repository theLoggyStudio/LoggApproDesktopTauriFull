/**
 * Registre unique des variables médicales (Page État).
 * Toute nouvelle variable : ajouter une entrée ici → palette, tableaux et modales suivent.
 */

export type MedicalCategoryId =
  | 'PATIENT'
  | 'ACTE'
  | 'DOCTEUR'
  | 'COLLABORATEUR'
  | 'CABINET'
  | 'POSOLOGIE'
  | 'QRCODE';

export type TableEntityKind = 'patient' | 'acte' | 'collaborateur';

/** Style d’affichage des catégories (sidebar VariablesSection) */
export const CATEGORY_STYLES: Record<
  MedicalCategoryId,
  { label: string; color: { bg: string; border: string; text: string; hoverBg: string; hoverText: string } }
> = {
  PATIENT: {
    label: '👤 Patient',
    color: {
      bg: '#e8f5e9',
      border: '#4caf50',
      text: '#2e7d32',
      hoverBg: '#4caf50',
      hoverText: 'white',
    },
  },
  ACTE: {
    label: '🦷 Acte',
    color: {
      bg: '#e3f2fd',
      border: '#2196f3',
      text: '#1565c0',
      hoverBg: '#2196f3',
      hoverText: 'white',
    },
  },
  DOCTEUR: {
    label: '👨‍⚕️ Docteur',
    color: {
      bg: '#fff3e0',
      border: '#ff9800',
      text: '#e65100',
      hoverBg: '#ff9800',
      hoverText: 'white',
    },
  },
  COLLABORATEUR: {
    label: '👥 Collaborateur (personnel cabinet)',
    color: {
      bg: '#e0f7fa',
      border: '#00838f',
      text: '#006064',
      hoverBg: '#00838f',
      hoverText: 'white',
    },
  },
  CABINET: {
    label: '🏥 Cabinet',
    color: {
      bg: '#f3e5f5',
      border: '#9c27b0',
      text: '#6a1b9a',
      hoverBg: '#9c27b0',
      hoverText: 'white',
    },
  },
  POSOLOGIE: {
    label: '💊 Posologie / ordonnance',
    color: {
      bg: '#e8f4fd',
      border: '#0288d1',
      text: '#01579b',
      hoverBg: '#0288d1',
      hoverText: 'white',
    },
  },
  QRCODE: {
    label: '📱 QR code (aperçu — même contenu qu’ailleurs dans l’app)',
    color: {
      bg: '#f5f5f5',
      border: '#424242',
      text: '#212121',
      hoverBg: '#424242',
      hoverText: 'white',
    },
  },
};

/**
 * Champs patient : clé = propriété sur l’objet ligne (tableau + résolution {{patient.x}}).
 */
export interface PatientFieldRegistryEntry {
  key: string;
  label: string;
  /** Bouton dans la liste « Variables » */
  showInPalette: boolean;
  /** Colonne proposable dans le modal « Tableau des patients » */
  table: {
    group: string;
    groupOrder: number;
    defaultVisible: boolean;
    essential: boolean;
  } | null;
}

export const PATIENT_FIELD_REGISTRY: PatientFieldRegistryEntry[] = [
  { key: 'nom', label: 'Nom', showInPalette: true, table: { group: 'Identité', groupOrder: 1, defaultVisible: true, essential: true } },
  { key: 'prenom', label: 'Prénom', showInPalette: true, table: { group: 'Identité', groupOrder: 1, defaultVisible: true, essential: true } },
  { key: 'naissance', label: 'Date naissance', showInPalette: true, table: { group: 'Identité', groupOrder: 1, defaultVisible: true, essential: true } },
  { key: 'age', label: 'Âge', showInPalette: true, table: { group: 'Identité', groupOrder: 1, defaultVisible: false, essential: false } },
  { key: 'sexe', label: 'Sexe', showInPalette: true, table: { group: 'Identité', groupOrder: 1, defaultVisible: false, essential: false } },
  { key: 'adresse', label: 'Adresse', showInPalette: true, table: { group: 'Coordonnées', groupOrder: 2, defaultVisible: false, essential: false } },
  { key: 'telephone', label: 'Téléphone', showInPalette: true, table: { group: 'Coordonnées', groupOrder: 2, defaultVisible: true, essential: true } },
  { key: 'email', label: 'Email', showInPalette: true, table: { group: 'Coordonnées', groupOrder: 2, defaultVisible: false, essential: false } },
  { key: 'login', label: 'Login', showInPalette: true, table: { group: 'Coordonnées', groupOrder: 2, defaultVisible: false, essential: false } },
  { key: 'nomDeJeuneFille', label: 'Nom de jeune fille', showInPalette: true, table: { group: 'Identité', groupOrder: 1, defaultVisible: false, essential: false } },
  { key: 'profession', label: 'Profession', showInPalette: true, table: { group: 'Identité', groupOrder: 1, defaultVisible: false, essential: false } },
  { key: 'adresserPar', label: 'Adressé par', showInPalette: true, table: { group: 'Divers', groupOrder: 4, defaultVisible: false, essential: false } },
  { key: 'observation', label: 'Observation', showInPalette: true, table: { group: 'Divers', groupOrder: 4, defaultVisible: false, essential: false } },
  { key: 'role', label: 'Rôle', showInPalette: true, table: { group: 'Divers', groupOrder: 4, defaultVisible: false, essential: false } },
  { key: 'loggId', label: 'Logg ID', showInPalette: true, table: { group: 'Divers', groupOrder: 4, defaultVisible: false, essential: false } },
  { key: 'dateCreation', label: 'Date création', showInPalette: true, table: { group: 'Divers', groupOrder: 4, defaultVisible: false, essential: false } },
  { key: 'avoirAnnuelle', label: 'Avoir annuelle', showInPalette: true, table: { group: 'Divers', groupOrder: 4, defaultVisible: false, essential: false } },
  { key: 'situationMatrimoniale', label: 'Situation matrimoniale', showInPalette: true, table: { group: 'Identité', groupOrder: 1, defaultVisible: false, essential: false } },
  { key: 'numeroSecuriteSociale', label: 'N° sécurité sociale', showInPalette: true, table: { group: 'Administratif', groupOrder: 3, defaultVisible: false, essential: false } },
  { key: 'groupeSanguin', label: 'Groupe sanguin', showInPalette: true, table: { group: 'Santé', groupOrder: 5, defaultVisible: false, essential: false } },
  { key: 'allergies', label: 'Allergies', showInPalette: true, table: { group: 'Santé', groupOrder: 5, defaultVisible: false, essential: false } },
  { key: 'maladiesChroniques', label: 'Maladies chroniques', showInPalette: true, table: { group: 'Santé', groupOrder: 5, defaultVisible: false, essential: false } },
  { key: 'dateInscription', label: 'Date inscription', showInPalette: true, table: { group: 'Suivi', groupOrder: 6, defaultVisible: false, essential: false } },
  { key: 'dernierRendezVous', label: 'Dernier RDV', showInPalette: true, table: { group: 'Suivi', groupOrder: 6, defaultVisible: false, essential: false } },
  { key: 'nombreVisites', label: 'Nombre de visites', showInPalette: true, table: { group: 'Suivi', groupOrder: 6, defaultVisible: false, essential: false } },
];

/** Variables « user » (même bloc Patient dans l’UI — anciens modèles) */
export const USER_SCALAR_REGISTRY: { path: string; label: string }[] = [
  { path: 'user.nom', label: 'user.nom' },
  { path: 'user.prenom', label: 'user.prenom' },
  { path: 'user.login', label: 'user.login' },
  { path: 'user.telephone', label: 'user.telephone' },
  { path: 'user.naissance', label: 'user.naissance' },
  { path: 'user.adresse', label: 'user.adresse' },
  { path: 'user.role', label: 'user.role' },
];

export interface ActeFieldRegistryEntry {
  key: string;
  label: string;
  showInPalette: boolean;
  table: {
    group: string;
    groupOrder: number;
    defaultVisible: boolean;
    essential: boolean;
  } | null;
}

export const ACTE_FIELD_REGISTRY: ActeFieldRegistryEntry[] = [
  { key: 'date', label: 'Date', showInPalette: true, table: { group: 'Acte', groupOrder: 1, defaultVisible: true, essential: true } },
  { key: 'nom', label: 'Nom', showInPalette: true, table: { group: 'Acte', groupOrder: 1, defaultVisible: true, essential: true } },
  { key: 'prix', label: 'Prix unitaire', showInPalette: true, table: { group: 'Acte', groupOrder: 1, defaultVisible: true, essential: true } },
  { key: 'description', label: 'Description', showInPalette: true, table: { group: 'Acte', groupOrder: 1, defaultVisible: false, essential: false } },
  { key: 'statut', label: 'Statut', showInPalette: true, table: { group: 'Acte', groupOrder: 1, defaultVisible: false, essential: false } },
  { key: 'quantite', label: 'Quantité', showInPalette: true, table: { group: 'Acte', groupOrder: 1, defaultVisible: false, essential: false } },
  { key: 'remise', label: 'Remise', showInPalette: true, table: { group: 'Acte', groupOrder: 1, defaultVisible: false, essential: false } },
  { key: 'montantTotal', label: 'Montant total', showInPalette: true, table: { group: 'Acte', groupOrder: 1, defaultVisible: false, essential: false } },
  { key: 'dateCreation', label: 'Date création', showInPalette: true, table: { group: 'Acte', groupOrder: 1, defaultVisible: false, essential: false } },
  { key: 'dateModification', label: 'Date modif.', showInPalette: true, table: { group: 'Acte', groupOrder: 1, defaultVisible: false, essential: false } },
  { key: 'argentRecu', label: 'Argent reçu', showInPalette: true, table: null },
  { key: 'argentRestant', label: 'Argent restant', showInPalette: true, table: null },
  { key: 'posologieId', label: 'Posologie ID', showInPalette: true, table: null },
  { key: 'assuranceNom', label: 'Nom assurance', showInPalette: true, table: { group: 'Assurance', groupOrder: 2, defaultVisible: false, essential: false } },
  { key: 'assuranceTaux', label: 'Taux (%)', showInPalette: true, table: { group: 'Assurance', groupOrder: 2, defaultVisible: false, essential: false } },
  { key: 'assuranceMontantPrisEnCharge', label: 'Montant pris en charge', showInPalette: true, table: { group: 'Assurance', groupOrder: 2, defaultVisible: false, essential: false } },
  { key: 'assuranceStatut', label: 'Statut assurance', showInPalette: true, table: { group: 'Assurance', groupOrder: 2, defaultVisible: false, essential: false } },
  { key: 'factureNumero', label: 'N° facture', showInPalette: true, table: { group: 'Facture', groupOrder: 3, defaultVisible: false, essential: false } },
  { key: 'factureDateEmission', label: 'Date émission', showInPalette: true, table: { group: 'Facture', groupOrder: 3, defaultVisible: false, essential: false } },
  { key: 'factureMontantTotal', label: 'Montant facture', showInPalette: true, table: { group: 'Facture', groupOrder: 3, defaultVisible: false, essential: false } },
  { key: 'factureStatutPaiement', label: 'Statut paiement', showInPalette: true, table: { group: 'Facture', groupOrder: 3, defaultVisible: false, essential: false } },
  { key: 'factureDatePaiement', label: 'Date paiement', showInPalette: true, table: { group: 'Facture', groupOrder: 3, defaultVisible: false, essential: false } },
  { key: 'factureModePaiement', label: 'Mode paiement', showInPalette: true, table: { group: 'Facture', groupOrder: 3, defaultVisible: false, essential: false } },
];

/** Colonnes du « Tableau des collaborateurs » (lignes = `EtatStaffRow`). */
export interface CollaborateurFieldRegistryEntry {
  key: string;
  label: string;
  showInPalette: boolean;
  table: {
    group: string;
    groupOrder: number;
    defaultVisible: boolean;
    essential: boolean;
  };
}

export const COLLABORATEUR_FIELD_REGISTRY: CollaborateurFieldRegistryEntry[] = [
  { key: 'nom', label: 'Nom', showInPalette: false, table: { group: 'Identité', groupOrder: 1, defaultVisible: true, essential: true } },
  { key: 'prenom', label: 'Prénom', showInPalette: false, table: { group: 'Identité', groupOrder: 1, defaultVisible: true, essential: true } },
  { key: 'sourceLabel', label: 'Type / rôle', showInPalette: false, table: { group: 'Fonction', groupOrder: 2, defaultVisible: true, essential: true } },
  { key: 'telephone', label: 'Téléphone', showInPalette: false, table: { group: 'Coordonnées', groupOrder: 3, defaultVisible: true, essential: true } },
  { key: 'login', label: 'Login', showInPalette: false, table: { group: 'Coordonnées', groupOrder: 3, defaultVisible: false, essential: false } },
  { key: 'naissance', label: 'Date de naissance', showInPalette: false, table: { group: 'Identité', groupOrder: 1, defaultVisible: false, essential: false } },
  { key: 'adresse', label: 'Adresse', showInPalette: false, table: { group: 'Coordonnées', groupOrder: 3, defaultVisible: false, essential: false } },
  { key: 'role', label: 'Rôle (technique)', showInPalette: false, table: { group: 'Fonction', groupOrder: 2, defaultVisible: false, essential: false } },
];

const DOCTEUR_SCALARS = [
  'docteur.nom',
  'docteur.prenom',
  'docteur.login',
  'docteur.telephone',
  'docteur.naissance',
  'docteur.adresse',
];

const COLLAB_SCALARS = [
  'collaborateur.nom',
  'collaborateur.prenom',
  'collaborateur.login',
  'collaborateur.telephone',
  'collaborateur.naissance',
  'collaborateur.adresse',
  'collaborateur.role',
];

const CABINET_SCALARS = ['cabinet.nom', 'cabinet.adresse', 'cabinet.pays'];

const POSOLOGIE_SCALARS = [
  'posologie',
  'posologie.texte',
  'posologie.date',
  'posologie.lignes',
  /** Dérivés de la 1re ligne (format bullets), pour modèles type « {{posologie.medicament}} » */
  'posologie.acte',
  'posologie.medicament',
  'posologie.boites',
  'posologie.dose',
  'posologie.prises',
];
const ORDONNANCE_SCALARS = ['ordonnance', 'ordonnance.texte', 'ordonnance.date', 'ordonnance.lignes'];

/** Variables insérées comme {{qrcode.*}} ; l’image est chargée en aperçu via les mêmes API que les écrans Profil / Patient. */
const QRCODE_VARIABLE_PATHS = [
  'qrcode.docteur',
  'qrcode.patient',
  'qrcode.collaborateur',
  'qrcode.posologie',
];

/** Construit l’objet VARIABLE_CATEGORIES (format historique VariablesSection / modèles). */
export function buildVariableCategoriesFromRegistry(): Record<
  string,
  { label: string; color: (typeof CATEGORY_STYLES)[MedicalCategoryId]['color']; variables: string[] }
> {
  const patientPaths: string[] = [
    ...PATIENT_FIELD_REGISTRY.filter((f) => f.showInPalette).map((f) => `patient.${f.key}`),
    ...USER_SCALAR_REGISTRY.map((u) => u.path),
  ];
  const actePaths = ACTE_FIELD_REGISTRY.filter((f) => f.showInPalette).map((f) => `acte.${f.key}`);

  return {
    PATIENT: {
      label: CATEGORY_STYLES.PATIENT.label,
      color: CATEGORY_STYLES.PATIENT.color,
      variables: patientPaths,
    },
    ACTE: {
      label: CATEGORY_STYLES.ACTE.label,
      color: CATEGORY_STYLES.ACTE.color,
      variables: actePaths,
    },
    DOCTEUR: {
      label: CATEGORY_STYLES.DOCTEUR.label,
      color: CATEGORY_STYLES.DOCTEUR.color,
      variables: [...DOCTEUR_SCALARS, ...USER_SCALAR_REGISTRY.map((u) => u.path)],
    },
    COLLABORATEUR: {
      label: CATEGORY_STYLES.COLLABORATEUR.label,
      color: CATEGORY_STYLES.COLLABORATEUR.color,
      variables: [...COLLAB_SCALARS, ...USER_SCALAR_REGISTRY.map((u) => u.path)],
    },
    CABINET: {
      label: CATEGORY_STYLES.CABINET.label,
      color: CATEGORY_STYLES.CABINET.color,
      variables: [...CABINET_SCALARS],
    },
    POSOLOGIE: {
      label: CATEGORY_STYLES.POSOLOGIE.label,
      color: CATEGORY_STYLES.POSOLOGIE.color,
      variables: [...POSOLOGIE_SCALARS, ...ORDONNANCE_SCALARS],
    },
    QRCODE: {
      label: CATEGORY_STYLES.QRCODE.label,
      color: CATEGORY_STYLES.QRCODE.color,
      variables: [...QRCODE_VARIABLE_PATHS],
    },
  };
}
