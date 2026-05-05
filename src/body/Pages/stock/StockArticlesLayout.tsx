import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Form } from "antd";
import { Select } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";

export default function StockArticlesLayout() {
  const N = usePageTexts("stockArticlesNav");
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const activeKey = pathname.includes("/units")
    ? "units"
    : pathname.includes("/categories")
      ? "categories"
      : pathname.includes("/devises")
        ? "devises"
        : "list";

  return (
    <>
      <Form layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item label={N[9]}>
          <Select
            style={{ minWidth: 240 }}
            value={activeKey}
            onChange={(k) => {
              if (k === "list") navigate("/stock/articles");
              else navigate(`/stock/articles/${k}`);
            }}
            options={[
              { value: "list", label: N[0] },
              { value: "units", label: N[1] },
              { value: "categories", label: N[2] },
              { value: "devises", label: N[3] },
            ]}
          />
        </Form.Item>
      </Form>
      <Outlet />
    </>
  );
}
