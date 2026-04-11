import { PageProfilController } from '../../../controllers/PageProfilController.js';

/**
 * Ligne normalisée pour les sélecteurs Page État (personnel du cabinet hors patient).
 * Regroupe assistants, comptables, secrétaires et fiches « type collaborateur » (Profil).
 */
export type EtatStaffRow = {
  id: string;
  nom: string;
  prenom: string;
  login: string;
  telephone: string;
  naissance: string;
  adresse: string;
  role: string;
  loggId: string;
  /** Rôle ou type affiché (ex. assistant, docteur, nom du TypeCollaborateur). */
  sourceLabel: string;
};

function asArray(x: unknown): any[] {
  if (Array.isArray(x)) return x;
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    for (const k of ['assistants', 'comptables', 'secretaires', 'collaborateurs', 'data', 'list']) {
      if (Array.isArray(o[k])) return o[k] as any[];
    }
  }
  return [];
}

function normalizeStaffRow(raw: any, roleLabel: string): EtatStaffRow {
  const loggId = String(raw?.loggId ?? raw?.logg_id ?? '').trim();
  const fromId = String(raw?.id ?? '').trim();
  /** Certaines fiches n’ont que loggId ou login — sans quoi la ligne était ignorée. */
  const id = fromId || loggId || String(raw?.login ?? '').trim();
  return {
    id,
    nom: String(raw?.nom ?? ''),
    prenom: String(raw?.prenom ?? ''),
    login: String(raw?.login ?? ''),
    telephone: String(raw?.telephone ?? ''),
    naissance: String(raw?.naissance ?? ''),
    adresse: String(raw?.adresse ?? ''),
    role: String(raw?.role ?? roleLabel),
    loggId: loggId || fromId,
    sourceLabel: roleLabel,
  };
}

function sortStaffRows(rows: EtatStaffRow[]): EtatStaffRow[] {
  return rows.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
}

async function addTypedCollaborateursToMap(
  mapById: Map<string, EtatStaffRow>,
  tabId: string,
  ctrl: ReturnType<typeof PageProfilController>,
  limit: number
): Promise<void> {
  const addAll = (items: any[], label: string) => {
    for (const it of items) {
      const row = normalizeStaffRow(it, label);
      if (!row.id) continue;
      mapById.set(row.id, row);
    }
  };

  let types: any[] = [];
  try {
    const t = await ctrl.listerTypesCollaborateur(tabId);
    types = asArray(t);
  } catch {
    types = [];
  }

  for (const t of types) {
    const tid = t?.id;
    if (!tid) continue;
    try {
      const collabs = await ctrl.listerCollaborateursByType(String(tid), tabId, limit);
      const typeName = String(t?.nom ?? t?.libelle ?? 'Type collaborateur');
      addAll(asArray(collabs), typeName);
    } catch {
      /* ignorer un type en erreur */
    }
  }
}

async function appendCabinetStaffForTabId(
  mapById: Map<string, EtatStaffRow>,
  tabId: string,
  pays: string
): Promise<void> {
  const ctrl = PageProfilController(pays);
  const limit = 500;

  const addAll = (items: any[], label: string) => {
    for (const it of items) {
      const row = normalizeStaffRow(it, label);
      if (!row.id) continue;
      mapById.set(row.id, row);
    }
  };

  const [assistants, comptables, secretaires] = await Promise.all([
    ctrl.listerAssistants(tabId, limit).catch(() => []),
    ctrl.listerComptables(tabId, limit).catch(() => []),
    ctrl.listerSecretaires(tabId, limit).catch(() => []),
  ]);
  addAll(asArray(assistants), 'assistant');
  addAll(asArray(comptables), 'comptable');
  addAll(asArray(secretaires), 'secretaire');

  await addTypedCollaborateursToMap(mapById, tabId, ctrl, limit);
}

/**
 * Personnel du cabinet (hors docteur) : assistants, comptables, secrétaires, fiches par type collaborateur.
 * Fusionne `tabId` et `main` quand ils diffèrent (données souvent rangées sous l’un ou l’autre).
 */
export async function listCabinetStaffForUserPicker(tabId: string, pays: string): Promise<EtatStaffRow[]> {
  if (!tabId?.trim() || !pays?.trim()) return [];

  const mapById = new Map<string, EtatStaffRow>();
  const tabIds = tabId === 'main' ? ['main'] : [...new Set([tabId.trim(), 'main'])];

  try {
    for (const tid of tabIds) {
      try {
        await appendCabinetStaffForTabId(mapById, tid, pays);
      } catch (e) {
        console.error('appendCabinetStaffForTabId', tid, e);
      }
    }
  } catch (e) {
    console.error('listCabinetStaffForUserPicker', e);
  }

  return sortStaffRows(Array.from(mapById.values()));
}

/** Pour le sélecteur {{user.*}} : ajoute le docteur du cabinet en tête (dédoublonné par id). */
export function mergeDocteurIntoUserPickerList(
  staff: EtatStaffRow[],
  docteur: unknown,
  tabId: string
): EtatStaffRow[] {
  const row = docteurToEtatStaffRow(docteur, tabId);
  if (!row) return staff;
  const rest = staff.filter((s) => s.id !== row.id);
  return [row, ...rest];
}

function docteurToEtatStaffRow(docteur: unknown, tabId: string): EtatStaffRow | null {
  if (!docteur || typeof docteur !== 'object') return null;
  const d = docteur as Record<string, unknown>;
  const id = String(d.id ?? d.loggId ?? '').trim();
  if (!id) return null;
  return {
    id,
    nom: String(d.nom ?? ''),
    prenom: String(d.prenom ?? ''),
    login: String(d.login ?? ''),
    telephone: String(d.telephone ?? ''),
    naissance: String(d.naissance ?? ''),
    adresse: String(d.adresse ?? ''),
    role: 'docteur',
    loggId: String(d.loggId ?? d.logg_id ?? tabId),
    sourceLabel: 'docteur',
  };
}
