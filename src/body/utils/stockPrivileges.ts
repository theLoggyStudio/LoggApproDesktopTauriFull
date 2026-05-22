import type { SessionUser } from "../context/SessionContext";

/** Clés synchronisées avec le backend (`stock_commands.rs` — droit « Collaborateur » ajouté côté serveur). */
export const STOCK_EDITABLE_PRIVILEGE_KEYS = [
  "dashboard",
  "articles",
  "articles_units",
  "articles_categories",
  "articles_devises",
  "warehouse",
  "movements",
  "fournisseurs",
  "clients",
  "documents",
  "documents_models",
  "circuits",
  "circuits_forms",
  "roles",
  "user",
  "settings",
] as const;

/** Sous-écran : accès explicite ou via l’écran parent (rétrocompatibilité). */
const STOCK_SCREEN_PARENT_KEY: Partial<Record<string, string>> = {
  articles_units: "articles",
  articles_categories: "articles",
  articles_devises: "articles",
  documents_models: "documents",
  circuits_forms: "circuits",
};

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
  "ref_currencies_import",
  "ref_currencies_export",
  "circuits_manage",
  "roles_manage",
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
  /** Édition des modèles d’impression HTML/CSS (indépendante des imports de fichiers). */
  "documents_print_models_manage",
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

/** Toutes les clés stock gérées par l’UI des privilèges (`user` est aussi injecté côté serveur si absent). */
export const ALL_STOCK_USER_PRIVILEGE_KEYS: readonly string[] = [
  ...STOCK_EDITABLE_PRIVILEGE_KEYS,
  ...STOCK_IO_PRIVILEGE_KEYS,
  ...STOCK_DOCUMENT_PRIVILEGE_KEYS,
];

/**
 * Profil par défaut à la création d’un utilisateur stock : tout sauf les droits dont la clé
 * contient `_import`, `_export` ou `_manage` (CSV, gestion avancée, etc.).
 */
export function getDefaultStockPrivilegesForNewUser(): string[] {
  return ALL_STOCK_USER_PRIVILEGE_KEYS.filter(
    (k) => !k.includes("_import") && !k.includes("_export") && !k.includes("_manage"),
  ).sort((a, b) => a.localeCompare(b));
}

/** Profil par défaut pour un nouveau rôle métier (identique au profil « collaborateur » de base). */
export const getDefaultStockPrivilegesForNewRole = getDefaultStockPrivilegesForNewUser;

export function hasStockScreenAccess(session: SessionUser | null, screen: string): boolean {
  if (!session) return false;
  if (session.role === "sadmin") return true;
  if (session.role === "stock_user") {
    const p = session.stockPrivileges ?? [];
    if (p.includes(screen)) return true;
    const parent = STOCK_SCREEN_PARENT_KEY[screen];
    if (parent && p.includes(parent)) return true;
    return false;
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

/** Vérifie l’accès écran à partir d’une liste brute de privilèges (sans session). */
export function stockScreenAllowedInPrivileges(privileges: string[], screen: string): boolean {
  if (privileges.includes(screen)) return true;
  const parent = STOCK_SCREEN_PARENT_KEY[screen];
  if (parent && privileges.includes(parent)) return true;
  return false;
}

/** Premier écran autorisé après connexion (ordre menu). */
export function getFirstStockPath(privileges: string[]): string {
  const order: { key: string; path: string }[] = [
    { key: "dashboard", path: "/stock" },
    { key: "articles", path: "/stock/articles" },
    { key: "articles_units", path: "/stock/articles/units" },
    { key: "articles_categories", path: "/stock/articles/categories" },
    { key: "articles_devises", path: "/stock/articles/devises" },
    { key: "warehouse", path: "/stock/warehouse" },
    { key: "movements", path: "/stock/movements" },
    { key: "fournisseurs", path: "/stock/fournisseurs" },
    { key: "clients", path: "/stock/clients" },
    { key: "documents", path: "/stock/documents" },
    { key: "documents_models", path: "/stock/documents/models" },
    { key: "circuits", path: "/stock/circuits" },
    { key: "circuits_forms", path: "/stock/circuits/forms" },
    { key: "roles", path: "/stock/user/roles" },
    { key: "user", path: "/stock/user" },
  ];
  for (const { key, path } of order) {
    if (stockScreenAllowedInPrivileges(privileges, key)) return path;
  }
  return "/stock/user";
}

export function pathnameToStockScreen(pathname: string): string {
  if (pathname.includes("/stock/user/roles")) return "roles";
  if (pathname.startsWith("/stock/user")) return "user";
  if (pathname.includes("/stock/circuits/forms")) return "circuits_forms";
  if (pathname.startsWith("/stock/circuits")) return "circuits";
  if (pathname.includes("/stock/articles/units")) return "articles_units";
  if (pathname.includes("/stock/articles/categories")) return "articles_categories";
  if (pathname.includes("/stock/articles/devises")) return "articles_devises";
  if (pathname.startsWith("/stock/articles")) return "articles";
  if (pathname.startsWith("/stock/warehouse")) return "warehouse";
  if (pathname.startsWith("/stock/movements")) return "movements";
  if (pathname.startsWith("/stock/fournisseurs")) return "fournisseurs";
  if (pathname.startsWith("/stock/clients")) return "clients";
  if (pathname.includes("/stock/documents/models")) return "documents_models";
  if (pathname.startsWith("/stock/documents")) return "documents";
  if (pathname === "/stock" || pathname === "/stock/") return "dashboard";
  return "dashboard";
}

/** Impression navigateur (listes) : même niveau que la consultation de l’écran ou que les droits CSV ref. */
export function canPrintStockArticleList(session: SessionUser | null): boolean {
  return hasStockScreenAccess(session, "articles");
}

export function canPrintStockDashboard(session: SessionUser | null): boolean {
  return hasStockScreenAccess(session, "dashboard");
}

export function canPrintStockMovements(session: SessionUser | null): boolean {
  return hasStockScreenAccess(session, "movements");
}

export function canPrintStockRefUnits(session: SessionUser | null): boolean {
  return (
    hasStockScreenAccess(session, "articles_units") ||
    hasStockPrivilege(session, "ref_units_import") ||
    hasStockPrivilege(session, "ref_units_export")
  );
}

export function canPrintStockRefCategories(session: SessionUser | null): boolean {
  return (
    hasStockScreenAccess(session, "articles_categories") ||
    hasStockPrivilege(session, "ref_categories_import") ||
    hasStockPrivilege(session, "ref_categories_export")
  );
}

export function canPrintStockRefCurrencies(session: SessionUser | null): boolean {
  return (
    hasStockScreenAccess(session, "articles_devises") ||
    hasStockPrivilege(session, "ref_currencies_import") ||
    hasStockPrivilege(session, "ref_currencies_export")
  );
}

export function canPrintStockRefLocations(session: SessionUser | null): boolean {
  return hasRefLocationView(session);
}

export function canPrintStockWarehouses(session: SessionUser | null): boolean {
  return hasStockScreenAccess(session, "warehouse");
}

export function canPrintStockFournisseurs(session: SessionUser | null): boolean {
  return (
    hasStockPrivilege(session, "fournisseurs_import") ||
    hasStockPrivilege(session, "fournisseurs_export")
  );
}

export function canPrintStockClients(session: SessionUser | null): boolean {
  return (
    hasStockPrivilege(session, "clients_import") || hasStockPrivilege(session, "clients_export")
  );
}

/** Liste documents (impression) : aligné sur `canViewStockDocuments`. */
export function canPrintStockDocuments(session: SessionUser | null): boolean {
  return canViewStockDocuments(session);
}

/** Consultation de la liste des modèles d’impression HTML/CSS. */
export function canViewDocumentPrintModels(session: SessionUser | null): boolean {
  return hasStockScreenAccess(session, "documents_models") || canViewStockDocuments(session);
}

/** Édition des modèles d’impression (création, modification, suppression). */
export function canEditDocumentPrintModels(session: SessionUser | null): boolean {
  return hasStockPrivilege(session, "documents_print_models_manage");
}
