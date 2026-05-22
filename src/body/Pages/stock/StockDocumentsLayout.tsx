import { useMemo } from "react";
import { Form } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Select } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { canViewDocumentPrintModels, hasStockScreenAccess } from "../../utils/stockPrivileges";
import { useSession } from "../../context/SessionContext";

export default function StockDocumentsLayout() {
  const N = usePageTexts("stockDocumentsNav");
  const D = usePageTexts("stockDocuments");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session } = useSession();
  const canFiles = hasStockScreenAccess(session, "documents");
  const canModels = canViewDocumentPrintModels(session);
  const showNav = canFiles && canModels;

  const activeKey = useMemo(() => {
    if (pathname.includes("/documents/models")) return "models";
    return "files";
  }, [pathname]);

  const options = useMemo(() => {
    const o: { value: string; label: string }[] = [];
    if (canFiles) o.push({ value: "files", label: N[0] });
    if (canModels) o.push({ value: "models", label: N[1] });
    return o;
  }, [N, canFiles, canModels]);

  return (
    <>
      {showNav ? (
        <Form layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item label={D[0]}>
            <Select
              style={{ minWidth: 280 }}
              value={activeKey}
              onChange={(k) => {
                if (k === "models") navigate("/stock/documents/models");
                else navigate("/stock/documents");
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
