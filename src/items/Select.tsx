import type { ReactElement, ReactNode } from "react";
import { Select as AntdSelect } from "antd";
import type { SelectProps } from "antd";
import { Button } from "./Button.tsx";

export type ItemSelectProps = SelectProps & {
  /** Première ligne du menu : libellé « + Créer … » (voir `Pages.constant.json` → `stockSelectCreateRow`). */
  createRowLabel?: string;
  onCreateRowClick?: () => void;
};

/**
 * Liste déroulante Ant Design avec option de **création** en première ligne du menu.
 * Sans `createRowLabel` / `onCreateRowClick`, se comporte comme `Select` standard.
 */
export function Select({ createRowLabel, onCreateRowClick, dropdownRender, popupRender, ...rest }: ItemSelectProps) {
  const inner = dropdownRender ?? popupRender;
  if (!createRowLabel || !onCreateRowClick) {
    return <AntdSelect {...rest} dropdownRender={dropdownRender} popupRender={popupRender} />;
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
  return <AntdSelect {...rest} dropdownRender={wrap} />;
}
