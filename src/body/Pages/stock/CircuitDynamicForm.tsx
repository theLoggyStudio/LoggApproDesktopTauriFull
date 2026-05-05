import { DatePicker, Form, Input, InputNumber, Space } from "antd";
import dayjs from "dayjs";
import "dayjs/locale/fr";
import { Select } from "../../../items";
import type { CircuitStepFieldDraft } from "../../utils/circuitFormFields";
import { formFieldName } from "../../utils/circuitFormFields";

dayjs.locale("fr");

export type ArticleOption = { value: string; label: string };

type Props = {
  fields: CircuitStepFieldDraft[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  articles: ArticleOption[];
  readOnly?: boolean;
};

export function CircuitDynamicForm({ fields, value, onChange, articles, readOnly }: Props) {
  const set = (name: string, v: string) => {
    onChange({ ...value, [name]: v });
  };

  return (
    <Form layout="vertical" disabled={readOnly}>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {fields.map((f) => {
          const name = formFieldName(f);
          const cur = value[name] ?? "";
          const label = (f.label.trim() || name) + (f.required ? " *" : "");
          if (f.type === "article") {
            return (
              <Form.Item key={f.key} label={label}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  allowClear
                  placeholder="—"
                  value={cur || undefined}
                  options={articles}
                  onChange={(v) => set(name, v ?? "")}
                  style={{ width: "100%", maxWidth: 480 }}
                />
              </Form.Item>
            );
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
