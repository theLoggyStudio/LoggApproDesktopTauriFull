import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Form, Input, InputNumber, Select, Typography, message, Space } from "antd";
import { Alert, Button, Loading, Modal, Table } from "../../../items";
import { PlusOutlined, DeleteOutlined, PrinterOutlined, CopyOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import {
  canPrintStockRefCategories,
  canPrintStockRefCurrencies,
  canPrintStockRefLocations,
  canPrintStockRefUnits,
  hasRefLocationCreate,
  hasRefLocationDelete,
  hasRefLocationEdit,
  hasRefLocationView,
  hasStockPrivilege,
} from "../../utils/stockPrivileges";
import { deleteRefItem, fetchRefItems, upsertRefItem, type StockRefItem, type StockRefKind } from "../../../lib/stockApi";
import StockDataIoBar from "./StockDataIoBar";
import { StockPrintModal } from "./StockPrintModal";
import { buildPrintTableHtml, sortByIsoDate } from "../../utils/stockBrowserPrint";
import { printStockListWithOptionalTemplate } from "../../utils/stockListPrintWithTemplate";
import { labelForPaymentPeriod, paymentPeriodSelectOptions } from "../../utils/stockLocationPaymentPeriod";

const { Title, Paragraph, Text } = Typography;

type PageKey =
  | "stockArticleUnits"
  | "stockArticleLocations"
  | "stockArticleCategories"
  | "stockArticleCurrencies";

type Props = {
  kind: Exclude<StockRefKind, "warehouse">;
  pageKey: PageKey;
  /** Filtrage / création des emplacements pour un entrepôt (écran Entrepôt). */
  warehouseId?: string;
  /** `inline` : formulaire au-dessus du tableau (création / édition / suppression comme avant). */
  formVariant?: "modal" | "inline";
};

type FormVals = {
  name: string;
  code: string;
  housingFee?: number;
  paymentPeriod?: string;
};

export function StockRefItemsPage({ kind, pageKey, warehouseId, formVariant = "modal" }: Props) {
  const T = usePageTexts(pageKey);
  const Prt = usePageTexts("stockPrint");
  const W = usePageTexts("stockWarehouseNav");
  const { session } = useSession();
  const isInline = formVariant === "inline";
  const isLoc = kind === "location";
  const canLocView = !isLoc || hasRefLocationView(session);
  const canLocCreate = !isLoc || hasRefLocationCreate(session);
  const canLocEdit = !isLoc || hasRefLocationEdit(session);
  const canLocDelete = !isLoc || hasRefLocationDelete(session);
  const canLocCsvImport = isLoc && hasStockPrivilege(session, "ref_locations_import") && canLocCreate;
  const canLocCsvExport = isLoc && hasStockPrivilege(session, "ref_locations_export") && canLocView;

  const canPrint = useMemo(() => {
    if (kind === "unit") return canPrintStockRefUnits(session);
    if (kind === "category") return canPrintStockRefCategories(session);
    if (kind === "currency") return canPrintStockRefCurrencies(session);
    return canPrintStockRefLocations(session);
  }, [kind, session]);

  const printListLabel = useMemo(() => {
    if (pageKey === "stockArticleUnits") return T[12];
    if (pageKey === "stockArticleCategories") return T[13];
    if (pageKey === "stockArticleCurrencies") return T[13];
    if (pageKey === "stockArticleLocations") return T[24];
    return T[0];
  }, [pageKey, T]);

  const [rows, setRows] = useState<StockRefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [form] = Form.useForm<FormVals>();

  const load = useCallback(() => {
    if (isLoc && !hasRefLocationView(session)) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const locOpts = kind === "location" && warehouseId ? { warehouseId } : undefined;
    fetchRefItems(kind, locOpts)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [kind, warehouseId, isLoc, session]);

  const setFormFromRow = (row: StockRefItem) => {
    form.setFieldsValue({
      name: row.name,
      code: row.code ?? "",
      housingFee: Number(row.housingFee ?? 0),
      paymentPeriod: row.paymentPeriod ?? "",
    });
  };

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isInline) {
      const timer = window.setTimeout(() => {
        if (editingId) {
          const row = rows.find((x) => x.id === editingId);
          if (row) {
            if (isLoc) setFormFromRow(row);
            else form.setFieldsValue({ name: row.name, code: row.code ?? "" });
          }
        } else {
          form.resetFields();
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (!modalOpen) return;
    const timer = window.setTimeout(() => {
      if (editingId) {
        const row = rows.find((x) => x.id === editingId);
        if (row) {
          if (isLoc) setFormFromRow(row);
          else form.setFieldsValue({ name: row.name, code: row.code ?? "" });
        }
      } else {
        form.resetFields();
        if (isLoc) form.setFieldsValue({ housingFee: 0, paymentPeriod: "" });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isInline, modalOpen, editingId, rows, form, isLoc]);

  const openCreate = () => {
    if (isLoc && !canLocCreate) return;
    setEditingId(null);
    if (isInline) {
      form.resetFields();
      if (isLoc) form.setFieldsValue({ housingFee: 0, paymentPeriod: "" });
    } else {
      setModalOpen(true);
    }
  };

  const openEdit = (r: StockRefItem) => {
    if (isLoc && !canLocEdit) return;
    setEditingId(r.id);
    if (!isInline) setModalOpen(true);
  };

  const duplicateRefFromModal = () => {
    const v = form.getFieldsValue() as FormVals;
    const sfx = getPageTexts("stockCommon")[1] || " (copie)";
    const nm = (v.name ?? "").trim();
    form.setFieldsValue({
      ...v,
      name: nm ? `${nm}${sfx}` : nm,
      code: (v.code ?? "").trim(),
    });
    setEditingId(null);
  };

  const onSave = async () => {
    if (isLoc) {
      if (editingId && !canLocEdit) return;
      if (!editingId && !canLocCreate) return;
    }
    const v = await form.validateFields().catch(() => null);
    if (!v?.name?.trim()) {
      message.warning(T[11]);
      return;
    }
    try {
      const body: Parameters<typeof upsertRefItem>[1] = {
        id: editingId ?? undefined,
        name: v.name.trim(),
        code: v.code?.trim() ?? "",
      };
      if (kind === "location" && warehouseId && !editingId) {
        body.warehouseId = warehouseId;
      }
      if (isLoc) {
        body.housingFee = Number(v.housingFee ?? 0);
        body.paymentPeriod = v.paymentPeriod ?? "";
      }
      await upsertRefItem(kind, body);
      message.success(T[10]);
      if (!isInline) setModalOpen(false);
      if (isInline) {
        setEditingId(null);
        form.resetFields();
      }
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const onDelete = async (id: string) => {
    if (isLoc && !canLocDelete) return;
    try {
      await deleteRefItem(kind, id);
      message.success(T[12]);
      if (!isInline) setModalOpen(false);
      setEditingId(null);
      if (isInline) form.resetFields();
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const editLbl = getPageTexts("stockArticles")[11];

  const confirmDeleteEditing = () => {
    if (!editingId) return;
    Modal.confirm({
      title: T[8],
      okText: getPageTexts("stockArticles")[15],
      cancelText: getPageTexts("stockArticles")[16],
      onOk: () => onDelete(editingId),
    });
  };

  const csvTable =
    kind === "unit"
      ? "ref_unit"
      : kind === "location"
        ? "ref_location"
        : kind === "currency"
          ? "ref_currency"
          : "ref_category";
  const importPriv =
    kind === "unit"
      ? "ref_units_import"
      : kind === "location"
        ? "ref_locations_import"
        : kind === "currency"
          ? "ref_currencies_import"
          : "ref_categories_import";
  const exportPriv =
    kind === "unit"
      ? "ref_units_export"
      : kind === "location"
        ? "ref_locations_export"
        : kind === "currency"
          ? "ref_currencies_export"
          : "ref_categories_export";

  const importPass = isLoc ? (canLocCsvImport ? importPriv : undefined) : importPriv;
  const exportPass = isLoc ? (canLocCsvExport ? exportPriv : undefined) : exportPriv;

  const columns: ColumnsType<StockRefItem> = useMemo(() => {
    const base: ColumnsType<StockRefItem> = [
      { title: T[3], dataIndex: "name", key: "name", ellipsis: true },
      { title: T[4], dataIndex: "code", key: "code", width: 140, ellipsis: true },
    ];
    if (isLoc && !warehouseId) {
      base.push({
        title: W[1],
        dataIndex: "warehouseName",
        key: "warehouseName",
        width: 160,
        ellipsis: true,
      });
    }
    if (isLoc) {
      base.push(
        {
          title: T[16],
          dataIndex: "housingFee",
          key: "housingFee",
          width: 110,
          align: "right",
          render: (n: number) =>
            Number(n ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        },
        {
          title: T[17],
          dataIndex: "paymentPeriod",
          key: "paymentPeriod",
          width: 130,
          render: (p: string) => labelForPaymentPeriod(p ?? "", T),
        },
      );
    }
    return base;
  }, [T, W, isLoc, warehouseId]);

  const formInputsDisabled = isLoc && (editingId ? !canLocEdit : !canLocCreate);

  const locationFeeFields = isLoc ? (
    <>
      <Text type="secondary" style={{ display: "block", marginTop: 12, marginBottom: 8, textDecoration: "underline" }}>
        {T[15]}
      </Text>
      <Form.Item name="housingFee" label={T[16]}>
        <InputNumber min={0} step={0.01} style={{ width: "100%" }} disabled={!!formInputsDisabled} />
      </Form.Item>
      <Form.Item name="paymentPeriod" label={T[17]}>
        <Select options={paymentPeriodSelectOptions(T)} disabled={!!formInputsDisabled} allowClear />
      </Form.Item>
    </>
  ) : null;

  const formBlock = (
    <Form form={form} layout="vertical">
      <Form.Item name="name" label={T[3]} rules={[{ required: true, message: T[11] }]}>
        <Input disabled={!!formInputsDisabled} />
      </Form.Item>
      <Form.Item name="code" label={T[4]}>
        <Input disabled={!!formInputsDisabled} />
      </Form.Item>
      {locationFeeFields}
    </Form>
  );

  const runPrint = async (_listKey: string, sort: "asc" | "desc", modelId: string) => {
    const sorted = sortByIsoDate(rows, "createdAt", sort);
    if (isLoc) {
      const headers = [
        T[3],
        T[4],
        ...(warehouseId ? [] : [W[1]]),
        Prt[7] ?? "Date",
        T[16],
        T[17],
      ];
      const bodyRows = sorted.map((r) => {
        const wh = (r.warehouseName ?? "").trim() || "—";
        const fee = Number(r.housingFee ?? 0).toLocaleString("fr-FR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const per = labelForPaymentPeriod(r.paymentPeriod ?? "", T);
        const base = [r.name, r.code ?? "", ...(warehouseId ? [] : [wh]), r.createdAt ?? "", fee, per];
        return base;
      });
      return await printStockListWithOptionalTemplate(
        "ref",
        `${T[0]} — ${Prt[0]}`,
        buildPrintTableHtml(printListLabel, headers, bodyRows),
        modelId,
      );
    }
    const headers = [T[3], T[4], Prt[7] ?? "Date"];
    const bodyRows = sorted.map((r) => [r.name, r.code ?? "", r.createdAt ?? ""]);
    return await printStockListWithOptionalTemplate(
      "ref",
      `${T[0]} — ${Prt[0]}`,
      buildPrintTableHtml(printListLabel, headers, bodyRows),
      modelId,
    );
  };

  const showInlineFormCard = isInline && isLoc && (canLocCreate || canLocEdit);
  const rowCursor = isInline && isLoc && !canLocEdit ? "default" : "pointer";

  if (isLoc && !canLocView) {
    return (
      <Loading spinning={loading}>
        <Title level={4} style={{ marginTop: 0 }}>
          {T[0]}
        </Title>
        <Alert type="warning" showIcon message={T[14] ?? T[0]} style={{ marginTop: 8 }} />
      </Loading>
    );
  }

  return (
    <Loading spinning={loading}>
      <Space align="start" style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
            {T[0]}
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {T[1]}
          </Paragraph>
        </div>
        <Button
          icon={<PrinterOutlined />}
          disabled={!canPrint}
          onClick={() => {
            if (canPrint) setPrintOpen(true);
          }}
        >
          {Prt[0] ?? "Imprimer"}
        </Button>
      </Space>
      {showInlineFormCard ? (
        <Card title={T[13] ?? T[0]} size="small" style={{ marginBottom: 16 }}>
          {formBlock}
          <Space wrap style={{ marginTop: 8 }}>
            {canLocCreate ? (
              <Button type="default" icon={<PlusOutlined />} onClick={openCreate}>
                {T[2]}
              </Button>
            ) : null}
            {(canLocCreate && !editingId) || (canLocEdit && !!editingId) ? (
              <Button type="primary" onClick={onSave}>
                {T[5]}
              </Button>
            ) : null}
            {editingId && canLocDelete ? (
              <Button danger icon={<DeleteOutlined />} onClick={confirmDeleteEditing}>
                {T[7]}
              </Button>
            ) : null}
          </Space>
        </Card>
      ) : null}
      <Space wrap style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }}>
        {!isInline ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {T[2]}
          </Button>
        ) : (
          <span />
        )}
        <StockDataIoBar
          table={csvTable}
          importPrivilege={importPass}
          exportPrivilege={exportPass}
          warehouseId={kind === "location" ? warehouseId : undefined}
          onAfterImport={load}
        />
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        locale={{ emptyText: T[9] }}
        pagination={{ pageSize: 12 }}
        onRow={(record) => ({
          onClick: () => openEdit(record),
          style: {
            cursor: rowCursor,
            background: isInline && record.id === editingId ? "rgba(24, 144, 255, 0.09)" : undefined,
          },
        })}
      />
      <StockPrintModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        lists={[{ value: "ref", label: printListLabel }]}
        onPrint={runPrint}
      />
      {!isInline ? (
        <Modal
          title={editingId ? editLbl : T[2]}
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          onOk={editingId ? undefined : onSave}
          okText={T[5]}
          cancelText={T[6]}
          destroyOnHidden
          width={isLoc ? 520 : 440}
          footer={
            editingId ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <Button danger icon={<DeleteOutlined />} onClick={confirmDeleteEditing}>
                  {T[7]}
                </Button>
                <Space>
                  <Button
                    type="text"
                    icon={<CopyOutlined />}
                    aria-label={getPageTexts("stockCommon")[0]}
                    title={getPageTexts("stockCommon")[0]}
                    onClick={duplicateRefFromModal}
                  />
                  <Button type="primary" onClick={onSave}>
                    {T[5]}
                  </Button>
                </Space>
              </div>
            ) : undefined
          }
        >
          {formBlock}
        </Modal>
      ) : null}
    </Loading>
  );
}
