import { useState } from "react";
import { Form, Input, message, Space, Typography } from "antd";
import { Button, Modal } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { testRemoteDb } from "../../../lib/stockApi";

const { Paragraph } = Typography;

type Props = { open: boolean; onClose: () => void };

export function StockDbSettingsModal({ open, onClose }: Props) {
  const S = usePageTexts("stockSettingsDb");
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const onTest = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setLoading(true);
    try {
      const r = await testRemoteDb({
        host: v.host ?? "",
        port: v.port ?? "",
        database: v.database ?? "",
        user: v.user ?? "",
        password: v.password ?? "",
      });
      if (r.ok) message.success(S[9] ?? "OK");
      else message.warning(r.message ?? "");
    } catch (e) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={S[0]} open={open} onCancel={onClose} footer={null} destroyOnHidden width={560}>
      <Paragraph type="secondary">{S[8]}</Paragraph>
      <Form form={form} layout="vertical" initialValues={{ port: "3306" }}>
        <Form.Item name="host" label={S[1]} rules={[{ required: false }]}>
          <Input placeholder="localhost" />
        </Form.Item>
        <Form.Item name="port" label={S[2]}>
          <Input />
        </Form.Item>
        <Form.Item name="database" label={S[3]}>
          <Input />
        </Form.Item>
        <Form.Item name="user" label={S[4]}>
          <Input />
        </Form.Item>
        <Form.Item name="password" label={S[5]}>
          <Input.Password />
        </Form.Item>
        <Space>
          <Button type="primary" onClick={onTest} loading={loading}>
            {S[6]}
          </Button>
          <Button onClick={onClose}>{S[7]}</Button>
        </Space>
      </Form>
    </Modal>
  );
}
