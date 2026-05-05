import { invoke } from "../tauri-bridge";
import { criptKey } from "../constants";
import { decrypteRepositoryStructure, encrypteRepositoryStructure } from "./payloadCrypto";

async function call<T>(command: string, body: Record<string, unknown> = {}): Promise<T> {
  const payload = encrypteRepositoryStructure(body, criptKey);
  if (!payload) throw new Error("Payload vide");
  const raw = await invoke<unknown>(command, { payload });
  const data = decrypteRepositoryStructure(raw, criptKey);
  return data as T;
}

export type StockArticle = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  qty: number;
  minQty: number;
  /** Prix unitaire (nombre ≥ 0). */
  price: number;
  /** Libellé de devise (réf. « Devises »), ex. EUR. */
  currency?: string;
  location: string;
  notes: string;
  updatedAt: string;
};

export type StockMovement = {
  id: string;
  /** Identifiant du lot (plusieurs lignes partagent le même lot). */
  batchId?: string;
  /** Index de ligne dans le lot (0 = première ligne). */
  lineNo?: number;
  articleId: string;
  sku: string;
  articleName: string;
  moveType: string;
  qty: number;
  /** Prix unitaire d'entrée (ligne). */
  priceIn?: number;
  /** Prix unitaire de sortie (ligne). */
  priceOut?: number;
  reason: string;
  refDoc: string;
  supplierName?: string;
  clientName?: string;
  createdAt: string;
  /** Nombre de fichiers reçu liés (max 3). */
  receiptCount?: number;
  /** Identifiants des documents « reçu » liés à ce mouvement. */
  receiptDocumentIds?: string[];
};

/** Ligne pour créer un mouvement multi-articles (prix par ligne). */
export type StockMovementLineInput = {
  articleId: string;
  qty: number;
  priceIn?: number;
  priceOut?: number;
};

export type StockParty = {
  id: string;
  kind: string;
  name: string;
  /** Obligatoire à la saisie pour fournisseurs et clients. */
  address: string;
  createdAt?: string;
};

export async function fetchArticles(search?: string): Promise<StockArticle[]> {
  const r = await call<{ articles: StockArticle[] }>("stock_list_articles", search ? { search } : {});
  return r.articles ?? [];
}

export async function saveArticle(a: Partial<StockArticle> & { sku: string; name: string }): Promise<{ success: boolean; id: string }> {
  return call("stock_upsert_article", a as Record<string, unknown>);
}

export async function removeArticle(id: string): Promise<{ success: boolean }> {
  return call("stock_delete_article", { id });
}

export async function fetchMovements(articleId?: string): Promise<StockMovement[]> {
  const r = await call<{ movements: StockMovement[] }>("stock_list_movements", articleId ? { articleId } : {});
  const list = r.movements ?? [];
  return list.map((m) => ({
    ...m,
    lineNo: typeof m.lineNo === "number" ? m.lineNo : Number(m.lineNo) || 0,
    priceIn: typeof m.priceIn === "number" ? m.priceIn : Number(m.priceIn) || 0,
    priceOut: typeof m.priceOut === "number" ? m.priceOut : Number(m.priceOut) || 0,
    receiptDocumentIds: Array.isArray(m.receiptDocumentIds)
      ? m.receiptDocumentIds.map((x) => String(x)).filter(Boolean)
      : undefined,
    receiptCount:
      typeof m.receiptCount === "number" ? m.receiptCount : Number(m.receiptCount) || 0,
  }));
}

export async function addMovement(body: {
  moveType: string;
  /** Date/heure du mouvement (`YYYY-MM-DD HH:mm:ss`). Si omis, le serveur utilise l’instant présent. */
  createdAt?: string;
  reason?: string;
  refDoc?: string;
  supplierName?: string;
  clientName?: string;
  /** Un mouvement multi-lignes : une ligne par article avec prix d'entrée / de sortie. */
  lines?: StockMovementLineInput[];
  /** Mode historique : un seul article (alternative à `lines`). */
  articleId?: string;
  qty?: number;
  priceIn?: number;
  priceOut?: number;
}): Promise<{ success: boolean; movementId?: string; batchId?: string; newQty?: number }> {
  return call("stock_add_movement", body as Record<string, unknown>);
}

export async function fetchParties(kind: "SUPPLIER" | "CLIENT"): Promise<StockParty[]> {
  const r = await call<{ parties: StockParty[] }>("stock_list_parties", { kind });
  return r.parties ?? [];
}

export async function upsertParty(
  kind: "SUPPLIER" | "CLIENT",
  name: string,
  address = "",
  id?: string,
): Promise<{ success: boolean }> {
  return call("stock_upsert_party", { kind, name, address, ...(id ? { id } : {}) });
}

export async function deleteParty(id: string): Promise<{ success: boolean }> {
  return call("stock_delete_party", { id });
}

export type ChartMovementDay = {
  date: string;
  inQty: number;
  outQty: number;
  adjQty: number;
};

export type ChartCategoryQty = {
  name: string;
  qty: number;
};

export type DashboardStats = {
  totalArticles: number;
  lowStockCount: number;
  totalQty: number;
  recentMovements: {
    id: string;
    articleId: string;
    sku: string;
    articleName: string;
    moveType: string;
    qty: number;
    supplierName?: string;
    clientName?: string;
    createdAt: string;
  }[];
  chartMovements14d?: ChartMovementDay[];
  chartCategoryQty?: ChartCategoryQty[];
};

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return call<DashboardStats>("stock_dashboard_stats", {});
}

export type StockCsvTable =
  | "articles"
  | "movements"
  | "fournisseurs"
  | "clients"
  | "ref_unit"
  | "ref_location"
  | "ref_category"
  | "ref_currency";

export async function exportStockCsv(
  table: StockCsvTable,
  opts?: { warehouseId?: string },
): Promise<{ csv: string; fileName: string }> {
  const body: Record<string, unknown> = { table };
  if (opts?.warehouseId) body.warehouseId = opts.warehouseId;
  return call<{ csv: string; fileName: string }>("stock_export_csv", body);
}

export async function importStockCsv(
  table: StockCsvTable,
  csv: string,
  opts?: { warehouseId?: string },
): Promise<{ success: boolean; inserted: number; updated: number; errorCount: number; errors: string[] }> {
  const body: Record<string, unknown> = { table, csv };
  if (opts?.warehouseId) body.warehouseId = opts.warehouseId;
  return call("stock_import_csv", body);
}

export type RemoteDbSettings = {
  driver: string;
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  schema: string;
  extraParams: string;
};

export async function fetchRemoteDbSettings(): Promise<RemoteDbSettings> {
  return call("stock_get_remote_db_settings", {});
}

export async function saveRemoteDbSettings(settings: RemoteDbSettings): Promise<{ success: boolean }> {
  return call("stock_save_remote_db_settings", settings as Record<string, unknown>);
}

export async function testRemoteDb(
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; message?: string }> {
  return call("stock_test_remote_db", fields);
}

export type StockAppUserRow = {
  id: string;
  login: string;
  displayName: string;
  /** Adresse postale ou lieu (facultatif). */
  address?: string;
  privileges: string[];
  createdAt: string;
  /** Identifiant du rôle métier (`stock_role`), facultatif. */
  roleId?: string;
};

export async function stockAppUserLogin(
  loginOrTel: string,
  password: string,
): Promise<{
  id: string;
  loginOrLabel: string;
  role: string;
  stockPrivileges: string[];
  address?: string;
  stockRoleId?: string;
}> {
  return call("stock_app_user_login", {
    loginOrTel: loginOrTel.toLowerCase().trim(),
    password,
  });
}

export async function fetchStockAppUsers(requesterRole: string): Promise<StockAppUserRow[]> {
  const r = await call<{ users: StockAppUserRow[] }>("stock_list_app_users", { requesterRole });
  return r.users ?? [];
}

export async function upsertStockAppUser(body: {
  requesterRole: string;
  id?: string;
  login: string;
  displayName: string;
  address?: string;
  roleId?: string;
  password?: string;
  /** @deprecated ignoré côté serveur — privilèges portés par le rôle. */
  privileges?: string[];
}): Promise<{ success: boolean; id: string; defaultPassword?: string }> {
  return call("stock_upsert_app_user", body as Record<string, unknown>);
}

export async function deleteStockAppUser(id: string, requesterRole: string): Promise<{ success: boolean }> {
  return call("stock_delete_app_user", { id, requesterRole });
}

export type StockRefItem = {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  /** Présent pour les emplacements (liste globale ou filtrée par entrepôt). */
  warehouseId?: string;
  warehouseName?: string;
  /** Emplacements : frais de logement optionnel (≥ 0). */
  housingFee?: number;
  /** Emplacements : périodicité de paiement (`monthly`, `quarterly`, …). */
  paymentPeriod?: string;
};

export type StockRefKind = "unit" | "location" | "category" | "currency" | "warehouse";

export async function fetchRefItems(
  kind: StockRefKind,
  opts?: { warehouseId?: string },
): Promise<StockRefItem[]> {
  const body: Record<string, unknown> = { kind };
  if (opts?.warehouseId) body.warehouseId = opts.warehouseId;
  const r = await call<{ items: StockRefItem[] }>("stock_list_ref_items", body);
  return r.items ?? [];
}

export async function upsertRefItem(
  kind: StockRefKind,
  body: {
    id?: string;
    name: string;
    code?: string;
    warehouseId?: string;
    housingFee?: number;
    paymentPeriod?: string;
  },
): Promise<{ success: boolean; id: string }> {
  return call("stock_upsert_ref_item", { kind, ...body });
}

export async function deleteRefItem(kind: StockRefKind, id: string): Promise<{ success: boolean }> {
  return call("stock_delete_ref_item", { kind, id });
}

export type StockDocumentRow = {
  id: string;
  originalName: string;
  kind: string;
  bytes: number;
  createdAt: string;
  movementId?: string;
  /** Texte fixe décrivant le mouvement lié (reçu). */
  movementCaption?: string;
};

export async function fetchStockDocuments(): Promise<StockDocumentRow[]> {
  const r = await call<{ documents: StockDocumentRow[] }>("stock_list_documents", {});
  return r.documents ?? [];
}

export async function importStockDocument(
  originalName: string,
  dataBase64: string,
  opts?: { movementId?: string },
): Promise<{ success: boolean; id: string; kind: string; originalName: string; bytes: number }> {
  const body: Record<string, unknown> = { originalName, dataBase64 };
  if (opts?.movementId) body.movementId = opts.movementId;
  return call("stock_import_document", body);
}

export async function exportStockDocument(
  id: string,
): Promise<{ base64: string; mime: string; fileName: string; kind: string }> {
  return call("stock_export_document", { id });
}

export async function deleteStockDocument(id: string): Promise<{ success: boolean }> {
  return call("stock_delete_document", { id });
}

export type StockDocumentPrintModelRow = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  /** Écran cible (movements, articles, docs, ...). */
  screenKey?: string;
};

export type StockDocumentPrintModelDetail = StockDocumentPrintModelRow & {
  htmlContent: string;
  cssContent: string;
};

export async function fetchStockDocumentPrintModels(): Promise<StockDocumentPrintModelRow[]> {
  const r = await call<{ models: StockDocumentPrintModelRow[] }>("stock_list_document_print_models", {});
  return r.models ?? [];
}

export async function fetchStockDocumentPrintModel(id: string): Promise<StockDocumentPrintModelDetail> {
  const r = await call<{ model: StockDocumentPrintModelDetail }>("stock_get_document_print_model", { id });
  if (!r.model) throw new Error("Modèle introuvable");
  return r.model;
}

export async function upsertStockDocumentPrintModel(body: {
  id?: string;
  name: string;
  description?: string;
  htmlContent: string;
  cssContent: string;
  screenKey?: string;
}): Promise<{ success: boolean; id: string }> {
  return call("stock_upsert_document_print_model", body as Record<string, unknown>);
}

export async function deleteStockDocumentPrintModel(id: string): Promise<{ success: boolean }> {
  return call("stock_delete_document_print_model", { id });
}

/** Affectations modèle d’impression → écran (clés : movements, articles, docs, …). */
export async function fetchDocumentPrintScreenBindings(): Promise<Record<string, string>> {
  const r = await call<{ bindings: Record<string, string> }>("stock_get_document_print_screen_bindings", {});
  return r.bindings ?? {};
}

export async function setDocumentPrintScreenBinding(
  screenKey: string,
  modelId: string,
): Promise<{ success: boolean }> {
  return call("stock_set_document_print_screen_binding", { screenKey, modelId });
}

export type StockRoleRow = {
  id: string;
  name: string;
  code: string;
  description: string;
  /** Droits métier (même clés que l’ancien JSON utilisateur). */
  privileges: string[];
  createdAt: string;
};

export async function fetchStockRoles(): Promise<StockRoleRow[]> {
  const r = await call<{ roles: StockRoleRow[] }>("stock_list_roles", {});
  return r.roles ?? [];
}

export async function upsertStockRole(body: {
  id?: string;
  name: string;
  code?: string;
  description?: string;
  /** À l’édition, tableau vide = conserver les privilèges actuels du rôle. */
  privileges?: string[];
}): Promise<{ success: boolean; id: string }> {
  return call("stock_upsert_role", body as Record<string, unknown>);
}

export async function deleteStockRole(id: string): Promise<{ success: boolean }> {
  return call("stock_delete_role", { id });
}

export type StockCircuitRow = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StockCircuitStepRow = {
  id: string;
  position: number;
  title: string;
  fieldsJson: string;
  validateRoleId: string;
  /** Premier rôle remplisseur (rétrocompat). */
  fillRoleId: string;
  /** Tous les rôles autorisés à remplir l’étape. */
  fillRoleIds?: string[];
  createdAt: string;
};

export async function fetchStockCircuits(): Promise<StockCircuitRow[]> {
  const r = await call<{ circuits: StockCircuitRow[] }>("stock_list_circuits", {});
  return r.circuits ?? [];
}

export async function fetchStockCircuit(id: string): Promise<{
  circuit: StockCircuitRow;
  steps: StockCircuitStepRow[];
}> {
  return call("stock_get_circuit", { id });
}

export async function upsertStockCircuit(body: {
  id?: string;
  name: string;
  description?: string;
  active?: boolean;
  steps: Array<{
    title: string;
    fieldsJson?: unknown;
    validateRoleId?: string;
    /** @deprecated utiliser fillRoleIds */
    fillRoleId?: string;
    fillRoleIds?: string[];
  }>;
}): Promise<{ success: boolean; id: string }> {
  return call("stock_upsert_circuit", body as Record<string, unknown>);
}

export async function deleteStockCircuit(id: string): Promise<{ success: boolean }> {
  return call("stock_delete_circuit", { id });
}

export type StockCollabTaskVisibility = "public" | "private" | "role";

export type StockCollabTaskKind = "reminder" | "circuit_validate" | "circuit_fill";

export type StockCollabTaskRow = {
  id: string;
  title: string;
  description: string;
  at: string;
  status: string;
  kind: string;
  visibility: StockCollabTaskVisibility;
  createdByUserId: string;
  visibleRoleId: string;
  circuitId: string;
  circuitStepIndex: number;
  createdAt: string;
  updatedAt: string;
};

export async function fetchStockCollabTasks(body: {
  requesterUserId: string;
  requesterRole: string;
}): Promise<StockCollabTaskRow[]> {
  const r = await call<{ tasks: StockCollabTaskRow[] }>("stock_list_collab_tasks", body as Record<string, unknown>);
  return r.tasks ?? [];
}

export async function upsertStockCollabTask(body: {
  requesterUserId: string;
  requesterRole: string;
  id?: string;
  title: string;
  description?: string;
  at: string;
  visibility: StockCollabTaskVisibility;
  visibleRoleId?: string;
}): Promise<{ success: boolean; id: string }> {
  return call("stock_upsert_collab_task", body as Record<string, unknown>);
}

export async function completeStockCollabTask(body: {
  id: string;
  requesterUserId: string;
  requesterRole: string;
}): Promise<{ success: boolean }> {
  return call("stock_complete_collab_task", body as Record<string, unknown>);
}

export async function createCircuitStepCollabTask(body: {
  requesterUserId: string;
  circuitId: string;
  stepIndex: number;
  variant: "fill" | "validate";
}): Promise<{ success: boolean; id: string }> {
  return call("stock_create_circuit_step_collab_task", body as Record<string, unknown>);
}

/** Modèle système « Mouvement de stock » (aligné sur `stock_commands::STOCK_SYSTEM_MOVEMENT_FORM_TEMPLATE_ID`). */
export const STOCK_SYSTEM_MOVEMENT_FORM_TEMPLATE_ID = "f0000001-0001-4001-8001-000000000001";

export type StockFormTemplateRow = {
  id: string;
  name: string;
  description: string;
  fieldsJson: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function fetchStockFormTemplates(): Promise<StockFormTemplateRow[]> {
  const r = await call<{ templates: StockFormTemplateRow[] }>("stock_list_form_templates", {});
  return r.templates ?? [];
}

export async function fetchStockFormTemplate(id: string): Promise<StockFormTemplateRow> {
  const r = await call<{ template: StockFormTemplateRow }>("stock_get_form_template", { id });
  if (!r.template) throw new Error("Modèle introuvable");
  return r.template;
}

export async function upsertStockFormTemplate(body: {
  id?: string;
  name: string;
  description?: string;
  fieldsJson: unknown[];
}): Promise<{ success: boolean; id: string }> {
  return call("stock_upsert_form_template", body as Record<string, unknown>);
}

export async function deleteStockFormTemplate(id: string): Promise<{ success: boolean }> {
  return call("stock_delete_form_template", { id });
}
