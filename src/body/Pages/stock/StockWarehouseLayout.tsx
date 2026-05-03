import { useCallback, useEffect, useState } from "react";
import { Form, Input, Typography, message } from "antd";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { PlusOutlined } from "@ant-design/icons";
import { Button, Modal, Select } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { fetchRefItems, upsertRefItem, type StockRefItem } from "../../../lib/stockApi";

const { Title } = Typography;

/** Zone Entrepôt : sous-écran = entrepôt choisi ; emplacements dans l’`<Outlet />`. */
export default function StockWarehouseLayout() {
  const W = usePageTexts("stockWarehouseNav");
  const { warehouseId } = useParams<{ warehouseId: string }>();
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<StockRefItem[]>([]);
  const [loadingWh, setLoadingWh] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
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

  return (
    <>
      <Title level={3} style={{ marginTop: 0 }}>
        {W[1]}
      </Title>
      <Form layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item label={W[3]}>
          <Select
            loading={loadingWh}
            style={{ minWidth: 260 }}
            value={warehouseId}
            onChange={(id) => navigate(`/stock/warehouse/${id}`)}
            options={warehouses.map((w) => ({
              value: w.id,
              label: w.code ? `${w.name} (${w.code})` : w.name,
            }))}
          />
        </Form.Item>
        <Form.Item>
          <Button type="default" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {W[4]}
          </Button>
        </Form.Item>
      </Form>
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
