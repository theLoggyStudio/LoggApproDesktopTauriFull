/**
 * Configuration centralisée de la publicité LoggAppro.
 *
 * Modifiez ici :
 * - `slideTiming` : durées d’ouverture / fin et budget total pour calculer le temps par capture apkImg
 * - `marketingRotationForImageSlides` : rotation des messages sur les diapos images
 * - `marketingCopy` : textes par identifiant de module
 * - `colors`, `defaults`, `PUB_TRANSITION_MS`
 */

export type SceneId =
  | 'opening'
  | 'intro'
  | 'patients'
  | 'dossier'
  | 'actes'
  | 'ordonnances'
  | 'etats'
  | 'stats'
  | 'documents'
  | 'mosaic'
  | 'ending';

/** Durée du fondu / slide entre deux scènes (ms) */
export const PUB_TRANSITION_MS = 850;

/** Variantes d’animation dans le cadre jaune (voir CSS `pub-img-slide__viewport--lot-*`). */
export const SLIDE_ANIM_LOT_COUNT = 6;

/**
 * Timings : une diapositive par fichier dans assets/apkImg (tri alphabétique).
 * Durée par image ≈ (targetTotalMs − ouverture − fin) ÷ nombre d’images, bornée par min/max.
 */
export const slideTiming = {
  splashOpeningMs: 12_000,
  splashEndingMs: 12_000,
  /** Durée totale visée (~2 min 45 s avec ~22 captures). */
  targetTotalMs: 165_000,
  perImageMinMs: 3_500,
  perImageMaxMs: 9_000,
} as const;

/** Ordre de rotation des textes marketing sur les diapos « capture écran ». */
export const marketingRotationForImageSlides: SceneId[] = [
  'intro',
  'patients',
  'dossier',
  'actes',
  'ordonnances',
  'etats',
  'stats',
  'documents',
  'mosaic',
];

export function computePerImageSlideMs(imageCount: number): number {
  if (imageCount <= 0) return 8_000;
  const edge = slideTiming.splashOpeningMs + slideTiming.splashEndingMs;
  const avail = Math.max(
    slideTiming.targetTotalMs - edge,
    imageCount * slideTiming.perImageMinMs,
  );
  const raw = Math.floor(avail / imageCount);
  return Math.min(
    slideTiming.perImageMaxMs,
    Math.max(slideTiming.perImageMinMs, raw),
  );
}

export const colors = {
  /** Fond principal de la publicité */
  background: '#3a1568',
  backgroundDeep: '#2a0f4d',
  /** Cadres type « écran logiciel » */
  frame: '#fdda37',
  frameInner: '#f8f4e8',
  frameBorder: '#c9a227',
  /** Aligné sur le splash index.html / thème */
  accent: '#5a28a5',
  accentLight: '#7c4ddb',
  letterStart: '#fdda37',
  textOnDark: '#f5f0ff',
  textMuted: 'rgba(245, 240, 255, 0.72)',
  mockSurface: '#ffffff',
  mockBorder: 'rgba(90, 40, 165, 0.15)',
} as const;

export const defaults = {
  /** Lecture en boucle : aussi activable via ?loop=1 dans l’URL */
  loop: false,
  /** Affiche une barre de progression et le toggle boucle */
  showControls: true,
} as const;

/** Textes marketing / sous-titres par module (clés = SceneId) — utilisés en rotation sur les captures */
export const marketingCopy: Record<
  SceneId,
  { headline: string; sublines: string[] }
> = {
  opening: {
    headline: 'LoggAppro',
    sublines: ['La gestion clinique, repensée', 'Simple. Rapide. Moderne.'],
  },
  intro: {
    headline: 'Une plateforme pensée pour une gestion plus claire',
    sublines: ['De l’accueil du patient au pilotage de l’activité'],
  },
  patients: {
    headline: 'Retrouvez chaque patient en quelques secondes',
    sublines: [
      'Une page patient claire, rapide et pensée pour l’efficacité',
      'Recherche, tri, consultation et suivi dans un seul espace',
    ],
  },
  dossier: {
    headline: 'Chaque information du patient reste accessible et structurée',
    sublines: ['Consultez rapidement l’historique et les données essentielles'],
  },
  actes: {
    headline: 'Suivez chaque acte avec précision',
    sublines: [
      'Une gestion claire des soins, des statuts et des coûts',
      'Historique, organisation et visibilité en temps réel',
    ],
  },
  ordonnances: {
    headline: 'Créez vos ordonnances avec rapidité et clarté',
    sublines: [
      'Un rendu propre, structuré et prêt à l’impression',
      'Moins de saisie, plus de fluidité au quotidien',
    ],
  },
  etats: {
    headline: 'Concevez vos états avec souplesse',
    sublines: [
      'Construisez des pages claires, structurées et prêtes à l’analyse',
      'Textes, tableaux, blocs et aperçu final dans un même espace',
    ],
  },
  stats: {
    headline: 'Analysez votre activité en un regard',
    sublines: [
      'Des statistiques lisibles pour mieux décider',
      'Transformez vos données en vision claire',
    ],
  },
  documents: {
    headline: 'Des documents clairs, prêts à être partagés ou imprimés',
    sublines: [],
  },
  mosaic: {
    headline: 'Toute votre gestion dans une seule solution',
    sublines: ['Patients', 'Actes', 'Ordonnances', 'États', 'Statistiques'],
  },
  ending: {
    headline: 'LoggAppro',
    sublines: ['La gestion clinique, repensée', 'Organisez. Suivez. Analysez.'],
  },
};

export function sumDurationsMs(durations: readonly number[]): number {
  return durations.reduce((a, b) => a + b, 0);
}
