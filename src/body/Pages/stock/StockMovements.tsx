import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DatePicker,
  Form,
  InputNumber,
  Input,
  message,
  Typography,
  Space,
  Descriptions,
  Tag,
} from "antd";
import { Button, Modal, Select, Table } from "../../../items";
import { CopyOutlined, MinusCircleOutlined, PlusOutlined, PrinterOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import {
  fetchArticles,
  fetchMovements,
  fetchParties,
  fetchRefItems,
  addMovement,
  saveArticle,
  upsertParty,
  importStockDocument,
  type StockArticle,
  type StockMovement,
} from "../../../lib/stockApi";
import { useSession } from "../../context/SessionContext";
import { canPrintStockMovements, hasStockPrivilege } from "../../utils/stockPrivileges";
import StockDataIoBar from "./StockDataIoBar";
import { StockPrintModal } from "./StockPrintModal";
import { buildPrintTableHtml, sortByIsoDate } from "../../utils/stockBrowserPrint";
import { printStockListWithOptionalTemplate } from "../../utils/stockListPrintWithTemplate";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const RECEIPT_MAX_BYTES = 12 * 1024 * 1024;

function sniffReceiptKind(u8: Uint8Array): "png" | "jpeg" | null {
  if (u8.length >= 4 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return "png";
  if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return "jpeg";
  return null;
}

function receiptImportPriv(kind: "png" | "jpeg"): string {
  return kind === "png" ? "documents_import_png" : "documents_import_jpeg";
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
}

export default function StockMovements() {
  const { session } = useSession();
  const T = usePageTexts("stockMovements");
  const Prt = usePageTexts("stockPrint");
  const docT = getPageTexts("stockDocuments");
  const C = usePageTexts("stockSelectCreateRow");
  const D = usePageTexts("stockDashboard");
  const skuLabel = getPageTexts("stockArticles")[3];
  const tiersTitle = D[15];
  const [articles, setArticles] = useState<StockArticle[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterArticleId, setFilterArticleId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [filterMoveType, setFilterMoveType] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [detailMovement, setDetailMovement] = useState<StockMovement | null>(null);
  const [suppliers, setSuppliers] = useState<{ value: string }[]>([]);
  const [clients, setClients] = useState<{ value: string }[]>([]);
  const [articleQuickOpen, setArticleQuickOpen] = useState(false);
  const [partyQuickKind, setPartyQuickKind] = useState<"SUPPLIER" | "CLIENT" | null>(null);
  const articleQuickSourceRef = useRef<"filter" | "form">("form");
  const [form] = Form.useForm<{
    movementAt: Dayjs;
    moveType: string;
    reason?: string;
    refDoc?: string;
    supplierName?: string;
    clientName?: string;
    lines: { articleId: string; qty: number; priceIn?: number; priceOut?: number }[];
  }>();
  const [articleQuickForm] = Form.useForm<{ sku: string; name: string; category?: string }>();
  const [partyQuickForm] = Form.useForm<{ name: string; address: string }>();
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const detailReceiptInputRef = useRef<HTMLInputElement>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const canPrint = canPrintStockMovements(session);

  const moveTypeWatch = Form.useWatch("moveType", form);

  const movementBatchKey = useCallback((m: StockMovement) => m.batchId || m.id, []);

  const linesInDetailBatch = useMemo(() => {
    if (!detailMovement) return [];
    const bid = movementBatchKey(detailMovement);
    return movements
      .filter((m) => movementBatchKey(m) === bid)
      .sort((a, b) => (a.lineNo ?? 0) - (b.lineNo ?? 0));
  }, [detailMovement, movements, movementBatchKey]);

  const receiptMovementId = linesInDetailBatch[0]?.id ?? detailMovement?.id;

  const loadParties = useCallback(() => {
    fetchParties("SUPPLIER").then((rows) =>
      setSuppliers(rows.map((p) => ({ value: p.name }))),
    );
    fetchParties("CLIENT").then((rows) => setClients(rows.map((p) => ({ value: p.name }))));
  }, []);

  const loadArts = useCallback(() => {
    fetchArticles().then(setArticles);
  }, []);

  const loadMoves = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchMovements({
        articleId: filterArticleId,
        dateFrom: dateRange?.[0]?.format("YYYY-MM-DD"),
        dateTo: dateRange?.[1]?.format("YYYY-MM-DD"),
        moveType: filterMoveType,
      });
      setMovements(list);
      setDetailMovement((prev) => {
        if (!prev) return prev;
        return list.find((m) => m.id === prev.id) ?? prev;
      });
    } catch (e) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [filterArticleId, dateRange, filterMoveType]);

  const uploadReceiptForMovement = useCallback(
    async (file: File, movementId: string): Promise<boolean> => {
      if (!session) return false;
      if (file.size > RECEIPT_MAX_BYTES) {
        message.error(docT[13]);
        return false;
      }
      const u8 = new Uint8Array(await file.arrayBuffer());
      const kind = sniffReceiptKind(u8);
      if (!kind) {
        message.error(docT[14]);
        return false;
      }
      if (!hasStockPrivilege(session, receiptImportPriv(kind))) {
        message.error(T[27]);
        return false;
      }
      const b64 = await fileToBase64(file);
      await importStockDocument(file.name, b64, { movementId });
      return true;
    },
    [session, docT, T],
  );

  useEffect(() => {
    loadArts();
    loadParties();
  }, [loadArts, loadParties]);

  useEffect(() => {
    loadMoves();
  }, [loadMoves]);

  useEffect(() => {
    if (modalOpen) loadParties();
  }, [modalOpen, loadParties]);

  useEffect(() => {
    if (modalOpen) setReceiptFiles([]);
  }, [modalOpen]);

  const moveOptions = useMemo(
    () => [
      { value: "IN", label: T[11] },
      { value: "OUT", label: T[12] },
      { value: "ADJ", label: T[13] },
    ],
    [T],
  );

  const typeLabel = (v: string) => {
    const u = v.toUpperCase();
    if (u === "IN") return T[11];
    if (u === "OUT") return T[12];
    if (u === "ADJ") return T[13];
    return v;
  };

  const tiersCell = (r: StockMovement) => {
    const t = r.moveType?.toUpperCase();
    if (t === "IN") return r.supplierName ?? "";
    if (t === "OUT") return r.clientName ?? "";
    return "";
  };

  const onSaveQuickArticle = async () => {
    const v = await articleQuickForm.validateFields().catch(() => null);
    if (!v?.sku?.trim() || !v.name?.trim()) return;
    try {
      const [units, locs] = await Promise.all([fetchRefItems("unit"), fetchRefItems("location")]);
      const unit = units[0]?.name ?? "pcs";
      const location = locs[0]?.name ?? "";
      const res = await saveArticle({
        sku: v.sku.trim(),
        name: v.name.trim(),
        category: v.category?.trim() ?? "",
        unit,
        qty: 0,
        minQty: 0,
        price: 0,
        location,
        notes: "",
      });
      message.success(C[17]);
      await loadArts();
      if (articleQuickSourceRef.current === "filter") {
        setFilterArticleId(res.id);
      } else {
        const cur = form.getFieldValue("lines") as { articleId?: string }[] | undefined;
        if (cur?.length) {
          form.setFieldValue(["lines", 0, "articleId"], res.id);
        } else {
          form.setFieldsValue({
            lines: [{ articleId: res.id, qty: 1, priceIn: 0, priceOut: 0 }],
          });
        }
      }
      setArticleQuickOpen(false);
      articleQuickForm.resetFields();
    } catch (e) {
      message.error(String(e));
    }
  };

  const onSaveQuickParty = async () => {
    if (!partyQuickKind) return;
    const v = await partyQuickForm.validateFields().catch(() => null);
    if (!v?.name?.trim() || !v.address?.trim()) {
      message.warning(getPageTexts("connection")[8]);
      return;
    }
    try {
      await upsertParty(partyQuickKind, v.name.trim(), v.address.trim());
      message.success(partyQuickKind === "SUPPLIER" ? C[18] : C[19]);
      await loadParties();
      if (partyQuickKind === "SUPPLIER") {
        form.setFieldsValue({ supplierName: v.name.trim() });
      } else {
        form.setFieldsValue({ clientName: v.name.trim() });
      }
      setPartyQuickKind(null);
      partyQuickForm.resetFields();
    } catch (e) {
      message.error(String(e));
    }
  };

  const onSubmitMove = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const receipts = receiptFiles.slice(0, 3);
    const mt = v.moveType?.toUpperCase() ?? "";
    const lines = (v.lines ?? []).map((row) => ({
      articleId: row.articleId,
      qty: Number(row.qty),
      priceIn: mt === "IN" ? Number(row.priceIn ?? 0) : 0,
      priceOut: mt === "OUT" ? Number(row.priceOut ?? 0) : 0,
    }));
    try {
      const r = await addMovement({
        moveType: v.moveType,
        createdAt: v.movementAt?.format("YYYY-MM-DD HH:mm:ss"),
        lines,
        reason: v.reason,
        refDoc: v.refDoc,
        supplierName: v.moveType === "IN" ? v.supplierName?.trim() || undefined : undefined,
        clientName: v.moveType === "OUT" ? v.clientName?.trim() || undefined : undefined,
      });
      if (!r.success) return;
      const mid = r.movementId;
      if (mid && receipts.length > 0) {
        for (const file of receipts) {
          try {
            await uploadReceiptForMovement(file, mid);
          } catch (err) {
            message.error(String(err));
          }
        }
      }
      message.success(T[14]);
      setModalOpen(false);
      form.resetFields();
      setReceiptFiles([]);
      await loadMoves();
      loadArts();
      loadParties();
    } catch (e) {
      message.error(String(e));
    }
  };

  const onPickCreateReceipts = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    setReceiptFiles((prev) => {
      const merged = [...prev, ...picked].slice(0, 3);
      if (merged.length < prev.length + picked.length) message.warning(T[23]);
      return merged;
    });
  };

  const onPickDetailReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !detailMovement || !receiptMovementId || !session) return;
    const n = detailMovement.receiptCount ?? detailMovement.receiptDocumentIds?.length ?? 0;
    if (n >= 3) {
      message.warning(T[23]);
      return;
    }
    try {
      const ok = await uploadReceiptForMovement(file, receiptMovementId);
      if (ok) {
        message.success(docT[15]);
        await loadMoves();
      }
    } catch (err) {
      message.error(String(err));
    }
  };

  const runPrint = async (listKey: string, sort: "asc" | "desc", modelId: string) => {
    if (listKey !== "movements") return false;
    const sorted = sortByIsoDate(movements, "createdAt", sort);
    const headers = [T[10], skuLabel, T[2], T[3], T[4], T[29], T[30], tiersTitle, T[5], T[6], T[21]];
    const bodyRows = sorted.map((r) => [
      r.createdAt ? dayjs(r.createdAt).format("DD/MM/YYYY HH:mm") : "",
      r.sku,
      r.articleName,
      typeLabel(r.moveType),
      String(r.qty),
      String(r.priceIn ?? 0),
      String(r.priceOut ?? 0),
      tiersCell(r),
      r.reason ?? "",
      r.refDoc ?? "",
      String(r.receiptCount ?? r.receiptDocumentIds?.length ?? 0),
    ]);
    return await printStockListWithOptionalTemplate(
      "movements",
      `${T[0]} — ${Prt[0]}`,
      buildPrintTableHtml(T[25] ?? T[0], headers, bodyRows),
      modelId,
    );
  };

  const columns: ColumnsType<StockMovement> = [
    {
      title: T[10],
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (s: string) => (s ? dayjs(s).format("DD/MM/YYYY HH:mm") : ""),
    },
    { title: skuLabel, dataIndex: "sku", key: "sku", width: 110 },
    { title: T[2], dataIndex: "articleName", key: "articleName" },
    {
      title: T[3],
      dataIndex: "moveType",
      key: "moveType",
      width: 140,
      render: (v: string) => (
        <Text strong style={{ color: v === "IN" ? "#52c41a" : v === "OUT" ? "#ff4d4f" : "#1677ff" }}>
          {typeLabel(v)}
        </Text>
      ),
    },
    { title: T[4], dataIndex: "qty", key: "qty", width: 96 },
    {
      title: T[29],
      dataIndex: "priceIn",
      key: "priceIn",
      width: 100,
      render: (v: number | undefined) => String(v ?? 0),
    },
    {
      title: T[30],
      dataIndex: "priceOut",
      key: "priceOut",
      width: 100,
      render: (v: number | undefined) => String(v ?? 0),
    },
    {
      title: tiersTitle,
      key: "tiers",
      width: 160,
      render: (_, r) => tiersCell(r),
    },
    { title: T[5], dataIndex: "reason", key: "reason" },
    { title: T[6], dataIndex: "refDoc", key: "refDoc", width: 120 },
    {
      title: T[21],
      key: "receipt",
      width: 72,
      align: "center",
      render: (_, r) => {
        const n = r.receiptCount ?? r.receiptDocumentIds?.length ?? 0;
        return `${n}/3`;
      },
    },
  ];

  return (
    <>
      <Space align="start" style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }}>
        <Title level={3} style={{ margin: 0 }}>
          {T[0]}
        </Title>
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
        lists={[{ value: "movements", label: T[25] ?? T[0] }]}
        onPrint={runPrint}
      />
      <Space wrap style={{ marginBottom: 16, width: "100%", justifyContent: "space-between" }}>
        <Space wrap align="center">
          <Text type="secondary">{T[8]}</Text>
          <Select
            allowClear
            placeholder={T[9]}
            style={{ minWidth: 220 }}
            value={filterArticleId}
            onChange={(id) => setFilterArticleId(id)}
            options={articles.map((a) => ({ value: a.id, label: `${a.sku} — ${a.name}` }))}
            createRowLabel={C[2]}
            onCreateRowClick={() => {
              articleQuickSourceRef.current = "filter";
              articleQuickForm.resetFields();
              setArticleQuickOpen(true);
            }}
          />
          <Text type="secondary">{T[34] ?? "Période"}</Text>
          <RangePicker
            value={dateRange}
            onChange={(v) => setDateRange(v)}
            format="DD/MM/YYYY"
            placeholder={[T[35] ?? "Du", T[36] ?? "au"]}
          />
          <Text type="secondary">{T[37] ?? "Type"}</Text>
          <Select
            allowClear
            placeholder={T[38] ?? "Tous les types"}
            style={{ minWidth: 140 }}
            value={filterMoveType}
            onChange={(v) => setFilterMoveType(v)}
            options={moveOptions}
          />
          <Button
            onClick={() => {
              setFilterArticleId(undefined);
              setDateRange(null);
              setFilterMoveType(undefined);
            }}
          >
            {T[39] ?? "Réinitialiser"}
          </Button>
        </Space>
        <Space wrap>
          <StockDataIoBar
            table="movements"
            importPrivilege="movements_import"
            exportPrivilege="movements_export"
            onAfterImport={() => {
              loadMoves();
              loadArts();
            }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setDetailMovement(null);
              form.resetFields();
              form.setFieldsValue({
                movementAt: dayjs(),
                moveType: "IN",
                lines: [{ qty: 1, priceIn: 0, priceOut: 0 }],
              });
              setReceiptFiles([]);
              setModalOpen(true);
            }}
          >
            {T[1]}
          </Button>
        </Space>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={movements}
        onRow={(record) => ({
          onClick: () => setDetailMovement(record),
          style: { cursor: "pointer" },
        })}
      />
      <Modal
        title={T[19]}
        open={!!detailMovement}
        onCancel={() => setDetailMovement(null)}
        footer={
          <Space>
            <Button
              type="text"
              icon={<CopyOutlined />}
              aria-label={getPageTexts("stockCommon")[0]}
              title={getPageTexts("stockCommon")[0]}
              onClick={() => {
                if (!detailMovement) return;
                const m = detailMovement;
                const batchLines =
                  linesInDetailBatch.length > 0 ? linesInDetailBatch : [m];
                setDetailMovement(null);
                form.setFieldsValue({
                  movementAt: m.createdAt ? dayjs(m.createdAt) : dayjs(),
                  moveType: m.moveType,
                  reason: m.reason || "",
                  refDoc: m.refDoc || "",
                  supplierName: m.supplierName,
                  clientName: m.clientName,
                  lines: batchLines.map((l) => ({
                    articleId: l.articleId,
                    qty: l.qty,
                    priceIn: l.priceIn ?? 0,
                    priceOut: l.priceOut ?? 0,
                  })),
                });
                setReceiptFiles([]);
                setModalOpen(true);
              }}
            />
          </Space>
        }
        width={640}
        destroyOnHidden
      >
        {detailMovement ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={T[10]}>
              {detailMovement.createdAt ? dayjs(detailMovement.createdAt).format("DD/MM/YYYY HH:mm") : "—"}
            </Descriptions.Item>
            <Descriptions.Item label={T[3]}>{typeLabel(detailMovement.moveType)}</Descriptions.Item>
            <Descriptions.Item label={tiersTitle}>{tiersCell(detailMovement) || "—"}</Descriptions.Item>
            <Descriptions.Item label={T[5]}>{detailMovement.reason || "—"}</Descriptions.Item>
            <Descriptions.Item label={T[6]}>{detailMovement.refDoc || "—"}</Descriptions.Item>
            <Descriptions.Item label={T[31]}>
              <Table<StockMovement>
                size="small"
                pagination={false}
                rowKey="id"
                dataSource={
                  linesInDetailBatch.length > 0 ? linesInDetailBatch : detailMovement ? [detailMovement] : []
                }
                columns={[
                  { title: skuLabel, dataIndex: "sku", width: 110 },
                  { title: T[2], dataIndex: "articleName" },
                  { title: T[4], dataIndex: "qty", width: 88 },
                  {
                    title: T[29],
                    dataIndex: "priceIn",
                    width: 96,
                    render: (v: number | undefined) => String(v ?? 0),
                  },
                  {
                    title: T[30],
                    dataIndex: "priceOut",
                    width: 96,
                    render: (v: number | undefined) => String(v ?? 0),
                  },
                ]}
              />
            </Descriptions.Item>
            <Descriptions.Item label={T[24]}>
              <Space direction="vertical" size="small" style={{ width: "100%" }}>
                <Text>
                  {(detailMovement.receiptCount ?? detailMovement.receiptDocumentIds?.length ?? 0)}/3
                </Text>
                {(detailMovement.receiptCount ?? detailMovement.receiptDocumentIds?.length ?? 0) ===
                0 ? (
                  <Text type="secondary">{T[26]}</Text>
                ) : null}
                <input
                  ref={detailReceiptInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  style={{ display: "none" }}
                  onChange={onPickDetailReceipt}
                />
                <Button
                  size="small"
                  onClick={() => detailReceiptInputRef.current?.click()}
                  disabled={
                    (detailMovement.receiptCount ?? detailMovement.receiptDocumentIds?.length ?? 0) >=
                      3 || !session
                  }
                >
                  {T[25]}
                </Button>
              </Space>
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>
      <Modal
        title={T[1]}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setReceiptFiles([]);
        }}
        onOk={onSubmitMove}
        okText={T[7]}
        destroyOnHidden
        width={720}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            movementAt: dayjs(),
            moveType: "IN",
            lines: [{ qty: 1, priceIn: 0, priceOut: 0 }],
          }}
        >
          <Form.Item
            name="movementAt"
            label={T[33]}
            rules={[{ required: true, message: T[33] }]}
          >
            <DatePicker
              showTime
              format="DD/MM/YYYY HH:mm"
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item name="moveType" label={T[3]} rules={[{ required: true }]}>
            <Select options={moveOptions} />
          </Form.Item>
          {moveTypeWatch === "IN" && (
            <Form.Item name="supplierName" label={T[15]}>
              <Select
                showSearch
                allowClear
                optionFilterProp="label"
                placeholder={T[17]}
                options={suppliers.map((s) => ({ value: s.value, label: s.value }))}
                createRowLabel={C[3]}
                onCreateRowClick={() => {
                  partyQuickForm.resetFields();
                  setPartyQuickKind("SUPPLIER");
                }}
              />
            </Form.Item>
          )}
          {moveTypeWatch === "OUT" && (
            <Form.Item name="clientName" label={T[16]}>
              <Select
                showSearch
                allowClear
                optionFilterProp="label"
                placeholder={T[18]}
                options={clients.map((s) => ({ value: s.value, label: s.value }))}
                createRowLabel={C[4]}
                onCreateRowClick={() => {
                  partyQuickForm.resetFields();
                  setPartyQuickKind("CLIENT");
                }}
              />
            </Form.Item>
          )}
          <Form.Item label={T[31]}>
            <Form.List
              name="lines"
              rules={[
                {
                  validator: async (_, rows) => {
                    if (!rows || rows.length < 1) {
                      return Promise.reject(new Error(T[2]));
                    }
                  },
                },
              ]}
            >
              {(fields, { add, remove }, { errors }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Space
                      key={key}
                      wrap
                      align="start"
                      style={{ width: "100%", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f0f0f0" }}
                    >
                      <Form.Item
                        {...restField}
                        label={T[2]}
                        name={[name, "articleId"]}
                        rules={[{ required: true, message: T[2] }]}
                        style={{ minWidth: 220, flex: 1, marginBottom: 0 }}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          options={articles.map((a) => ({
                            value: a.id,
                            label: `${a.sku} — ${a.name}`,
                          }))}
                          createRowLabel={C[2]}
                          onCreateRowClick={() => {
                            articleQuickSourceRef.current = "form";
                            articleQuickForm.resetFields();
                            setArticleQuickOpen(true);
                          }}
                        />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        label={T[4]}
                        name={[name, "qty"]}
                        rules={[{ required: true, message: T[4] }]}
                        style={{ width: 120, marginBottom: 0 }}
                      >
                        <InputNumber
                          min={moveTypeWatch === "ADJ" ? 0 : 0.01}
                          step={0.01}
                          style={{ width: "100%" }}
                        />
                      </Form.Item>
                      {moveTypeWatch === "IN" ? (
                        <Form.Item
                          {...restField}
                          label={T[29]}
                          name={[name, "priceIn"]}
                          style={{ width: 120, marginBottom: 0 }}
                        >
                          <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
                        </Form.Item>
                      ) : null}
                      {moveTypeWatch === "OUT" ? (
                        <Form.Item
                          {...restField}
                          label={T[30]}
                          name={[name, "priceOut"]}
                          style={{ width: 120, marginBottom: 0 }}
                        >
                          <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
                        </Form.Item>
                      ) : null}
                      {fields.length > 1 ? (
                        <MinusCircleOutlined
                          style={{ marginTop: 32, color: "#ff4d4f" }}
                          onClick={() => remove(name)}
                        />
                      ) : null}
                    </Space>
                  ))}
                  <Form.ErrorList errors={errors} />
                  <Button
                    type="dashed"
                    onClick={() =>
                      add({
                        qty: 1,
                        ...(moveTypeWatch === "IN" ? { priceIn: 0 } : {}),
                        ...(moveTypeWatch === "OUT" ? { priceOut: 0 } : {}),
                      })
                    }
                    block
                    icon={<PlusOutlined />}
                  >
                    {T[32]}
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>
          <Form.Item name="reason" label={T[5]}>
            <Input />
          </Form.Item>
          <Form.Item name="refDoc" label={T[6]}>
            <Input />
          </Form.Item>
          <Form.Item label={T[21]} extra={T[22]}>
            <input
              type="file"
              accept="image/png,image/jpeg"
              multiple
              style={{ marginBottom: 8 }}
              onChange={onPickCreateReceipts}
            />
            <Space wrap>
              {receiptFiles.map((f, i) => (
                <Tag
                  key={`${f.name}-${i}`}
                  closable
                  onClose={() => setReceiptFiles((prev) => prev.filter((_, j) => j !== i))}
                >
                  {f.name}
                </Tag>
              ))}
            </Space>
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={C[7]}
        open={articleQuickOpen}
        onCancel={() => setArticleQuickOpen(false)}
        onOk={onSaveQuickArticle}
        okText={C[13]}
        cancelText={C[14]}
        destroyOnHidden
        width={480}
      >
        <Form form={articleQuickForm} layout="vertical">
          <Form.Item name="sku" label={C[20]} rules={[{ required: true, message: skuLabel }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label={C[21]} rules={[{ required: true, message: T[2] }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label={C[22]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={partyQuickKind === "SUPPLIER" ? C[8] : partyQuickKind === "CLIENT" ? C[9] : ""}
        open={partyQuickKind !== null}
        onCancel={() => {
          setPartyQuickKind(null);
          partyQuickForm.resetFields();
        }}
        onOk={onSaveQuickParty}
        okText={C[13]}
        cancelText={C[14]}
        destroyOnHidden
        width={480}
      >
        <Form form={partyQuickForm} layout="vertical">
          <Form.Item
            name="name"
            label={C[10]}
            rules={[{ required: true, message: getPageTexts("stockArticleUnits")[11] }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="address" label={C[12]} rules={[{ required: true, message: C[12] }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
