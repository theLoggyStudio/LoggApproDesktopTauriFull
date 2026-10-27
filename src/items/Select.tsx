import type { ReactElement, ReactNode } from "react";
import { Select as AntdSelect } from "antd";
import type { SelectProps } from "antd";
import { Button } from "./Button.tsx";

/** Trigger exécuté à chaque changement de valeur du Select. */
export type SelectChangeTrigger = (value: unknown, option?: unknown) => void;

export type ItemSelectProps = SelectProps & {
  /** Première ligne du menu : libellé « + Créer … » (voir `Pages.constant.json` → `stockSelectCreateRow`). */
  createRowLabel?: string;
  onCreateRowClick?: () => void;
  /**
   * Logique de réaction au changement (tous les Select).
   * Appelés après `onChange` Ant Design, dans l’ordre.
   * Ex. : synchroniser les variables HTML selon l’écran choisi.
   */
  triggers?: SelectChangeTrigger[];
};

/**
 * Liste déroulante Ant Design avec option de **création** en première ligne du menu
 * et triggers optionnels sur changement de valeur.
 * Sans `createRowLabel` / `onCreateRowClick`, se comporte comme `Select` standard.
 */
export function Select({
  createRowLabel,
  onCreateRowClick,
  dropdownRender,
  popupRender,
  triggers,
  onChange,
  ...rest
}: ItemSelectProps) {
  const inner = dropdownRender ?? popupRender;

  const handleChange: SelectProps["onChange"] = (value, option) => {
    onChange?.(value, option);
    if (triggers?.length) {
      for (const t of triggers) {
        try {
          t(value, option);
        } catch {
          /* trigger isolé : ne pas bloquer les suivants */
        }
      }
    }
  };

  if (!createRowLabel || !onCreateRowClick) {
    return (
      <AntdSelect {...rest} onChange={handleChange} dropdownRender={dropdownRender} popupRender={popupRender} />
    );
  }
  const wrap = (menu: ReactNode) => (
    <>
      <div
        style={{
          padding: "4px 11px",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <Button
          type="link"
          block
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCreateRowClick}
          style={{ height: "auto", padding: "4px 0", textAlign: "start" }}
        >
          {createRowLabel}
        </Button>
      </div>
      {inner ? inner(menu as ReactElement) : menu}
    </>
  );
  return <AntdSelect {...rest} onChange={handleChange} dropdownRender={wrap} />;
}
