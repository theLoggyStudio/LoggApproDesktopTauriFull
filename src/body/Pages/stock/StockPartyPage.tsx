import { useCallback, useEffect, useMemo, useState } from "react";
import { Form, Input, Typography, message, Space } from "antd";
import { Button, Loading, Modal, Table } from "../../../items";
import { PlusOutlined, DeleteOutlined, PrinterOutlined, CopyOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { ColumnsType } from "antd/es/table";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import {
  fetchParties,
  upsertParty,
  deleteParty,
  type StockParty,
} from "../../../lib/stockApi";
import StockDataIoBar from "./StockDataIoBar";
import { StockPrintModal } from "./StockPrintModal";
import { buildPrintTableHtml, sortByIsoDate } from "../../utils/stockBrowserPrint";
import { printStockListWithOptionalTemplate } from "../../utils/stockListPrintWithTemplate";
import { useSession } from "../../context/SessionContext";
import { canPrintStockClients, canPrintStockFournisseurs } from "../../utils/stockPrivileges";

const { Title, Paragraph } = Typography;

type Kind = "SUPPLIER" | "CLIENT";
type PageKey = "stockFournisseurs" | "stockClients";

type Props = { kind: Kind; pageKey: PageKey };

export function StockPartyPage({ kind, pageKey }: Props) {
  const T = usePageTexts(pageKey);
  const Prt = usePageTexts("stockPrint");
  const { session } = useSession();
  const canPrint = useMemo(
    () => (kind === "SUPPLIER" ? canPrintStockFournisseurs(session) : canPrintStockClients(session)),
    [kind, session],
  );
  const [rows, setRows] = useState<StockParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<StockParty | null>(null);
  const [form] = Form.useForm<{ name: string; address?: string; phone?: string; email?: string }>();
  const [printOpen, setPrintOpen] = useState(false);

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
          phone: editingParty.phone ?? "",
          email: editingParty.email ?? "",
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
      await upsertParty(
        kind,
        v.name.trim(),
        (v.address ?? "").trim(),
        editingParty?.id,
        (v.phone ?? "").trim(),
        (v.email ?? "").trim(),
      );
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

  const duplicatePartyFromModal = () => {
    const v = form.getFieldsValue() as { name?: string; address?: string; phone?: string; email?: string };
    const sfx = getPageTexts("stockCommon")[1] || " (copie)";
    const nm = (v.name ?? "").trim();
    form.setFieldsValue({
      name: nm ? `${nm}${sfx}` : nm,
      address: (v.address ?? "").trim(),
      phone: (v.phone ?? "").trim(),
      email: (v.email ?? "").trim(),
    });
    setEditingParty(null);
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
    },
    {
      title: T[11],
      dataIndex: "address",
      key: "address",
      render: (a: string) => a || "—",
    },
    {
      title: T[15] ?? "Téléphone",
      dataIndex: "phone",
      key: "phone",
      width: 140,
      render: (p?: string) => (p?.trim() ? p : "—"),
    },
    {
      title: T[16] ?? "E-mail",
      dataIndex: "email",
      key: "email",
      width: 180,
      render: (e?: string) => (e?.trim() ? e : "—"),
    },
    {
      title: T[13],
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (s?: string) => (s ? dayjs(s).format("DD/MM/YYYY HH:mm") : "—"),
    },
  ];

  const printListLabel = T[14];

  const runPrint = async (listKey: string, sort: "asc" | "desc", modelId: string) => {
    if (listKey !== "parties") return false;
    const sorted = sortByIsoDate(rows, "createdAt", sort);
    const headers = [T[3], T[11], T[15] ?? "Tél.", T[16] ?? "E-mail", Prt[7] ?? "Date"];
    const bodyRows = sorted.map((r) => [
      r.name,
      (r.address ?? "").trim() || "—",
      (r.phone ?? "").trim() || "—",
      (r.email ?? "").trim() || "—",
      r.createdAt ? dayjs(r.createdAt).format("DD/MM/YYYY HH:mm") : "—",
    ]);
    return await printStockListWithOptionalTemplate(
      "parties",
      `${T[0]} — ${Prt[0]}`,
      buildPrintTableHtml(printListLabel, headers, bodyRows),
      modelId,
    );
  };

  return (
    <Loading spinning={loading}>
      <Space align="start" style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            {T[0]}
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {T[1]}
          </Paragraph>
        </div>
        <Button
          icon={<PrinterOutlined />}
          disabled={!canPrint}
          onClick={() => {
            if (canPrint) setPrintOpen(true);
          }}
        >
          {Prt[0] ?? "Imprimer"}
        </Button>
      </Space>
      <StockPrintModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        lists={[{ value: "parties", label: printListLabel }]}
        onPrint={runPrint}
      />
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
                  type="text"
                  icon={<CopyOutlined />}
                  aria-label={getPageTexts("stockCommon")[0]}
                  title={getPageTexts("stockCommon")[0]}
                  onClick={duplicatePartyFromModal}
                />
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
          <Form.Item name="phone" label={T[15] ?? "Téléphone"}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label={T[16] ?? "E-mail"}>
            <Input type="email" />
          </Form.Item>
        </Form>
      </Modal>
    </Loading>
  );
}
