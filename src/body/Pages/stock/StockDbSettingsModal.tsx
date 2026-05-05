import { useEffect, useState } from "react";
import { Form, Input, message, Select, Space, Switch, Typography } from "antd";
import { Button, Modal } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import {
  fetchRemoteDbSettings,
  saveRemoteDbSettings,
  testRemoteDb,
  type RemoteDbSettings,
} from "../../../lib/stockApi";

const { Paragraph } = Typography;

type Props = { open: boolean; onClose: () => void };

function formToSettings(v: {
  driver?: string;
  host?: string;
  port?: string;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  schema?: string;
  extraParams?: string;
}): RemoteDbSettings {
  return {
    driver: String(v.driver ?? "mysql"),
    host: String(v.host ?? "").trim(),
    port: String(v.port ?? "").trim(),
    database: String(v.database ?? "").trim(),
    user: String(v.user ?? "").trim(),
    password: String(v.password ?? ""),
    ssl: Boolean(v.ssl),
    schema: String(v.schema ?? "").trim(),
    extraParams: String(v.extraParams ?? "").trim(),
  };
}

export function StockDbSettingsModal({ open, onClose }: Props) {
  const S = usePageTexts("stockSettingsDb");
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchRemoteDbSettings();
        if (cancelled) return;
        form.setFieldsValue({
          driver: d.driver || "mysql",
          host: d.host,
          port: d.port || (d.driver === "postgres" ? "5432" : "3306"),
          database: d.database,
          user: d.user,
          password: d.password,
          ssl: d.ssl,
          schema: d.schema,
          extraParams: d.extraParams,
        });
      } catch (e) {
        if (!cancelled) message.error(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, form]);

  const onTest = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setLoading(true);
    try {
      const r = await testRemoteDb({ ...formToSettings(v) });
      if (r.ok) message.success(r.message ?? S[9]);
      else message.warning(r.message ?? "");
    } catch (e) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  const onSave = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    try {
      await saveRemoteDbSettings(formToSettings(v));
      message.success(S[15]);
    } catch (e) {
      message.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={S[0]} open={open} onCancel={onClose} footer={null} destroyOnHidden width={620}>
      <Paragraph type="secondary">{S[8]}</Paragraph>
      <Form form={form} layout="vertical" initialValues={{ driver: "mysql", port: "3306", ssl: false }}>
        <Form.Item name="driver" label={S[10]}>
          <Select
            options={[
              { value: "mysql", label: S[16] },
              { value: "postgres", label: S[17] },
            ]}
            onChange={(drv) => {
              const port = form.getFieldValue("port");
              if (!port || port === "3306" || port === "5432") {
                form.setFieldValue("port", drv === "postgres" ? "5432" : "3306");
              }
            }}
          />
        </Form.Item>
        <Form.Item name="host" label={S[1]}>
          <Input placeholder="db.exemple.com" allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item name="port" label={S[2]}>
          <Input placeholder="3306 ou 5432" allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item name="database" label={S[3]} rules={[{ required: false }]}>
          <Input placeholder="nom_base" allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item name="schema" label={S[11]}>
          <Input placeholder="public" allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item name="user" label={S[4]}>
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item name="password" label={S[5]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="ssl" label={S[12]} valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="extraParams" label={S[13]}>
          <Input.TextArea rows={2} placeholder="charset=utf8mb4" allowClear />
        </Form.Item>
        <Space wrap>
          <Button type="primary" onClick={onTest} loading={loading}>
            {S[6]}
          </Button>
          <Button onClick={onSave} loading={saving}>
            {S[14]}
          </Button>
          <Button onClick={onClose}>{S[7]}</Button>
        </Space>
      </Form>
    </Modal>
  );
}
