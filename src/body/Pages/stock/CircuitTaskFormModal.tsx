import { useCallback, useEffect, useMemo, useState } from "react";
import { Checkbox, Space, Typography, message } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { Button, Loading, Modal, Panel } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import {
  completeStockCollabTask,
  fetchCircuitValidatedSteps,
  fetchStockCircuit,
  type StockCircuitValidatedStep,
} from "../../../lib/stockApi";
import { dispatchCollabTasksChanged, type ScheduledTask } from "../../utils/scheduledTasksStore";
import { parseCircuitFieldsJson, formFieldName } from "../../utils/circuitFormFields";
import {
  loadCircuitFormEntityOptions,
  resolveEntityFieldDisplayValue,
  type CircuitFormEntityOptions,
} from "../../utils/circuitFormEntityOptions";
import { isCircuitEntityFieldType } from "../../utils/circuitFieldTypes";
import { buildPrintTableHtml, printHtmlPage } from "../../utils/stockBrowserPrint";
import { CircuitDynamicForm } from "./CircuitDynamicForm";

type Props = {
  open: boolean;
  task: ScheduledTask | null;
  onClose: () => void;
  onCompleted?: () => void;
};

export function CircuitTaskFormModal({ open, task, onClose, onCompleted }: Props) {
  const T = usePageTexts("stockCircuitTaskForm");
  const { session } = useSession();
  const [loading, setLoading] = useState(false);
  const [stepTitle, setStepTitle] = useState("");
  const [circuitName, setCircuitName] = useState("");
  const [fieldsJson, setFieldsJson] = useState("[]");
  const [values, setValues] = useState<Record<string, string>>({});
  const [entityOptions, setEntityOptions] = useState<CircuitFormEntityOptions>({});
  const [approved, setApproved] = useState(false);
  const [validatedSteps, setValidatedSteps] = useState<StockCircuitValidatedStep[]>([]);

  const isValidate = task?.kind === "circuit_validate";
  const isCircuitTask = task?.kind === "circuit_validate" || task?.kind === "circuit_fill";

  const reset = useCallback(() => {
    setStepTitle("");
    setCircuitName("");
    setFieldsJson("[]");
    setValues({});
    setApproved(false);
    setValidatedSteps([]);
  }, []);

  useEffect(() => {
    if (!open || !task?.circuitId || task.circuitStepIndex === undefined) {
      reset();
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const stepIdx = task.circuitStepIndex ?? 0;
        const [{ circuit, steps }, entities, prior] = await Promise.all([
          fetchStockCircuit(task.circuitId!),
          loadCircuitFormEntityOptions(),
          isCircuitTask
            ? fetchCircuitValidatedSteps({
                circuitId: task.circuitId!,
                beforeStepIndex: stepIdx,
              })
            : Promise.resolve([] as StockCircuitValidatedStep[]),
        ]);
        setCircuitName(circuit.name ?? "");
        const ordered = [...steps].sort((a, b) => a.position - b.position);
        const st = ordered[stepIdx];
        if (!st) {
          message.error("Étape introuvable.");
          reset();
          onClose();
          return;
        }
        setStepTitle(st.title ?? "");
        setFieldsJson(st.fieldsJson ?? "[]");
        const incoming = task.formValues ?? {};
        setValues(
          Object.fromEntries(
            Object.entries(incoming).map(([k, v]) => [k, v == null ? "" : String(v)]),
          ),
        );
        setEntityOptions(entities);
        setValidatedSteps(prior);
      } catch (e) {
        message.error(String(e));
        onClose();
      } finally {
        setLoading(false);
      }
    })();
  }, [open, task, reset, onClose, isCircuitTask]);

  const parsedFields = useMemo(() => parseCircuitFieldsJson(fieldsJson), [fieldsJson]);

  const handlePrint = () => {
    const headers = ["Champ", "Valeur"];
    const bodyRows = parsedFields.map((f) => {
      const n = formFieldName(f);
      const raw = values[n] ?? "";
      const display = isCircuitEntityFieldType(f.type)
        ? resolveEntityFieldDisplayValue(f.type, raw, entityOptions)
        : raw;
      return [f.label.trim() || n, display];
    });
    const title = `${circuitName} — ${stepTitle}`;
    const ok = printHtmlPage(title, buildPrintTableHtml(title, headers, bodyRows));
    if (!ok) message.warning("Impossible d’ouvrir la fenêtre d’impression (popup bloquée ?).");
  };

  const validateRequired = (): boolean => {
    for (const f of parsedFields) {
      if (!f.required || isValidate) continue;
      const n = formFieldName(f);
      if (!(values[n] ?? "").toString().trim()) {
        message.warning(T[7]);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!session?.id || !task?.id) return;
    if (isValidate) {
      if (!approved) {
        message.warning(T[6]);
        return;
      }
    } else if (!validateRequired()) {
      return;
    }
    try {
      await completeStockCollabTask({
        id: task.id,
        requesterUserId: session.id,
        requesterRole: session.role ?? "",
        formValues: isValidate ? task.formValues ?? values : values,
      });
      message.success(T[8]);
      dispatchCollabTasksChanged();
      onCompleted?.();
      onClose();
    } catch (e) {
      message.error(String(e));
    }
  };

  return (
    <Modal
      title={isValidate ? T[1] : T[0]}
      open={open}
      onCancel={onClose}
      width={640}
      destroyOnClose
      footer={
        <Space wrap>
          <Button icon={<PrinterOutlined />} onClick={handlePrint}>
            {T[2]}
          </Button>
          <Button onClick={onClose}>{T[4]}</Button>
          <Button type="primary" onClick={() => void handleSubmit()}>
            {T[3]}
          </Button>
        </Space>
      }
    >
      <Loading spinning={loading}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          {circuitName}
          {stepTitle ? ` — ${stepTitle}` : ""}
        </Typography.Paragraph>
        {isCircuitTask ? (
          <div style={{ marginBottom: 16 }}>
            <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
              {T[9]}
            </Typography.Text>
            {validatedSteps.length === 0 ? (
              <Typography.Text type="secondary">{T[10]}</Typography.Text>
            ) : (
              <Space direction="vertical" size="small" style={{ width: "100%" }}>
                {validatedSteps.map((vs) => {
                  const fields = parseCircuitFieldsJson(vs.fieldsJson ?? "[]");
                  const fv = vs.formValues ?? {};
                  const formatAt = (raw?: string) => {
                    const s = (raw ?? "").trim();
                    if (!s) return "—";
                    const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
                    return Number.isNaN(d.getTime()) ? s : d.toLocaleString("fr-FR");
                  };
                  const panelTitle = `${T[11]} ${(vs.stepIndex ?? 0) + 1}${
                    vs.stepTitle ? ` — ${vs.stepTitle}` : ""
                  }`;
                  return (
                    <Panel
                      key={`validated-${vs.stepIndex}`}
                      size="small"
                      collapsible
                      defaultCollapsed
                      title={panelTitle}
                    >
                      <Typography.Paragraph style={{ marginBottom: 4 }}>
                        <Typography.Text type="secondary">{T[12]}{" : "}</Typography.Text>
                        <Typography.Text>{vs.filledBy?.trim() || "—"}</Typography.Text>
                      </Typography.Paragraph>
                      <Typography.Paragraph style={{ marginBottom: 4 }}>
                        <Typography.Text type="secondary">{T[13]}{" : "}</Typography.Text>
                        <Typography.Text>{formatAt(vs.filledAt)}</Typography.Text>
                      </Typography.Paragraph>
                      <Typography.Paragraph style={{ marginBottom: 4 }}>
                        <Typography.Text type="secondary">{T[15]}{" : "}</Typography.Text>
                        <Typography.Text>{vs.signedBy?.trim() || "—"}</Typography.Text>
                      </Typography.Paragraph>
                      <Typography.Paragraph style={{ marginBottom: 12 }}>
                        <Typography.Text type="secondary">{T[14]}{" : "}</Typography.Text>
                        <Typography.Text>{formatAt(vs.signedAt)}</Typography.Text>
                      </Typography.Paragraph>
                      {fields.length === 0 ? (
                        <Typography.Text type="secondary">—</Typography.Text>
                      ) : (
                        fields.map((f) => {
                          const n = formFieldName(f);
                          const raw = fv[n] ?? "";
                          const display =
                            isCircuitEntityFieldType(f.type) && raw
                              ? resolveEntityFieldDisplayValue(f.type, raw, entityOptions)
                              : raw;
                          return (
                            <Typography.Paragraph
                              key={`${vs.stepIndex}-${n}`}
                              style={{ marginBottom: 4 }}
                            >
                              <Typography.Text type="secondary">
                                {f.label.trim() || n}
                                {" : "}
                              </Typography.Text>
                              <Typography.Text>{display || "—"}</Typography.Text>
                            </Typography.Paragraph>
                          );
                        })
                      )}
                    </Panel>
                  );
                })}
              </Space>
            )}
          </div>
        ) : null}
        <CircuitDynamicForm
          fields={parsedFields}
          value={values}
          onChange={setValues}
          entityOptions={entityOptions}
          readOnly={isValidate}
        />
        {isValidate ? (
          <Checkbox style={{ marginTop: 16 }} checked={approved} onChange={(e) => setApproved(e.target.checked)}>
            {T[5]}
          </Checkbox>
        ) : null}
        {task?.history?.length ? (
          <div style={{ marginTop: 16 }}>
            <Typography.Text strong>Historique</Typography.Text>
            <div style={{ marginTop: 8, maxHeight: 180, overflow: "auto" }}>
              {task.history.map((h, i) => (
                <Typography.Paragraph key={`${h.at}-${i}`} style={{ marginBottom: 6 }}>
                  <Typography.Text type="secondary">
                    {h.at ? new Date(h.at).toLocaleString("fr-FR") : "—"}
                  </Typography.Text>
                  {" — "}
                  <Typography.Text>{h.note || h.action}</Typography.Text>
                </Typography.Paragraph>
              ))}
            </div>
          </div>
        ) : null}
      </Loading>
    </Modal>
  );
}
