import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Form } from "antd";
import { Select } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import { hasStockScreenAccess } from "../../utils/stockPrivileges";

export default function StockArticlesLayout() {
  const N = usePageTexts("stockArticlesNav");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session } = useSession();

  const canList = hasStockScreenAccess(session, "articles");
  const canUnits = hasStockScreenAccess(session, "articles_units");
  const canCategories = hasStockScreenAccess(session, "articles_categories");
  const canDevises = hasStockScreenAccess(session, "articles_devises");
  const showNav = [canList, canUnits, canCategories, canDevises].filter(Boolean).length > 1;

  const activeKey = pathname.includes("/articles/units")
    ? "units"
    : pathname.includes("/articles/categories")
      ? "categories"
      : pathname.includes("/articles/devises")
        ? "devises"
        : "list";

  const options = useMemo(() => {
    const o: { value: string; label: string }[] = [];
    if (canList) o.push({ value: "list", label: N[0] });
    if (canUnits) o.push({ value: "units", label: N[1] });
    if (canCategories) o.push({ value: "categories", label: N[2] });
    if (canDevises) o.push({ value: "devises", label: N[3] });
    return o;
  }, [N, canList, canUnits, canCategories, canDevises]);

  return (
    <>
      {showNav ? (
        <Form layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item label={N[9]}>
            <Select
              style={{ minWidth: 240 }}
              value={activeKey}
              onChange={(k) => {
                if (k === "list") navigate("/stock/articles");
                else navigate(`/stock/articles/${k}`);
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
