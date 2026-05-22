import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Form } from "antd";
import { Select } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import { hasStockPrivilege, hasStockScreenAccess } from "../../utils/stockPrivileges";
import { resolveStockCircuitsNavActiveKey } from "../../utils/stockMenuNavigation";

export default function StockCircuitsLayout() {
  const N = usePageTexts("stockCircuitsNav");
  const C = usePageTexts("stockCircuits");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session } = useSession();
  const canManage = hasStockPrivilege(session, "circuits_manage");
  const canCircuits = hasStockScreenAccess(session, "circuits");
  const canForms = hasStockScreenAccess(session, "circuits_forms");

  const activeKey = useMemo(() => resolveStockCircuitsNavActiveKey(pathname), [pathname]);

  const options = useMemo(() => {
    const o: { value: string; label: string }[] = [];
    if (canCircuits) o.push({ value: "list", label: N[0] });
    if (canManage && canCircuits) o.push({ value: "circuit", label: N[1] });
    if (canForms) o.push({ value: "forms", label: N[2] });
    return o;
  }, [N, canManage, canCircuits, canForms]);

  const showNav = options.length > 1;

  return (
    <>
      {showNav ? (
        <Form layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item label={C[0]}>
            <Select
              style={{ minWidth: 280 }}
              value={activeKey}
              onChange={(k) => {
                if (k === "circuit") navigate("/stock/circuits/new");
                else if (k === "forms") navigate("/stock/circuits/forms");
                else navigate("/stock/circuits");
              }}
              options={options}
            />
          </Form.Item>
        </Form>
      ) : null}
      <Outlet />
    </>
  );
}
