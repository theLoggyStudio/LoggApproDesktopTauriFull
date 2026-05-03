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
  location: string;
  notes: string;
  updatedAt: string;
};

export type StockMovement = {
  id: string;
  articleId: string;
  sku: string;
  articleName: string;
  moveType: string;
  qty: number;
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

export type StockParty = {
  id: string;
  kind: string;
  name: string;
  /** Obligatoire à la saisie pour fournisseurs et clients. */
  address: string;
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
    receiptDocumentIds: Array.isArray(m.receiptDocumentIds)
      ? m.receiptDocumentIds.map((x) => String(x)).filter(Boolean)
      : undefined,
    receiptCount:
      typeof m.receiptCount === "number" ? m.receiptCount : Number(m.receiptCount) || 0,
  }));
}

export async function addMovement(body: {
  articleId: string;
  moveType: string;
  qty: number;
  reason?: string;
  refDoc?: string;
  supplierName?: string;
  clientName?: string;
}): Promise<{ success: boolean; movementId?: string; newQty?: number }> {
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
  | "ref_category";

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

export async function testRemoteDb(fields: Record<string, string>): Promise<{ ok: boolean; message?: string }> {
  return call("stock_test_remote_db", fields);
}

export type StockAppUserRow = {
  id: string;
  login: string;
  displayName: string;
  privileges: string[];
  createdAt: string;
};

export async function stockAppUserLogin(
  loginOrTel: string,
  password: string,
): Promise<{ id: string; loginOrLabel: string; role: string; stockPrivileges: string[] }> {
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
  password?: string;
  privileges: string[];
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
};

export type StockRefKind = "unit" | "location" | "category" | "warehouse";

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
  body: { id?: string; name: string; code?: string; warehouseId?: string },
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
