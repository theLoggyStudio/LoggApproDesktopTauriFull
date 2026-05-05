import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Card, Checkbox, Form, Input, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Loading, Modal, Select } from "../../../items";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import {
  fetchStockFormTemplate,
  fetchStockFormTemplates,
  upsertStockFormTemplate,
  type StockFormTemplateRow,
} from "../../../lib/stockApi";
import { hasStockPrivilege } from "../../utils/stockPrivileges";
import {
  type CircuitFieldType,
  type CircuitStepFieldDraft,
  newCircuitFieldKey,
  parseCircuitFieldsJson,
  serializeCircuitFieldsForApi,
  stripSystemMovementDuplicates,
} from "../../utils/circuitFormFields";

const { Text } = Typography;

function cloneImportedFields(rows: CircuitStepFieldDraft[]): CircuitStepFieldDraft[] {
  return stripSystemMovementDuplicates(rows).map((r) => ({
    key: newCircuitFieldKey(),
    fieldId: undefined,
    label: r.label,
    type: r.type,
    required: r.required,
    locked: false,
  }));
}

export default function StockFormTemplateEditor() {
  const T = usePageTexts("stockFormTemplates");
  const C = usePageTexts("stockCircuits");
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const skipNewResetAfterClone = useRef(false);
  const { session } = useSession();
  const canManage = hasStockPrivilege(session, "circuits_manage");
  const isNew = templateId === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<CircuitStepFieldDraft[]>([
    { key: newCircuitFieldKey(), label: "", type: "text", required: false },
  ]);
  const [isSystem, setIsSystem] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [templatesPick, setTemplatesPick] = useState<StockFormTemplateRow[]>([]);
  const [importId, setImportId] = useState<string | undefined>();

  /** Consultation pour les profils sans `circuits_manage` ; le modèle système reste toujours en lecture seule. */
  const readOnly = isSystem || !canManage;

  const fieldTypeOptions = useMemo(
    () => [
      { value: "text" as const, label: C[16] },
      { value: "number" as const, label: C[17] },
      { value: "date" as const, label: C[18] },
      { value: "textarea" as const, label: C[19] },
      { value: "article" as const, label: C[37] },
    ],
    [C],
  );

  const load = useCallback(async () => {
    if (!templateId || isNew) {
      if (isNew && skipNewResetAfterClone.current) {
        skipNewResetAfterClone.current = false;
        setLoading(false);
        return;
      }
      if (isNew && searchParams.get("clone")?.trim()) {
        return;
      }
      setName("");
      setDescription("");
      setFields([{ key: newCircuitFieldKey(), label: "", type: "text", required: false }]);
      setIsSystem(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const t = await fetchStockFormTemplate(templateId);
      setName(t.name);
      setDescription(t.description ?? "");
      setIsSystem(Boolean(t.isSystem));
      const parsed = parseCircuitFieldsJson(t.fieldsJson);
      setFields(parsed.length ? parsed : [{ key: newCircuitFieldKey(), label: "", type: "text", required: false }]);
    } catch (e) {
      message.error(String(e));
      navigate("/stock/circuits/forms");
    } finally {
      setLoading(false);
    }
  }, [templateId, isNew, navigate, searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isNew || !canManage) return;
    const clone = searchParams.get("clone")?.trim();
    if (!clone) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const t = await fetchStockFormTemplate(clone);
        if (cancelled) return;
        const sfx = getPageTexts("stockCommon")[1] || " (copie)";
        setName(`${(t.name || "").trim()}${sfx}`);
        setDescription(t.description ?? "");
        setIsSystem(false);
        const parsed = parseCircuitFieldsJson(t.fieldsJson);
        const base =
          parsed.length > 0 ? parsed : [{ key: newCircuitFieldKey(), label: "", type: "text" as const, required: false }];
        const cloned = cloneImportedFields(base);
        setFields(cloned.length > 0 ? cloned : [{ key: newCircuitFieldKey(), label: "", type: "text", required: false }]);
        skipNewResetAfterClone.current = true;
        setSearchParams({}, { replace: true });
      } catch (e) {
        if (!cancelled) {
          message.error(String(e));
          navigate("/stock/circuits/forms");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, canManage, searchParams, setSearchParams, navigate]);

  useEffect(() => {
    if (isNew && !canManage) navigate("/stock/circuits/forms", { replace: true });
  }, [isNew, canManage, navigate]);

  const addField = () => {
    if (readOnly) return;
    setFields((prev) => [...prev, { key: newCircuitFieldKey(), label: "", type: "text", required: false }]);
  };

  const removeField = (key: string) => {
    if (readOnly) return;
    setFields((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((f) => f.key !== key);
    });
  };

  const updateField = (key: string, patch: Partial<CircuitStepFieldDraft>) => {
    if (readOnly) return;
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  };

  const openImport = () => {
    void fetchStockFormTemplates()
      .then((list) => {
        setTemplatesPick(list.filter((x) => x.id !== templateId));
        setImportId(undefined);
        setImportOpen(true);
      })
      .catch(() => setTemplatesPick([]));
  };

  const applyImport = async () => {
    if (!importId) {
      message.warning(C[43]);
      return;
    }
    try {
      const t = await fetchStockFormTemplate(importId);
      const extra = cloneImportedFields(parseCircuitFieldsJson(t.fieldsJson));
      setFields((prev) => [...prev, ...extra]);
      message.success(T[14]);
      setImportOpen(false);
    } catch (e) {
      message.error(String(e));
    }
  };

  const onSave = async () => {
    if (readOnly) return;
    const n = name.trim();
    if (!n) {
      message.error(T[15]);
      return;
    }
    setSaving(true);
    try {
      await upsertStockFormTemplate({
        id: isNew ? undefined : templateId,
        name: n,
        description: description.trim(),
        fieldsJson: serializeCircuitFieldsForApi(fields),
      });
      message.success(T[16]);
      navigate("/stock/circuits/forms");
    } catch (e) {
      message.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Loading spinning={loading}>
      <Card
        title={isNew ? T[2] : isSystem ? T[12] : T[3]}
        extra={
          <Space>
            <Button onClick={() => navigate("/stock/circuits/forms")}>{C[25]}</Button>
            {!readOnly && !isNew && templateId ? (
              <Button onClick={() => navigate(`/stock/circuits/forms/new?clone=${encodeURIComponent(templateId)}`)}>
                {getPageTexts("stockCommon")[0]}
              </Button>
            ) : null}
            {!readOnly ? (
              <Button type="primary" loading={saving} onClick={() => void onSave()}>
                {T[7]}
              </Button>
            ) : null}
          </Space>
        }
      >
        {isSystem ? (
          <Typography.Paragraph type="secondary">{T[17]}</Typography.Paragraph>
        ) : null}
        <Form layout="vertical" style={{ maxWidth: 560 }}>
          <Form.Item label={T[4]} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
          </Form.Item>
          <Form.Item label={T[5]}>
            <Input.TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} />
          </Form.Item>
        </Form>

        <Space style={{ marginBottom: 8 }} wrap>
          <Text strong>{T[6]}</Text>
          {!readOnly ? (
            <>
              <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addField}>
                {C[20]}
              </Button>
              <Button size="small" onClick={openImport}>
                {C[39]}
              </Button>
            </>
          ) : null}
        </Space>

        <Table
          size="small"
          pagination={false}
          rowKey="key"
          dataSource={fields}
          columns={
            [
              {
                title: C[13],
                render: (_: unknown, row: CircuitStepFieldDraft) => (
                  <Input
                    size="small"
                    value={row.label}
                    disabled={readOnly || row.locked}
                    onChange={(e) => updateField(row.key, { label: e.target.value })}
                  />
                ),
              },
              {
                title: C[14],
                width: 150,
                render: (_: unknown, row: CircuitStepFieldDraft) => (
                  <Select
                    size="small"
                    style={{ width: "100%" }}
                    value={row.type}
                    disabled={readOnly || row.locked}
                    options={fieldTypeOptions}
                    onChange={(v) => updateField(row.key, { type: (v as CircuitFieldType) ?? "text" })}
                  />
                ),
              },
              {
                title: C[15],
                width: 80,
                align: "center",
                render: (_: unknown, row: CircuitStepFieldDraft) => (
                  <Checkbox
                    checked={row.required}
                    disabled={readOnly || row.locked}
                    onChange={(e) => updateField(row.key, { required: e.target.checked })}
                  />
                ),
              },
              {
                title: "",
                width: 48,
                render: (_: unknown, row: CircuitStepFieldDraft) => (
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={readOnly || row.locked || fields.length <= 1}
                    onClick={() => removeField(row.key)}
                  />
                ),
              },
            ] as ColumnsType<CircuitStepFieldDraft>
          }
        />

        <Modal title={C[40]} open={importOpen} onCancel={() => setImportOpen(false)} onOk={() => void applyImport()}>
          <Select
            style={{ width: "100%" }}
            placeholder={C[40]}
            value={importId}
            onChange={setImportId}
            options={templatesPick.map((x) => ({ value: x.id, label: x.name }))}
            showSearch
            optionFilterProp="label"
          />
        </Modal>
      </Card>
    </Loading>
  );
}
