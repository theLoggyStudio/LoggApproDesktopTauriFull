import { useCallback, useEffect, useState } from "react";
import { Card, Descriptions, Form, Input, Popconfirm, Space, Tag, Typography, message, theme } from "antd";
import { Button, Loading, Modal, Select, Table } from "../../../items";
import { UserOutlined, PlusOutlined, DeleteOutlined, CopyOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import {
  deleteStockAppUser,
  fetchStockAppUsers,
  fetchStockRoles,
  upsertStockAppUser,
  upsertStockRole,
  type StockAppUserRow,
  type StockRoleRow,
} from "../../../lib/stockApi";
import { STOCK_DEFAULT_INITIAL_PASSWORD, getDefaultStockPrivilegesForNewRole } from "../../utils/stockPrivileges";
import { useStockAdminPrivilegeGroups } from "./StockAdminPrivilegePicker";

const { Title, Text, Paragraph } = Typography;

export default function StockUserPage() {
  const T = usePageTexts("stockUser");
  const U = usePageTexts("stockUserAdmin");
  const R = usePageTexts("stockRoles");
  const C = usePageTexts("stockSelectCreateRow");
  const { session } = useSession();
  const { token } = theme.useToken();
  const { privLabel } = useStockAdminPrivilegeGroups();
  const [rows, setRows] = useState<StockAppUserRow[]>([]);
  const [roles, setRoles] = useState<StockRoleRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [roleQuickOpen, setRoleQuickOpen] = useState(false);
  const [roleQuickForm] = Form.useForm<{ name: string; code?: string; description?: string }>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm<{
    login: string;
    displayName: string;
    address: string;
    roleId?: string;
    password: string;
  }>();

  const isSadmin = session?.role === "sadmin";

  const okDel = getPageTexts("stockArticles")[15];
  const cancelDel = getPageTexts("stockArticles")[16];

  const loadUsers = useCallback(() => {
    if (!isSadmin) return;
    setLoadingUsers(true);
    fetchStockAppUsers("sadmin")
      .then(setRows)
      .finally(() => setLoadingUsers(false));
  }, [isSadmin]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!isSadmin) return;
    fetchStockRoles()
      .then(setRoles)
      .catch(() => setRoles([]));
  }, [isSadmin]);

  useEffect(() => {
    if (!modalOpen) return;
    const timer = window.setTimeout(() => {
      if (editingId) {
        const row = rows.find((x) => x.id === editingId);
        if (row) {
          form.setFieldsValue({
            login: row.login,
            displayName: row.displayName,
            address: row.address ?? "",
            roleId: row.roleId?.trim() || undefined,
            password: "",
          });
        }
      } else {
        form.resetFields();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [modalOpen, editingId, rows, form]);

  const openCreate = () => {
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (r: StockAppUserRow) => {
    setEditingId(r.id);
    setModalOpen(true);
  };

  const onModalOk = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    try {
      const res = await upsertStockAppUser({
        requesterRole: "sadmin",
        id: editingId ?? undefined,
        login: v.login.trim(),
        displayName: v.displayName.trim(),
        address: v.address?.trim() ?? "",
        roleId: v.roleId?.trim() || undefined,
        password: v.password?.trim() || undefined,
      });
      message.success(U[11]);
      if (res.defaultPassword) {
        message.info(`${U[21]} ${res.defaultPassword}`, 8);
      }
      setModalOpen(false);
      loadUsers();
    } catch (e) {
      message.error(String(e));
    }
  };

  const roleLabel = useCallback(
    (id?: string) => {
      const rid = id?.trim();
      if (!rid) return T[5];
      return roles.find((r) => r.id === rid)?.name ?? rid;
    },
    [roles, T],
  );

  const onRoleQuickOk = async () => {
    const v = await roleQuickForm.validateFields().catch(() => null);
    if (!v) return;
    try {
      const res = await upsertStockRole({
        name: v.name.trim(),
        code: v.code?.trim() || undefined,
        description: v.description?.trim() || undefined,
        privileges: getDefaultStockPrivilegesForNewRole(),
      });
      message.success(R[10]);
      const list = await fetchStockRoles();
      setRoles(list);
      form.setFieldValue("roleId", res.id);
      setRoleQuickOpen(false);
      roleQuickForm.resetFields();
    } catch (e) {
      message.error(String(e));
    }
  };

  const duplicateUserFromModal = () => {
    const v = form.getFieldsValue() as {
      login: string;
      displayName: string;
      address: string;
      roleId?: string;
      password: string;
    };
    const sfx = getPageTexts("stockCommon")[1] || "_copie";
    const login = (v.login ?? "").trim();
    form.setFieldsValue({
      login: login ? `${login}${sfx}` : "",
      displayName: (v.displayName ?? "").trim(),
      address: (v.address ?? "").trim(),
      roleId: v.roleId,
      password: "",
    });
    setEditingId(null);
  };

  const onDelete = async (id: string) => {
    try {
      await deleteStockAppUser(id, "sadmin");
      message.success(U[13]);
      setModalOpen(false);
      setEditingId(null);
      loadUsers();
    } catch (e) {
      message.error(String(e));
    }
  };

  const columns: ColumnsType<StockAppUserRow> = [
    { title: U[3], dataIndex: "login", key: "login", ellipsis: true },
    { title: U[4], dataIndex: "displayName", key: "displayName", ellipsis: true },
    { title: T[3], dataIndex: "roleId", key: "roleId", width: 160, ellipsis: true, render: (_: unknown, r) => roleLabel(r.roleId) },
    { title: T[7], dataIndex: "address", key: "address", ellipsis: true, width: 200 },
    {
      title: U[5],
      dataIndex: "privileges",
      key: "privileges",
      render: (p: string[]) => (
        <span>
          {(p ?? []).map((k) => (
            <Tag key={k} style={{ marginBottom: 4 }}>
              {privLabel(k)}
            </Tag>
          ))}
        </span>
      ),
    },
  ];

  if (!session) {
    return null;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Space align="center" size="middle">
        <UserOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
        <div>
          <Title level={3} style={{ margin: 0 }}>
            {T[0]}
          </Title>
          <Text type="secondary">{T[1]}</Text>
        </div>
      </Space>

      <Card>
        <Descriptions column={1} size="middle" labelStyle={{ fontWeight: 600, width: 200 }}>
          <Descriptions.Item label={T[2]}>{session.loginOrLabel}</Descriptions.Item>
          <Descriptions.Item label={T[3]}>
            {session.role?.trim() ? session.role : <Text type="secondary">{T[5]}</Text>}
          </Descriptions.Item>
          <Descriptions.Item label={T[4]}>
            <Text code>{session.id}</Text>
          </Descriptions.Item>
          {session.role === "stock_user" ? (
            <Descriptions.Item label={T[7]}>
              {session.address?.trim() ? (
                <Text style={{ whiteSpace: "pre-wrap" }}>{session.address}</Text>
              ) : (
                <Text type="secondary">—</Text>
              )}
            </Descriptions.Item>
          ) : null}
        </Descriptions>
        <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
          {T[6]}
        </Paragraph>
      </Card>

      {isSadmin ? (
        <Card title={U[0]}>
          <Paragraph type="secondary">{U[1]}</Paragraph>
          <Paragraph type="secondary" style={{ marginBottom: 12 }}>
            <Text strong>{U[23]}</Text> : <Text code>{STOCK_DEFAULT_INITIAL_PASSWORD}</Text>
          </Paragraph>
          <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 16 }} onClick={openCreate}>
            {U[2]}
          </Button>
          <Loading spinning={loadingUsers}>
            <Table
              rowKey="id"
              columns={columns}
              dataSource={rows}
              pagination={{ pageSize: 8 }}
              size="small"
              onRow={(record) => ({
                onClick: () => openEdit(record),
                style: { cursor: "pointer" },
              })}
            />
          </Loading>
        </Card>
      ) : null}

      <Modal
        title={editingId ? U[20] : U[2]}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={editingId ? undefined : onModalOk}
        okText={U[7]}
        cancelText={U[8]}
        destroyOnHidden
        width={520}
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
              <Popconfirm title={U[10]} onConfirm={() => onDelete(editingId)} okText={okDel} cancelText={cancelDel}>
                <Button danger icon={<DeleteOutlined />}>
                  {U[9]}
                </Button>
              </Popconfirm>
              <Space>
                <Button
                  type="text"
                  icon={<CopyOutlined />}
                  aria-label={getPageTexts("stockCommon")[0]}
                  title={getPageTexts("stockCommon")[0]}
                  onClick={duplicateUserFromModal}
                />
                <Button type="primary" onClick={onModalOk}>
                  {U[7]}
                </Button>
              </Space>
            </div>
          ) : undefined
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="login" label={U[3]} rules={[{ required: true, message: U[12] }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="displayName" label={U[4]}>
            <Input />
          </Form.Item>
          <Form.Item name="roleId" label={T[3]}>
            <Select
              allowClear
              placeholder={T[5]}
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
              showSearch
              optionFilterProp="label"
              createRowLabel={C[28]}
              onCreateRowClick={() => {
                roleQuickForm.resetFields();
                setRoleQuickOpen(true);
              }}
            />
          </Form.Item>
          <Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 12 }}>
            {U[77]}
          </Paragraph>
          <Form.Item name="address" label={T[7]}>
            <Input.TextArea rows={3} placeholder={T[7]} allowClear />
          </Form.Item>
          <Form.Item name="password" label={U[6]} extra={editingId ? U[24] : undefined}>
            <Input.Password autoComplete="new-password" placeholder={editingId ? U[24] : `(${STOCK_DEFAULT_INITIAL_PASSWORD})`} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={C[29]}
        open={roleQuickOpen}
        onCancel={() => {
          setRoleQuickOpen(false);
          roleQuickForm.resetFields();
        }}
        onOk={() => void onRoleQuickOk()}
        okText={R[6]}
        cancelText={R[7]}
        destroyOnHidden
        width={440}
      >
        <Form form={roleQuickForm} layout="vertical">
          <Form.Item name="name" label={R[3]} rules={[{ required: true, message: R[11] }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label={R[4]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={R[5]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
