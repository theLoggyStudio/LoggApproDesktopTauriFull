import { useCallback, useEffect, useState } from "react";
import {
  Form,
  Input,
  DatePicker,
  Typography,
  Space,
  message,
  Checkbox,
  Tag,
} from "antd";
import { Alert, Button, Modal, Select, Table } from "../../../items";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import "dayjs/locale/fr";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import {
  loadScheduledTasks,
  getReminderTasks,
  saveReminderTasksPreservingLowStock,
  subscribeScheduledTasks,
  sortScheduledTasksForDisplay,
  completeScheduledTask,
  mapCollabRowToScheduledTask,
  dispatchCollabTasksChanged,
  subscribeCollabTasks,
  type ScheduledTask,
} from "../../utils/scheduledTasksStore";
import {
  completeStockCollabTask,
  fetchStockCollabTasks,
  fetchStockRoles,
  upsertStockCollabTask,
  type StockCollabTaskVisibility,
  type StockRoleRow,
} from "../../../lib/stockApi";
import { CircuitTaskFormModal } from "./CircuitTaskFormModal";

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
  const { session } = useSession();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingFromServer, setEditingFromServer] = useState(false);
  const [editingKind, setEditingKind] = useState<string | undefined>(undefined);
  const [roles, setRoles] = useState<StockRoleRow[]>([]);
  const [circuitFormTask, setCircuitFormTask] = useState<ScheduledTask | null>(null);
  const [form] = Form.useForm<{
    title: string;
    at: dayjs.Dayjs;
    description: string;
    visibility: StockCollabTaskVisibility;
    visibleRoleId?: string;
  }>();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );

  const canUseServerTasks =
    Boolean(session?.id) && (session?.role === "stock_user" || session?.role === "sadmin");

  const reload = useCallback(async () => {
    const low = loadScheduledTasks().filter((t) => t.kind === "low_stock");
    const localRem = getReminderTasks();
    let serverMapped: ScheduledTask[] = [];
    if (canUseServerTasks && session) {
      try {
        const srv = await fetchStockCollabTasks({
          requesterUserId: session.id,
          requesterRole: session.role ?? "",
        });
        serverMapped = (srv ?? []).map(mapCollabRowToScheduledTask);
      } catch {
        serverMapped = [];
      }
    }
    setTasks(sortScheduledTasksForDisplay([...serverMapped, ...localRem, ...low]));
  }, [canUseServerTasks, session]);

  useEffect(() => {
    void reload();
    const u1 = subscribeScheduledTasks(() => void reload());
    const u2 = subscribeCollabTasks(() => void reload());
    return () => {
      u1();
      u2();
    };
  }, [reload]);

  useEffect(() => {
    if (!open || !canUseServerTasks) return;
    fetchStockRoles()
      .then(setRoles)
      .catch(() => setRoles([]));
  }, [open, canUseServerTasks]);

  useEffect(() => {
    if (open && typeof Notification !== "undefined") {
      setPerm(Notification.permission);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEditingTaskId(null);
      setEditingFromServer(false);
      setEditingKind(undefined);
      form.resetFields();
    }
  }, [open, form]);

  useEffect(() => {
    if (!open || !editingTaskId) return;
    const task = tasks.find((x) => x.id === editingTaskId);
    if (!task || task.kind === "low_stock") return;
    if (task.kind === "circuit_validate" || task.kind === "circuit_fill") return;
    const timer = window.setTimeout(() => {
      form.setFieldsValue({
        title: task.title,
        at: dayjs(task.at),
        description: task.description ?? "",
        visibility: (task.visibility as StockCollabTaskVisibility) ?? "public",
        visibleRoleId: task.visibleRoleId?.trim() || undefined,
      });
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
    setEditingFromServer(false);
    setEditingKind(undefined);
    form.resetFields();
  };

  const handleSaveTask = async () => {
    if (!session?.id) return;
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
    const visibility = v.visibility ?? "public";
    if (visibility === "role" && !(v.visibleRoleId && String(v.visibleRoleId).trim())) {
      message.warning(T[25]);
      return;
    }
    const atIso = new Date(atMs).toISOString();
    const desc = v.description?.trim() ?? "";

    if (canUseServerTasks) {
      try {
        await upsertStockCollabTask({
          requesterUserId: session.id,
          requesterRole: session.role ?? "",
          id: editingTaskId && editingFromServer ? editingTaskId : undefined,
          title,
          description: desc,
          at: atIso,
          visibility,
          visibleRoleId: visibility === "role" ? v.visibleRoleId?.trim() : undefined,
        });
        if (editingTaskId && !editingFromServer) {
          saveReminderTasksPreservingLowStock(getReminderTasks().filter((x) => x.id !== editingTaskId));
        }
        message.success(editingTaskId && editingFromServer ? T[15] : T[12]);
        cancelEdit();
        dispatchCollabTasksChanged();
        void reload();
      } catch (e) {
        message.error(String(e));
      }
      return;
    }

    if (editingTaskId) {
      const next = getReminderTasks().map((x) =>
        x.id === editingTaskId ? { ...x, title, at: atIso, kind: "reminder" as const } : x,
      );
      saveReminderTasksPreservingLowStock(next);
      message.success(T[15]);
      cancelEdit();
    } else {
      const next: ScheduledTask[] = [
        ...getReminderTasks(),
        { id: newId(), title, at: atIso, kind: "reminder" },
      ];
      saveReminderTasksPreservingLowStock(next);
      form.resetFields();
      message.success(T[12]);
    }
    void reload();
  };

  const confirmDeleteEditing = () => {
    if (!editingTaskId) return;
    if (editingFromServer && canUseServerTasks && session) {
      Modal.confirm({
        title: T[16],
        okText: getPageTexts("stockArticles")[15],
        cancelText: getPageTexts("stockArticles")[16],
        onOk: async () => {
          try {
            await completeStockCollabTask({
              id: editingTaskId,
              requesterUserId: session.id,
              requesterRole: session.role ?? "",
            });
            cancelEdit();
            dispatchCollabTasksChanged();
            void reload();
          } catch (e) {
            message.error(String(e));
          }
        },
      });
      return;
    }
    Modal.confirm({
      title: T[16],
      okText: getPageTexts("stockArticles")[15],
      cancelText: getPageTexts("stockArticles")[16],
      onOk: () => {
        saveReminderTasksPreservingLowStock(getReminderTasks().filter((x) => x.id !== editingTaskId));
        cancelEdit();
        void reload();
      },
    });
  };

  const columns: ColumnsType<ScheduledTask> = [
    {
      title: T[17],
      key: "done",
      width: 56,
      align: "center",
      render: (_, record) =>
        record.kind === "circuit_validate" || record.kind === "circuit_fill" ? null : (
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox
            aria-label={T[17]}
            onChange={() => {
              void (async () => {
                if (record.fromServer && session?.id) {
                  try {
                    await completeStockCollabTask({
                      id: record.id,
                      requesterUserId: session.id,
                      requesterRole: session.role ?? "",
                    });
                    dispatchCollabTasksChanged();
                  } catch (e) {
                    message.error(String(e));
                  }
                } else {
                  completeScheduledTask(record);
                }
                void reload();
              })();
            }}
          />
        </span>
      ),
    },
    {
      title: T[2],
      dataIndex: "title",
      key: "title",
      render: (text: string, record) => (
        <span>
          {record.kind === "low_stock" ? (
            <Tag color="orange" style={{ marginInlineEnd: 8 }}>
              {T[18]}
            </Tag>
          ) : null}
          {record.kind === "circuit_validate" ? (
            <Tag color="blue" style={{ marginInlineEnd: 8 }}>
              {T[26]}
            </Tag>
          ) : null}
          {record.kind === "circuit_fill" ? (
            <Tag color="geekblue" style={{ marginInlineEnd: 8 }}>
              {T[27]}
            </Tag>
          ) : null}
          {text}
        </span>
      ),
    },
    {
      title: T[3],
      dataIndex: "at",
      key: "at",
      width: 200,
      render: (iso: string, record) =>
        record.kind === "low_stock" ? "—" : iso ? dayjs(iso).format("DD/MM/YYYY HH:mm") : "",
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
      width={780}
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
      <Form
          form={form}
          layout="vertical"
          style={{ marginBottom: 16 }}
          initialValues={{ visibility: "public" as StockCollabTaskVisibility, description: "" }}
        >
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
            {canUseServerTasks ? (
              <>
                <Form.Item name="visibility" label={T[20]} style={{ minWidth: 200, marginBottom: 0 }}>
                  <Select
                    style={{ width: "100%" }}
                    options={[
                      { value: "public", label: T[21] },
                      { value: "private", label: T[22] },
                      { value: "role", label: T[23] },
                    ]}
                  />
                </Form.Item>
                <Form.Item noStyle shouldUpdate={(p, c) => p.visibility !== c.visibility}>
                  {({ getFieldValue }) =>
                    getFieldValue("visibility") === "role" ? (
                      <Form.Item
                        name="visibleRoleId"
                        label={T[24]}
                        rules={[{ required: true, message: T[25] }]}
                        style={{ minWidth: 220, marginBottom: 0 }}
                      >
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          placeholder={T[25]}
                          options={roles.map((r) => ({ value: r.id, label: r.name }))}
                        />
                      </Form.Item>
                    ) : null
                  }
                </Form.Item>
                <Form.Item name="description" label={T[28]} style={{ flex: "1 1 100%", minWidth: 280, marginBottom: 0 }}>
                  <Input.TextArea rows={2} placeholder={T[28]} allowClear />
                </Form.Item>
              </>
            ) : null}
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
        onRow={(record) =>
          record.kind === "low_stock"
            ? { style: { cursor: "default" } }
            : {
                onClick: () => {
                  if (record.kind === "circuit_validate" || record.kind === "circuit_fill") {
                    if (!record.circuitId?.trim() || record.circuitStepIndex === undefined) {
                      message.warning("Tâche circuit incomplète (identifiant manquant).");
                      return;
                    }
                    setCircuitFormTask(record);
                    return;
                  }
                  setEditingTaskId(record.id);
                  setEditingFromServer(Boolean(record.fromServer));
                  setEditingKind(record.kind);
                },
                style: { cursor: "pointer" },
              }
        }
      />
      <CircuitTaskFormModal
        open={Boolean(circuitFormTask)}
        task={circuitFormTask}
        onClose={() => setCircuitFormTask(null)}
        onCompleted={() => void reload()}
      />
    </Modal>
  );
}
