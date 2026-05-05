import { useEffect, useMemo, useState } from "react";
import { Form, Modal as AntModal, Radio, Select, Space, Typography } from "antd";
import { Button, Modal, Table } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import {
  fetchStockDocumentPrintModel,
  fetchStockDocumentPrintModels,
  type StockDocumentPrintModelDetail,
  type StockDocumentPrintModelRow,
} from "../../../lib/stockApi";
import { substituteMustache } from "../../utils/stockPrintTemplateVariables";

export type StockPrintListOption = { value: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;
  lists: StockPrintListOption[];
  onPrint: (listKey: string, sortOrder: "asc" | "desc", modelId: string) => Promise<string | false | void> | string | false | void;
};

export function StockPrintModal({ open, onClose, lists, onPrint }: Props) {
  const P = usePageTexts("stockPrint");
  const Tm = usePageTexts("stockDocumentPrintModels");
  const [form] = Form.useForm<{ list: string; sort: "asc" | "desc"; modelId: string }>();
  const [allModels, setAllModels] = useState<StockDocumentPrintModelRow[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [preview, setPreview] = useState<StockDocumentPrintModelDetail | null>(null);

  const currentList = Form.useWatch("list", form);
  const currentModelId = Form.useWatch("modelId", form);

  const modelsForScreen = useMemo(
    () => allModels.filter((m) => (m.screenKey ?? "").trim() === (currentList ?? "").trim()),
    [allModels, currentList],
  );

  useEffect(() => {
    if (!open || lists.length === 0) return;
    form.setFieldsValue({
      list: lists[0]?.value ?? "",
      sort: "asc",
      modelId: "",
    });
  }, [open, lists, form]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingModels(true);
      try {
        const rows = await fetchStockDocumentPrintModels();
        if (cancelled) return;
        setAllModels(rows);
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const first = modelsForScreen[0]?.id ?? "";
    form.setFieldValue("modelId", first);
  }, [open, modelsForScreen, form]);

  useEffect(() => {
    if (!currentModelId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const d = await fetchStockDocumentPrintModel(currentModelId);
      if (!cancelled) setPreview(d);
    })().catch(() => {
      if (!cancelled) setPreview(null);
    });
    return () => {
      cancelled = true;
    };
  }, [currentModelId]);

  const previewSrc = useMemo(() => {
    if (!preview) return "";
    const map: Record<string, string> = {
      titre: preview.name || "Aperçu",
      sousTitre: preview.description || "",
      "date.aujourdhui": new Date().toLocaleDateString("fr-FR"),
      "date.heure": new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      "liste.contenu": "<table><tr><td>Aperçu de contenu liste</td></tr></table>",
    };
    const body = substituteMustache(preview.htmlContent ?? "", map);
    const style = substituteMustache(preview.cssContent ?? "", map);
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><style>body{margin:0;padding:12px;background:#f3f4f6}.a4{width:210mm;min-height:297mm;margin:0 auto;background:#fff;box-shadow:0 0 0 1px #d1d5db;overflow:hidden}${style}</style></head><body><div class="a4">${body}</div></body></html>`;
  }, [preview]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={P[0] ?? "Imprimer"}
      footer={null}
      destroyOnHidden
      width={980}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={async (v) => {
          const out = await onPrint(v.list, v.sort, v.modelId);
          const fileName = typeof out === "string" ? out : "";
          if (fileName) {
            AntModal.success({
              title: `${fileName} créé avec succès`,
            });
          }
          onClose();
        }}
      >
        <Space align="start" style={{ width: "100%" }}>
          <Space direction="vertical" style={{ width: 340 }}>
            <Form.Item name="list" label={P[1]} rules={[{ required: true }]}>
              <Select
                options={lists.map((l) => ({ value: l.value, label: l.label }))}
                disabled={lists.length <= 1}
              />
            </Form.Item>
            <Form.Item name="sort" label={P[2]} rules={[{ required: true }]}>
              <Radio.Group>
                <Radio value="asc">{P[3]}</Radio>
                <Radio value="desc">{P[4]}</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item
              name="modelId"
              label={Tm[0]}
              rules={[{ required: true, message: Tm[15] ?? "Aucun modèle disponible" }]}
              hidden
            >
              <Select options={[]} />
            </Form.Item>
            <Table
              rowKey="id"
              size="small"
              loading={loadingModels}
              pagination={false}
              dataSource={modelsForScreen}
              locale={{ emptyText: Tm[15] ?? "Aucun modèle pour le moment." }}
              columns={[{ title: Tm[4], dataIndex: "name", key: "name", ellipsis: true }]}
              onRow={(r) => ({
                onClick: () => form.setFieldValue("modelId", r.id),
                style: {
                  cursor: "pointer",
                  background: r.id === currentModelId ? "rgba(22,119,255,0.08)" : undefined,
                },
              })}
            />
          </Space>
          <div style={{ flex: 1 }}>
            <Typography.Text type="secondary">{Tm[8] ?? "Aperçu en direct"}</Typography.Text>
            <iframe
              title="preview-print-modal"
              srcDoc={previewSrc}
              sandbox=""
              style={{ width: "100%", minHeight: 420, border: "1px solid #d9d9d9", borderRadius: 6, marginTop: 8 }}
            />
          </div>
        </Space>
        <Space style={{ marginTop: 12 }}>
          <Button type="primary" htmlType="submit" disabled={!currentModelId}>
            {"Exporter en PDF"}
          </Button>
        </Space>
      </Form>
    </Modal>
  );
}
