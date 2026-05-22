import { useCallback, useEffect, useState } from "react";
import { Card, Descriptions, Popconfirm, Space, Tag, Typography, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import { Button, Loading, Modal, Table } from "../../../items";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import { deleteStockFormTemplate, fetchStockFormTemplates, type StockFormTemplateRow } from "../../../lib/stockApi";
import { hasStockPrivilege } from "../../utils/stockPrivileges";
import { stockFormTemplateScreenLabel } from "../../utils/stockFormTemplateScreens";

const { Text } = Typography;

export default function StockFormTemplatesList() {
  const T = usePageTexts("stockFormTemplates");
  const roleTx = getPageTexts("stockRoles");
  const cancelLabel = roleTx[7];
  const { session } = useSession();
  const navigate = useNavigate();
  const canManage = hasStockPrivilege(session, "circuits_manage");
  const [rows, setRows] = useState<StockFormTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailRow, setDetailRow] = useState<StockFormTemplateRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchStockFormTemplates());
    } catch (e) {
      message.error(String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<StockFormTemplateRow> = [
    {
      title: T[18] ?? "Écran",
      dataIndex: "screenType",
      key: "screenType",
      width: 180,
      render: (v?: string) => stockFormTemplateScreenLabel(v),
    },
    {
      title: T[4],
      dataIndex: "name",
      key: "name",
      render: (name: string, r) => (
        <Space>
          {r.isSystem ? (
            <Tag color="blue">{T[11]}</Tag>
          ) : null}
          <Text>{name}</Text>
        </Space>
      ),
    },
    {
      title: T[5],
      dataIndex: "description",
      key: "description",
    },
  ];

  const closeDetail = () => setDetailRow(null);

  const onDeleteFromModal = async () => {
    if (!detailRow || detailRow.isSystem) return;
    try {
      await deleteStockFormTemplate(detailRow.id);
      message.success(T[9]);
      closeDetail();
      void load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const editLabel = (r: StockFormTemplateRow) => (!canManage ? T[12] : r.isSystem ? T[12] : T[3]);

  return (
    <Loading spinning={loading}>
      <Card
        title={T[0]}
        extra={
          canManage ? (
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => navigate("/stock/circuits/forms/new")}>
              {T[2]}
            </Button>
          ) : null
        }
      >
        <Typography.Paragraph type="secondary">{T[1]}</Typography.Paragraph>
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: T[10] }}
          onRow={(r) => ({
            onClick: () => setDetailRow(r),
            style: { cursor: "pointer" },
          })}
        />
      </Card>

      <Modal
        title={
          detailRow ? (
            <Space>
              {detailRow.isSystem ? <Tag color="blue">{T[11]}</Tag> : null}
              <span>{detailRow.name}</span>
            </Space>
          ) : (
            T[0]
          )
        }
        open={Boolean(detailRow)}
        onCancel={closeDetail}
        footer={
          detailRow ? (
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button onClick={closeDetail}>{cancelLabel}</Button>
              {canManage && !detailRow.isSystem ? (
                <Popconfirm title={roleTx[13]} onConfirm={() => void onDeleteFromModal()} okText={T[8]} cancelText={cancelLabel}>
                  <Button danger>{T[8]}</Button>
                </Popconfirm>
              ) : null}
              <Button
                onClick={() => {
                  navigate(`/stock/circuits/forms/new?clone=${encodeURIComponent(detailRow.id)}`);
                  closeDetail();
                }}
              >
                {getPageTexts("stockCommon")[0]}
              </Button>
              <Button
                type="primary"
                onClick={() => {
                  navigate(`/stock/circuits/forms/${detailRow.id}/edit`);
                  closeDetail();
                }}
              >
                {editLabel(detailRow)}
              </Button>
            </Space>
          ) : null
        }
        destroyOnHidden
        width={520}
      >
        {detailRow ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={T[18] ?? "Écran"}>
              {stockFormTemplateScreenLabel(detailRow.screenType)}
            </Descriptions.Item>
            <Descriptions.Item label={T[5]}>{detailRow.description?.trim() ? detailRow.description : "—"}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>
    </Loading>
  );
}
