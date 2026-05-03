import { Card } from "antd";
import type { CardProps } from "antd";

/** Panneau / carte conteneur — enveloppe `Card` Ant Design. */
export function Panel(props: CardProps) {
  return <Card {...props} />;
}
