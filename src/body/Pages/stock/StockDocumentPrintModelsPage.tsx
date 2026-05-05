import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Descriptions, Popconfirm, Space, Typography, message } from "antd";
import { CopyOutlined, PlusOutlined, PrinterOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import { Button, Loading, Modal, Table } from "../../../items";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import { useSession, type SessionUser } from "../../context/SessionContext";
import {
  deleteStockDocumentPrintModel,
  fetchStockDocumentPrintModel,
  fetchStockDocumentPrintModels,
  type StockDocumentPrintModelDetail,
  type StockDocumentPrintModelRow,
} from "../../../lib/stockApi";
import { hasStockPrivilege, canViewStockDocuments } from "../../utils/stockPrivileges";
import { DOCUMENT_PRINT_SCREEN_KEYS, type DocumentPrintScreenKey } from "../../utils/stockListPrintWithTemplate";
import { substituteMustache } from "../../utils/stockPrintTemplateVariables";
import { exportFullHtmlDocumentPdf } from "../../utils/stockBrowserPrint";

const { Text } = Typography;

function canEditPrintModels(session: SessionUser | null): boolean {
  if (!session) return false;
  return (
    hasStockPrivilege(session, "documents_import_png") ||
    hasStockPrivilege(session, "documents_import_jpeg") ||
    hasStockPrivilege(session, "documents_import_pdf")
  );
}

export default function StockDocumentPrintModelsPage() {
  const T = usePageTexts("stockDocumentPrintModels");
  const D = usePageTexts("stockDocuments");
  const roleTx = getPageTexts("stockRoles");
  const cancelLabel = roleTx[7];
  const { session } = useSession();
  const navigate = useNavigate();
  const canView = canViewStockDocuments(session);
  const canEdit = canEditPrintModels(session);
  const [rows, setRows] = useState<StockDocumentPrintModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailRow, setDetailRow] = useState<StockDocumentPrintModelRow | null>(null);
  const [screenModalKey, setScreenModalKey] = useState<string>("");
  const [screenPreview, setScreenPreview] = useState<StockDocumentPrintModelDetail | null>(null);
  const [screenPreviewLoading, setScreenPreviewLoading] = useState(false);

  const screenLabel = useCallback(
    (key?: string) => {
      const k = (key ?? "").trim();
      if (!k) return "—";
      const i = DOCUMENT_PRINT_SCREEN_KEYS.indexOf(k as DocumentPrintScreenKey);
      return i >= 0 ? T[20 + i] ?? k : k;
    },
    [T],
  );

  const load = useCallback(async () => {
    if (!canView) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchStockDocumentPrintModels());
    } catch (e) {
      message.error(String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo(() => {
    const Tx = getPageTexts("stockDocumentPrintModels");
    const c: ColumnsType<StockDocumentPrintModelRow> = [
      {
        title: Tx[18] ?? "Écran",
        dataIndex: "screenKey",
        key: "screenKey",
        width: 230,
        render: (v?: string) => (
          <Button
            type="link"
            style={{ paddingInline: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              const k = (v ?? "").trim();
              if (!k) return;
              setScreenModalKey(k);
            }}
          >
            {screenLabel(v)}
          </Button>
        ),
      },
      { title: Tx[4], dataIndex: "name", key: "name", ellipsis: true },
      { title: Tx[5], dataIndex: "description", key: "description", ellipsis: true },
    ];
    return c;
  }, [screenLabel]);

  const modelsForScreen = useMemo(
    () => rows.filter((r) => (r.screenKey ?? "").trim() === screenModalKey),
    [rows, screenModalKey],
  );

  const [selectedScreenModelId, setSelectedScreenModelId] = useState<string>("");

  useEffect(() => {
    if (!screenModalKey) return;
    const first = modelsForScreen[0]?.id ?? "";
    setSelectedScreenModelId(first);
  }, [screenModalKey, modelsForScreen]);

  useEffect(() => {
    if (!selectedScreenModelId) {
      setScreenPreview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setScreenPreviewLoading(true);
      try {
        const d = await fetchStockDocumentPrintModel(selectedScreenModelId);
        if (!cancelled) setScreenPreview(d);
      } catch (e) {
        if (!cancelled) message.error(String(e));
      } finally {
        if (!cancelled) setScreenPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedScreenModelId]);

  const previewSrc = useMemo(() => {
    if (!screenPreview) return "";
    const map: Record<string, string> = {
      titre: screenPreview.name || "Aperçu",
      sousTitre: screenPreview.description || "",
      "date.aujourdhui": new Date().toLocaleDateString("fr-FR"),
      "date.heure": new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      "liste.contenu": "<table><tr><td>Aperçu de contenu liste</td></tr></table>",
    };
    const body = substituteMustache(screenPreview.htmlContent ?? "", map);
    const style = substituteMustache(screenPreview.cssContent ?? "", map);
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><style>body{margin:0;padding:12px;background:#f3f4f6}.a4{width:210mm;min-height:297mm;margin:0 auto;background:#fff;box-shadow:0 0 0 1px #d1d5db;overflow:hidden}${style}</style></head><body><div class="a4">${body}</div></body></html>`;
  }, [screenPreview]);

  const closeDetail = () => setDetailRow(null);

  const isScreenExportInListModal = useCallback((screenKey?: string) => {
    const k = (screenKey ?? "").trim();
    return k === "articles" || k === "dashboard_recent" || k === "dashboard_categories";
  }, []);

  const exportModelPdf = useCallback(async (modelId: string) => {
    const d = await fetchStockDocumentPrintModel(modelId);
    const map: Record<string, string> = {
      titre: d.name || "Aperçu",
      sousTitre: d.description || "",
      "date.aujourdhui": new Date().toLocaleDateString("fr-FR"),
      "date.heure": new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      "liste.contenu": "<table><tr><td>Aperçu de contenu liste</td></tr></table>",
    };
    const full = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><style>${substituteMustache(d.cssContent ?? "", map)}</style></head><body>${substituteMustache(d.htmlContent ?? "", map)}</body></html>`;
    const out = await exportFullHtmlDocumentPdf(d.name || "modele", full);
    if (out) Modal.success({ title: `${out} créé avec succès` });
  }, []);

  const onDeleteFromModal = async () => {
    if (!detailRow) return;
    try {
      await deleteStockDocumentPrintModel(detailRow.id);
      message.success(T[13]);
      closeDetail();
      void load();
    } catch (e) {
      message.error(String(e));
    }
  };

  return (
    <Loading spinning={loading}>
      <Card
        title={T[0]}
        extra={
          canEdit ? (
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => navigate("/stock/documents/models/new")}>
              {T[2]}
            </Button>
          ) : null
        }
      >
        <Typography.Paragraph type="secondary">{T[1]}</Typography.Paragraph>
        {!canView ? (
          <Text type="secondary">{D[29]}</Text>
        ) : (
          <Table
            rowKey="id"
            size="small"
            dataSource={rows}
            columns={columns}
            pagination={false}
            locale={{ emptyText: T[15] }}
            onRow={(r) => ({
              onClick: () => setDetailRow(r),
              style: { cursor: "pointer" },
            })}
          />
        )}
      </Card>

      <Modal
        title={
          <Space style={{ width: "100%", justifyContent: "space-between", paddingRight: 44 }}>
            <span>{detailRow?.name ?? T[0]}</span>
            {detailRow && !isScreenExportInListModal(detailRow.screenKey) ? (
              <Space size={4}>
                <Button
                  type="text"
                  icon={<CopyOutlined />}
                  aria-label="Dupliquer"
                  title="Dupliquer"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/stock/documents/models/new?clone=${encodeURIComponent(detailRow.id)}`);
                    closeDetail();
                  }}
                />
                <Button
                  type="text"
                  icon={<PrinterOutlined />}
                  aria-label="Exporter en PDF"
                  title="Exporter en PDF"
                  onClick={async (e) => {
                    e.preventDefault();
                    try {
                      await exportModelPdf(detailRow.id);
                    } catch (err) {
                      message.error(String(err));
                    }
                  }}
                />
              </Space>
            ) : null}
          </Space>
        }
        open={Boolean(detailRow)}
        onCancel={closeDetail}
        footer={
          detailRow ? (
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              {canEdit ? (
                <>
                  <Popconfirm title={roleTx[13]} onConfirm={() => void onDeleteFromModal()} okText={T[10]} cancelText={cancelLabel}>
                    <Button danger>{T[10]}</Button>
                  </Popconfirm>
                  <Button
                    type="primary"
                    onClick={() => {
                      navigate(`/stock/documents/models/${detailRow.id}`);
                      closeDetail();
                    }}
                  >
                    {T[3]}
                  </Button>
                </>
              ) : null}
            </Space>
          ) : null
        }
        destroyOnHidden
        width={520}
      >
        {detailRow ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={T[18] ?? "Écran"}>{screenLabel(detailRow.screenKey)}</Descriptions.Item>
            <Descriptions.Item label={T[4]}>{detailRow.name}</Descriptions.Item>
            <Descriptions.Item label={T[5]}>{detailRow.description?.trim() ? detailRow.description : "—"}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>
      <Modal
        title={
          <Space style={{ width: "100%", justifyContent: "space-between", paddingRight: 44 }}>
            <span>{screenLabel(screenModalKey)}</span>
            {selectedScreenModelId && isScreenExportInListModal(screenModalKey) ? (
              <Space size={4}>
                <Button
                  type="text"
                  icon={<CopyOutlined />}
                  aria-label="Dupliquer"
                  title="Dupliquer"
                  onClick={(e) => {
                    e.preventDefault();
                    if (!selectedScreenModelId) return;
                    navigate(`/stock/documents/models/new?clone=${encodeURIComponent(selectedScreenModelId)}`);
                    setScreenModalKey("");
                  }}
                />
                <Button
                  type="text"
                  icon={<PrinterOutlined />}
                  aria-label="Exporter en PDF"
                  title="Exporter en PDF"
                  onClick={async (e) => {
                    e.preventDefault();
                    if (!selectedScreenModelId) return;
                    try {
                      await exportModelPdf(selectedScreenModelId);
                    } catch (err) {
                      message.error(String(err));
                    }
                  }}
                />
              </Space>
            ) : null}
          </Space>
        }
        open={Boolean(screenModalKey)}
        onCancel={() => setScreenModalKey("")}
        width={980}
        destroyOnHidden
        footer={
          <Space>
            {canEdit ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  navigate(`/stock/documents/models/new?screenKey=${encodeURIComponent(screenModalKey)}`);
                  setScreenModalKey("");
                }}
              >
                {T[2]}
              </Button>
            ) : null}
          </Space>
        }
      >
        <Space align="start" style={{ width: "100%" }}>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            style={{ width: 360 }}
            dataSource={modelsForScreen}
            locale={{ emptyText: T[15] }}
            columns={[{ title: T[4], dataIndex: "name", key: "name", ellipsis: true }]}
            onRow={(r) => ({
              onClick: () => setSelectedScreenModelId(r.id),
              style: {
                cursor: "pointer",
                background: r.id === selectedScreenModelId ? "rgba(22,119,255,0.08)" : undefined,
              },
            })}
          />
          <Space direction="vertical" style={{ flex: 1 }}>
            <Space>
              {canEdit && selectedScreenModelId ? (
                <>
                  <Button onClick={() => navigate(`/stock/documents/models/${selectedScreenModelId}`)}>{T[3]}</Button>
                  <Popconfirm
                    title={roleTx[13]}
                    onConfirm={async () => {
                      if (!selectedScreenModelId) return;
                      await deleteStockDocumentPrintModel(selectedScreenModelId);
                      await load();
                    }}
                    okText={T[10]}
                    cancelText={cancelLabel}
                  >
                    <Button danger>{T[10]}</Button>
                  </Popconfirm>
                </>
              ) : null}
            </Space>
            <Loading spinning={screenPreviewLoading}>
              <iframe
                title="preview-screen-model"
                srcDoc={previewSrc}
                sandbox=""
                style={{ width: "100%", minHeight: 440, border: "1px solid #d9d9d9", borderRadius: 6 }}
              />
            </Loading>
          </Space>
        </Space>
      </Modal>
    </Loading>
  );
}
