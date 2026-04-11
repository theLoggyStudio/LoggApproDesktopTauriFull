/** Fausses données réalistes pour les maquettes animées de la publicité */

export const mockPatients = [
  {
    id: '1',
    nom: 'Martin',
    prenom: 'Sophie',
    tel: '+221 77 312 45 89',
    age: 42,
    sexe: 'F',
    derniereVisite: '18/03/2026',
    prochainRdv: '02/04/2026',
    statut: 'Actif',
  },
  {
    id: '2',
    nom: 'Diallo',
    prenom: 'Amadou',
    tel: '+221 76 901 23 45',
    age: 35,
    sexe: 'M',
    derniereVisite: '12/03/2026',
    prochainRdv: '—',
    statut: 'Suivi',
  },
  {
    id: '3',
    nom: 'Ndiaye',
    prenom: 'Fatou',
    tel: '+221 70 445 67 12',
    age: 58,
    sexe: 'F',
    derniereVisite: '25/02/2026',
    prochainRdv: '28/03/2026',
    statut: 'Actif',
  },
  {
    id: '4',
    nom: 'Sarr',
    prenom: 'Ibrahima',
    tel: '+221 78 223 88 00',
    age: 29,
    sexe: 'M',
    derniereVisite: '20/03/2026',
    prochainRdv: '05/04/2026',
    statut: 'Nouveau',
  },
];

export const mockActes = [
  {
    id: 'a1',
    date: '28/03/2026',
    patient: 'Sophie Martin',
    acte: 'Consultation générale',
    praticien: 'Dr. Kane',
    montant: '25 000 F',
    statut: 'Facturé',
    progression: 100,
  },
  {
    id: 'a2',
    date: '28/03/2026',
    patient: 'Amadou Diallo',
    acte: 'Pansement complexe',
    praticien: 'Dr. Kane',
    montant: '15 000 F',
    statut: 'En cours',
    progression: 60,
  },
  {
    id: 'a3',
    date: '27/03/2026',
    patient: 'Fatou Ndiaye',
    acte: 'Échographie',
    praticien: 'Dr. Sy',
    montant: '45 000 F',
    statut: 'Validé',
    progression: 100,
  },
];

export const mockOrdonnanceLines = [
  { med: 'Amoxicilline 500 mg', poso: '1 cp x 3 / j', duree: '7 jours' },
  { med: 'Paracétamol 1 g', poso: 'Si douleur', duree: '5 jours' },
];

export const mockKpis = [
  { label: 'Patients actifs', value: 1248, suffix: '' },
  { label: 'Actes ce mois', value: 386, suffix: '' },
  { label: 'Revenus estimés', value: 12.4, suffix: ' M F' },
];

export const mockChartWeeks = [
  { label: 'S1', v: 42 },
  { label: 'S2', v: 58 },
  { label: 'S3', v: 51 },
  { label: 'S4', v: 67 },
];
