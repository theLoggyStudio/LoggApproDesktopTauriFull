import { useCallback, useEffect, useMemo, useState } from "react";
import { Checkbox, Space, Typography, message } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { Button, Loading, Modal } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import { completeStockCollabTask, fetchStockCircuit } from "../../../lib/stockApi";
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

  const isValidate = task?.kind === "circuit_validate";

  const reset = useCallback(() => {
    setStepTitle("");
    setCircuitName("");
    setFieldsJson("[]");
    setValues({});
    setApproved(false);
  }, []);

  useEffect(() => {
    if (!open || !task?.circuitId || task.circuitStepIndex === undefined) {
      reset();
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const [{ circuit, steps }, entities] = await Promise.all([
          fetchStockCircuit(task.circuitId!),
          loadCircuitFormEntityOptions(),
        ]);
        setCircuitName(circuit.name ?? "");
        const idx = task.circuitStepIndex ?? 0;
        const ordered = [...steps].sort((a, b) => a.position - b.position);
        const st = ordered[idx];
        if (!st) {
          message.error("Étape introuvable.");
          reset();
          onClose();
          return;
        }
        setStepTitle(st.title ?? "");
        setFieldsJson(st.fieldsJson ?? "[]");
        setValues({});
        setEntityOptions(entities);
      } catch (e) {
        message.error(String(e));
        onClose();
      } finally {
        setLoading(false);
      }
    })();
  }, [open, task, reset, onClose]);

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
