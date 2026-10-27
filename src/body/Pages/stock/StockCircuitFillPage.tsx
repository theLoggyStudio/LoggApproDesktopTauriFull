import { useCallback, useEffect, useState } from "react";
import { Space, Tag, Typography, message } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Alert, Button, Loading, Table } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import {
  createCircuitStepCollabTask,
  fetchRoleCircuitEntries,
  fetchStockCollabTasks,
  type StockRoleCircuitEntry,
} from "../../../lib/stockApi";
import {
  dispatchCollabTasksChanged,
  mapCollabRowToScheduledTask,
  type ScheduledTask,
} from "../../utils/scheduledTasksStore";
import { hasStockScreenAccess } from "../../utils/stockPrivileges";
import { CircuitTaskFormModal } from "./CircuitTaskFormModal";

const { Title, Paragraph, Text } = Typography;

export default function StockCircuitFillPage() {
  const T = usePageTexts("stockCircuitFill");
  const { session } = useSession();
  const canCircuits = hasStockScreenAccess(session, "circuits");
  const [entries, setEntries] = useState<StockRoleCircuitEntry[]>([]);
  const [pendingTasks, setPendingTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [formTask, setFormTask] = useState<ScheduledTask | null>(null);

  const load = useCallback(async () => {
    if (!session?.id || !canCircuits) {
      setEntries([]);
      setPendingTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [ents, tasks] = await Promise.all([
        fetchRoleCircuitEntries({
          requesterUserId: session.id,
          requesterRole: session.role ?? "",
        }),
        fetchStockCollabTasks({
          requesterUserId: session.id,
          requesterRole: session.role ?? "",
        }),
      ]);
      setEntries(ents ?? []);
      setPendingTasks(
        (tasks ?? [])
          .filter((t) => t.kind === "circuit_fill" && (t.status ?? "pending") === "pending")
          .map(mapCollabRowToScheduledTask),
      );
    } catch (e) {
      message.error(String(e));
      setEntries([]);
      setPendingTasks([]);
    } finally {
      setLoading(false);
    }
  }, [session, canCircuits]);

  useEffect(() => {
    void load();
  }, [load]);

  const startFill = async (entry: StockRoleCircuitEntry) => {
    if (!session?.id) return;
    if (!entry.active) {
      message.warning(T[8]);
      return;
    }
    if (!entry.canStart && session.role !== "sadmin") {
      message.warning(T[1]);
      return;
    }
    setStartingId(entry.circuitId);
    try {
      const res = await createCircuitStepCollabTask({
        requesterUserId: session.id,
        circuitId: entry.circuitId,
        stepIndex: entry.firstStepIndex ?? 0,
        variant: "fill",
      });
      dispatchCollabTasksChanged();
      const task: ScheduledTask = {
        id: res.id,
        title: entry.circuitName,
        at: new Date().toISOString(),
        kind: "circuit_fill",
        fromServer: true,
        status: "pending",
        circuitId: entry.circuitId,
        circuitStepIndex: entry.firstStepIndex ?? 0,
      };
      setFormTask(task);
      await load();
    } catch (e) {
      message.error(String(e));
    } finally {
      setStartingId(null);
    }
  };

  const circuitCols: ColumnsType<StockRoleCircuitEntry> = [
    {
      title: T[4],
      dataIndex: "circuitName",
      key: "circuitName",
    },
    {
      title: T[9] ?? T[8],
      dataIndex: "active",
      key: "active",
      width: 110,
      render: (a: boolean) =>
        a ? <Tag color="green">{T[9]}</Tag> : <Tag>{T[10]}</Tag>,
    },
    {
      title: T[2],
      key: "actions",
      width: 200,
      render: (_, row) => (
        <Button
          type="primary"
          size="small"
          icon={<PlayCircleOutlined />}
          loading={startingId === row.circuitId}
          disabled={!row.active || (!row.canStart && session?.role !== "sadmin")}
          onClick={() => void startFill(row)}
        >
          {T[3]}
        </Button>
      ),
    },
  ];

  const taskCols: ColumnsType<ScheduledTask> = [
    { title: T[5], dataIndex: "title", key: "title" },
    {
      title: T[2],
      key: "open",
      width: 140,
      render: (_, row) => (
        <Button size="small" type="link" onClick={() => setFormTask(row)}>
          {T[2]}
        </Button>
      ),
    },
  ];

  if (!canCircuits) {
    return (
      <Alert type="warning" showIcon message={T[6]} />
    );
  }

  return (
    <Loading spinning={loading}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <div>
          <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
            {T[0]}
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {T[1]}
          </Paragraph>
        </div>

        <div>
          <Text strong style={{ display: "block", marginBottom: 8 }}>
            {T[4]}
          </Text>
          <Table
            rowKey="circuitId"
            columns={circuitCols}
            dataSource={entries}
            locale={{ emptyText: T[6] }}
            pagination={{ pageSize: 8 }}
            size="small"
          />
        </div>

        <div>
          <Text strong style={{ display: "block", marginBottom: 8 }}>
            {T[5]}
          </Text>
          <Table
            rowKey="id"
            columns={taskCols}
            dataSource={pendingTasks}
            locale={{ emptyText: T[7] }}
            pagination={{ pageSize: 8 }}
            size="small"
          />
        </div>
      </Space>

      <CircuitTaskFormModal
        open={!!formTask}
        task={formTask}
        onClose={() => setFormTask(null)}
        onCompleted={() => {
          setFormTask(null);
          void load();
        }}
      />
    </Loading>
  );
}
