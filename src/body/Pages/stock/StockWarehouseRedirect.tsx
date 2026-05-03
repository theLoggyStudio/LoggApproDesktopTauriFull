import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Spin, Typography } from "antd";
import { fetchRefItems } from "../../../lib/stockApi";
import { usePageTexts } from "../../../hooks/usePageTexts";

/** Redirige vers le premier entrepôt connu (la base en crée un par défaut si besoin). */
export default function StockWarehouseRedirect() {
  const navigate = useNavigate();
  const W = usePageTexts("stockWarehouseNav");

  useEffect(() => {
    let cancelled = false;
    fetchRefItems("warehouse")
      .then((list) => {
        if (cancelled) return;
        if (list.length) {
          navigate(`/stock/warehouse/${list[0].id}`, { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) navigate("/stock", { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <Spin size="large" />
      <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
        {W[5]}
      </Typography.Paragraph>
    </div>
  );
}
