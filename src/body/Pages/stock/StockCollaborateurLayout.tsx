import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Form } from "antd";
import { Select } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import { hasStockScreenAccess } from "../../utils/stockPrivileges";

export default function StockCollaborateurLayout() {
  const N = usePageTexts("stockCollaborateurNav");
  const Collab = usePageTexts("stockUser")[0];
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session } = useSession();
  const canUser = hasStockScreenAccess(session, "user");
  const canRoles = hasStockScreenAccess(session, "roles");

  useEffect(() => {
    if (!session) return;
    if (pathname.includes("/roles")) {
      if (!canRoles) navigate(canUser ? "/stock/user" : "/stock", { replace: true });
      return;
    }
    if (!canUser && canRoles) navigate("/stock/user/roles", { replace: true });
  }, [pathname, session, canUser, canRoles, navigate]);

  const activeKey = pathname.includes("/roles") ? "roles" : "profil";

  const options = [
    ...(canUser ? [{ value: "profil" as const, label: N[0] }] : []),
    ...(canRoles ? [{ value: "roles" as const, label: N[1] }] : []),
  ];

  if (options.length === 0) {
    return null;
  }

  return (
    <>
      {options.length > 1 ? (
        <Form layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item label={Collab}>
            <Select
              style={{ minWidth: 220 }}
              value={activeKey}
              onChange={(k) => {
                if (k === "roles") navigate("/stock/user/roles");
                else navigate("/stock/user");
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
