import type { SessionUser } from "../context/SessionContext";

/** Clés synchronisées avec le backend (`stock_commands.rs` — droit « Mon compte » ajouté côté serveur). */
export const STOCK_EDITABLE_PRIVILEGE_KEYS = [
  "dashboard",
  "articles",
  "warehouse",
  "movements",
  "fournisseurs",
  "clients",
  "documents",
  "settings",
] as const;

export type StockEditablePrivilegeKey = (typeof STOCK_EDITABLE_PRIVILEGE_KEYS)[number];

/** Graphiques + import / export CSV (synchronisé avec `STOCK_PRIVILEGE_KEYS` côté Rust). */
export const STOCK_IO_PRIVILEGE_KEYS = [
  "dashboard_charts",
  "articles_import",
  "articles_export",
  "movements_import",
  "movements_export",
  "fournisseurs_import",
  "fournisseurs_export",
  "clients_import",
  "clients_export",
  "ref_units_import",
  "ref_units_export",
  "ref_locations_import",
  "ref_locations_export",
  "ref_locations_view",
  "ref_locations_create",
  "ref_locations_edit",
  "ref_locations_delete",
  "ref_categories_import",
  "ref_categories_export",
] as const;

export type StockIoPrivilegeKey = (typeof STOCK_IO_PRIVILEGE_KEYS)[number];

/** Liste / aperçu + import / export / suppression par format — aligné sur `STOCK_PRIVILEGE_KEYS` côté Rust. */
export const STOCK_DOCUMENT_PRIVILEGE_KEYS = [
  "documents_view",
  "documents_import_png",
  "documents_export_png",
  "documents_delete_png",
  "documents_import_jpeg",
  "documents_export_jpeg",
  "documents_delete_jpeg",
  "documents_import_pdf",
  "documents_export_pdf",
  "documents_delete_pdf",
] as const;

export type StockDocumentPrivilegeKey = (typeof STOCK_DOCUMENT_PRIVILEGE_KEYS)[number];

const STOCK_DOCUMENT_IO_KEYS = STOCK_DOCUMENT_PRIVILEGE_KEYS.filter((k) => k !== "documents_view");

/** Liste et écran Documents : droit explicite « voir » ou tout droit import/export/suppression sur un format. */
export function canViewStockDocuments(session: SessionUser | null): boolean {
  if (!session) return false;
  if (session.role === "sadmin") return true;
  if (session.role !== "stock_user") return true;
  const p = session.stockPrivileges ?? [];
  if (p.includes("documents_view")) return true;
  return STOCK_DOCUMENT_IO_KEYS.some((k) => p.includes(k));
}

/** Aperçu dans la modale : « voir » ou export pour le format concerné (téléchargement reste export seul). */
export function canPreviewStockDocument(session: SessionUser | null, kind: string): boolean {
  if (!session) return false;
  if (session.role === "sadmin") return true;
  if (session.role !== "stock_user") return true;
  const p = session.stockPrivileges ?? [];
  if (p.includes("documents_view")) return true;
  const k = kind.toLowerCase();
  if (k === "png") return p.includes("documents_export_png");
  if (k === "jpeg" || k === "jpg") return p.includes("documents_export_jpeg");
  if (k === "pdf") return p.includes("documents_export_pdf");
  return false;
}

/** Mot de passe initial par défaut (identique à `STOCK_APP_DEFAULT_PASSWORD` côté Rust). */
export const STOCK_DEFAULT_INITIAL_PASSWORD = "LoggAppro2026!";

/** Toutes les clés stock gérées par l’UI des privilèges (hors `user`, ajouté côté serveur). */
export const ALL_STOCK_USER_PRIVILEGE_KEYS: readonly string[] = [
  ...STOCK_EDITABLE_PRIVILEGE_KEYS,
  ...STOCK_IO_PRIVILEGE_KEYS,
  ...STOCK_DOCUMENT_PRIVILEGE_KEYS,
];

/**
 * Profil par défaut à la création d’un utilisateur stock : tout sauf les droits dont la clé
 * contient `_import` ou `_export` (CSV, export fichier, etc.).
 */
export function getDefaultStockPrivilegesForNewUser(): string[] {
  return ALL_STOCK_USER_PRIVILEGE_KEYS.filter(
    (k) => !k.includes("_import") && !k.includes("_export"),
  ).sort((a, b) => a.localeCompare(b));
}

export function hasStockScreenAccess(session: SessionUser | null, screen: string): boolean {
  if (!session) return false;
  if (session.role === "sadmin") return true;
  if (session.role === "stock_user") {
    return (session.stockPrivileges ?? []).includes(screen);
  }
  return true;
}

/** Droit d’action (graphiques, import ou export) — une clé par bouton / zone. */
export function hasStockPrivilege(session: SessionUser | null, privilegeKey: string): boolean {
  if (!session) return false;
  if (session.role === "sadmin") return true;
  if (session.role === "stock_user") {
    return (session.stockPrivileges ?? []).includes(privilegeKey);
  }
  return true;
}

const STOCK_REF_LOCATION_GRANULAR_KEYS = [
  "ref_locations_view",
  "ref_locations_create",
  "ref_locations_edit",
  "ref_locations_delete",
] as const;

/** Au moins une des clés fines emplacements est présente : on n’applique plus le mode « tout si entrepôt ». */
export function usesGranularLocationPrivileges(privileges: string[] | undefined): boolean {
  if (!privileges?.length) return false;
  return STOCK_REF_LOCATION_GRANULAR_KEYS.some((k) => privileges.includes(k));
}

/**
 * Anciens comptes : droit `warehouse` sans aucune clé `ref_locations_*` fine → accès emplacements complet.
 * Dès qu’une clé fine est cochée, seules les clés explicites comptent.
 */
export function hasLegacyFullLocationAccess(session: SessionUser | null): boolean {
  if (!session || session.role !== "stock_user") return false;
  const p = session.stockPrivileges ?? [];
  return p.includes("warehouse") && !usesGranularLocationPrivileges(p);
}

export function hasRefLocationView(session: SessionUser | null): boolean {
  if (!session) return false;
  if (session.role === "sadmin") return true;
  if (session.role !== "stock_user") return false;
  const p = session.stockPrivileges ?? [];
  if (p.includes("ref_locations_view")) return true;
  return hasLegacyFullLocationAccess(session);
}

export function hasRefLocationCreate(session: SessionUser | null): boolean {
  if (!session) return false;
  if (session.role === "sadmin") return true;
  if (session.role !== "stock_user") return false;
  const p = session.stockPrivileges ?? [];
  if (p.includes("ref_locations_create")) return true;
  return hasLegacyFullLocationAccess(session);
}

export function hasRefLocationEdit(session: SessionUser | null): boolean {
  if (!session) return false;
  if (session.role === "sadmin") return true;
  if (session.role !== "stock_user") return false;
  const p = session.stockPrivileges ?? [];
  if (p.includes("ref_locations_edit")) return true;
  return hasLegacyFullLocationAccess(session);
}

export function hasRefLocationDelete(session: SessionUser | null): boolean {
  if (!session) return false;
  if (session.role === "sadmin") return true;
  if (session.role !== "stock_user") return false;
  const p = session.stockPrivileges ?? [];
  if (p.includes("ref_locations_delete")) return true;
  return hasLegacyFullLocationAccess(session);
}

/** Premier écran autorisé après connexion (ordre menu). */
export function getFirstStockPath(privileges: string[]): string {
  const order: { key: string; path: string }[] = [
    { key: "dashboard", path: "/stock" },
    { key: "articles", path: "/stock/articles" },
    { key: "warehouse", path: "/stock/warehouse" },
    { key: "movements", path: "/stock/movements" },
    { key: "fournisseurs", path: "/stock/fournisseurs" },
    { key: "clients", path: "/stock/clients" },
    { key: "documents", path: "/stock/documents" },
    { key: "user", path: "/stock/user" },
  ];
  for (const { key, path } of order) {
    if (privileges.includes(key)) return path;
  }
  return "/stock/user";
}

export function pathnameToStockScreen(pathname: string): string {
  if (pathname.startsWith("/stock/user")) return "user";
  if (pathname.startsWith("/stock/articles")) return "articles";
  if (pathname.startsWith("/stock/warehouse")) return "warehouse";
  if (pathname.startsWith("/stock/movements")) return "movements";
  if (pathname.startsWith("/stock/fournisseurs")) return "fournisseurs";
  if (pathname.startsWith("/stock/clients")) return "clients";
  if (pathname.startsWith("/stock/documents")) return "documents";
  if (pathname === "/stock" || pathname === "/stock/") return "dashboard";
  return "dashboard";
}
