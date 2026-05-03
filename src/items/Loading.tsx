import { Spin } from "antd";
import type { SpinProps } from "antd";

/** Indicateur de chargement — enveloppe `Spin` Ant Design. */
export function Loading(props: SpinProps) {
  return <Spin {...props} />;
}
