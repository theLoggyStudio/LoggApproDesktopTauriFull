// Constantes pour les données médicales

import { buildVariableCategoriesFromRegistry } from '../medicalVariables/medicalVariablesRegistry.js';

/**
 * Variables alignées sur le registre central (`medicalVariablesRegistry.ts`)
 * et sur la résolution dans `PageEtat` → `renderVariableValue`.
 */
export const VARIABLE_CATEGORIES = buildVariableCategoriesFromRegistry();

/** Données de démonstration pour l’aperçu (variables non liées à un patient réel). À remplacer par les vraies données en mode aperçu. */
export const DEFAULT_MEDICAL_DATA = {
  cabinet: {
    nom: 'Cabinet dentaire (exemple)',
    adresse: 'Adresse du cabinet — à compléter',
    pays: 'France',
  },
  testPatient: {
    nom: 'DURAND',
    prenom: 'Camille',
    naissance: '12/06/1990',
    age: '—',
    adresse: 'Adresse patient (exemple)',
    telephone: '—'
  },
  testActes: [{
    nom: 'Soin / acte (exemple)',
    date: new Date().toLocaleDateString('fr-FR'),
    prix: '0',
    description: 'Description d’exemple pour l’aperçu du document'
  }],
  /** Texte d’exemple pour l’aperçu {{posologie}} sur la page État */
  testPosologie: {
    texte:
      '• Exemple — Médicament 500mg × 2 (Matin, Soir)\n• Exemple — Solution antiseptique × 1 (Midi)',
    date: new Date().toLocaleDateString('fr-FR'),
    lignes:
      '• Exemple — Médicament 500mg × 2 (Matin, Soir)\n• Exemple — Solution × 1 (Midi)'
  },
  testDocteur: {
    nom: 'MARTIN',
    prenom: 'Jean',
    login: 'praticien@exemple.fr',
    telephone: '+33 6 00 00 00 00',
    naissance: '',
    adresse: '—',
  },
  testUser: {
    nom: 'Utilisateur (exemple)'
  }
};

// Dimensions A4 en pixels (à 96 DPI)
export const A4_DIMENSIONS = {
  WIDTH: 794,  // 210mm
  HEIGHT: 1123  // 297mm
};
