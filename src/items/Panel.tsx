import { useState, type ReactNode } from "react";
import { Card } from "antd";
import type { CardProps } from "antd";
import { DownOutlined, UpOutlined } from "@ant-design/icons";
import { Button } from "./Button";

export type PanelProps = CardProps & {
  /** Affiche un bouton pour replier / déplier le corps du panneau. */
  collapsible?: boolean;
  /** État initial replié (uniquement si `collapsible`). */
  defaultCollapsed?: boolean;
};

/** Panneau / carte conteneur — enveloppe `Card` Ant Design. */
export function Panel({
  collapsible,
  defaultCollapsed = false,
  title,
  extra,
  children,
  styles,
  ...rest
}: PanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (!collapsible) {
    return (
      <Card title={title} extra={extra} styles={styles} {...rest}>
        {children}
      </Card>
    );
  }

  const toggle: ReactNode = (
    <Button
      type="text"
      size="small"
      aria-expanded={!collapsed}
      icon={collapsed ? <DownOutlined /> : <UpOutlined />}
      onClick={(e) => {
        e.stopPropagation();
        setCollapsed((c) => !c);
      }}
    />
  );

  const mergedExtra =
    extra != null ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {extra}
        {toggle}
      </span>
    ) : (
      toggle
    );

  return (
    <Card
      title={title}
      extra={mergedExtra}
      styles={{
        ...styles,
        body: collapsed ? { display: "none", padding: 0, ...(styles?.body as object) } : styles?.body,
      }}
      {...rest}
    >
      {children}
    </Card>
  );
}
