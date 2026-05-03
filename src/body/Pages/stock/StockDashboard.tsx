import { useEffect, useState } from "react";
import { Card, Col, Row, Statistic, Tag, Typography } from "antd";
import { Button, Loading, Table } from "../../../items";
import { WarningOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { fetchDashboardStats, type DashboardStats } from "../../../lib/stockApi";
import { useSession } from "../../context/SessionContext";
import { hasStockPrivilege } from "../../utils/stockPrivileges";

const { Title, Text } = Typography;

export default function StockDashboard() {
  const T = usePageTexts("stockDashboard");
  const { session } = useSession();
  const showCharts = hasStockPrivilege(session, "dashboard_charts");
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchDashboardStats()
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const moveLabel = (t: string) => {
    const u = t.toUpperCase();
    if (u === "IN") return T[10];
    if (u === "OUT") return T[11];
    if (u === "ADJ") return T[12];
    return t;
  };

  const chartMv = data?.chartMovements14d ?? [];
  const chartCat = data?.chartCategoryQty ?? [];

  return (
    <Loading spinning={loading}>
      <Title level={3}>{T[0]}</Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title={T[1]} value={data?.totalArticles ?? 0} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title={T[2]} value={data?.totalQty ?? 0} precision={2} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title={T[3]}
              value={data?.lowStockCount ?? 0}
              prefix={data && data.lowStockCount > 0 ? <WarningOutlined style={{ color: "#faad14" }} /> : null}
            />
          </Card>
        </Col>
      </Row>

      {showCharts && (chartMv.length > 0 || chartCat.length > 0) ? (
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          {chartMv.length > 0 ? (
            <Col xs={24} lg={14}>
              <Card title={T[16]}>
                <div style={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer>
                    <LineChart data={chartMv} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={(d) => (d ? dayjs(d).format("DD/MM") : "")} />
                      <YAxis />
                      <Tooltip
                        labelFormatter={(d) => (d ? dayjs(String(d)).format("DD/MM/YYYY") : "")}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="inQty" name={T[10]} stroke="#52c41a" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="outQty" name={T[11]} stroke="#ff4d4f" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="adjQty" name={T[12]} stroke="#1677ff" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
          ) : null}
          {chartCat.length > 0 ? (
            <Col xs={24} lg={chartMv.length > 0 ? 10 : 24}>
              <Card title={T[17]}>
                <div style={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer>
                    <BarChart data={chartCat} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={70} tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="qty" fill="#1677ff" name={T[8]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
          ) : null}
        </Row>
      ) : null}

      <Card style={{ marginTop: 24 }} title={T[4]} extra={<Button icon={<ReloadOutlined />} onClick={load}>{T[14]}</Button>}>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          locale={{ emptyText: T[13] }}
          dataSource={data?.recentMovements ?? []}
          columns={[
            { title: T[5], dataIndex: "sku", key: "sku" },
            { title: T[6], dataIndex: "articleName", key: "articleName" },
            {
              title: T[7],
              dataIndex: "moveType",
              key: "moveType",
              render: (v: string) => <Tag color={v === "IN" ? "green" : v === "OUT" ? "red" : "blue"}>{moveLabel(v)}</Tag>,
            },
            { title: T[8], dataIndex: "qty", key: "qty" },
            {
              title: T[15],
              key: "tiers",
              ellipsis: true,
              render: (_, row) => {
                const u = row.moveType?.toUpperCase();
                if (u === "IN") return row.supplierName ?? "";
                if (u === "OUT") return row.clientName ?? "";
                return "";
              },
            },
            {
              title: T[9],
              dataIndex: "createdAt",
              key: "createdAt",
              render: (s: string) => <Text type="secondary">{s ? dayjs(s).format("DD/MM/YYYY HH:mm") : ""}</Text>,
            },
          ]}
        />
      </Card>
    </Loading>
  );
}
