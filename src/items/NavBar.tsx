import type { ComponentProps } from "react";
import { Layout } from "antd";

const { Header } = Layout;

/**
 * Barre de navigation / en-tête — enveloppe `Layout.Header` Ant Design.
 * Les libellés et menus se passent en `children` depuis les pages.
 */
export function NavBar(props: ComponentProps<typeof Header>) {
  return <Header {...props} />;
}
