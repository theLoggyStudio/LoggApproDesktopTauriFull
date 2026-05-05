import { useCallback, useEffect, useState } from "react";
import { Form, Input, Space, Typography, message } from "antd";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { PlusOutlined, PrinterOutlined } from "@ant-design/icons";
import { Button, Modal, Select } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import { canPrintStockWarehouses } from "../../utils/stockPrivileges";
import { fetchRefItems, upsertRefItem, type StockRefItem } from "../../../lib/stockApi";
import { StockPrintModal } from "./StockPrintModal";
import { buildPrintTableHtml, sortByIsoDate } from "../../utils/stockBrowserPrint";
import { printStockListWithOptionalTemplate } from "../../utils/stockListPrintWithTemplate";

const { Title } = Typography;

/** Zone Entrepôt : même motif que Articles / Documents — liste « Sous-écran » = entrepôts ; emplacements dans l’`<Outlet />`. */
export default function StockWarehouseLayout() {
  const W = usePageTexts("stockWarehouseNav");
  const Prt = usePageTexts("stockPrint");
  const { session } = useSession();
  const canPrint = canPrintStockWarehouses(session);
  const { warehouseId } = useParams<{ warehouseId: string }>();
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<StockRefItem[]>([]);
  const [loadingWh, setLoadingWh] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [createForm] = Form.useForm<{ name: string; code?: string }>();

  const loadWarehouses = useCallback(() => {
    setLoadingWh(true);
    fetchRefItems("warehouse")
      .then(setWarehouses)
      .finally(() => setLoadingWh(false));
  }, []);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    if (loadingWh || !warehouseId || warehouses.length === 0) return;
    const exists = warehouses.some((w) => w.id === warehouseId);
    if (!exists) {
      navigate(`/stock/warehouse/${warehouses[0].id}`, { replace: true });
    }
  }, [loadingWh, warehouseId, warehouses, navigate]);

  const onCreateWarehouse = async () => {
    const v = await createForm.validateFields().catch(() => null);
    if (!v?.name?.trim()) {
      message.warning(W[12]);
      return;
    }
    try {
      const r = await upsertRefItem("warehouse", {
        name: v.name.trim(),
        code: v.code?.trim() ?? "",
      });
      message.success(W[11]);
      setCreateOpen(false);
      createForm.resetFields();
      await loadWarehouses();
      if (r.id) navigate(`/stock/warehouse/${r.id}`, { replace: true });
    } catch (e) {
      message.error(String(e));
    }
  };

  if (!loadingWh && warehouses.length === 0) {
    return (
      <>
        <Title level={3} style={{ marginTop: 0 }}>
          {W[1]}
        </Title>
        <Typography.Paragraph type="secondary">{W[14]}</Typography.Paragraph>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          {W[4]}
        </Button>
        <Modal
          title={W[6]}
          open={createOpen}
          onCancel={() => setCreateOpen(false)}
          onOk={onCreateWarehouse}
          okText={W[9]}
          cancelText={W[10]}
          destroyOnHidden
          width={440}
        >
          <Form form={createForm} layout="vertical">
            <Form.Item name="name" label={W[7]} rules={[{ required: true, message: W[12] }]}>
              <Input />
            </Form.Item>
            <Form.Item name="code" label={W[8]}>
              <Input />
            </Form.Item>
          </Form>
        </Modal>
      </>
    );
  }

  const runPrint = async (listKey: string, sort: "asc" | "desc", modelId: string) => {
    if (listKey !== "wh") return false;
    const sorted = sortByIsoDate(warehouses, "createdAt", sort);
    const headers = [W[7], W[8], Prt[7] ?? "Date"];
    const body = sorted.map((w) => [w.name, w.code ?? "", w.createdAt ?? ""]);
    return await printStockListWithOptionalTemplate(
      "wh",
      `${W[1]} — ${Prt[0] ?? "Imprimer"}`,
      buildPrintTableHtml(W[14] ?? W[1], headers, body),
      modelId,
    );
  };

  return (
    <>
      <Form layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item label={W[2]}>
          <Select
            loading={loadingWh}
            style={{ minWidth: 280 }}
            value={warehouseId}
            onChange={(id) => navigate(`/stock/warehouse/${id}`)}
            options={warehouses.map((w) => ({
              value: w.id,
              label: w.code ? `${w.name} (${w.code})` : w.name,
            }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item>
          <Button type="default" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {W[4]}
          </Button>
        </Form.Item>
      </Form>
      <StockPrintModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        lists={[{ value: "wh", label: W[14] ?? W[1] }]}
        onPrint={runPrint}
      />
      <Space align="start" style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }}>
        <Title level={3} style={{ marginTop: 0, marginBottom: 0 }}>
          {W[1]}
        </Title>
        <Button
          icon={<PrinterOutlined />}
          disabled={!canPrint || warehouses.length === 0}
          onClick={() => {
            if (canPrint && warehouses.length > 0) setPrintOpen(true);
          }}
        >
          {Prt[0] ?? "Imprimer"}
        </Button>
      </Space>
      <Outlet />
      <Modal
        title={W[6]}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={onCreateWarehouse}
        okText={W[9]}
        cancelText={W[10]}
        destroyOnHidden
        width={440}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label={W[7]} rules={[{ required: true, message: W[12] }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label={W[8]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
