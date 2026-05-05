import { STOCK_SYSTEM_MOVEMENT_FORM_TEMPLATE_ID, fetchStockFormTemplate } from "../../lib/stockApi";

export type CircuitFieldType = "text" | "number" | "date" | "textarea" | "article";

export type CircuitStepFieldDraft = {
  key: string;
  /** Identifiant stable sérialisé (ex. sys-mvt-article). */
  fieldId?: string;
  label: string;
  type: CircuitFieldType;
  required: boolean;
  locked?: boolean;
};

export function newCircuitFieldKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeFieldType(t: string): CircuitFieldType {
  const x = t.toLowerCase();
  if (x === "number" || x === "date" || x === "textarea" || x === "article") return x;
  return "text";
}

export function parseCircuitFieldsJson(raw: string): CircuitStepFieldDraft[] {
  try {
    const j = JSON.parse(raw || "[]");
    if (!Array.isArray(j)) return [];
    return j.map((item) => {
      const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const fid = String(o.id ?? o.fieldId ?? "").trim() || undefined;
      const label = String(o.label ?? o.name ?? "").trim();
      const type = normalizeFieldType(String(o.type ?? "text"));
      return {
        key: fid ?? newCircuitFieldKey(),
        fieldId: fid,
        label,
        type,
        required: Boolean(o.required),
        locked: Boolean(o.locked),
      };
    });
  } catch {
    return [];
  }
}

export function serializeCircuitFieldsForApi(fields: CircuitStepFieldDraft[]): Array<Record<string, unknown>> {
  return fields.map(({ label, type, required, locked, fieldId }) => {
    const o: Record<string, unknown> = {
      label: label.trim(),
      type,
      required: Boolean(required),
    };
    if (fieldId) o.id = fieldId;
    if (locked) o.locked = true;
    return o;
  });
}

export function formFieldName(f: CircuitStepFieldDraft): string {
  return f.fieldId?.trim() || f.key;
}

/** Place les champs du modèle mouvement en tête ; le reste conserve l’ordre. */
export function mergeMovementTemplateIntoFields(
  fields: CircuitStepFieldDraft[],
  movementTemplate: CircuitStepFieldDraft[],
): CircuitStepFieldDraft[] {
  if (!movementTemplate.length) return fields;
  const mIds = new Set(movementTemplate.map((m) => m.fieldId).filter(Boolean) as string[]);
  const tail = fields.filter((f) => !f.fieldId || !mIds.has(f.fieldId));
  const head = movementTemplate.map((m) => ({
    ...m,
    key: m.fieldId ?? m.key,
    locked: true,
  }));
  return [...head, ...tail];
}

export async function loadMovementTemplateFields(): Promise<CircuitStepFieldDraft[]> {
  try {
    const t = await fetchStockFormTemplate(STOCK_SYSTEM_MOVEMENT_FORM_TEMPLATE_ID);
    return parseCircuitFieldsJson(t.fieldsJson).map((f) => ({
      ...f,
      key: f.fieldId ?? f.key,
      locked: true,
    }));
  } catch {
    return parseCircuitFieldsJson(
      JSON.stringify([
        { id: "sys-mvt-article", label: "Article", type: "article", required: true, locked: true },
        { id: "sys-mvt-type", label: "Type de mouvement", type: "text", required: true, locked: true },
        { id: "sys-mvt-qty", label: "Quantité", type: "number", required: true, locked: true },
        { id: "sys-mvt-reason", label: "Motif", type: "textarea", required: false, locked: true },
        { id: "sys-mvt-ref", label: "Réf. document", type: "text", required: false, locked: true },
        { id: "sys-mvt-supplier", label: "Fournisseur", type: "text", required: false, locked: true },
        { id: "sys-mvt-client", label: "Client", type: "text", required: false, locked: true },
      ]),
    ).map((f) => ({ ...f, key: f.fieldId ?? f.key, locked: true }));
  }
}

/** Lors de l’import d’un modèle dans une étape de circuit : exclut le bloc système déjà injecté. */
export function stripSystemMovementDuplicates(fields: CircuitStepFieldDraft[]): CircuitStepFieldDraft[] {
  return fields.filter((f) => !f.fieldId || !f.fieldId.startsWith("sys-mvt-"));
}
