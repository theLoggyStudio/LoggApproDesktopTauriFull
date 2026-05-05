import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Form } from "antd";
import { Select } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import { hasStockPrivilege, hasStockScreenAccess } from "../../utils/stockPrivileges";

export default function StockCircuitsLayout() {
  const N = usePageTexts("stockCircuitsNav");
  const C = usePageTexts("stockCircuits");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session } = useSession();
  const canManage = hasStockPrivilege(session, "circuits_manage");
  const canCircuits = hasStockScreenAccess(session, "circuits");

  const activeKey = useMemo(() => {
    if (!canCircuits) return "list";
    if (pathname.includes("/circuits/forms")) return "forms";
    if (pathname.includes("/circuits/fill")) return "fill";
    if (pathname.endsWith("/circuits/new") || /\/circuits\/[^/]+\/edit$/.test(pathname)) return "circuit";
    return "list";
  }, [pathname, canCircuits]);

  const options = useMemo(() => {
    const o: { value: string; label: string }[] = [{ value: "list", label: N[0] }];
    if (canManage) o.push({ value: "circuit", label: N[1] });
    if (canCircuits) {
      o.push({ value: "forms", label: N[2] });
      o.push({ value: "fill", label: N[3] });
    }
    return o;
  }, [N, canManage, canCircuits]);

  if (!canCircuits) {
    return <Outlet />;
  }

  return (
    <>
      <Form layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item label={C[0]}>
          <Select
            style={{ minWidth: 280 }}
            value={activeKey}
            onChange={(k) => {
              if (k === "circuit") navigate("/stock/circuits/new");
              else if (k === "forms") navigate("/stock/circuits/forms");
              else if (k === "fill") navigate("/stock/circuits/fill");
              else navigate("/stock/circuits");
            }}
            options={options}
          />
        </Form.Item>
      </Form>
      <Outlet />
    </>
  );
}
