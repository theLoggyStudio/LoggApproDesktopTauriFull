import { useEffect, useState } from "react";
import { Card, Col, Row, Space, Statistic, Tag, Typography } from "antd";
import { Button, Loading, Table } from "../../../items";
import { useNavigate } from "react-router-dom";
import { WarningOutlined, ReloadOutlined, PrinterOutlined } from "@ant-design/icons";
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
import { canPrintStockDashboard, hasStockPrivilege } from "../../utils/stockPrivileges";
import { StockPrintModal } from "./StockPrintModal";
import { buildPrintTableHtml, sortByIsoDate, sortByNumber } from "../../utils/stockBrowserPrint";
import { printStockListWithOptionalTemplate } from "../../utils/stockListPrintWithTemplate";

const { Title, Text } = Typography;

export default function StockDashboard() {
  const navigate = useNavigate();
  const T = usePageTexts("stockDashboard");
  const Prt = usePageTexts("stockPrint");
  const { session } = useSession();
  const showCharts = hasStockPrivilege(session, "dashboard_charts");
  const canPrint = canPrintStockDashboard(session);
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [printOpen, setPrintOpen] = useState(false);

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

  const runPrint = async (listKey: string, sort: "asc" | "desc", modelId: string) => {
    if (listKey === "recent") {
      const list = sortByIsoDate([...(data?.recentMovements ?? [])], "createdAt", sort);
      const headers = [T[5], T[6], T[7], T[8], T[15], T[9]];
      const body = list.map((r) => {
        const u = r.moveType?.toUpperCase();
        const tiers =
          u === "IN" ? (r.supplierName ?? "") : u === "OUT" ? (r.clientName ?? "") : "";
        return [
          r.sku,
          r.articleName,
          moveLabel(r.moveType),
          String(r.qty),
          tiers,
          r.createdAt ? dayjs(r.createdAt).format("DD/MM/YYYY HH:mm") : "",
        ];
      });
      return await printStockListWithOptionalTemplate(
        "dashboard_recent",
        `${T[0]} — ${Prt[0]}`,
        buildPrintTableHtml(T[18] ?? T[4], headers, body),
        modelId,
      );
    }
    if (listKey === "categories") {
      const list = sortByNumber([...chartCat], "qty", sort);
      const headers = [T[17], T[8]];
      const body = list.map((r) => [r.name, String(r.qty)]);
      return await printStockListWithOptionalTemplate(
        "dashboard_categories",
        `${T[0]} — ${Prt[0]}`,
        buildPrintTableHtml(T[19] ?? T[17], headers, body),
        modelId,
      );
    }
    return false;
  };

  return (
    <Loading spinning={loading}>
      <Space align="start" style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }}>
        <Title level={3} style={{ margin: 0 }}>
          {T[0]}
        </Title>
        <Button
          type="text"
          icon={<PrinterOutlined />}
          disabled={!canPrint}
          aria-label={Prt[0] ?? "Exporter en PDF"}
          title={Prt[0] ?? "Exporter en PDF"}
          onClick={() => {
            if (canPrint) setPrintOpen(true);
          }}
        />
      </Space>
      <StockPrintModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        lists={[
          { value: "recent", label: T[18] ?? T[4] },
          { value: "categories", label: T[19] ?? T[17] },
        ]}
        onPrint={runPrint}
      />
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

      <Card
        style={{ marginTop: 24 }}
        title={T[4]}
        extra={
          <Space>
            <Button type="link" style={{ paddingInline: 4 }} onClick={() => navigate("/stock/movements")}>
              {T[20] ?? "Voir tous les mouvements"}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={load}>
              {T[14]}
            </Button>
          </Space>
        }
      >
        <Table
          size="small"
          rowKey="id"
          pagination={{ pageSize: 10, showSizeChanger: false }}
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
