import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  Checkbox,
  Descriptions,
  Form,
  Input,
  Popconfirm,
  Space,
  Tag,
  Typography,
  message,
  theme,
} from "antd";
import { Button, Loading, Modal, Table } from "../../../items";
import { UserOutlined, PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import {
  deleteStockAppUser,
  fetchStockAppUsers,
  upsertStockAppUser,
  type StockAppUserRow,
} from "../../../lib/stockApi";
import {
  STOCK_EDITABLE_PRIVILEGE_KEYS,
  STOCK_IO_PRIVILEGE_KEYS,
  STOCK_DOCUMENT_PRIVILEGE_KEYS,
  STOCK_DEFAULT_INITIAL_PASSWORD,
  getDefaultStockPrivilegesForNewUser,
} from "../../utils/stockPrivileges";

const { Title, Text, Paragraph } = Typography;

const PRIV_LABEL_INDEX: Record<(typeof STOCK_EDITABLE_PRIVILEGE_KEYS)[number], number> = {
  dashboard: 14,
  articles: 15,
  warehouse: 26,
  movements: 16,
  fournisseurs: 17,
  clients: 18,
  documents: 40,
  settings: 19,
};

const PRIV_IO_LABEL_INDEX: Record<(typeof STOCK_IO_PRIVILEGE_KEYS)[number], number> = {
  dashboard_charts: 27,
  articles_import: 28,
  articles_export: 29,
  movements_import: 30,
  movements_export: 31,
  fournisseurs_import: 32,
  fournisseurs_export: 33,
  clients_import: 34,
  clients_export: 35,
  ref_units_import: 36,
  ref_units_export: 37,
  ref_locations_import: 38,
  ref_locations_export: 39,
  ref_locations_view: 53,
  ref_locations_create: 54,
  ref_locations_edit: 55,
  ref_locations_delete: 56,
  ref_categories_import: 51,
  ref_categories_export: 52,
};

const PRIV_DOC_LABEL_INDEX: Record<(typeof STOCK_DOCUMENT_PRIVILEGE_KEYS)[number], number> = {
  documents_view: 41,
  documents_import_png: 42,
  documents_export_png: 43,
  documents_delete_png: 44,
  documents_import_jpeg: 45,
  documents_export_jpeg: 46,
  documents_delete_jpeg: 47,
  documents_import_pdf: 48,
  documents_export_pdf: 49,
  documents_delete_pdf: 50,
};

type PrivilegeGroup = { title: string; keys: readonly string[] };

function StockPrivilegeGroupedPicker({
  value,
  onChange,
  groups,
  privLabel,
  selectAllLabel,
}: {
  value?: string[];
  onChange?: (v: string[]) => void;
  groups: PrivilegeGroup[];
  privLabel: (key: string) => string;
  selectAllLabel: string;
}) {
  const selected = value ?? [];

  const applySet = (next: Set<string>) => {
    onChange?.([...next].sort((a, b) => a.localeCompare(b)));
  };

  const toggleKey = (key: string, checked: boolean) => {
    const s = new Set(selected);
    if (checked) s.add(key);
    else s.delete(key);
    applySet(s);
  };

  const toggleGroup = (keys: readonly string[], checked: boolean) => {
    const s = new Set(selected);
    keys.forEach((k) => {
      if (checked) s.add(k);
      else s.delete(k);
    });
    applySet(s);
  };

  return (
    <div>
      {groups.map((g, idx) => {
        const inGroup = g.keys.filter((k) => selected.includes(k)).length;
        const all = g.keys.length > 0 && inGroup === g.keys.length;
        const some = inGroup > 0 && !all;
        return (
          <div key={g.title}>
            {idx > 0 ? <br /> : null}
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {g.title}
            </Text>
            <Checkbox
              indeterminate={some}
              checked={all}
              onChange={(e) => toggleGroup(g.keys, e.target.checked)}
              style={{ display: "block", marginBottom: 8 }}
            >
              {selectAllLabel}
            </Checkbox>
            <Space direction="vertical" size={4} style={{ marginLeft: 20, marginBottom: 4 }}>
              {g.keys.map((k) => (
                <Checkbox key={k} checked={selected.includes(k)} onChange={(e) => toggleKey(k, e.target.checked)}>
                  {privLabel(k)}
                </Checkbox>
              ))}
            </Space>
          </div>
        );
      })}
    </div>
  );
}

export default function StockUserPage() {
  const T = usePageTexts("stockUser");
  const U = usePageTexts("stockUserAdmin");
  const { session } = useSession();
  const { token } = theme.useToken();
  const [rows, setRows] = useState<StockAppUserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm<{
    login: string;
    displayName: string;
    password: string;
    privileges: string[];
  }>();

  const isSadmin = session?.role === "sadmin";

  const privilegeGroups = useMemo<PrivilegeGroup[]>(
    () => [
      { title: U[57], keys: STOCK_EDITABLE_PRIVILEGE_KEYS },
      { title: U[58], keys: ["dashboard_charts"] },
      { title: U[59], keys: ["articles_import", "articles_export"] },
      { title: U[60], keys: ["movements_import", "movements_export"] },
      { title: U[61], keys: ["fournisseurs_import", "fournisseurs_export"] },
      { title: U[62], keys: ["clients_import", "clients_export"] },
      { title: U[63], keys: ["ref_units_import", "ref_units_export"] },
      {
        title: U[64],
        keys: [
          "ref_locations_import",
          "ref_locations_export",
          "ref_locations_view",
          "ref_locations_create",
          "ref_locations_edit",
          "ref_locations_delete",
        ],
      },
      { title: U[65], keys: ["ref_categories_import", "ref_categories_export"] },
      { title: U[66], keys: STOCK_DOCUMENT_PRIVILEGE_KEYS },
    ],
    [U],
  );

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
    if (!modalOpen) return;
    const timer = window.setTimeout(() => {
      if (editingId) {
        const row = rows.find((x) => x.id === editingId);
        if (row) {
          const allEditable = [...STOCK_EDITABLE_PRIVILEGE_KEYS, ...STOCK_IO_PRIVILEGE_KEYS, ...STOCK_DOCUMENT_PRIVILEGE_KEYS];
          const editable = allEditable.filter((k) => row.privileges.includes(k));
          form.setFieldsValue({
            login: row.login,
            displayName: row.displayName,
            password: "",
            privileges: editable.length ? editable : getDefaultStockPrivilegesForNewUser(),
          });
        }
      } else {
        form.resetFields();
        form.setFieldsValue({
          privileges: getDefaultStockPrivilegesForNewUser(),
        });
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
        password: v.password?.trim() || undefined,
        privileges: v.privileges ?? [],
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

  const privLabel = (key: string) => {
    const k = key as keyof typeof PRIV_LABEL_INDEX;
    if (k in PRIV_LABEL_INDEX) return U[PRIV_LABEL_INDEX[k]] ?? key;
    const ik = key as keyof typeof PRIV_IO_LABEL_INDEX;
    if (ik in PRIV_IO_LABEL_INDEX) return U[PRIV_IO_LABEL_INDEX[ik]] ?? key;
    const dk = key as keyof typeof PRIV_DOC_LABEL_INDEX;
    if (dk in PRIV_DOC_LABEL_INDEX) return U[PRIV_DOC_LABEL_INDEX[dk]] ?? key;
    if (key === "user") return U[22];
    return key;
  };

  const columns: ColumnsType<StockAppUserRow> = [
    { title: U[3], dataIndex: "login", key: "login", ellipsis: true },
    { title: U[4], dataIndex: "displayName", key: "displayName", ellipsis: true },
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
        width={680}
        styles={{ body: { maxHeight: "72vh", overflowY: "auto" } }}
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
                <Button onClick={() => setModalOpen(false)}>{U[8]}</Button>
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
          <Form.Item name="password" label={U[6]} extra={editingId ? U[24] : undefined}>
            <Input.Password autoComplete="new-password" placeholder={editingId ? U[24] : `(${STOCK_DEFAULT_INITIAL_PASSWORD})`} />
          </Form.Item>
          <Form.Item
            name="privileges"
            label={U[5]}
            rules={[
              {
                validator: (_, v) =>
                  Array.isArray(v) && v.length > 0 ? Promise.resolve() : Promise.reject(new Error(U[25])),
              },
            ]}
          >
            <StockPrivilegeGroupedPicker
              groups={privilegeGroups}
              privLabel={privLabel}
              selectAllLabel={U[67]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
