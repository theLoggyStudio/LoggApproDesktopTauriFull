import { useMemo } from "react";
import { Checkbox, Typography } from "antd";
import { usePageTexts } from "../../../hooks/usePageTexts";
import {
  STOCK_EDITABLE_PRIVILEGE_KEYS,
  STOCK_IO_PRIVILEGE_KEYS,
  STOCK_DOCUMENT_PRIVILEGE_KEYS,
} from "../../utils/stockPrivileges";

const { Text } = Typography;

export type PrivilegeGroup = { title: string; keys: readonly string[] };

const PRIV_LABEL_INDEX: Record<(typeof STOCK_EDITABLE_PRIVILEGE_KEYS)[number], number> = {
  dashboard: 14,
  articles: 15,
  articles_units: 79,
  articles_categories: 80,
  articles_devises: 81,
  warehouse: 26,
  movements: 16,
  fournisseurs: 17,
  clients: 18,
  documents: 40,
  documents_models: 82,
  circuits: 71,
  circuits_forms: 83,
  roles: 72,
  user: 22,
  settings: 19,
};

const PRIV_IO_LABEL_INDEX: Record<(typeof STOCK_IO_PRIVILEGE_KEYS)[number], number> = {
  dashboard_charts: 27,
  articles_import: 28,
  articles_export: 29,
  movements_import: 30,
  movements_export: 31,
  fournisseurs_import: 32,
  fournisseurs_export: 33,
  clients_import: 34,
  clients_export: 35,
  ref_units_import: 36,
  ref_units_export: 37,
  ref_locations_import: 38,
  ref_locations_export: 39,
  ref_locations_view: 53,
  ref_locations_create: 54,
  ref_locations_edit: 55,
  ref_locations_delete: 56,
  ref_categories_import: 51,
  ref_categories_export: 52,
  ref_currencies_import: 68,
  ref_currencies_export: 69,
  circuits_manage: 73,
  roles_manage: 74,
};

const PRIV_DOC_LABEL_INDEX: Record<(typeof STOCK_DOCUMENT_PRIVILEGE_KEYS)[number], number> = {
  documents_view: 41,
  documents_import_png: 42,
  documents_export_png: 43,
  documents_delete_png: 44,
  documents_import_jpeg: 45,
  documents_export_jpeg: 46,
  documents_delete_jpeg: 47,
  documents_import_pdf: 48,
  documents_export_pdf: 49,
  documents_delete_pdf: 50,
  documents_print_models_manage: 78,
};

export function useStockAdminPrivilegeGroups() {
  const U = usePageTexts("stockUserAdmin");
  const groups = useMemo<PrivilegeGroup[]>(
    () => [
      { title: U[57], keys: STOCK_EDITABLE_PRIVILEGE_KEYS },
      { title: U[58], keys: ["dashboard_charts"] },
      { title: U[59], keys: ["articles_import", "articles_export"] },
      { title: U[60], keys: ["movements_import", "movements_export"] },
      { title: U[61], keys: ["fournisseurs_import", "fournisseurs_export"] },
      { title: U[62], keys: ["clients_import", "clients_export"] },
      { title: U[63], keys: ["ref_units_import", "ref_units_export"] },
      {
        title: U[64],
        keys: [
          "ref_locations_import",
          "ref_locations_export",
          "ref_locations_view",
          "ref_locations_create",
          "ref_locations_edit",
          "ref_locations_delete",
        ],
      },
      { title: U[65], keys: ["ref_categories_import", "ref_categories_export"] },
      { title: U[70], keys: ["ref_currencies_import", "ref_currencies_export"] },
      { title: U[66], keys: STOCK_DOCUMENT_PRIVILEGE_KEYS },
      { title: U[75], keys: ["circuits", "circuits_forms", "circuits_manage"] },
      { title: U[76], keys: ["roles", "roles_manage"] },
    ],
    [U],
  );

  const privLabel = useMemo(
    () => (key: string) => {
      const k = key as keyof typeof PRIV_LABEL_INDEX;
      if (k in PRIV_LABEL_INDEX) return U[PRIV_LABEL_INDEX[k]] ?? key;
      const ik = key as keyof typeof PRIV_IO_LABEL_INDEX;
      if (ik in PRIV_IO_LABEL_INDEX) return U[PRIV_IO_LABEL_INDEX[ik]] ?? key;
      const dk = key as keyof typeof PRIV_DOC_LABEL_INDEX;
      if (dk in PRIV_DOC_LABEL_INDEX) return U[PRIV_DOC_LABEL_INDEX[dk]] ?? key;
      return key;
    },
    [U],
  );

  return { groups, privLabel, selectAllLabel: U[67] };
}

export function StockPrivilegeGroupedPicker({
  value,
  onChange,
  groups,
  privLabel,
  selectAllLabel,
}: {
  value?: string[];
  onChange?: (v: string[]) => void;
  groups: PrivilegeGroup[];
  privLabel: (key: string) => string;
  selectAllLabel: string;
}) {
  const selected = value ?? [];

  const applySet = (next: Set<string>) => {
    onChange?.([...next].sort((a, b) => a.localeCompare(b)));
  };

  const toggleKey = (key: string, checked: boolean) => {
    const s = new Set(selected);
    if (checked) s.add(key);
    else s.delete(key);
    applySet(s);
  };

  const toggleGroup = (keys: readonly string[], checked: boolean) => {
    const s = new Set(selected);
    keys.forEach((k) => {
      if (checked) s.add(k);
      else s.delete(k);
    });
    applySet(s);
  };

  return (
    <div>
      {groups.map((g, idx) => {
        const inGroup = g.keys.filter((k) => selected.includes(k)).length;
        const all = g.keys.length > 0 && inGroup === g.keys.length;
        const some = inGroup > 0 && !all;
        const smallCb = { fontSize: 12, lineHeight: "20px" } as const;
        return (
          <div key={g.title}>
            {idx > 0 ? <br /> : null}
            <Text strong style={{ display: "block", marginBottom: 6, fontSize: 13 }}>
              {g.title}
            </Text>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                columnGap: 12,
                rowGap: 4,
                marginBottom: 6,
                ...smallCb,
              }}
            >
              <Checkbox
                indeterminate={some}
                checked={all}
                onChange={(e) => toggleGroup(g.keys, e.target.checked)}
                style={{ marginInlineEnd: 4 }}
              >
                <span style={{ ...smallCb, fontWeight: 600 }}>{selectAllLabel}</span>
              </Checkbox>
              {g.keys.map((k) => (
                <Checkbox key={k} checked={selected.includes(k)} onChange={(e) => toggleKey(k, e.target.checked)}>
                  <span style={smallCb}>{privLabel(k)}</span>
                </Checkbox>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
