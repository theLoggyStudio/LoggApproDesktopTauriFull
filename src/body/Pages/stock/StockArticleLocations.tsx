import { useParams } from "react-router-dom";
import { Typography } from "antd";
import { StockRefItemsPage } from "./StockRefItemsPage";
import { usePageTexts } from "../../../hooks/usePageTexts";

export default function StockArticleLocations() {
  const { warehouseId } = useParams<{ warehouseId: string }>();
  const W = usePageTexts("stockWarehouseNav");

  if (!warehouseId) {
    return <Typography.Paragraph type="secondary">{W[5]}</Typography.Paragraph>;
  }

  return (
    <StockRefItemsPage
      kind="location"
      pageKey="stockArticleLocations"
      warehouseId={warehouseId}
      formVariant="inline"
    />
  );
}
