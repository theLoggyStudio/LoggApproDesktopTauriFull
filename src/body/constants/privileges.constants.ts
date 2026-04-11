/**
 * Système de privilèges LoggAppro - Refonte complète
 *
 * Structure logique par domaine :
 * - [resource][action] : pat01 (patients.view), pat02 (patients.manage)
 * - acc01 : portail d'accès (abonnement actif) - requis pour que les autres privilèges fonctionnent
 *
 * Convention : code à 5 caractères (3 lettres + 2 chiffres)
 * - 01 = voir / lecture
 * - 02 = gérer / écriture (CRUD)
 */

// ==================== NOUVEAUX PRIVILÈGES (référence) ====================

export const PRIVILEGES = {
  // Accès (portail - requis pour les collaborateurs)
  acc01: { key: "access", label: "Accès à l'application", desc: "Abonnement actif, requis pour utiliser les autres privilèges" },

  // Patients
  pat01: { key: "patients.view", label: "Voir les patients", desc: "Consulter la liste et les fiches patients" },
  pat02: { key: "patients.manage", label: "Gérer les patients", desc: "Créer, modifier, supprimer des patients" },

  // Actes
  act01: { key: "acts.view", label: "Voir les actes", desc: "Consulter les actes médicaux des patients" },
  act02: { key: "acts.manage", label: "Gérer les actes", desc: "Créer, modifier, supprimer des actes" },

  // Posologie / ordonnance (fiche patient)
  pos01: { key: "posology.manage", label: "Posologie", desc: "Créer une posologie structurée (actes, médicaments) et QR pour le patient" },
  oso01: { key: "prescription.print", label: "Ordonnance PDF", desc: "Imprimer une ordonnance depuis les modèles d’état et un texte libre" },

  /** Affiche le lien « Gestion des éléments de base » dans Autres pages (sans ouvrir les accordéons sans les autres codes). */
  edb01: {
    key: "referentials.page",
    label: "Voir les éléments de base (menu Autres pages)",
    desc: "Affiche l’entrée de menu ; l’accès direct à l’URL reste possible avec les droits de section (gam, gas, …).",
  },

  /** Référentiel page Paramètres — accordéon actes médicaux (équivalent historique nma01 / nma02). */
  gam01: {
    key: "refActsMedical.view",
    label: "Voir la gestion des actes médicaux (référentiel)",
    desc: "Accordéon « Actes médicaux » sur la page Éléments de base",
  },
  gam02: {
    key: "refActsMedical.manage",
    label: "Gérer la gestion des actes médicaux (référentiel)",
    desc: "Modifier le catalogue des noms d’actes (page Éléments de base)",
  },
  gas01: {
    key: "refAssurances.view",
    label: "Voir la gestion des assurances (référentiel)",
    desc: "Accordéon Assurances — équivalent asr01",
  },
  gas02: {
    key: "refAssurances.manage",
    label: "Gérer la gestion des assurances (référentiel)",
    desc: "Équivalent asr02",
  },
  gmt01: {
    key: "refMaterials.view",
    label: "Voir la gestion des matériels médicaux (référentiel)",
    desc: "Accordéon Matériels — équivalent mat01",
  },
  gmt02: {
    key: "refMaterials.manage",
    label: "Gérer la gestion des matériels médicaux (référentiel)",
    desc: "Équivalent mat02",
  },
  gme01: {
    key: "refMedicaments.view",
    label: "Voir la gestion des médicaments (catalogue posologie)",
    desc: "Accordéon Médicaments en lecture",
  },
  gme02: {
    key: "refMedicaments.manage",
    label: "Gérer la gestion des médicaments (catalogue posologie)",
    desc: "Modifier le catalogue ; équivalent pos01 pour l’édition catalogue",
  },
  gtc01: {
    key: "refCollabTypes.view",
    label: "Voir la gestion des types de collaborateurs",
    desc: "Accordéon Types + partie Profil — équivalent col01",
  },
  gtc02: {
    key: "refCollabTypes.manage",
    label: "Gérer la gestion des types de collaborateurs",
    desc: "Équivalent col02",
  },
  pet01: {
    key: "etats.view",
    label: "Voir les états (page modèles)",
    desc: "Entrée menu Modèles d’état + consultation",
  },
  pet02: {
    key: "etats.manage",
    label: "Gérer les états (page modèles)",
    desc: "Création / édition / impression des modèles",
  },

  // Noms d'actes (référentiel) — codes historiques, équivalents gam01 / gam02
  nma01: { key: "acteNames.view", label: "Voir les noms d'actes", desc: "Consulter le catalogue des actes" },
  nma02: { key: "acteNames.manage", label: "Gérer les noms d'actes", desc: "Créer, modifier, supprimer des noms d'actes" },

  // Assurances (référentiel)
  asr01: { key: "assurances.view", label: "Voir les assurances", desc: "Consulter le catalogue des assurances" },
  asr02: { key: "assurances.manage", label: "Gérer les assurances", desc: "Créer, modifier, supprimer des assurances" },

  // Matériels (référentiel)
  mat01: { key: "materials.view", label: "Voir les matériels", desc: "Consulter le catalogue des matériels" },
  mat02: { key: "materials.manage", label: "Gérer les matériels", desc: "Créer, modifier, supprimer des matériels" },

  // Paiements
  pay01: { key: "payments.view", label: "Voir les paiements", desc: "Consulter les paiements et factures" },
  pay02: { key: "payments.manage", label: "Gérer les paiements", desc: "Enregistrer et modifier les paiements" },

  // Statistiques
  stt01: { key: "statistics.view", label: "Voir les statistiques", desc: "Accéder aux tableaux de bord et statistiques" },

  // Impression
  prt01: { key: "reports.print", label: "Imprimer", desc: "Imprimer et télécharger des documents" },

  // Import / Export Excel (éléments de base)
  iex01: { key: "data.import", label: "Importer Excel", desc: "Importer des données depuis un fichier Excel" },
  iex02: { key: "data.export", label: "Exporter Excel", desc: "Exporter des tableaux en fichier Excel" },
  iex03: { key: "data.schema", label: "Schéma import (nouvelles colonnes)", desc: "Autoriser les colonnes NEW_ dans les fichiers CSV importés" },

  // Profil
  prf01: { key: "profile.view", label: "Voir les profils", desc: "Consulter les profils des membres du cabinet" },
  prf02: { key: "profile.manage", label: "Modifier le profil", desc: "Modifier son profil et les paramètres du cabinet" },

  // Cabinet
  cab01: { key: "cabinet.manage", label: "Gérer le cabinet", desc: "Paramètres généraux du cabinet" },

  // Collaborateurs
  col01: { key: "collaborators.view", label: "Voir les collaborateurs", desc: "Consulter la liste des collaborateurs" },
  col02: { key: "collaborators.manage", label: "Gérer les collaborateurs", desc: "Créer, modifier, supprimer des collaborateurs et types" },

  // Privilèges
  prv01: { key: "privileges.view", label: "Voir les privilèges", desc: "Consulter les privilèges des utilisateurs" },
  prv02: { key: "privileges.manage", label: "Modifier les privilèges", desc: "Attribuer ou retirer des privilèges" },

  // QR codes
  qrc01: { key: "qrcodes.view", label: "Voir les QR codes", desc: "Générer et afficher les QR codes" },

  // Audit / Journal
  aud01: { key: "audit.view", label: "Voir le journal", desc: "Consulter l'historique des actions du cabinet" },

  // Configuration (API PayDunya, base de données)
  cfg01: { key: "config.view", label: "Voir la configuration", desc: "Consulter les clés API et paramètres de la base" },
  cfg02: { key: "config.manage", label: "Modifier la configuration", desc: "Modifier les clés API et paramètres (admin uniquement)" },
} as const;

export type PrivilegeCode = keyof typeof PRIVILEGES;

/** Tous les codes connus — utilisé côté UI pour le super-admin (affichage / QR / menus comme un compte « plein droits »). */
export const ALL_KNOWN_PRIVILEGE_CODES: PrivilegeCode[] = Object.keys(PRIVILEGES) as PrivilegeCode[];

/**
 * Jeu « catalogue » complet (tous les codes {@link PRIVILEGES}) — aligné sur l’intention du défaut docteur côté API.
 * Le backend ajoute encore des codes legacy dans `PRIV_NOM_DEFAUT_DOCTEUR` (`commands.rs`) pour les bases historiques.
 */
export const PRIV_DEFAULT_FULL_CATALOG_CSV: string = ALL_KNOWN_PRIVILEGE_CODES.join(",");

/** Uniquement le lien « Gestion des éléments de base » dans NavTop (Autres pages). */
export const PAGE_PARAMETRE_NAV_CODES: readonly string[] = ["edb01"];

/**
 * Accès à la route / page Paramètres (sans forcément voir le menu) + garde `hasAccess`.
 * Inclut les codes métier gam/gas/gmt/gme/gtc et les équivalents historiques.
 */
export const PAGE_PARAMETRE_PAGE_ACCESS_CODES: readonly string[] = [
  "edb01",
  "gam01",
  "gam02",
  "gas01",
  "gas02",
  "gmt01",
  "gmt02",
  "gme01",
  "gme02",
  "gtc01",
  "gtc02",
  "nma01",
  "nma02",
  "asr01",
  "asr02",
  "mat01",
  "mat02",
  "col01",
  "col02",
  "pos01",
  "act02",
];

/** @deprecated Utiliser PAGE_PARAMETRE_PAGE_ACCESS_CODES */
export const PAGE_PARAMETRE_ACCESS_TOKEN_CODES: readonly string[] = PAGE_PARAMETRE_PAGE_ACCESS_CODES;

/**
 * Ouvre le portail checkPrivilege sans acc01/pat/prf (référentiels, page états).
 * @see helpers.tsx `hasAccess`
 */
export const AUTH_PORTAL_EXTRA_CODES: readonly string[] = Array.from(
  new Set([
    ...PAGE_PARAMETRE_PAGE_ACCESS_CODES,
    "pet01",
    "pet02",
    "prt01",
    "imp01",
    "oso01",
  ])
);

// ==================== MAPPING ANCIEN -> NOUVEAU (migration) ====================

/** Codes anciens acceptés comme équivalents (rétrocompatibilité) */
export const LEGACY_TO_NEW: Record<string, PrivilegeCode[]> = {
  slf01: ["prf01"],
  crd02: ["pat02"],
  crd03: ["act02"],
  crd04: ["nma02", "mat02"],
  crd05: ["asr02"],
  crd06: ["col02"],
  crd07: ["col02"],
  crd08: ["col02"],
  crd09: ["prf02"],
  stt01: ["stt01"],
  imp01: ["prt01"],
  vpr01: ["pat01"],
  vac01: ["act01"],
  vna01: ["nma01", "mat01"],
  vns01: ["asr01"],
  vac02: ["aud01"],
  vqr01: ["qrc01"],
  apy01: ["acc01", "pay02"],
  /** Ancien code « export Excel » (lignes Rust / rôles par défaut) */
  exp01: ["iex02"],
  mpr01: ["prf02"],
  vpf01: ["prf01"],
  vpv01: ["prv01"],
  mpv01: ["prv02"],
};

/** Pour un code donné, liste des codes (nouveaux ou anciens) qui accordent ce privilège */
const _CODES: Record<string, string[]> = {
  acc01: ["acc01", "apy01"],
  pat01: ["pat01", "vpr01"],
  pat02: ["pat02", "crd02"],
  act01: ["act01", "vac01"],
  act02: ["act02", "crd03"],
  pos01: ["pos01", "gme01", "gme02"],
  oso01: ["oso01", "pet01", "pet02"],
  edb01: ["edb01"],
  gam01: ["gam01", "nma01", "vna01"],
  gam02: ["gam02", "nma02", "crd04"],
  gas01: ["gas01", "asr01", "vns01"],
  gas02: ["gas02", "asr02", "crd05"],
  gmt01: ["gmt01", "mat01", "vna01", "nma01"],
  gmt02: ["gmt02", "mat02", "crd04", "nma02"],
  gme01: ["gme01", "pos01"],
  gme02: ["gme02", "pos01"],
  gtc01: ["gtc01", "col01", "crd06", "crd07", "crd08"],
  gtc02: ["gtc02", "col02", "crd06", "crd07", "crd08"],
  pet01: ["pet01", "prt01", "imp01", "oso01", "pet02"],
  pet02: ["pet02", "prt01", "oso01"],
  nma01: ["nma01", "vna01", "gam01"],
  nma02: ["nma02", "crd04", "gam02"],
  asr01: ["asr01", "vns01", "gas01"],
  asr02: ["asr02", "crd05", "gas02"],
  mat01: ["mat01", "vna01", "nma01", "gmt01"],
  mat02: ["mat02", "crd04", "nma02", "gmt02"],
  pay01: ["pay01"],
  pay02: ["pay02", "apy01"],
  stt01: ["stt01"],
  prt01: ["prt01", "imp01", "pet01", "pet02", "oso01"],
  iex01: ["iex01"],
  iex02: ["iex02", "exp01"],
  iex03: ["iex03"],
  prf01: ["prf01", "vpf01", "slf01"],
  prf02: ["prf02", "mpr01", "crd09"],
  /** Avant la séparation cab01, « modifier le profil » incluait souvent le cabinet. */
  cab01: ["cab01", "prf02", "mpr01", "crd09"],
  /** col02 (ou anciens crd06–08) implique au minimum la vue des collaborateurs. */
  col01: ["col01", "col02", "crd06", "crd07", "crd08", "gtc01", "gtc02"],
  col02: ["col02", "crd06", "crd07", "crd08", "gtc02"],
  prv01: ["prv01", "vpv01"],
  prv02: ["prv02", "mpv01"],
  qrc01: ["qrc01", "vqr01"],
  aud01: ["aud01", "vac02"],
  cfg01: ["cfg01"],
  cfg02: ["cfg02"],
};

/** Rétrocompatibilité : anciens codes mappés vers les mêmes validCodes */
export const CODES_FOR_PRIVILEGE: Record<string, string[]> = {
  ..._CODES,
  slf01: _CODES.prf01,
  crd02: _CODES.pat02,
  crd03: _CODES.act02,
  crd04: _CODES.nma02,
  crd05: _CODES.asr02,
  crd06: _CODES.col02,
  crd07: _CODES.col02,
  crd08: _CODES.col02,
  crd09: _CODES.prf02,
  imp01: _CODES.prt01,
  vpr01: _CODES.pat01,
  vac01: _CODES.act01,
  vna01: _CODES.nma01,
  vns01: _CODES.asr01,
  vac02: _CODES.aud01,
  vqr01: _CODES.qrc01,
  apy01: _CODES.pay02,
  mpr01: _CODES.prf02,
  vpf01: _CODES.prf01,
  vpv01: _CODES.prv01,
  mpv01: _CODES.prv02,
};

// ==================== MAPPING NOM -> CODE (pour encodePrivileges) ====================

export const PRIVILEGE_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(PRIVILEGES).map(([code, p]) => [p.key, code])
) as Record<string, string>;

// Ajouter les anciens noms pour compatibilité
const OLD_NAMES: Record<string, string> = {
  selfInfo: "prf01",
  crudPatient: "pat02",
  crudActe: "act02",
  crudNomActe: "nma02",
  crudNomAssurance: "asr02",
  crudAssistant: "col02",
  crudComptable: "col02",
  crudSecretaire: "col02",
  crudProfil: "prf02",
  statistique: "stt01",
  impression: "prt01",
  voirPatient: "pat01",
  voirActe: "act01",
  voirNomActe: "nma01",
  voirNomAssurance: "asr01",
  voirAction: "aud01",
  voirQrCode: "qrc01",
  modifierProfil: "prf02",
  voirProfil: "prf01",
  voirPrivileges: "prv01",
  modifierPrivileges: "prv02",
  aPayer: "acc01",
  referentialsPage: "edb01",
  elementsDeBase: "edb01",
};
Object.assign(PRIVILEGE_TO_CODE, OLD_NAMES);

// Mapping inverse code -> nom (pour decodePrivileges)
export const CODE_TO_PRIVILEGE: Record<string, string> = Object.fromEntries(
  Object.entries(PRIVILEGES).map(([code, p]) => [code, p.key])
);

// ==================== FONCTIONS UTILITAIRES ====================

/**
 * Encode une liste de privilèges (noms ou codes) vers une chaîne de codes séparés par des virgules
 */
export function encodePrivileges(privileges: string[] | string): string {
  if (!privileges) return "";
  const privArray = typeof privileges === "string"
    ? privileges.split(",").map((p) => p.trim()).filter(Boolean)
    : privileges;
  return privArray
    .map((priv) => PRIVILEGE_TO_CODE[priv.trim()] || priv.trim())
    .filter(Boolean)
    .join(",");
}

/**
 * Libellé français pour un code (alertes, récap) — préfère {@link PRIVILEGES}.
 */
export function getPrivilegeDisplayLabel(code: string): string {
  const c = String(code ?? "").trim().toLowerCase();
  if (!c) return "";
  if (Object.prototype.hasOwnProperty.call(PRIVILEGES, c)) {
    return (PRIVILEGES as Record<string, { label: string }>)[c].label;
  }
  return c;
}

/**
 * Décode une chaîne de codes vers une liste de clés techniques (ex. patients.view) — usage historique / debug.
 */
export function decodePrivileges(encodedPrivileges: string): string[] {
  if (!encodedPrivileges) return [];
  const codes = encodedPrivileges.split(",").map((c) => c.trim()).filter(Boolean);
  return codes.map((code) => CODE_TO_PRIVILEGE[code] || code);
}

/**
 * Chaîne de libellés français pour affichage utilisateur (alertes, exports texte).
 */
export function decodePrivilegesToString(encodedPrivileges: string): string {
  if (!encodedPrivileges) return "";
  const raw = encodedPrivileges.split(",").map((c) => c.trim()).filter(Boolean);
  const normalized = normalizeToNewCodes(raw);
  return normalized.map((c) => getPrivilegeDisplayLabel(c)).join(", ");
}

/**
 * Vérifie si un privilège est présent dans une chaîne encodée
 */
export function hasPrivilege(privilege: string, encodedPrivileges: string): boolean {
  if (!privilege || !encodedPrivileges) return false;
  const code = PRIVILEGE_TO_CODE[privilege] || privilege;
  const codes = encodedPrivileges.split(",").map((c) => c.trim());
  return codes.includes(code);
}

/**
 * Normalise des codes chargés (anciens ou nouveaux) vers les codes actuels.
 * Utilisé pour l'affichage dans ProfilPhoto et les modals.
 */
export function normalizeToNewCodes(loaded: string[]): string[] {
  const result = new Set<string>();
  for (const raw of loaded) {
    const t = String(raw ?? "").trim();
    if (!t) continue;

    const lower = t.toLowerCase();

    // Code actuel (insensible à la casse, ex. PAT01 → pat01)
    if (Object.prototype.hasOwnProperty.call(PRIVILEGES, lower)) {
      result.add(lower);
      continue;
    }

    // Anciens codes courts (ex. vpr01, exp01, crd02)
    const legacy = LEGACY_TO_NEW[lower] ?? LEGACY_TO_NEW[t];
    if (legacy) {
      legacy.forEach((c) => result.add(c));
      continue;
    }

    // Clés sémantiques ou anciens noms (ex. patients.view, voirPatient) — aligné sur checkPrivilege
    const fromKey = PRIVILEGE_TO_CODE[t] ?? PRIVILEGE_TO_CODE[lower];
    if (fromKey && Object.prototype.hasOwnProperty.call(PRIVILEGES, fromKey)) {
      result.add(fromKey);
      continue;
    }
  }
  return Array.from(result);
}

/** Ligne d’en-tête ou case à cocher dans les modals Profil (types collaborateurs, etc.) */
export type PrivilegeSelectionRow =
  | { type: "heading"; id: string; title: string; hint?: string }
  | { type: "item"; code: string; label: string };

/**
 * Liste ordonnée avec sections : les accordéons de la page « Gestion des éléments de base »
 * (Autres pages) sont regroupés et nommés explicitement (codes nma / asr / mat / pos / col / edb).
 */
export const PRIVILEGE_SELECTION_ROWS: PrivilegeSelectionRow[] = [
  { type: "heading", id: "acc-pat", title: "Accès & patients" },
  { type: "item", code: "acc01", label: "Accès à l'application [acc01]" },
  { type: "item", code: "pat01", label: "Voir les patients [pat01]" },
  { type: "item", code: "pat02", label: "Gérer les patients [pat02]" },

  {
    type: "heading",
    id: "edb",
    title: "Page « Gestion des éléments de base »",
    hint:
      "edb01 = lien « Autres pages » uniquement. L’URL / page s’ouvre avec gam/gas/gmt/gme/gtc (ou nma/asr/mat/pos/col) ou act02. Chaque accordéon suit sa paire voir/gérer.",
  },
  { type: "item", code: "edb01", label: "Voir le menu « Gestion des éléments de base » (Autres pages) [edb01]" },
  { type: "item", code: "gam01", label: "Voir la gestion des actes médicaux — référentiel [gam01]" },
  { type: "item", code: "gam02", label: "Gérer la gestion des actes médicaux — référentiel [gam02]" },
  { type: "item", code: "gas01", label: "Voir la gestion des assurances — référentiel [gas01]" },
  { type: "item", code: "gas02", label: "Gérer la gestion des assurances — référentiel [gas02]" },
  { type: "item", code: "gmt01", label: "Voir la gestion des matériels médicaux — référentiel [gmt01]" },
  { type: "item", code: "gmt02", label: "Gérer la gestion des matériels médicaux — référentiel [gmt02]" },
  { type: "item", code: "gme01", label: "Voir la gestion des médicaments (catalogue posologie) [gme01]" },
  { type: "item", code: "gme02", label: "Gérer la gestion des médicaments (catalogue posologie) [gme02]" },
  { type: "item", code: "gtc01", label: "Voir la gestion des types de collaborateurs [gtc01]" },
  { type: "item", code: "gtc02", label: "Gérer la gestion des types de collaborateurs [gtc02]" },
  { type: "item", code: "nma01", label: "Équivalent gam01 — noms d’actes (voir) [nma01]" },
  { type: "item", code: "nma02", label: "Équivalent gam02 — noms d’actes (gérer) [nma02]" },
  { type: "item", code: "asr01", label: "Équivalent gas01 — assurances (voir) [asr01]" },
  { type: "item", code: "asr02", label: "Équivalent gas02 — assurances (gérer) [asr02]" },
  { type: "item", code: "mat01", label: "Équivalent gmt01 — matériels (voir) [mat01]" },
  { type: "item", code: "mat02", label: "Équivalent gmt02 — matériels (gérer) [mat02]" },
  {
    type: "item",
    code: "pos01",
    label:
      "Posologie fiche patient + édition catalogue médicaments (équivalent gme02 côté catalogue) [pos01]",
  },
  {
    type: "item",
    code: "col01",
    label:
      "Équivalent gtc01 — types collaborateurs (voir) + liste collaborateurs Profil [col01]",
  },
  {
    type: "item",
    code: "col02",
    label:
      "Équivalent gtc02 — types collaborateurs (gérer) + gestion collaborateurs Profil [col02]",
  },
  { type: "item", code: "act02", label: "Gérer les actes (fiche patient) + accès page Éléments de base [act02]" },

  { type: "heading", id: "actes-fiche", title: "Actes, ordonnances & modèles d’état" },
  { type: "item", code: "act01", label: "Voir les actes [act01]" },
  { type: "item", code: "oso01", label: "Ordonnance PDF (modèles d’état) [oso01]" },
  { type: "item", code: "pet01", label: "Voir les états — menu Modèles d’état + consultation [pet01]" },
  { type: "item", code: "pet02", label: "Gérer les états — création / édition / impression modèles [pet02]" },

  { type: "heading", id: "fin", title: "Paiements, impression, profil, etc." },
  { type: "item", code: "pay01", label: "Voir les paiements [pay01]" },
  { type: "item", code: "pay02", label: "Gérer les paiements [pay02]" },
  { type: "item", code: "stt01", label: "Statistiques [stt01]" },
  { type: "item", code: "prt01", label: "Imprimer (historique ; couvre aussi l’édition page États avec pet02) [prt01]" },
  { type: "item", code: "iex01", label: "Importer Excel [iex01]" },
  { type: "item", code: "iex02", label: "Exporter Excel [iex02]" },
  { type: "item", code: "iex03", label: "Schéma import (colonnes NEW_) [iex03]" },
  { type: "item", code: "prf01", label: "Voir les profils [prf01]" },
  { type: "item", code: "prf02", label: "Modifier le profil [prf02]" },
  { type: "item", code: "cab01", label: "Gérer le cabinet [cab01]" },
  { type: "item", code: "prv01", label: "Voir les privilèges [prv01]" },
  { type: "item", code: "prv02", label: "Modifier les privilèges [prv02]" },
  { type: "item", code: "qrc01", label: "Voir les QR codes [qrc01]" },
  { type: "item", code: "aud01", label: "Voir le journal [aud01]" },
  { type: "item", code: "cfg01", label: "Voir la configuration [cfg01]" },
  { type: "item", code: "cfg02", label: "Modifier la configuration [cfg02]" },
];

/** Liste plate (mêmes libellés détaillés) — compatibilité si un module map() sans sections. */
export const PRIVILEGE_LIST_FOR_SELECTION: { code: string; label: string }[] = PRIVILEGE_SELECTION_ROWS.filter(
  (r): r is { type: "item"; code: string; label: string } => r.type === "item"
).map(({ code, label }) => ({ code, label }));
