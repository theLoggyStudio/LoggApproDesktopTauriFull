import { Table as AntdTable } from "antd";
import type { TableProps } from "antd";

/**
 * Tableau de liste (Ant Design). Primitif UI réutilisable — les libellés et `columns`
 * viennent des pages via props (ex. `usePageTexts` + `Pages.constant.json`), pas de texte métier ici.
 *
 * @see `.cursorrules` — `src/items` pour les primitifs ; extension via props optionnelles uniquement.
 */
export function Table<RecordType extends object = Record<string, unknown>>(props: TableProps<RecordType>) {
  return <AntdTable<RecordType> {...props} />;
}
