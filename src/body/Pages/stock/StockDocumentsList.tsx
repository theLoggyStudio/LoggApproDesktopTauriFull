import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Card, Input, Popconfirm, Space, Tag, Typography, message, theme } from "antd";
import { Button, Modal, Table } from "../../../items";
import {
  DeleteOutlined,
  DownloadOutlined,
  UploadOutlined,
  ReloadOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { ColumnsType } from "antd/es/table";
import { usePageTexts, getPageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import {
  canPreviewStockDocument,
  canPrintStockDocuments,
  canViewStockDocuments,
  hasStockPrivilege,
} from "../../utils/stockPrivileges";
import {
  deleteStockDocument,
  exportStockDocument,
  fetchStockDocuments,
  importStockDocument,
  type StockDocumentRow,
} from "../../../lib/stockApi";
import { StockPrintModal } from "./StockPrintModal";
import { buildPrintTableHtml, sortByIsoDate } from "../../utils/stockBrowserPrint";
import { printStockListWithOptionalTemplate } from "../../utils/stockListPrintWithTemplate";

const { Title, Text } = Typography;

const MAX_BYTES = 12 * 1024 * 1024;

function sniffDocKind(data: Uint8Array): "png" | "jpeg" | "pdf" | null {
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpeg";
  if (data.length >= 4 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) return "pdf";
  return null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

function docPriv(kind: string, op: "import" | "export" | "delete"): string {
  return `documents_${op}_${kind}`;
}

function exportDownloadName(originalName: string, kind: string): string {
  if (/\.(png|jpe?g|pdf)$/i.test(originalName)) return originalName;
  const ext = kind === "jpeg" ? "jpg" : kind;
  return `${originalName}.${ext}`;
}

export default function StockDocumentsList() {
  const T = usePageTexts("stockDocuments");
  const Prt = usePageTexts("stockPrint");
  const okDel = getPageTexts("stockArticles")[15];
  const cancelDel = getPageTexts("stockArticles")[16];
  const { session } = useSession();
  const { token } = theme.useToken();
  const [rows, setRows] = useState<StockDocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<StockDocumentRow | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const canImportAny =
    hasStockPrivilege(session, "documents_import_png") ||
    hasStockPrivilege(session, "documents_import_jpeg") ||
    hasStockPrivilege(session, "documents_import_pdf");

  const canView = useMemo(() => canViewStockDocuments(session), [session]);
  const canPrint = useMemo(() => canPrintStockDocuments(session), [session]);

  const load = useCallback(() => {
    if (!canView) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchStockDocuments()
      .then(setRows)
      .catch((e) => message.error(String(e)))
      .finally(() => setLoading(false));
  }, [canView]);

  useEffect(() => {
    load();
  }, [load]);

  const revokePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  };

  const closePreviewModal = () => {
    setPreviewModalOpen(false);
    setSelected(null);
    revokePreview();
  };

  useEffect(() => {
    return () => revokePreview();
  }, []);

  useEffect(() => {
    revokePreview();
    if (!previewModalOpen || !selected?.id || !session) return;
    const kind = selected.kind;
    if (!canPreviewStockDocument(session, kind)) return;

    let cancelled = false;
    (async () => {
      try {
        const ex = await exportStockDocument(selected.id);
        const bin = atob(ex.base64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const blob = new Blob([u8], { type: ex.mime });
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        previewUrlRef.current = url;
        setPreviewUrl(url);
      } catch (e) {
        if (!cancelled) message.error(String(e));
      }
    })();

    return () => {
      cancelled = true;
      revokePreview();
    };
  }, [previewModalOpen, selected?.id, selected?.kind, session]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !session) return;
    if (file.size > MAX_BYTES) {
      message.error(T[13]);
      return;
    }
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    const kind = sniffDocKind(u8);
    if (!kind) {
      message.error(T[14]);
      return;
    }
    if (!hasStockPrivilege(session, docPriv(kind, "import"))) {
      message.error(T[21]);
      return;
    }
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(T[25]));
      reader.readAsDataURL(file);
    });
    const comma = dataUrl.indexOf(",");
    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    try {
      await importStockDocument(file.name, b64);
      message.success(T[15]);
      load();
    } catch (err) {
      message.error(String(err));
    }
  };

  const onExportRow = async (r: StockDocumentRow) => {
    if (!session || !hasStockPrivilege(session, docPriv(r.kind, "export"))) return;
    try {
      const ex = await exportStockDocument(r.id);
      const bin = atob(ex.base64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const blob = new Blob([u8], { type: ex.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportDownloadName(ex.fileName || r.originalName, r.kind);
      a.click();
      URL.revokeObjectURL(url);
      message.success(T[16]);
    } catch (e) {
      message.error(String(e));
    }
  };

  const onDeleteRow = async (r: StockDocumentRow) => {
    try {
      const res = await deleteStockDocument(r.id);
      if (!res.success) {
        message.error(T[23]);
        return;
      }
      message.success(T[18]);
      if (selected?.id === r.id) closePreviewModal();
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const columns: ColumnsType<StockDocumentRow> = [
    { title: T[5], dataIndex: "originalName", key: "originalName", ellipsis: true },
    {
      title: T[6],
      dataIndex: "kind",
      key: "kind",
      width: 100,
      render: (k: string) => <Tag>{k.toUpperCase()}</Tag>,
    },
    {
      title: T[7],
      dataIndex: "bytes",
      key: "bytes",
      width: 110,
      render: (b: number) => formatBytes(b),
    },
    { title: T[8], dataIndex: "createdAt", key: "createdAt", width: 170 },
    {
      title: T[28],
      dataIndex: "movementCaption",
      key: "movementCaption",
      width: 220,
      ellipsis: true,
      render: (cap: string | undefined) =>
        cap ? (
          <Input size="small" readOnly disabled value={cap} style={{ cursor: "default" }} />
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: T[22],
      key: "actions",
      width: 200,
      render: (_, r) => (
        <Space size="small" onClick={(ev) => ev.stopPropagation()}>
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            disabled={!hasStockPrivilege(session, docPriv(r.kind, "export"))}
            onClick={() => onExportRow(r)}
          >
            {T[3]}
          </Button>
          <Popconfirm title={T[17]} okText={okDel} cancelText={cancelDel} onConfirm={() => onDeleteRow(r)}>
            <Button
              type="link"
              danger
              size="small"
              icon={<DeleteOutlined />}
              disabled={!hasStockPrivilege(session, docPriv(r.kind, "delete"))}
            >
              {T[4]}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const previewKind = selected?.kind;
  const canPreview =
    !!selected &&
    !!session &&
    canPreviewStockDocument(session, previewKind ?? "");

  const runPrint = async (listKey: string, sort: "asc" | "desc", modelId: string) => {
    if (listKey !== "docs") return false;
    const sorted = sortByIsoDate(rows, "createdAt", sort);
    const headers = [T[5], T[6], T[7], T[8], T[29]];
    const bodyRows = sorted.map((r) => [
      r.originalName,
      (r.kind ?? "").toUpperCase(),
      formatBytes(r.bytes),
      r.createdAt ? dayjs(r.createdAt).format("DD/MM/YYYY HH:mm") : "",
      (r.movementCaption ?? "").trim() || "—",
    ]);
    return await printStockListWithOptionalTemplate(
      "docs",
      `${T[0]} — ${Prt[0]}`,
      buildPrintTableHtml(T[30] ?? T[0], headers, bodyRows),
      modelId,
    );
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Space align="start" style={{ width: "100%", justifyContent: "space-between" }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            {T[0]}
          </Title>
          <Text type="secondary">{T[1]}</Text>
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
        lists={[{ value: "docs", label: T[30] ?? T[0] }]}
        onPrint={runPrint}
      />

      {!canView && session ? <Alert type="warning" showIcon message={T[29]} style={{ marginBottom: 16 }} /> : null}

      <Card
        extra={
          <Space>
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
              style={{ display: "none" }}
              onChange={onPickFile}
            />
            <Button
              type="primary"
              icon={<UploadOutlined />}
              disabled={!canView || !canImportAny}
              onClick={() => fileInputRef.current?.click()}
            >
              {T[2]}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={load} disabled={!canView}>
              {T[19]}
            </Button>
          </Space>
        }
      >
        <Table<StockDocumentRow>
          rowKey="id"
          loading={loading}
          size="small"
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: canView ? T[12] : T[29] }}
          onRow={(record) => ({
            onClick: () => {
              if (!canView) return;
              setSelected(record);
              setPreviewModalOpen(true);
            },
            style: {
              cursor: canView ? "pointer" : "default",
              background: previewModalOpen && selected?.id === record.id ? token.colorFillAlter : undefined,
            },
          })}
        />
      </Card>

      <Modal
        title={selected ? `${T[9]} — ${selected.originalName}` : T[9]}
        open={previewModalOpen}
        onCancel={closePreviewModal}
        footer={
          <Button type="primary" onClick={closePreviewModal}>
            {T[27] ?? "Fermer"}
          </Button>
        }
        width={900}
        destroyOnHidden
        styles={{ body: { maxHeight: "75vh", overflow: "auto" } }}
      >
        {!selected ? (
          <Text type="secondary">{T[10]}</Text>
        ) : !canPreview ? (
          <Text type="secondary">{T[11]}</Text>
        ) : !previewUrl ? (
          <Text type="secondary">{T[24]}</Text>
        ) : previewKind === "pdf" ? (
          <iframe
            title={T[26]}
            src={previewUrl}
            style={{ width: "100%", height: 520, border: `1px solid ${token.colorBorder}` }}
          />
        ) : (
          <img
            alt={selected.originalName}
            src={previewUrl}
            style={{ maxWidth: "100%", maxHeight: 520, objectFit: "contain", display: "block", margin: "0 auto" }}
          />
        )}
      </Modal>
    </Space>
  );
}
