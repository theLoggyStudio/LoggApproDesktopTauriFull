import { Drawer } from "antd";
import type { DrawerProps } from "antd";

/** Panneau latéral type « offcanvas » — enveloppe `Drawer` Ant Design. */
export function Offcanvas(props: DrawerProps) {
  return <Drawer {...props} />;
}
