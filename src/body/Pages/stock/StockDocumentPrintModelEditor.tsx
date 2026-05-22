import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, Col, Form, Input, Row, Select, Space, Typography, message } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Loading } from "../../../items";
import { getPageTexts, usePageTexts } from "../../../hooks/usePageTexts";
import { useSession, type SessionUser } from "../../context/SessionContext";
import {
  fetchStockDocumentPrintModel,
  upsertStockDocumentPrintModel,
  type StockDocumentPrintModelDetail,
} from "../../../lib/stockApi";
import { canViewDocumentPrintModels, canEditDocumentPrintModels } from "../../utils/stockPrivileges";
import {
  STOCK_PRINT_TEMPLATE_VARIABLES,
  extractPlaceholderKeys,
  substituteMustache,
  type StockPrintTemplateVariable,
} from "../../utils/stockPrintTemplateVariables";
import { MustacheVariableTextarea } from "./MustacheVariableTextarea";
import { DOCUMENT_PRINT_SCREEN_KEYS, type DocumentPrintScreenKey } from "../../utils/stockListPrintWithTemplate";
import { A4_CONTENT_WIDTH_PX, wrapPrintModelHtml } from "../../utils/stockPrintA4";

const { Text, Title } = Typography;

const DEFAULT_HTML = `<div class="page">
  <h1>{{ titre }}</h1>
  <p class="sub">{{ sousTitre }}</p>
</div>`;

const DEFAULT_CSS = `.page { font-family: system-ui, sans-serif; width: ${A4_CONTENT_WIDTH_PX}px; box-sizing: border-box; margin: 0; padding: 0; }
h1 { margin: 0 0 8px; font-size: 22px; }
.sub { color: #555; margin: 0; font-size: 14px; }`;

function demoValueForKey(key: string): string {
  const map: Record<string, string> = {
    titre: "Exemple de titre",
    sousTitre: "Sous-titre ou mention complémentaire",
    "date.aujourdhui": new Date().toLocaleDateString("fr-FR"),
    "date.heure": new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    "societe.nom": "Mon établissement",
    "societe.adresse": "12 rue Exemple, 75000 Paris",
    "article.nom": "Article démo",
    "article.sku": "SKU-001",
    "article.qte": "42",
    "article.unite": "Boîte",
    "article.categorie": "Consommables",
    "mouvement.type": "Entrée",
    "mouvement.qte": "10",
    "mouvement.motif": "Réception fournisseur",
    "mouvement.refDoc": "BL-2026-001",
    "mouvement.date": new Date().toLocaleString("fr-FR"),
    "fournisseur.nom": "Fournisseur démo",
    "client.nom": "Client démo",
    "document.nom": "scan_recu.pdf",
    "document.type": "PDF",
    "liste.contenu": "<table><tr><td>… tableau généré par l’écran …</td></tr></table>",
  };
  return map[key] ?? `(${key})`;
}

const SCREEN_PRESET_KEYS: Record<string, string[]> = {
  movements: [
    "titre",
    "sousTitre",
    "date.aujourdhui",
    "date.heure",
    "liste.contenu",
    "article.nom",
    "article.sku",
    "mouvement.type",
    "mouvement.qte",
    "mouvement.motif",
    "mouvement.refDoc",
    "mouvement.date",
    "fournisseur.nom",
    "client.nom",
  ],
  articles: ["titre", "sousTitre", "date.aujourdhui", "date.heure", "liste.contenu", "article.nom", "article.sku", "article.qte", "article.unite", "article.categorie"],
  docs: ["titre", "sousTitre", "date.aujourdhui", "date.heure", "liste.contenu", "document.nom", "document.type"],
  parties: ["titre", "sousTitre", "date.aujourdhui", "date.heure", "liste.contenu", "fournisseur.nom", "client.nom"],
  ref: ["titre", "sousTitre", "date.aujourdhui", "date.heure", "liste.contenu"],
  wh: ["titre", "sousTitre", "date.aujourdhui", "date.heure", "liste.contenu"],
  dashboard_recent: ["titre", "sousTitre", "date.aujourdhui", "date.heure", "liste.contenu", "mouvement.type", "mouvement.qte", "mouvement.date"],
  dashboard_categories: ["titre", "sousTitre", "date.aujourdhui", "date.heure", "liste.contenu"],
};

export default function StockDocumentPrintModelEditor() {
  const T = usePageTexts("stockDocumentPrintModels");
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const skipNewResetAfterClone = useRef(false);
  const { session } = useSession();
  const canView = canViewDocumentPrintModels(session);
  const canEdit = canEditDocumentPrintModels(session);
  const isNew = modelId === "new";

  const [loading, setLoading] = useState(!isNew);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [css, setCss] = useState(DEFAULT_CSS);
  const [sampleValues, setSampleValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [assignedScreen, setAssignedScreen] = useState<string>("");

  const screenLabel = useCallback(
    (key: string) => {
      const i = DOCUMENT_PRINT_SCREEN_KEYS.indexOf(key as DocumentPrintScreenKey);
      return i >= 0 ? T[20 + i] : key;
    },
    [T],
  );

  const extraVars: StockPrintTemplateVariable[] = useMemo(() => {
    const keys = extractPlaceholderKeys(html, css);
    const known = new Set(STOCK_PRINT_TEMPLATE_VARIABLES.map((v) => v.key));
    return keys.filter((k) => !known.has(k)).map((k) => ({ key: k, label: k, category: "Modèle" }));
  }, [html, css]);

  const placeholderKeys = useMemo(() => {
    const extracted = extractPlaceholderKeys(html, css);
    const preset = SCREEN_PRESET_KEYS[assignedScreen] ?? [];
    return [...new Set([...preset, ...extracted])];
  }, [html, css, assignedScreen]);

  useEffect(() => {
    setSampleValues((prev) => {
      const next = { ...prev };
      for (const k of placeholderKeys) {
        if (!(k in next)) next[k] = demoValueForKey(k);
      }
      for (const k of Object.keys(next)) {
        if (!placeholderKeys.includes(k)) delete next[k];
      }
      return next;
    });
  }, [placeholderKeys]);

  const load = useCallback(async () => {
    if (!modelId || isNew || !canView) {
      if (isNew && searchParams.get("clone")?.trim()) {
        return;
      }
      if (isNew && skipNewResetAfterClone.current) {
        skipNewResetAfterClone.current = false;
        setLoading(false);
        return;
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const m: StockDocumentPrintModelDetail = await fetchStockDocumentPrintModel(modelId);
      setName(m.name);
      setDescription(m.description ?? "");
      setHtml(m.htmlContent || DEFAULT_HTML);
      setCss(m.cssContent || DEFAULT_CSS);
      setAssignedScreen((m.screenKey ?? "").trim());
    } catch (e) {
      message.error(String(e));
      navigate("/stock/documents/models");
    } finally {
      setLoading(false);
    }
  }, [modelId, isNew, canView, navigate, searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isNew || !canView) return;
    const clone = searchParams.get("clone")?.trim();
    if (!clone) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const m: StockDocumentPrintModelDetail = await fetchStockDocumentPrintModel(clone);
        if (cancelled) return;
        const sfx = getPageTexts("stockCommon")[1] || " (copie)";
        setName(`${(m.name || "").trim()}${sfx}`);
        setDescription(m.description ?? "");
        setHtml(m.htmlContent || DEFAULT_HTML);
        setCss(m.cssContent || DEFAULT_CSS);
        setAssignedScreen((m.screenKey ?? "").trim());
        skipNewResetAfterClone.current = true;
        setSearchParams({}, { replace: true });
      } catch (e) {
        if (!cancelled) {
          message.error(String(e));
          navigate("/stock/documents/models");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, canView, searchParams, setSearchParams, navigate]);

  useEffect(() => {
    if (isNew && !canEdit) navigate("/stock/documents/models", { replace: true });
  }, [isNew, canEdit, navigate]);

  useEffect(() => {
    if (isNew) setAssignedScreen("");
  }, [isNew]);

  useEffect(() => {
    if (!isNew) return;
    const s = (searchParams.get("screenKey") ?? "").trim();
    if (DOCUMENT_PRINT_SCREEN_KEYS.includes(s as DocumentPrintScreenKey)) {
      setAssignedScreen(s);
    }
  }, [isNew, searchParams]);

  const previewSrcDoc = useMemo(() => {
    const body = substituteMustache(html, sampleValues);
    const style = substituteMustache(css, sampleValues);
    return wrapPrintModelHtml(body, style);
  }, [html, css, sampleValues]);

  const onSave = async () => {
    if (!canEdit) return;
    const n = name.trim();
    if (!n) {
      message.error(T[14]);
      return;
    }
    setSaving(true);
    try {
      const res = await upsertStockDocumentPrintModel({
        id: isNew ? undefined : modelId,
        name: n,
        description: description.trim(),
        htmlContent: html,
        cssContent: css,
        screenKey: assignedScreen || undefined,
      });
      message.success(T[12]);
      navigate("/stock/documents/models");
    } catch (e) {
      message.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return (
      <Card>
        <Text type="secondary">Accès refusé.</Text>
      </Card>
    );
  }

  return (
    <Loading spinning={loading}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Space align="center" style={{ width: "100%", justifyContent: "space-between" }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {isNew ? T[2] : T[3]}
            </Title>
            <Text type="secondary">{T[1]}</Text>
          </div>
          <Space wrap>
            <Button onClick={() => navigate("/stock/documents/models")}>{T[17]}</Button>
            {canEdit && !isNew && modelId ? (
              <Button
                type="text"
                icon={<CopyOutlined />}
                aria-label={getPageTexts("stockCommon")[0]}
                title={getPageTexts("stockCommon")[0]}
                onClick={() => navigate(`/stock/documents/models/new?clone=${encodeURIComponent(modelId)}`)}
              />
            ) : null}
            {canEdit ? (
              <Button type="primary" loading={saving} onClick={() => void onSave()}>
                {T[11]}
              </Button>
            ) : null}
          </Space>
        </Space>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title={T[4]} size="small">
              <Form layout="vertical">
                <Form.Item label={T[4]} required>
                  <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
                </Form.Item>
                <Form.Item label={T[5]}>
                  <Input.TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit} />
                </Form.Item>
                <Form.Item label={T[18]}>
                  {canEdit ? (
                    <Select
                      allowClear
                      placeholder={T[19]}
                      value={assignedScreen || undefined}
                      onChange={(v) => setAssignedScreen(typeof v === "string" ? v : "")}
                      options={DOCUMENT_PRINT_SCREEN_KEYS.map((key, i) => ({
                        value: key,
                        label: T[20 + i] ?? key,
                      }))}
                    />
                  ) : (
                    <Text>{assignedScreen ? screenLabel(assignedScreen) : "—"}</Text>
                  )}
                </Form.Item>
              </Form>
            </Card>
            <Card title={T[6]} size="small" style={{ marginTop: 16 }}>
              <MustacheVariableTextarea value={html} onChange={setHtml} rows={14} extraVariables={extraVars} disabled={!canEdit} />
            </Card>
            <Card title={T[7]} size="small" style={{ marginTop: 16 }}>
              <MustacheVariableTextarea value={css} onChange={setCss} rows={10} extraVariables={extraVars} disabled={!canEdit} />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title={T[8]} size="small">
              <iframe title="preview" srcDoc={previewSrcDoc} sandbox="" style={{ width: "100%", height: 420, border: "1px solid #d9d9d9", borderRadius: 4 }} />
            </Card>
            <Card title={T[9]} size="small" style={{ marginTop: 16 }}>
              {placeholderKeys.length === 0 ? (
                <Text type="secondary">Ajoutez des variables au format {"{{ nom }}"} dans le HTML ou le CSS.</Text>
              ) : (
                <Form layout="vertical">
                  {placeholderKeys.map((k) => (
                    <Form.Item key={k} label={<Text code>{k}</Text>}>
                      <Input value={sampleValues[k] ?? ""} onChange={(e) => setSampleValues((p) => ({ ...p, [k]: e.target.value }))} />
                    </Form.Item>
                  ))}
                </Form>
              )}
            </Card>
          </Col>
        </Row>
      </Space>
    </Loading>
  );
}
