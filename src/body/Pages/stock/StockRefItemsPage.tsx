import { useCallback, useEffect, useState } from "react";
import { Card, Form, Input, Typography, message, Space } from "antd";
import { Alert, Button, Loading, Modal, Table } from "../../../items";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import {
  hasRefLocationCreate,
  hasRefLocationDelete,
  hasRefLocationEdit,
  hasRefLocationView,
  hasStockPrivilege,
} from "../../utils/stockPrivileges";
import { deleteRefItem, fetchRefItems, upsertRefItem, type StockRefItem, type StockRefKind } from "../../../lib/stockApi";
import StockDataIoBar from "./StockDataIoBar";

const { Title, Paragraph } = Typography;

type PageKey = "stockArticleUnits" | "stockArticleLocations" | "stockArticleCategories";

type Props = {
  kind: Exclude<StockRefKind, "warehouse">;
  pageKey: PageKey;
  /** Filtrage / création des emplacements pour un entrepôt (écran Entrepôt). */
  warehouseId?: string;
  /** `inline` : formulaire au-dessus du tableau (création / édition / suppression comme avant). */
  formVariant?: "modal" | "inline";
};

export function StockRefItemsPage({ kind, pageKey, warehouseId, formVariant = "modal" }: Props) {
  const T = usePageTexts(pageKey);
  const { session } = useSession();
  const isInline = formVariant === "inline";
  const isLoc = kind === "location";
  const canLocView = !isLoc || hasRefLocationView(session);
  const canLocCreate = !isLoc || hasRefLocationCreate(session);
  const canLocEdit = !isLoc || hasRefLocationEdit(session);
  const canLocDelete = !isLoc || hasRefLocationDelete(session);
  const canLocCsvImport = isLoc && hasStockPrivilege(session, "ref_locations_import") && canLocCreate;
  const canLocCsvExport = isLoc && hasStockPrivilege(session, "ref_locations_export") && canLocView;

  const [rows, setRows] = useState<StockRefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm<{ name: string; code: string }>();

  const load = useCallback(() => {
    if (isLoc && !hasRefLocationView(session)) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const locOpts = kind === "location" && warehouseId ? { warehouseId } : undefined;
    fetchRefItems(kind, locOpts)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [kind, warehouseId, isLoc, session]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isInline) {
      const timer = window.setTimeout(() => {
        if (editingId) {
          const row = rows.find((x) => x.id === editingId);
          if (row) form.setFieldsValue({ name: row.name, code: row.code ?? "" });
        } else {
          form.resetFields();
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (!modalOpen) return;
    const timer = window.setTimeout(() => {
      if (editingId) {
        const row = rows.find((x) => x.id === editingId);
        if (row) form.setFieldsValue({ name: row.name, code: row.code ?? "" });
      } else {
        form.resetFields();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isInline, modalOpen, editingId, rows, form]);

  const openCreate = () => {
    if (isLoc && !canLocCreate) return;
    setEditingId(null);
    if (isInline) {
      form.resetFields();
    } else {
      setModalOpen(true);
    }
  };

  const openEdit = (r: StockRefItem) => {
    if (isLoc && !canLocEdit) return;
    setEditingId(r.id);
    if (!isInline) setModalOpen(true);
  };

  const onSave = async () => {
    if (isLoc) {
      if (editingId && !canLocEdit) return;
      if (!editingId && !canLocCreate) return;
    }
    const v = await form.validateFields().catch(() => null);
    if (!v?.name?.trim()) {
      message.warning(T[11]);
      return;
    }
    try {
      const body: { id?: string; name: string; code: string; warehouseId?: string } = {
        id: editingId ?? undefined,
        name: v.name.trim(),
        code: v.code?.trim() ?? "",
      };
      if (kind === "location" && warehouseId && !editingId) {
        body.warehouseId = warehouseId;
      }
      await upsertRefItem(kind, body);
      message.success(T[10]);
      if (!isInline) setModalOpen(false);
      if (isInline) {
        setEditingId(null);
        form.resetFields();
      }
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const onDelete = async (id: string) => {
    if (isLoc && !canLocDelete) return;
    try {
      await deleteRefItem(kind, id);
      message.success(T[12]);
      if (!isInline) setModalOpen(false);
      setEditingId(null);
      if (isInline) form.resetFields();
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const editLbl = getPageTexts("stockArticles")[11];

  const confirmDeleteEditing = () => {
    if (!editingId) return;
    Modal.confirm({
      title: T[8],
      okText: getPageTexts("stockArticles")[15],
      cancelText: getPageTexts("stockArticles")[16],
      onOk: () => onDelete(editingId),
    });
  };

  const csvTable =
    kind === "unit" ? "ref_unit" : kind === "location" ? "ref_location" : "ref_category";
  const importPriv =
    kind === "unit"
      ? "ref_units_import"
      : kind === "location"
        ? "ref_locations_import"
        : "ref_categories_import";
  const exportPriv =
    kind === "unit"
      ? "ref_units_export"
      : kind === "location"
        ? "ref_locations_export"
        : "ref_categories_export";

  const importPass = isLoc ? (canLocCsvImport ? importPriv : undefined) : importPriv;
  const exportPass = isLoc ? (canLocCsvExport ? exportPriv : undefined) : exportPriv;

  const columns: ColumnsType<StockRefItem> = [
    { title: T[3], dataIndex: "name", key: "name", ellipsis: true },
    { title: T[4], dataIndex: "code", key: "code", width: 140, ellipsis: true },
  ];

  const formInputsDisabled = isLoc && (editingId ? !canLocEdit : !canLocCreate);

  const formBlock = (
    <Form form={form} layout="vertical">
      <Form.Item name="name" label={T[3]} rules={[{ required: true, message: T[11] }]}>
        <Input disabled={!!formInputsDisabled} />
      </Form.Item>
      <Form.Item name="code" label={T[4]}>
        <Input disabled={!!formInputsDisabled} />
      </Form.Item>
    </Form>
  );

  const showInlineFormCard = isInline && isLoc && (canLocCreate || canLocEdit);
  const rowCursor = isInline && isLoc && !canLocEdit ? "default" : "pointer";

  if (isLoc && !canLocView) {
    return (
      <Loading spinning={loading}>
        <Title level={4} style={{ marginTop: 0 }}>
          {T[0]}
        </Title>
        <Alert type="warning" showIcon message={T[14] ?? T[0]} style={{ marginTop: 8 }} />
      </Loading>
    );
  }

  return (
    <Loading spinning={loading}>
      <Title level={4} style={{ marginTop: 0 }}>
        {T[0]}
      </Title>
      <Paragraph type="secondary">{T[1]}</Paragraph>
      {showInlineFormCard ? (
        <Card title={T[13] ?? T[0]} size="small" style={{ marginBottom: 16 }}>
          {formBlock}
          <Space wrap style={{ marginTop: 8 }}>
            {canLocCreate ? (
              <Button type="default" icon={<PlusOutlined />} onClick={openCreate}>
                {T[2]}
              </Button>
            ) : null}
            {(canLocCreate && !editingId) || (canLocEdit && !!editingId) ? (
              <Button type="primary" onClick={onSave}>
                {T[5]}
              </Button>
            ) : null}
            {editingId && canLocDelete ? (
              <Button danger icon={<DeleteOutlined />} onClick={confirmDeleteEditing}>
                {T[7]}
              </Button>
            ) : null}
          </Space>
        </Card>
      ) : null}
      <Space wrap style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }}>
        {!isInline ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {T[2]}
          </Button>
        ) : (
          <span />
        )}
        <StockDataIoBar
          table={csvTable}
          importPrivilege={importPass}
          exportPrivilege={exportPass}
          warehouseId={kind === "location" ? warehouseId : undefined}
          onAfterImport={load}
        />
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        locale={{ emptyText: T[9] }}
        pagination={{ pageSize: 12 }}
        onRow={(record) => ({
          onClick: () => openEdit(record),
          style: {
            cursor: rowCursor,
            background: isInline && record.id === editingId ? "rgba(24, 144, 255, 0.09)" : undefined,
          },
        })}
      />
      {!isInline ? (
        <Modal
          title={editingId ? editLbl : T[2]}
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          onOk={editingId ? undefined : onSave}
          okText={T[5]}
          cancelText={T[6]}
          destroyOnHidden
          footer={
            editingId ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <Button danger icon={<DeleteOutlined />} onClick={confirmDeleteEditing}>
                  {T[7]}
                </Button>
                <Space>
                  <Button onClick={() => setModalOpen(false)}>{T[6]}</Button>
                  <Button type="primary" onClick={onSave}>
                    {T[5]}
                  </Button>
                </Space>
              </div>
            ) : undefined
          }
        >
          <Form form={form} layout="vertical">
            <Form.Item name="name" label={T[3]} rules={[{ required: true, message: T[11] }]}>
              <Input />
            </Form.Item>
            <Form.Item name="code" label={T[4]}>
              <Input />
            </Form.Item>
          </Form>
        </Modal>
      ) : null}
    </Loading>
  );
}
