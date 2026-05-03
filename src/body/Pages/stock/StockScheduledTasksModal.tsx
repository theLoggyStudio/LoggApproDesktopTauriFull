import { useCallback, useEffect, useState } from "react";
import {
  Form,
  Input,
  DatePicker,
  Typography,
  Space,
  message,
} from "antd";
import { Alert, Button, Modal, Table } from "../../../items";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import "dayjs/locale/fr";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import {
  loadScheduledTasks,
  saveScheduledTasks,
  subscribeScheduledTasks,
  type ScheduledTask,
} from "../../utils/scheduledTasksStore";

dayjs.locale("fr");

type Props = {
  open: boolean;
  onClose: () => void;
};

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function StockScheduledTasksModal({ open, onClose }: Props) {
  const T = usePageTexts("stockScheduledTasks");
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [form] = Form.useForm<{ title: string; at: dayjs.Dayjs }>();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );

  const reload = useCallback(() => {
    setTasks(loadScheduledTasks().sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()));
  }, []);

  useEffect(() => {
    reload();
    return subscribeScheduledTasks(reload);
  }, [reload]);

  useEffect(() => {
    if (open && typeof Notification !== "undefined") {
      setPerm(Notification.permission);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEditingTaskId(null);
      form.resetFields();
    }
  }, [open, form]);

  /** Formulaire monté après ouverture : remplissage au tick suivant (même logique que les autres écrans). */
  useEffect(() => {
    if (!open || !editingTaskId) return;
    const task = tasks.find((x) => x.id === editingTaskId);
    if (!task) return;
    const timer = window.setTimeout(() => {
      form.setFieldsValue({ title: task.title, at: dayjs(task.at) });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, editingTaskId, tasks, form]);

  const requestNotif = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const r = await Notification.requestPermission();
      setPerm(r);
    } catch {
      setPerm("denied");
    }
  };

  const cancelEdit = () => {
    setEditingTaskId(null);
    form.resetFields();
  };

  const handleSaveTask = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const title = v.title?.trim() ?? "";
    if (!title) {
      message.warning(T[10]);
      return;
    }
    const atMs = v.at.valueOf();
    if (atMs <= Date.now()) {
      message.warning(T[10]);
      return;
    }
    if (editingTaskId) {
      const next = loadScheduledTasks().map((x) =>
        x.id === editingTaskId ? { ...x, title, at: new Date(atMs).toISOString() } : x,
      );
      saveScheduledTasks(next);
      message.success(T[15]);
      cancelEdit();
    } else {
      const next: ScheduledTask[] = [
        ...loadScheduledTasks(),
        { id: newId(), title, at: new Date(atMs).toISOString() },
      ];
      saveScheduledTasks(next);
      form.resetFields();
      message.success(T[12]);
    }
    reload();
  };

  const confirmDeleteEditing = () => {
    if (!editingTaskId) return;
    Modal.confirm({
      title: T[16],
      okText: getPageTexts("stockArticles")[15],
      cancelText: getPageTexts("stockArticles")[16],
      onOk: () => {
        saveScheduledTasks(loadScheduledTasks().filter((x) => x.id !== editingTaskId));
        cancelEdit();
        reload();
      },
    });
  };

  const columns: ColumnsType<ScheduledTask> = [
    {
      title: T[2],
      dataIndex: "title",
      key: "title",
      ellipsis: true,
    },
    {
      title: T[3],
      dataIndex: "at",
      key: "at",
      width: 200,
      render: (iso: string) => (iso ? dayjs(iso).format("DD/MM/YYYY HH:mm") : ""),
    },
  ];

  const showPermHint = perm !== "granted" && perm !== "unsupported";

  return (
    <Modal
      title={T[0]}
      open={open}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          {T[11]}
        </Button>
      }
      width={720}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">{T[1]}</Typography.Paragraph>
      {showPermHint && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={T[8]}
          action={
            perm !== "denied" ? (
              <Button size="small" type="primary" onClick={requestNotif}>
                {T[7]}
              </Button>
            ) : undefined
          }
        />
      )}
      <Form form={form} layout="vertical" style={{ marginBottom: 16 }}>
        <Space wrap style={{ width: "100%" }} align="start">
          <Form.Item
            name="title"
            label={T[2]}
            rules={[{ required: true, message: T[10] }]}
            style={{ flex: 1, minWidth: 200, marginBottom: 0 }}
          >
            <Input placeholder={T[2]} />
          </Form.Item>
          <Form.Item
            name="at"
            label={T[3]}
            rules={[{ required: true, message: T[10] }]}
            style={{ minWidth: 220, marginBottom: 0 }}
          >
            <DatePicker
              showTime
              format="DD/MM/YYYY HH:mm"
              minuteStep={5}
              style={{ width: "100%" }}
              disabledDate={(current) => !!current && current < dayjs().startOf("day")}
            />
          </Form.Item>
          <Form.Item label=" " colon={false} style={{ marginBottom: 0 }}>
            <Space wrap>
              {editingTaskId ? (
                <>
                  <Button type="primary" onClick={handleSaveTask}>
                    {T[13]}
                  </Button>
                  <Button onClick={cancelEdit}>{T[14]}</Button>
                  <Button danger onClick={confirmDeleteEditing}>
                    {T[5]}
                  </Button>
                </>
              ) : (
                <Button type="primary" onClick={handleSaveTask}>
                  {T[4]}
                </Button>
              )}
            </Space>
          </Form.Item>
        </Space>
      </Form>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={tasks}
        pagination={false}
        locale={{ emptyText: T[6] }}
        scroll={{ y: 320 }}
        onRow={(record) => ({
          onClick: () => setEditingTaskId(record.id),
          style: { cursor: "pointer" },
        })}
      />
    </Modal>
  );
}
