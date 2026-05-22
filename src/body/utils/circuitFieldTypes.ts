import { getPageTexts } from "../../hooks/usePageTexts";

/** Types scalaires (saisie libre). */
export const CIRCUIT_SCALAR_FIELD_TYPES = ["text", "number", "date", "textarea"] as const;

/** Types « sélection » liés à un écran / référentiel stock (comme `article`). */
export const CIRCUIT_ENTITY_FIELD_TYPES = [
  "article",
  "fournisseur",
  "client",
  "movement",
  "document",
  "warehouse",
  "location",
  "circuit",
  "role",
] as const;

export type CircuitScalarFieldType = (typeof CIRCUIT_SCALAR_FIELD_TYPES)[number];
export type CircuitEntityFieldType = (typeof CIRCUIT_ENTITY_FIELD_TYPES)[number];
export type CircuitFieldType = CircuitScalarFieldType | CircuitEntityFieldType;

const ENTITY_SET = new Set<string>(CIRCUIT_ENTITY_FIELD_TYPES);

export function isCircuitEntityFieldType(t: string): t is CircuitEntityFieldType {
  return ENTITY_SET.has(t);
}

export function normalizeCircuitFieldType(raw: string): CircuitFieldType {
  const x = raw.trim().toLowerCase();
  if ((CIRCUIT_SCALAR_FIELD_TYPES as readonly string[]).includes(x)) return x as CircuitScalarFieldType;
  if (isCircuitEntityFieldType(x)) return x;
  return "text";
}

/** Libellés des types de champ (index `stockCircuits` 16–19, 37, 44–51). */
export function circuitFieldTypeLabel(type: string): string {
  const C = getPageTexts("stockCircuits");
  const map: Record<string, number> = {
    text: 16,
    number: 17,
    date: 18,
    textarea: 19,
    article: 37,
    fournisseur: 44,
    client: 45,
    movement: 46,
    document: 47,
    warehouse: 48,
    location: 49,
    circuit: 50,
    role: 51,
  };
  const idx = map[type];
  return idx !== undefined ? (C[idx] ?? type) : type;
}

export function buildCircuitFieldTypeSelectOptions(): { value: CircuitFieldType; label: string }[] {
  return [...CIRCUIT_SCALAR_FIELD_TYPES, ...CIRCUIT_ENTITY_FIELD_TYPES].map((value) => ({
    value,
    label: circuitFieldTypeLabel(value),
  }));
}
