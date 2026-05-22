import { DatePicker, Form, Input, InputNumber, Space } from "antd";
import dayjs from "dayjs";
import "dayjs/locale/fr";
import { Select } from "../../../items";
import type { CircuitStepFieldDraft } from "../../utils/circuitFormFields";
import { formFieldName } from "../../utils/circuitFormFields";
import { isCircuitEntityFieldType } from "../../utils/circuitFieldTypes";
import type { CircuitFormEntityOptions, EntitySelectOption } from "../../utils/circuitFormEntityOptions";

dayjs.locale("fr");

export type ArticleOption = EntitySelectOption;

type Props = {
  fields: CircuitStepFieldDraft[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  /** @deprecated Préférer `entityOptions` ; conservé pour compatibilité. */
  articles?: EntitySelectOption[];
  entityOptions?: CircuitFormEntityOptions;
  readOnly?: boolean;
};

export function CircuitDynamicForm({ fields, value, onChange, articles, entityOptions, readOnly }: Props) {
  const entities: CircuitFormEntityOptions = {
    ...entityOptions,
    article: entityOptions?.article ?? articles,
  };

  const set = (name: string, v: string) => {
    onChange({ ...value, [name]: v });
  };

  const renderEntitySelect = (f: CircuitStepFieldDraft, name: string, cur: string, label: string) => {
    const opts = isCircuitEntityFieldType(f.type) ? entities[f.type] ?? [] : [];
    return (
      <Form.Item key={f.key} label={label}>
        <Select
          showSearch
          optionFilterProp="label"
          allowClear
          placeholder="—"
          value={cur || undefined}
          options={opts}
          onChange={(v) => set(name, v ?? "")}
          style={{ width: "100%", maxWidth: 480 }}
        />
      </Form.Item>
    );
  };

  return (
    <Form layout="vertical" disabled={readOnly}>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {fields.map((f) => {
          const name = formFieldName(f);
          const cur = value[name] ?? "";
          const label = (f.label.trim() || name) + (f.required ? " *" : "");
          if (isCircuitEntityFieldType(f.type)) {
            return renderEntitySelect(f, name, cur, label);
          }
          if (f.type === "number") {
            return (
              <Form.Item key={f.key} label={label}>
                <InputNumber
                  style={{ width: "100%", maxWidth: 280 }}
                  value={cur === "" ? undefined : Number(cur)}
                  onChange={(n) => set(name, n === null || n === undefined ? "" : String(n))}
                />
              </Form.Item>
            );
          }
          if (f.type === "date") {
            return (
              <Form.Item key={f.key} label={label}>
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: "100%", maxWidth: 280 }}
                  value={cur ? dayjs(cur) : undefined}
                  onChange={(d) => set(name, d ? d.format("YYYY-MM-DD") : "")}
                />
              </Form.Item>
            );
          }
          if (f.type === "textarea") {
            return (
              <Form.Item key={f.key} label={label}>
                <Input.TextArea rows={3} value={cur} onChange={(e) => set(name, e.target.value)} />
              </Form.Item>
            );
          }
          return (
            <Form.Item key={f.key} label={label}>
              <Input value={cur} onChange={(e) => set(name, e.target.value)} />
            </Form.Item>
          );
        })}
      </Space>
    </Form>
  );
}
