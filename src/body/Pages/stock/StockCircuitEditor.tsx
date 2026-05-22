import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Card,
  Checkbox,
  Form,
  Input,
  Space,
  Switch,
  Table,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CopyOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import { Button, Loading, Modal, Select } from "../../../items";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import {
  createCircuitStepCollabTask,
  fetchStockCircuit,
  fetchStockFormTemplates,
  fetchStockFormTemplate,
  fetchStockRoles,
  upsertStockCircuit,
  type StockCircuitStepRow,
  type StockFormTemplateRow,
  type StockRoleRow,
} from "../../../lib/stockApi";
import { dispatchCollabTasksChanged } from "../../utils/scheduledTasksStore";
import { hasStockPrivilege, hasStockScreenAccess } from "../../utils/stockPrivileges";
import {
  type CircuitStepFieldDraft,
  newCircuitFieldKey,
  parseCircuitFieldsJson,
  serializeCircuitFieldsForApi,
  stripSystemMovementDuplicates,
} from "../../utils/circuitFormFields";
import { buildCircuitFieldTypeSelectOptions, type CircuitFieldType } from "../../utils/circuitFieldTypes";
import { buildPrintTableHtml, printHtmlPage } from "../../utils/stockBrowserPrint";
import { ensureCircuitStepInteractionRoles } from "../../utils/stockCircuitRoles";

const { Text } = Typography;

type StepDraft = {
  key: string;
  title: string;
  fillRoleIds: string[];
  validateRoleId: string;
  fields: CircuitStepFieldDraft[];
};

function stepDraftFromApiRow(
  s: StockCircuitStepRow,
  stepIndex: number,
): Pick<StepDraft, "fillRoleIds" | "validateRoleId"> {
  const raw = (s.fillRoleIds ?? []).map((x) => String(x).trim()).filter(Boolean);
  const fromApi = raw.length
    ? [...new Set(raw)]
    : (s.fillRoleId ?? "").trim()
      ? [(s.fillRoleId ?? "").trim()]
      : [];
  return ensureCircuitStepInteractionRoles(fromApi, s.validateRoleId ?? "", stepIndex);
}

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseStepFieldsFromJson(raw: string): CircuitStepFieldDraft[] {
  const parsed = stripSystemMovementDuplicates(
    parseCircuitFieldsJson(raw).map((f) => ({
      ...f,
      key: (f.fieldId ?? f.key) || newKey(),
      locked: false,
    })),
  );
  return parsed.length
    ? parsed
    : [{ key: newCircuitFieldKey(), label: "", type: "text", required: false }];
}

export default function StockCircuitEditor() {
  const C = usePageTexts("stockCircuits");
  const Ta = usePageTexts("stockScheduledTasks");
  const { circuitId } = useParams<{ circuitId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const skipEmptyNewAfterClone = useRef(false);
  const { session } = useSession();
  const canManage = hasStockPrivilege(session, "circuits_manage");
  const canNotifyTasks = hasStockScreenAccess(session, "circuits");
  const isEdit = Boolean(circuitId);

  const [roles, setRoles] = useState<StockRoleRow[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [templatesPick, setTemplatesPick] = useState<StockFormTemplateRow[]>([]);
  const [importTplId, setImportTplId] = useState<string | undefined>();
  const [importStepIndex, setImportStepIndex] = useState(0);

  const roleOptions = useMemo(
    () => roles.map((r) => ({ value: r.id, label: r.name })),
    [roles],
  );

  useEffect(() => {
    if (!session) return;
    if (session.role === "stock_user" && !canManage) {
      navigate("/stock/circuits", { replace: true });
    }
  }, [session, canManage, navigate]);

  useEffect(() => {
    fetchStockRoles()
      .then(setRoles)
      .catch(() => setRoles([]));
  }, []);

  const loadCircuit = useCallback(async () => {
    if (!circuitId) return;
    setLoading(true);
    try {
      const { circuit, steps: srvSteps } = await fetchStockCircuit(circuitId);
      setName(circuit.name);
      setDescription(circuit.description ?? "");
      setActive(circuit.active);
      setSteps(
        [...srvSteps]
          .sort((a, b) => a.position - b.position)
          .map((s, idx) => {
            const roles = stepDraftFromApiRow(s, idx);
            return {
              key: s.id || newKey(),
              title: s.title,
              fillRoleIds: roles.fillRoleIds,
              validateRoleId: roles.validateRoleId,
              fields: parseStepFieldsFromJson(s.fieldsJson),
            };
          }),
      );
    } catch (e) {
      message.error(String(e));
      navigate("/stock/circuits");
    } finally {
      setLoading(false);
    }
  }, [circuitId, navigate]);

  useEffect(() => {
    if (circuitId) {
      void loadCircuit();
      return;
    }
    const clone = searchParams.get("clone")?.trim();
    if (clone) {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          const { circuit, steps: srvSteps } = await fetchStockCircuit(clone);
          if (cancelled) return;
          const sfx = getPageTexts("stockCommon")[1] || " (copie)";
          setName(`${(circuit.name || "").trim()}${sfx}`);
          setDescription(circuit.description ?? "");
          setActive(circuit.active);
          setSteps(
            [...srvSteps]
              .sort((a, b) => a.position - b.position)
              .map((s, idx) => {
                const roles = stepDraftFromApiRow(s, idx);
                return {
                  key: s.id || newKey(),
                  title: s.title,
                  fillRoleIds: roles.fillRoleIds,
                  validateRoleId: roles.validateRoleId,
                  fields: parseStepFieldsFromJson(s.fieldsJson),
                };
              }),
          );
          skipEmptyNewAfterClone.current = true;
          setSearchParams({}, { replace: true });
        } catch (e) {
          if (!cancelled) {
            message.error(String(e));
            navigate("/stock/circuits");
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    if (skipEmptyNewAfterClone.current) {
      skipEmptyNewAfterClone.current = false;
      return;
    }
    setName("");
    setDescription("");
    setActive(true);
    setSteps([
      {
        key: newKey(),
        title: "",
        fillRoleIds: [],
        validateRoleId: "",
        fields: [{ key: newCircuitFieldKey(), label: "", type: "text", required: false }],
      },
    ]);
  }, [circuitId, loadCircuit, navigate, searchParams, setSearchParams]);

  const fieldTypeOptions = useMemo(() => buildCircuitFieldTypeSelectOptions(), []);

  const moveStep = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        key: newKey(),
        title: "",
        fillRoleIds: [],
        validateRoleId: "",
        fields: [{ key: newCircuitFieldKey(), label: "", type: "text", required: false }],
      },
    ]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, patch: Partial<StepDraft>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addField = (stepIndex: number) => {
    setSteps((prev) =>
      prev.map((s, i) =>
        i === stepIndex
          ? {
              ...s,
              fields: [...s.fields, { key: newCircuitFieldKey(), label: "", type: "text", required: false }],
            }
          : s,
      ),
    );
  };

  const removeField = (stepIndex: number, fieldKey: string) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        const target = s.fields.find((f) => f.key === fieldKey);
        if (target?.locked) return s;
        if (s.fields.length <= 1) return s;
        return { ...s, fields: s.fields.filter((f) => f.key !== fieldKey) };
      }),
    );
  };

  const updateField = (stepIndex: number, fieldKey: string, patch: Partial<CircuitStepFieldDraft>) => {
    setSteps((prev) =>
      prev.map((s, i) =>
        i === stepIndex
          ? { ...s, fields: s.fields.map((f) => (f.key === fieldKey ? { ...f, ...patch } : f)) }
          : s,
      ),
    );
  };

  const onSave = async () => {
    const n = name.trim();
    if (!n) {
      message.error(C[30]);
      return;
    }
    if (!steps.length) {
      message.error(C[31]);
      return;
    }
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      if (!st.title.trim()) {
        message.error(`${C[7]} ${i + 1} : ${C[8]}`);
        return;
      }
    }
    setSaving(true);
    try {
      await upsertStockCircuit({
        id: circuitId,
        name: n,
        description: description.trim(),
        active,
        steps: steps.map((st, idx) => {
          const roles = ensureCircuitStepInteractionRoles(
            st.fillRoleIds.map((x) => x.trim()).filter(Boolean),
            idx === 0 ? "" : st.validateRoleId.trim(),
            idx,
          );
          return {
            title: st.title.trim(),
            fillRoleIds: roles.fillRoleIds,
            fillRoleId: roles.fillRoleIds[0] ?? "",
            validateRoleId: roles.validateRoleId,
            fieldsJson: serializeCircuitFieldsForApi(st.fields),
          };
        }),
      });
      message.success(C[29]);
      navigate("/stock/circuits");
    } catch (e) {
      message.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handlePrintCircuit = () => {
    const n = name.trim() || "Circuit";
    const chunks: string[] = [];
    steps.forEach((st, si) => {
      chunks.push(
        buildPrintTableHtml(
          `${C[7]} ${si + 1} — ${st.title.trim() || "—"}`,
          [C[13], C[14], C[15]],
          st.fields.map((f) => [f.label.trim() || "—", f.type, f.required ? "oui" : "non"]),
        ),
      );
    });
    const ok = printHtmlPage(n, chunks.join(""));
    if (!ok) message.warning("Impossible d’ouvrir la fenêtre d’impression (popup bloquée ?).");
  };

  const openImportForStep = (stepIndex: number) => {
    setImportStepIndex(stepIndex);
    void fetchStockFormTemplates()
      .then((list) => {
        setTemplatesPick(list);
        setImportTplId(undefined);
        setImportOpen(true);
      })
      .catch(() => {
        setTemplatesPick([]);
        setImportOpen(true);
      });
  };

  const applyTemplateImport = async () => {
    if (!importTplId) {
      message.warning(C[43]);
      return;
    }
    try {
      const t = await fetchStockFormTemplate(importTplId);
      const extra = stripSystemMovementDuplicates(parseCircuitFieldsJson(t.fieldsJson)).map((f) => ({
        key: newCircuitFieldKey(),
        fieldId: undefined,
        label: f.label,
        type: f.type,
        required: f.required,
        locked: false,
      }));
      setSteps((prev) =>
        prev.map((s, i) => (i === importStepIndex ? { ...s, fields: [...s.fields, ...extra] } : s)),
      );
      message.success(C[41]);
      setImportOpen(false);
    } catch (e) {
      message.error(String(e));
    }
  };

  const pushCircuitTask = async (stepIndex: number, variant: "fill" | "validate") => {
    if (!session?.id || !circuitId) {
      message.warning(C[36]);
      return;
    }
    try {
      await createCircuitStepCollabTask({
        requesterUserId: session.id,
        circuitId,
        stepIndex,
        variant,
      });
      message.success(Ta[12]);
      dispatchCollabTasksChanged();
    } catch (e) {
      message.error(String(e));
    }
  };

  if (!canManage && session?.role === "stock_user") {
    return null;
  }

  return (
    <Loading spinning={loading}>
      <Card
        title={isEdit ? C[26] : C[2]}
        extra={
          <Space wrap>
            <Button icon={<PrinterOutlined />} onClick={handlePrintCircuit}>
              {C[42]}
            </Button>
            {isEdit && circuitId ? (
              <Button
                type="text"
                icon={<CopyOutlined />}
                aria-label={getPageTexts("stockCommon")[0]}
                title={getPageTexts("stockCommon")[0]}
                onClick={() => navigate(`/stock/circuits/new?clone=${encodeURIComponent(circuitId)}`)}
              />
            ) : null}
            <Button onClick={() => navigate("/stock/circuits")}>{C[25]}</Button>
            <Button type="primary" loading={saving} onClick={() => void onSave()}>
              {C[24]}
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Form layout="vertical" style={{ maxWidth: 560 }}>
            <Form.Item label={C[3]} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Form.Item>
            <Form.Item label={C[4]}>
              <Input.TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Form.Item>
            <Form.Item label={C[5]}>
              <Switch checked={active} onChange={setActive} />
            </Form.Item>
          </Form>

          <div>
            <Text strong>{C[6]}</Text>
            <Button type="dashed" icon={<PlusOutlined />} onClick={addStep} style={{ marginLeft: 12 }}>
              {C[21]}
            </Button>
          </div>

          {steps.map((step, si) => (
            <Card
              key={step.key}
              size="small"
              title={`${C[7]} ${si + 1}`}
              extra={
                <Space>
                  <Button type="text" icon={<ArrowUpOutlined />} disabled={si === 0} onClick={() => moveStep(si, -1)} title={C[22]} />
                  <Button
                    type="text"
                    icon={<ArrowDownOutlined />}
                    disabled={si === steps.length - 1}
                    onClick={() => moveStep(si, 1)}
                    title={C[23]}
                  />
                  <Button type="text" danger icon={<DeleteOutlined />} disabled={steps.length <= 1} onClick={() => removeStep(si)} />
                </Space>
              }
            >
              <Form layout="vertical">
                <Form.Item label={C[8]} required>
                  <Input value={step.title} onChange={(e) => updateStep(si, { title: e.target.value })} />
                </Form.Item>
                <Form.Item label={C[9]} extra={<Text type="secondary">{C[53]}</Text>}>
                  <Select
                    mode="multiple"
                    allowClear
                    style={{ width: "100%", maxWidth: 480 }}
                    value={step.fillRoleIds.length ? step.fillRoleIds : undefined}
                    options={roleOptions}
                    placeholder={C[9]}
                    onChange={(v) =>
                      updateStep(si, {
                        fillRoleIds: Array.isArray(v) ? (v as string[]).filter((x) => String(x).trim()) : [],
                      })
                    }
                    showSearch
                    optionFilterProp="label"
                    maxTagCount="responsive"
                  />
                </Form.Item>
                <Form.Item label={C[10]}>
                  {si === 0 ? (
                    <Text type="secondary">{C[11]}</Text>
                  ) : (
                    <Select
                      style={{ width: "100%", maxWidth: 400 }}
                      value={step.validateRoleId || undefined}
                      options={roleOptions}
                      placeholder={C[10]}
                      onChange={(v) => updateStep(si, { validateRoleId: v ?? "" })}
                      showSearch
                      optionFilterProp="label"
                    />
                  )}
                </Form.Item>
              </Form>

              {canNotifyTasks && circuitId ? (
                <Space wrap style={{ marginTop: 8 }}>
                  <Button size="small" type="default" onClick={() => void pushCircuitTask(si, "fill")}>
                    {C[34]}
                  </Button>
                  {si >= 1 ? (
                    <Button size="small" type="default" onClick={() => void pushCircuitTask(si, "validate")}>
                      {C[35]}
                    </Button>
                  ) : null}
                </Space>
              ) : canNotifyTasks && !circuitId ? (
                <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
                  {C[36]}
                </Text>
              ) : null}

              <Text strong style={{ display: "block", marginBottom: 8 }}>
                {C[12]}
              </Text>
              <Space wrap style={{ marginBottom: 8 }}>
                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => addField(si)}>
                  {C[20]}
                </Button>
                <Button size="small" onClick={() => openImportForStep(si)}>
                  {C[39]}
                </Button>
              </Space>
              <Table
                size="small"
                pagination={false}
                rowKey="key"
                dataSource={step.fields}
                columns={
                  [
                    {
                      title: C[13],
                      dataIndex: "label",
                      render: (_: unknown, row: CircuitStepFieldDraft) => (
                        <Input
                          size="small"
                          value={row.label}
                          disabled={Boolean(row.locked)}
                          onChange={(e) => updateField(si, row.key, { label: e.target.value })}
                        />
                      ),
                    },
                    {
                      title: C[14],
                      width: 220,
                      render: (_: unknown, row: CircuitStepFieldDraft) => (
                        <Select
                          size="small"
                          style={{ width: "100%" }}
                          value={row.type}
                          disabled={Boolean(row.locked)}
                          options={fieldTypeOptions}
                          onChange={(v) => updateField(si, row.key, { type: (v as CircuitFieldType) ?? "text" })}
                        />
                      ),
                    },
                    {
                      title: C[15],
                      width: 100,
                      align: "center",
                      render: (_: unknown, row: CircuitStepFieldDraft) => (
                        <Checkbox
                          checked={row.required}
                          disabled={Boolean(row.locked)}
                          onChange={(e) => updateField(si, row.key, { required: e.target.checked })}
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
                          disabled={Boolean(row.locked) || step.fields.length <= 1}
                          onClick={() => removeField(si, row.key)}
                        />
                      ),
                    },
                  ] as ColumnsType<CircuitStepFieldDraft>
                }
              />
            </Card>
          ))}
        </Space>
        <Modal title={C[40]} open={importOpen} onCancel={() => setImportOpen(false)} onOk={() => void applyTemplateImport()}>
          <Select
            style={{ width: "100%" }}
            placeholder={C[40]}
            value={importTplId}
            onChange={setImportTplId}
            options={templatesPick.map((x) => ({ value: x.id, label: x.name }))}
            showSearch
            optionFilterProp="label"
          />
        </Modal>
      </Card>
    </Loading>
  );
}
