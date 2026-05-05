import { useMemo } from "react";
import { Form } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Select } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { hasStockScreenAccess } from "../../utils/stockPrivileges";
import { useSession } from "../../context/SessionContext";

export default function StockDocumentsLayout() {
  const N = usePageTexts("stockDocumentsNav");
  const D = usePageTexts("stockDocuments");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session } = useSession();
  const canDocs = hasStockScreenAccess(session, "documents");

  const activeKey = useMemo(() => {
    if (!canDocs) return "files";
    if (pathname.includes("/documents/models")) return "models";
    return "files";
  }, [pathname, canDocs]);

  if (!canDocs) {
    return <Outlet />;
  }

  return (
    <>
      <Form layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item label={D[0]}>
          <Select
            style={{ minWidth: 280 }}
            value={activeKey}
            onChange={(k) => {
              if (k === "models") navigate("/stock/documents/models");
              else navigate("/stock/documents");
            }}
            options={[
              { value: "files", label: N[0] },
              { value: "models", label: N[1] },
            ]}
          />
        </Form.Item>
      </Form>
      <Outlet />
    </>
  );
}
