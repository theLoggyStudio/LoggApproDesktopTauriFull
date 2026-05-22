import { useCallback, useEffect, useState } from "react";
import { Card, Form, Input, Popconfirm, Space, Table, Typography, message } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Button, Loading, Modal } from "../../../items";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import { deleteStockRole, fetchStockRoles, upsertStockRole, type StockRoleRow } from "../../../lib/stockApi";
import { getDefaultStockPrivilegesForNewRole, hasStockPrivilege } from "../../utils/stockPrivileges";
import { StockPrivilegeGroupedPicker, useStockAdminPrivilegeGroups } from "./StockAdminPrivilegePicker";

const { Paragraph, Text } = Typography;

export default function StockRolesPage() {
  const R = usePageTexts("stockRoles");
  const U = usePageTexts("stockUserAdmin");
  const { session } = useSession();
  const { groups, privLabel, selectAllLabel } = useStockAdminPrivilegeGroups();
  const canManage = hasStockPrivilege(session, "roles_manage");
  const [rows, setRows] = useState<StockRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rolePrivileges, setRolePrivileges] = useState<string[]>([]);
  const [form] = Form.useForm<{ name: string; code: string; description: string }>();

  const load = useCallback(() => {
    setLoading(true);
    fetchStockRoles()
      .then(setRows)
      .catch((e) => message.error(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!modalOpen) return;
    const t = window.setTimeout(() => {
      if (editingId) {
        const row = rows.find((x) => x.id === editingId);
        if (row) {
          form.setFieldsValue({
            name: row.name,
            code: row.code ?? "",
            description: row.description ?? "",
          });
          setRolePrivileges(row.privileges?.length ? [...row.privileges] : getDefaultStockPrivilegesForNewRole());
        }
      } else {
        form.resetFields();
        setRolePrivileges(getDefaultStockPrivilegesForNewRole());
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [modalOpen, editingId, rows, form]);

  const onSave = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    if (!rolePrivileges.length) {
      message.error(U[25]);
      return;
    }
    try {
      await upsertStockRole({
        id: editingId ?? undefined,
        name: v.name.trim(),
        code: v.code?.trim() || undefined,
        description: v.description?.trim() || undefined,
        privileges: rolePrivileges,
      });
      message.success(R[10]);
      setModalOpen(false);
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const dupLabel = getPageTexts("stockCommon")[0];
  const dupSuffix = getPageTexts("stockCommon")[1] || " (copie)";

  const duplicateRoleFromModal = () => {
    const v = form.getFieldsValue() as { name?: string; code?: string; description?: string };
    const base = (v.name ?? "").trim();
    form.setFieldsValue({
      name: base ? `${base}${dupSuffix}` : base,
      code: (v.code ?? "").trim(),
      description: (v.description ?? "").trim(),
    });
    setRolePrivileges([...rolePrivileges]);
    setEditingId(null);
  };

  const onDelete = async (id: string) => {
    try {
      await deleteStockRole(id);
      message.success(R[12]);
      setModalOpen(false);
      setEditingId(null);
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const columns: ColumnsType<StockRoleRow> = [
    { title: R[3], dataIndex: "name", key: "name" },
    { title: R[4], dataIndex: "code", key: "code", width: 140 },
    { title: R[5], dataIndex: "description", key: "description" },
  ];

  return (
    <Card
      title={
        <Space>
          <span>{R[0]}</span>
          {canManage ? (
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingId(null);
                setModalOpen(true);
              }}
            >
              {R[2]}
            </Button>
          ) : null}
        </Space>
      }
    >
      <Paragraph type="secondary">{R[1]}</Paragraph>
      <Loading spinning={loading}>
        {rows.length === 0 && !loading ? (
          <Text type="secondary">{R[9]}</Text>
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            pagination={{ pageSize: 12 }}
            size="small"
            onRow={
              canManage
                ? (r) => ({
                    onClick: () => {
                      setEditingId(r.id);
                      setModalOpen(true);
                    },
                    style: { cursor: "pointer" },
                  })
                : undefined
            }
          />
        )}
      </Loading>

      <Modal
        title={editingId ? `${R[0]} — ${R[3]}` : R[2]}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void onSave()}
        okText={R[6]}
        cancelText={R[7]}
        destroyOnHidden
        width={680}
        styles={{ body: { maxHeight: "72vh", overflowY: "auto" } }}
        footer={
          editingId && canManage ? (
            <Space style={{ width: "100%", justifyContent: "space-between" }}>
              <Popconfirm title={R[13]} onConfirm={() => void onDelete(editingId)}>
                <Button danger icon={<DeleteOutlined />}>
                  {R[8]}
                </Button>
              </Popconfirm>
              <Space>
                <Button onClick={() => setModalOpen(false)}>{R[7]}</Button>
                <Button onClick={duplicateRoleFromModal}>{dupLabel}</Button>
                <Button type="primary" onClick={() => void onSave()}>
                  {R[6]}
                </Button>
              </Space>
            </Space>
          ) : undefined
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={R[3]} rules={[{ required: true, message: R[11] }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label={R[4]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={R[5]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Paragraph type="secondary" style={{ marginBottom: 8 }}>
            {R[15]}
          </Paragraph>
          <div style={{ marginBottom: 8 }}>
            <Text strong>{R[14]}</Text>
          </div>
          <StockPrivilegeGroupedPicker
            value={rolePrivileges}
            onChange={setRolePrivileges}
            groups={groups}
            privLabel={privLabel}
            selectAllLabel={selectAllLabel}
          />
        </Form>
      </Modal>
    </Card>
  );
}
