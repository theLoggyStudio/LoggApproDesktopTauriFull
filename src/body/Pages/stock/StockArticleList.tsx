import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Input,
  Space,
  Form,
  InputNumber,
  message,
  Tag,
  Typography,
} from "antd";
import { Button, Modal, Select, Table } from "../../../items";
import { PlusOutlined, DeleteOutlined, SearchOutlined, PrinterOutlined, CopyOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import {
  canPrintStockArticleList,
  hasRefLocationCreate,
  hasRefLocationEdit,
  hasRefLocationView,
} from "../../utils/stockPrivileges";
import {
  fetchArticles,
  fetchRefItems,
  saveArticle,
  removeArticle,
  upsertRefItem,
  type StockArticle,
} from "../../../lib/stockApi";
import StockDataIoBar from "./StockDataIoBar";
import { StockPrintModal } from "./StockPrintModal";
import { buildPrintTableHtml, sortByIsoDate } from "../../utils/stockBrowserPrint";
import { printStockListWithOptionalTemplate } from "../../utils/stockListPrintWithTemplate";

const { Title } = Typography;

export default function StockArticleList() {
  const { session } = useSession();
  const T = usePageTexts("stockArticles");
  const F = usePageTexts("stockArticleForm");
  const N = usePageTexts("stockArticlesNav");
  const C = usePageTexts("stockSelectCreateRow");
  const unitRequiredMsg = getPageTexts("stockArticleUnits")[11];
  const catSavedMsg = getPageTexts("stockArticleCategories")[10];
  const curSavedMsg = getPageTexts("stockSelectCreateRow")[27];
  const [rows, setRows] = useState<StockArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StockArticle | null>(null);
  const [form] = Form.useForm<Partial<StockArticle>>();
  const [unitOptions, setUnitOptions] = useState<{ value: string; label: string }[]>([]);
  const [locationOptions, setLocationOptions] = useState<{ value: string; label: string }[]>([]);
  const [defaultWarehouseId, setDefaultWarehouseId] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const [currencyOptions, setCurrencyOptions] = useState<{ value: string; label: string }[]>([]);
  const [unitQuickOpen, setUnitQuickOpen] = useState(false);
  const [locationQuickOpen, setLocationQuickOpen] = useState(false);
  const [categoryQuickOpen, setCategoryQuickOpen] = useState(false);
  const [currencyQuickOpen, setCurrencyQuickOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [unitQuickForm] = Form.useForm<{ name: string; code?: string }>();
  const [locationQuickForm] = Form.useForm<{ name: string; code?: string }>();
  const [categoryQuickForm] = Form.useForm<{ name: string; code?: string }>();
  const [currencyQuickForm] = Form.useForm<{ name: string; code?: string }>();

  const Wh = usePageTexts("stockWarehouseNav");
  const Prt = usePageTexts("stockPrint");
  const canLocView = hasRefLocationView(session);
  const canLocCreate = hasRefLocationCreate(session);
  const canLocEdit = hasRefLocationEdit(session);
  const canPrint = canPrintStockArticleList(session);

  const mergedCategoryOptions = useMemo(() => {
    const cat = editing?.category?.trim();
    if (!cat) return categoryOptions;
    if (categoryOptions.some((o) => o.value === cat)) return categoryOptions;
    return [...categoryOptions, { value: cat, label: cat }];
  }, [categoryOptions, editing?.category]);

  const mergedLocationOptions = useMemo(() => {
    const loc = editing?.location?.trim();
    if (!loc) return locationOptions;
    if (locationOptions.some((o) => o.value === loc)) return locationOptions;
    return [...locationOptions, { value: loc, label: loc }];
  }, [locationOptions, editing?.location]);

  const mergedCurrencyOptions = useMemo(() => {
    const c = (editing?.currency ?? "").trim();
    if (!c) return currencyOptions;
    if (currencyOptions.some((o) => o.value === c)) return currencyOptions;
    return [...currencyOptions, { value: c, label: c }];
  }, [currencyOptions, editing?.currency]);

  const locationLabelByValue = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of locationOptions) m[o.value] = o.label;
    return m;
  }, [locationOptions]);

  const loadRefs = useCallback(() => {
    fetchRefItems("unit").then((list) =>
      setUnitOptions(list.map((x) => ({ value: x.name, label: x.code ? `${x.name} (${x.code})` : x.name }))),
    );
    if (canLocCreate) {
      fetchRefItems("warehouse").then((list) => {
        setDefaultWarehouseId(list[0]?.id ?? "");
      });
    } else {
      setDefaultWarehouseId("");
    }
    if (canLocView) {
      fetchRefItems("location").then((list) =>
        setLocationOptions(
          list.map((x) => ({
            value: x.id,
            label:
              x.warehouseName && x.name
                ? `${x.warehouseName} — ${x.code ? `${x.name} (${x.code})` : x.name}`
                : x.code
                  ? `${x.name} (${x.code})`
                  : x.name,
          })),
        ),
      );
    } else {
      setLocationOptions([]);
    }
    fetchRefItems("category").then((list) =>
      setCategoryOptions(list.map((x) => ({ value: x.name, label: x.code ? `${x.name} (${x.code})` : x.name }))),
    );
    fetchRefItems("currency").then((list) =>
      setCurrencyOptions(list.map((x) => ({ value: x.name, label: x.code ? `${x.name} (${x.code})` : x.name }))),
    );
  }, [canLocView, canLocCreate]);

  const load = useCallback(() => {
    setLoading(true);
    fetchArticles(debounced || undefined)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [debounced]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadRefs();
  }, [loadRefs]);

  /** Avec `destroyOnHidden`, le Form n'existe qu'après ouverture : remplir les champs au tick suivant. */
  useEffect(() => {
    if (!modalOpen) return;
    const timer = window.setTimeout(() => {
      if (editing) {
        form.setFieldsValue({
          ...editing,
          qty: Number(editing.qty),
          minQty: Number(editing.minQty),
          price: Number(editing.price ?? 0),
          currency: (editing.currency ?? "").trim(),
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          qty: 0,
          minQty: 0,
          price: 0,
          unit: unitOptions[0]?.value ?? "u",
          category: categoryOptions[0]?.value ?? "",
          currency: "",
        });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [modalOpen, editing?.id, editing, form, unitOptions, categoryOptions, currencyOptions]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (r: StockArticle) => {
    setEditing(r);
    setModalOpen(true);
  };

  const duplicateArticleFromModal = () => {
    const v = form.getFieldsValue() as Partial<StockArticle>;
    const sfx = getPageTexts("stockCommon")[1] || "-COPIE";
    const sku = (v.sku ?? "").trim();
    form.setFieldsValue({
      ...v,
      sku: sku ? `${sku}${sfx}` : sku,
    });
    setEditing(null);
  };

  const onSave = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    if (!v.sku?.trim() || !v.name?.trim()) {
      message.warning(getPageTexts("connection")[8]);
      return;
    }
    try {
      await saveArticle({
        ...v,
        id: editing?.id,
        sku: v.sku!.trim(),
        name: v.name!.trim(),
        qty: Number(v.qty ?? 0),
        minQty: Number(v.minQty ?? 0),
        price: Number(v.price ?? 0),
        currency: (v.currency as string | undefined)?.trim() ?? "",
      });
      message.success(T[21] ?? "");
      setModalOpen(false);
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const onSaveQuickUnit = async () => {
    const v = await unitQuickForm.validateFields().catch(() => null);
    if (!v?.name?.trim()) return;
    try {
      await upsertRefItem("unit", { name: v.name.trim(), code: v.code?.trim() || "" });
      message.success(C[15]);
      await loadRefs();
      form.setFieldValue("unit", v.name.trim());
      setUnitQuickOpen(false);
      unitQuickForm.resetFields();
    } catch (e) {
      message.error(String(e));
    }
  };

  const onSaveQuickCategory = async () => {
    const v = await categoryQuickForm.validateFields().catch(() => null);
    if (!v?.name?.trim()) return;
    try {
      await upsertRefItem("category", { name: v.name.trim(), code: v.code?.trim() || "" });
      message.success(catSavedMsg);
      await loadRefs();
      form.setFieldValue("category", v.name.trim());
      setCategoryQuickOpen(false);
      categoryQuickForm.resetFields();
    } catch (e) {
      message.error(String(e));
    }
  };

  const onSaveQuickCurrency = async () => {
    const v = await currencyQuickForm.validateFields().catch(() => null);
    if (!v?.name?.trim()) return;
    try {
      await upsertRefItem("currency", { name: v.name.trim(), code: v.code?.trim() || "" });
      message.success(curSavedMsg);
      await loadRefs();
      form.setFieldValue("currency", v.name.trim());
      setCurrencyQuickOpen(false);
      currencyQuickForm.resetFields();
    } catch (e) {
      message.error(String(e));
    }
  };

  const onSaveQuickLocation = async () => {
    if (!canLocCreate) return;
    const v = await locationQuickForm.validateFields().catch(() => null);
    if (!v?.name?.trim()) return;
    if (!defaultWarehouseId) {
      message.warning(Wh[13] ?? "");
      return;
    }
    try {
      const r = await upsertRefItem("location", {
        name: v.name.trim(),
        code: v.code?.trim() || "",
        warehouseId: defaultWarehouseId,
      });
      message.success(C[16]);
      await loadRefs();
      form.setFieldValue("location", r.id);
      setLocationQuickOpen(false);
      locationQuickForm.resetFields();
    } catch (e) {
      message.error(String(e));
    }
  };

  const onDelete = (r: StockArticle) => {
    Modal.confirm({
      title: T[14],
      okText: T[15],
      cancelText: T[16],
      onOk: async () => {
        try {
          await removeArticle(r.id);
          message.success(T[22]);
          setModalOpen(false);
          setEditing(null);
          load();
        } catch (e) {
          message.error(String(e));
        }
      },
    });
  };

  const columns = useMemo((): ColumnsType<StockArticle> => {
    const base: ColumnsType<StockArticle> = [
      { title: T[3], dataIndex: "sku", key: "sku", width: 110 },
      { title: T[4], dataIndex: "name", key: "name" },
      { title: T[5], dataIndex: "category", key: "category", width: 120 },
      { title: T[6], dataIndex: "unit", key: "unit", width: 72 },
      {
        title: T[7],
        dataIndex: "qty",
        key: "qty",
        width: 130,
        align: "right",
        render: (q: number, r) => {
          const n = Number(q ?? 0);
          const shown = Number.isFinite(n)
            ? n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })
            : "—";
          return (
            <Space size="small" wrap>
              <span>{shown}</span>
              {r.minQty > 0 && n <= r.minQty && (
                <Tag color="warning">{T[13]}</Tag>
              )}
            </Space>
          );
        },
      },
      { title: T[8], dataIndex: "minQty", key: "minQty", width: 88 },
      {
        title: T[23],
        dataIndex: "price",
        key: "price",
        width: 100,
        align: "right",
        render: (p: number) =>
          Number(p ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      },
      {
        title: T[25] ?? "Devise",
        dataIndex: "currency",
        key: "currency",
        width: 88,
        render: (c: string | undefined) => ((c ?? "").trim() || "—") as string,
      },
    ];
    if (canLocView) {
      base.push({
        title: T[9],
        dataIndex: "location",
        key: "location",
        render: (loc: string) => {
          const s = (loc ?? "").trim();
          if (!s) return "—";
          return locationLabelByValue[s] ?? s;
        },
      });
    }
    return base;
  }, [T, canLocView, locationLabelByValue]);

  const runPrint = async (listKey: string, sort: "asc" | "desc", modelId: string) => {
    if (listKey !== "articles") return false;
    const sorted = sortByIsoDate(rows, "updatedAt", sort);
    const headers = [
      T[3],
      T[4],
      T[5],
      T[6],
      T[7],
      T[8],
      T[23],
      T[25] ?? "Devise",
      ...(canLocView ? [T[9]] : []),
      F[7],
    ];
    const bodyRows = sorted.map((r) => {
      const loc = (r.location ?? "").trim();
      const locLabel = canLocView ? locationLabelByValue[loc] ?? loc : "";
      return [
        r.sku,
        r.name,
        r.category,
        r.unit,
        String(r.qty),
        String(r.minQty),
        Number(r.price ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        (r.currency ?? "").trim() || "—",
        ...(canLocView ? [locLabel || "—"] : []),
        (r.notes ?? "").trim() || "—",
      ];
    });
    return await printStockListWithOptionalTemplate(
      "articles",
      `${T[0]} — ${Prt[0] ?? "Imprimer"}`,
      buildPrintTableHtml(T[24] ?? T[0], headers, bodyRows),
      modelId,
    );
  };

  return (
    <>
      <Space align="start" style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            {T[0]}
          </Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {N[4] ?? ""}
          </Typography.Paragraph>
        </div>
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
      <Space wrap style={{ marginBottom: 16, width: "100%", justifyContent: "space-between" }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder={T[1]}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <Space wrap>
          <StockDataIoBar
            table="articles"
            importPrivilege="articles_import"
            exportPrivilege="articles_export"
            onAfterImport={load}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {T[2]}
          </Button>
        </Space>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        onRow={(record) => ({
          onClick: () => openEdit(record),
          style: { cursor: "pointer" },
        })}
      />
      <Modal
        title={editing ? T[11] : T[2]}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={editing ? undefined : onSave}
        okText={T[17]}
        cancelText={T[18]}
        width={560}
        destroyOnHidden
        footer={
          editing ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <Button danger icon={<DeleteOutlined />} onClick={() => onDelete(editing)}>
                {T[12]}
              </Button>
              <Space>
                <Button
                  type="text"
                  icon={<CopyOutlined />}
                  aria-label={getPageTexts("stockCommon")[0]}
                  title={getPageTexts("stockCommon")[0]}
                  onClick={duplicateArticleFromModal}
                />
                <Button type="primary" onClick={onSave}>
                  {T[17]}
                </Button>
              </Space>
            </div>
          ) : undefined
        }
      >
        <Form form={form} layout="vertical" preserve>
          <Form.Item name="sku" label={F[0]} rules={[{ required: true }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item name="name" label={F[1]} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label={F[2]}>
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              options={mergedCategoryOptions}
              placeholder={F[2]}
              createRowLabel={C[23]}
              onCreateRowClick={() => {
                categoryQuickForm.resetFields();
                setCategoryQuickOpen(true);
              }}
              dropdownRender={(menu) => (
                <>
                  {menu}
                  <Typography.Text type="secondary" style={{ display: "block", padding: "8px 12px", fontSize: 12 }}>
                    {N[7] ?? ""}
                  </Typography.Text>
                </>
              )}
            />
          </Form.Item>
          <Form.Item name="unit" label={F[3]}>
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              options={unitOptions}
              placeholder={F[3]}
              createRowLabel={C[0]}
              onCreateRowClick={() => {
                unitQuickForm.resetFields();
                setUnitQuickOpen(true);
              }}
              dropdownRender={(menu) => (
                <>
                  {menu}
                  <Typography.Text type="secondary" style={{ display: "block", padding: "8px 12px", fontSize: 12 }}>
                    {N[5] ?? ""}
                  </Typography.Text>
                </>
              )}
            />
          </Form.Item>
          <Form.Item name="qty" label={T[20] ?? F[4]}>
            <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="minQty" label={F[5]}>
            <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="price" label={F[8]}>
            <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="currency" label={F[9]}>
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              options={mergedCurrencyOptions}
              placeholder={F[9]}
              createRowLabel={C[25]}
              onCreateRowClick={() => {
                currencyQuickForm.resetFields();
                setCurrencyQuickOpen(true);
              }}
              dropdownRender={(menu) => (
                <>
                  {menu}
                  <Typography.Text type="secondary" style={{ display: "block", padding: "8px 12px", fontSize: 12 }}>
                    {N[8] ?? ""}
                  </Typography.Text>
                </>
              )}
            />
          </Form.Item>
          {canLocView ? (
            <Form.Item name="location" label={F[6]}>
              <Select
                showSearch
                allowClear
                optionFilterProp="label"
                options={mergedLocationOptions}
                placeholder={F[6]}
                disabled={!canLocEdit}
                createRowLabel={canLocCreate ? C[1] : undefined}
                onCreateRowClick={
                  canLocCreate
                    ? () => {
                        locationQuickForm.resetFields();
                        setLocationQuickOpen(true);
                      }
                    : undefined
                }
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    <Typography.Text type="secondary" style={{ display: "block", padding: "8px 12px", fontSize: 12 }}>
                      {N[6] ?? ""}
                    </Typography.Text>
                  </>
                )}
              />
            </Form.Item>
          ) : null}
          <Form.Item name="notes" label={F[7]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={C[5]}
        open={unitQuickOpen}
        onCancel={() => setUnitQuickOpen(false)}
        onOk={onSaveQuickUnit}
        okText={C[13]}
        cancelText={C[14]}
        destroyOnHidden
        width={440}
      >
        <Form form={unitQuickForm} layout="vertical">
          <Form.Item name="name" label={C[10]} rules={[{ required: true, message: unitRequiredMsg }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label={C[11]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={C[24]}
        open={categoryQuickOpen}
        onCancel={() => setCategoryQuickOpen(false)}
        onOk={onSaveQuickCategory}
        okText={C[13]}
        cancelText={C[14]}
        destroyOnHidden
        width={440}
      >
        <Form form={categoryQuickForm} layout="vertical">
          <Form.Item name="name" label={C[10]} rules={[{ required: true, message: unitRequiredMsg }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label={C[11]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={C[26]}
        open={currencyQuickOpen}
        onCancel={() => setCurrencyQuickOpen(false)}
        onOk={onSaveQuickCurrency}
        okText={C[13]}
        cancelText={C[14]}
        destroyOnHidden
        width={440}
      >
        <Form form={currencyQuickForm} layout="vertical">
          <Form.Item name="name" label={C[10]} rules={[{ required: true, message: unitRequiredMsg }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label={C[11]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
      <StockPrintModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        lists={[{ value: "articles", label: T[24] ?? T[0] }]}
        onPrint={runPrint}
      />
      <Modal
        title={C[6]}
        open={locationQuickOpen}
        onCancel={() => setLocationQuickOpen(false)}
        onOk={onSaveQuickLocation}
        okText={C[13]}
        cancelText={C[14]}
        destroyOnHidden
        width={440}
      >
        <Form form={locationQuickForm} layout="vertical">
          <Form.Item name="name" label={C[10]} rules={[{ required: true, message: unitRequiredMsg }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label={C[11]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
