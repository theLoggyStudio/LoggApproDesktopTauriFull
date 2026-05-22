import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Descriptions, Popconfirm, Space, Switch, Table, Typography, message } from "antd";
import { CopyOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Button, Loading, Modal } from "../../../items";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import {
  deleteStockCircuit,
  fetchStockCircuits,
  setStockCircuitActive,
  type StockCircuitRow,
} from "../../../lib/stockApi";
import { hasStockPrivilege } from "../../utils/stockPrivileges";

const { Paragraph, Text } = Typography;

export default function StockCircuitList() {
  const C = usePageTexts("stockCircuits");
  const roleTx = getPageTexts("stockRoles");
  const { session } = useSession();
  const navigate = useNavigate();
  const canManage = hasStockPrivilege(session, "circuits_manage");
  const [rows, setRows] = useState<StockCircuitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailRow, setDetailRow] = useState<StockCircuitRow | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchStockCircuits()
      .then(setRows)
      .catch((e) => message.error(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns: ColumnsType<StockCircuitRow> = [
    { title: C[3], dataIndex: "name", key: "name" },
    { title: C[4], dataIndex: "description", key: "description", width: 280 },
    {
      title: C[5],
      dataIndex: "active",
      key: "active",
      width: 90,
      render: (a: boolean, r) => (
        <Switch
          checked={a}
          size="small"
          disabled={!canManage}
          onClick={(_, e) => e.stopPropagation()}
          onChange={async (checked) => {
            if (!canManage) return;
            try {
              await setStockCircuitActive(r.id, checked);
              setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: checked } : x)));
            } catch (err) {
              message.error(String(err));
            }
          }}
        />
      ),
    },
  ];

  const onDelete = async (id: string) => {
    try {
      await deleteStockCircuit(id);
      message.success(C[32]);
      setDetailRow(null);
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  return (
    <Card
      title={
        <Space>
          <span>{C[0]}</span>
          {canManage ? (
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => navigate("/stock/circuits/new")}>
              {C[2]}
            </Button>
          ) : null}
        </Space>
      }
    >
      <Paragraph type="secondary">{C[1]}</Paragraph>
      <Loading spinning={loading}>
        {rows.length === 0 && !loading ? (
          <Text type="secondary">{C[28]}</Text>
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            pagination={{ pageSize: 10 }}
            size="small"
            onRow={(r) => ({
              onClick: () => setDetailRow(r),
              style: { cursor: "pointer" },
            })}
          />
        )}
      </Loading>

      <Modal
        title={detailRow?.name ?? C[0]}
        open={Boolean(detailRow)}
        onCancel={() => setDetailRow(null)}
        footer={
          detailRow && canManage ? (
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Popconfirm title={C[33]} onConfirm={() => void onDelete(detailRow.id)} okText={roleTx[8]} cancelText={C[25]}>
                <Button danger>{C[27]}</Button>
              </Popconfirm>
              <Button
                type="text"
                icon={<CopyOutlined />}
                aria-label={getPageTexts("stockCommon")[0]}
                title={getPageTexts("stockCommon")[0]}
                onClick={() => {
                  navigate(`/stock/circuits/new?clone=${encodeURIComponent(detailRow.id)}`);
                  setDetailRow(null);
                }}
              />
              <Button
                type="primary"
                onClick={() => {
                  navigate(`/stock/circuits/${detailRow.id}/edit`);
                  setDetailRow(null);
                }}
              >
                {C[26]}
              </Button>
            </Space>
          ) : null
        }
        destroyOnHidden
        width={520}
      >
        {detailRow ? (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={C[4]}>{detailRow.description?.trim() ? detailRow.description : "—"}</Descriptions.Item>
              <Descriptions.Item label={C[5]}>
                <Switch
                  checked={detailRow.active}
                  size="small"
                  disabled={!canManage}
                  onChange={async (checked) => {
                    if (!canManage) return;
                    try {
                      await setStockCircuitActive(detailRow.id, checked);
                      setDetailRow({ ...detailRow, active: checked });
                      setRows((prev) =>
                        prev.map((x) => (x.id === detailRow.id ? { ...x, active: checked } : x)),
                      );
                    } catch (err) {
                      message.error(String(err));
                    }
                  }}
                />
              </Descriptions.Item>
            </Descriptions>
          </>
        ) : null}
      </Modal>
    </Card>
  );
}
