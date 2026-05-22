import { STOCK_ROLE_DIRECTION_ID } from "./stockBuiltinRoles";

/** Garantit au moins un rôle de remplissage et un validateur (étapes > 0) via Direction par défaut. */
export function ensureCircuitStepInteractionRoles(
  fillRoleIds: string[],
  validateRoleId: string,
  stepIndex: number,
): { fillRoleIds: string[]; validateRoleId: string } {
  const fills = [...new Set(fillRoleIds.map((x) => x.trim()).filter(Boolean))];
  if (!fills.length) fills.push(STOCK_ROLE_DIRECTION_ID);
  let validate = validateRoleId.trim();
  if (stepIndex > 0 && !validate) validate = STOCK_ROLE_DIRECTION_ID;
  return { fillRoleIds: fills, validateRoleId: validate };
}
