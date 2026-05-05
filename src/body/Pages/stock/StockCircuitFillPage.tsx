import { useCallback, useEffect, useState } from "react";
import { Card, Space, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Button, Loading, Table } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import { fetchStockCollabTasks } from "../../../lib/stockApi";
import {
  mapCollabRowToScheduledTask,
  sortScheduledTasksForDisplay,
  type ScheduledTask,
} from "../../utils/scheduledTasksStore";
import { CircuitTaskFormModal } from "./CircuitTaskFormModal";

export default function StockCircuitFillPage() {
  const T = usePageTexts("stockCircuitFill");
  const Ta = usePageTexts("stockScheduledTasks");
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<ScheduledTask | null>(null);

  const canUseServerTasks =
    Boolean(session?.id) && (session?.role === "stock_user" || session?.role === "sadmin");

  const load = useCallback(async () => {
    if (!canUseServerTasks || !session) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const srv = await fetchStockCollabTasks({
        requesterUserId: session.id,
        requesterRole: session.role ?? "",
      });
      const mapped = (srv ?? []).map(mapCollabRowToScheduledTask);
      const circuit = mapped.filter(
        (x) =>
          (x.kind === "circuit_fill" || x.kind === "circuit_validate") &&
          Boolean(x.circuitId?.trim()) &&
          x.circuitStepIndex !== undefined,
      );
      setTasks(sortScheduledTasksForDisplay(circuit));
    } catch (e) {
      message.error(String(e));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [canUseServerTasks, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<ScheduledTask> = [
    {
      title: Ta[2],
      dataIndex: "title",
      key: "title",
      ellipsis: true,
      render: (text: string, record) => (
        <Space wrap>
          {record.kind === "circuit_validate" ? (
            <Tag color="blue">{Ta[26]}</Tag>
          ) : (
            <Tag color="geekblue">{Ta[27]}</Tag>
          )}
          <span>{text}</span>
        </Space>
      ),
    },
    {
      title: Ta[3],
      dataIndex: "at",
      key: "at",
      width: 180,
      render: (iso: string) => (iso ? new Date(iso).toLocaleString("fr-FR") : ""),
    },
    {
      title: "",
      key: "go",
      width: 120,
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          onClick={() => {
            setActiveTask(record);
            setModalOpen(true);
          }}
        >
          {T[2]}
        </Button>
      ),
    },
  ];

  return (
    <Loading spinning={loading}>
      <Card title={T[0]}>
        <Typography.Paragraph type="secondary">{T[1]}</Typography.Paragraph>
        {!canUseServerTasks ? (
          <Typography.Text type="secondary">{Ta[8]}</Typography.Text>
        ) : (
          <Table rowKey="id" size="small" columns={columns} dataSource={tasks} pagination={false} locale={{ emptyText: Ta[6] }} />
        )}
      </Card>
      <CircuitTaskFormModal
        open={modalOpen}
        task={activeTask}
        onClose={() => {
          setModalOpen(false);
          setActiveTask(null);
        }}
        onCompleted={() => void load()}
      />
    </Loading>
  );
}
