import {
  ACTE_FIELD_REGISTRY,
  COLLABORATEUR_FIELD_REGISTRY,
  PATIENT_FIELD_REGISTRY,
  type TableEntityKind,
} from './medicalVariablesRegistry.js';

export type TableColumnsVisibility = Record<string, boolean>;

type RegistryRow =
  | (typeof PATIENT_FIELD_REGISTRY)[number]
  | (typeof ACTE_FIELD_REGISTRY)[number]
  | (typeof COLLABORATEUR_FIELD_REGISTRY)[number];

function getRegistryForEntity(entity: TableEntityKind): RegistryRow[] {
  if (entity === 'patient') return PATIENT_FIELD_REGISTRY;
  if (entity === 'acte') return ACTE_FIELD_REGISTRY;
  return COLLABORATEUR_FIELD_REGISTRY;
}

export function isPatientTableId(tableElementId: string): boolean {
  return tableElementId.includes('patients');
}

export function isCollaborateurTableId(tableElementId: string): boolean {
  return tableElementId.includes('collaborateurs');
}

/** Tableau « actes » : ni patients ni collaborateurs (`table_${ts}`). */
export function isActeTableId(tableElementId: string): boolean {
  return !isPatientTableId(tableElementId) && !isCollaborateurTableId(tableElementId);
}

export function buildInitialTableColumnState(entity: TableEntityKind): TableColumnsVisibility {
  const reg = getRegistryForEntity(entity);
  const out: TableColumnsVisibility = {};
  for (const f of reg) {
    if (f.table) {
      out[f.key] = f.table.defaultVisible;
    }
  }
  return out;
}

export function applyAllTableColumns(entity: TableEntityKind): TableColumnsVisibility {
  const reg = getRegistryForEntity(entity);
  const out: TableColumnsVisibility = {};
  for (const f of reg) {
    if (f.table) {
      out[f.key] = true;
    }
  }
  return out;
}

export function applyNoneTableColumns(entity: TableEntityKind): TableColumnsVisibility {
  const reg = getRegistryForEntity(entity);
  const out: TableColumnsVisibility = {};
  for (const f of reg) {
    if (f.table) {
      out[f.key] = false;
    }
  }
  return out;
}

export function applyEssentialTableColumns(entity: TableEntityKind): TableColumnsVisibility {
  const reg = getRegistryForEntity(entity);
  const out: TableColumnsVisibility = {};
  for (const f of reg) {
    if (f.table) {
      out[f.key] = f.table.essential;
    }
  }
  return out;
}

/** Colonnes par défaut pour un tableau vide (édition) — même logique que l’ancien code. */
export function getPlaceholderTableColumnKeys(entity: TableEntityKind): string[] {
  const reg = getRegistryForEntity(entity);
  return reg.filter((f) => f.table?.essential).map((f) => f.key);
}

export function getTableColumnLabel(entity: TableEntityKind, key: string): string {
  const reg = getRegistryForEntity(entity);
  const hit = reg.find((f) => f.key === key);
  return hit?.label ?? key.replace(/([A-Z])/g, ' $1').trim();
}

type GroupedFields = { group: string; groupOrder: number; fields: { key: string; label: string }[] }[];

export function getTableFieldGroups(entity: TableEntityKind): GroupedFields {
  const reg = getRegistryForEntity(entity);
  const map = new Map<string, { groupOrder: number; fields: { key: string; label: string }[] }>();
  for (const f of reg) {
    if (!f.table) continue;
    const g = f.table.group;
    const ord = f.table.groupOrder;
    if (!map.has(g)) {
      map.set(g, { groupOrder: ord, fields: [] });
    }
    map.get(g)!.fields.push({ key: f.key, label: f.label });
  }
  return Array.from(map.entries())
    .map(([group, v]) => ({ group, groupOrder: v.groupOrder, fields: v.fields }))
    .sort((a, b) => a.groupOrder - b.groupOrder || a.group.localeCompare(b.group));
}

export function inferTableEntityFromElementId(tableElementId: string): TableEntityKind {
  if (tableElementId.includes('patients')) return 'patient';
  if (tableElementId.includes('collaborateurs')) return 'collaborateur';
  return 'acte';
}
