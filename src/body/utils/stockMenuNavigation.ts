/** Clés Ant Design du menu latéral stock (`StockLayout`). */
export function resolveStockSiderSelectedKeys(pathname: string): string[] {
  if (pathname.includes("/articles/units")) return ["articles-units"];
  if (pathname.includes("/articles/categories")) return ["articles-categories"];
  if (pathname.includes("/articles/devises")) return ["articles-devises"];
  if (pathname.includes("/articles")) return ["articles-list"];
  if (pathname.includes("/warehouse")) return ["warehouse-locations"];
  if (pathname.includes("/movements")) return ["movements"];
  if (pathname.includes("/fournisseurs")) return ["fournisseurs"];
  if (pathname.includes("/clients")) return ["clients"];
  if (pathname.includes("/documents/models")) return ["documents-models"];
  if (pathname.includes("/documents")) return ["documents-files"];
  if (pathname.includes("/user/roles")) return ["user-roles"];
  if (pathname.includes("/user")) return ["user-profil"];
  if (pathname.includes("/circuits/forms")) return ["circuits-forms"];
  if (pathname.endsWith("/circuits/new") || /\/circuits\/[^/]+\/edit$/.test(pathname)) {
    return ["circuits-form"];
  }
  if (pathname.includes("/circuits")) return ["circuits-list"];
  return ["dash"];
}

/** Sous-navigation Circuits (`StockCircuitsLayout`). */
export function resolveStockCircuitsNavActiveKey(pathname: string): "list" | "forms" | "circuit" {
  if (pathname.includes("/circuits/forms")) return "forms";
  if (pathname.endsWith("/circuits/new") || /\/circuits\/[^/]+\/edit$/.test(pathname)) return "circuit";
  return "list";
}

/** Clés de sous-menus ouverts dans le menu latéral. */
export function resolveStockSiderOpenKeys(pathname: string): string[] {
  const keys: string[] = [];
  if (pathname.includes("/articles")) keys.push("sub-articles");
  if (pathname.includes("/warehouse")) keys.push("sub-warehouse");
  if (pathname.includes("/user")) keys.push("sub-collab");
  if (pathname.includes("/circuits")) keys.push("sub-circuits");
  if (pathname.includes("/documents")) keys.push("sub-documents");
  return keys;
}
