import { useCallback, useEffect, useState } from "react";
import { Form, Input, Typography, message, Space } from "antd";
import { Button, Loading, Modal, Table } from "../../../items";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import {
  fetchParties,
  upsertParty,
  deleteParty,
  type StockParty,
} from "../../../lib/stockApi";
import StockDataIoBar from "./StockDataIoBar";

const { Title, Paragraph } = Typography;

type Kind = "SUPPLIER" | "CLIENT";
type PageKey = "stockFournisseurs" | "stockClients";

type Props = { kind: Kind; pageKey: PageKey };

export function StockPartyPage({ kind, pageKey }: Props) {
  const T = usePageTexts(pageKey);
  const [rows, setRows] = useState<StockParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<StockParty | null>(null);
  const [form] = Form.useForm<{ name: string; address?: string }>();

  const load = useCallback(() => {
    setLoading(true);
    fetchParties(kind)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!modalOpen) return;
    const timer = window.setTimeout(() => {
      if (editingParty) {
        form.setFieldsValue({
          name: editingParty.name,
          address: editingParty.address ?? "",
        });
      } else {
        form.resetFields();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [modalOpen, editingParty?.id, editingParty, form]);

  const onSave = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    try {
      await upsertParty(kind, v.name.trim(), (v.address ?? "").trim(), editingParty?.id);
      message.success(T[9]);
      setModalOpen(false);
      form.resetFields();
      setEditingParty(null);
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteParty(id);
      setModalOpen(false);
      setEditingParty(null);
      form.resetFields();
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const editLbl = getPageTexts("stockArticles")[11];

  const confirmDeleteEditing = () => {
    if (!editingParty) return;
    Modal.confirm({
      title: T[7],
      okText: getPageTexts("stockArticles")[15],
      cancelText: getPageTexts("stockArticles")[16],
      onOk: () => onDelete(editingParty.id),
    });
  };

  const csvTable = kind === "SUPPLIER" ? "fournisseurs" : "clients";
  const importPriv = kind === "SUPPLIER" ? "fournisseurs_import" : "clients_import";
  const exportPriv = kind === "SUPPLIER" ? "fournisseurs_export" : "clients_export";

  const columns: ColumnsType<StockParty> = [
    {
      title: T[3],
      dataIndex: "name",
      key: "name",
      ellipsis: true,
    },
    {
      title: T[11],
      dataIndex: "address",
      key: "address",
      ellipsis: true,
      render: (a: string) => a || "—",
    },
  ];

  return (
    <Loading spinning={loading}>
      <Title level={3}>{T[0]}</Title>
      <Paragraph type="secondary">{T[1]}</Paragraph>
      <Space wrap style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingParty(null);
            setModalOpen(true);
          }}
        >
          {T[2]}
        </Button>
        <StockDataIoBar
          table={csvTable}
          importPrivilege={importPriv}
          exportPrivilege={exportPriv}
          onAfterImport={load}
        />
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        locale={{ emptyText: T[8] }}
        pagination={{ pageSize: 12 }}
        onRow={(record) => ({
          onClick: () => {
            setEditingParty(record);
            setModalOpen(true);
          },
          style: { cursor: "pointer" },
        })}
      />
      <Modal
        title={editingParty ? editLbl : T[2]}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingParty(null);
          form.resetFields();
        }}
        onOk={editingParty ? undefined : onSave}
        okText={T[4]}
        cancelText={T[5]}
        destroyOnHidden
        footer={
          editingParty ? (
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
                {T[6]}
              </Button>
              <Space>
                <Button
                  onClick={() => {
                    setModalOpen(false);
                    setEditingParty(null);
                    form.resetFields();
                  }}
                >
                  {T[5]}
                </Button>
                <Button type="primary" onClick={onSave}>
                  {T[4]}
                </Button>
              </Space>
            </div>
          ) : undefined
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={T[3]} rules={[{ required: true, message: T[10] }]}>
            <Input placeholder={T[3]} />
          </Form.Item>
          <Form.Item name="address" label={T[11]} rules={[{ required: true, message: T[12] }]}>
            <Input.TextArea placeholder={T[11]} rows={3} autoSize={{ minRows: 2, maxRows: 6 }} />
          </Form.Item>
        </Form>
      </Modal>
    </Loading>
  );
}
