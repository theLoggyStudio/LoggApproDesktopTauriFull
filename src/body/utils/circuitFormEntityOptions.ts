import {
  fetchArticles,
  fetchMovements,
  fetchParties,
  fetchRefItems,
  fetchStockCircuits,
  fetchStockDocuments,
  fetchStockRoles,
} from "../../lib/stockApi";
import { isCircuitEntityFieldType, type CircuitEntityFieldType } from "./circuitFieldTypes";

export type EntitySelectOption = { value: string; label: string };

export type CircuitFormEntityOptions = Partial<Record<CircuitEntityFieldType, EntitySelectOption[]>>;

function refItemLabel(name: string, code?: string, extra?: string): string {
  const c = (code ?? "").trim();
  const base = c ? `${name} (${c})` : name;
  return extra ? `${base} — ${extra}` : base;
}

/** Charge les listes pour les champs de type « sélection écran ». */
export async function loadCircuitFormEntityOptions(): Promise<CircuitFormEntityOptions> {
  const [
    articles,
    suppliers,
    clients,
    movements,
    documents,
    warehouses,
    locations,
    circuits,
    roles,
  ] = await Promise.all([
    fetchArticles().catch(() => []),
    fetchParties("SUPPLIER").catch(() => []),
    fetchParties("CLIENT").catch(() => []),
    fetchMovements().catch(() => []),
    fetchStockDocuments().catch(() => []),
    fetchRefItems("warehouse").catch(() => []),
    fetchRefItems("location").catch(() => []),
    fetchStockCircuits().catch(() => []),
    fetchStockRoles().catch(() => []),
  ]);

  const moveTypeLbl = (t: string) => {
    const m = t.toUpperCase();
    if (m === "IN") return "Entrée";
    if (m === "OUT") return "Sortie";
    if (m === "ADJ") return "Ajustement";
    return t;
  };

  return {
    article: articles.map((a) => ({
      value: a.id,
      label: `${a.name} (${a.sku})`,
    })),
    fournisseur: suppliers.map((p) => ({
      value: p.id,
      label: (p.name || "").trim() || p.id,
    })),
    client: clients.map((p) => ({
      value: p.id,
      label: (p.name || "").trim() || p.id,
    })),
    movement: movements.slice(0, 500).map((m) => {
      const d = m.createdAt ? new Date(m.createdAt).toLocaleString("fr-FR") : "";
      return {
        value: m.id,
        label: `${m.articleName} — ${moveTypeLbl(m.moveType)}${d ? ` (${d})` : ""}`,
      };
    }),
    document: documents.map((d) => ({
      value: d.id,
      label: `${d.originalName}${d.kind ? ` (${d.kind})` : ""}`,
    })),
    warehouse: warehouses.map((w) => ({
      value: w.id,
      label: refItemLabel(w.name, w.code),
    })),
    location: locations.map((l) => ({
      value: l.id,
      label: refItemLabel(l.name, l.code, l.warehouseName),
    })),
    circuit: circuits.map((c) => ({
      value: c.id,
      label: (c.name || "").trim() || c.id,
    })),
    role: roles.map((r) => ({
      value: r.id,
      label: (r.name || "").trim() || r.id,
    })),
  };
}

/** Résout un id stocké en libellé lisible (aperçu / impression). */
export function resolveEntityFieldDisplayValue(
  type: string,
  stored: string,
  options: CircuitFormEntityOptions,
): string {
  const v = (stored ?? "").trim();
  if (!v) return "";
  if (!isCircuitEntityFieldType(type)) return v;
  const hit = options[type]?.find((o) => o.value === v);
  return hit?.label ?? v;
}
