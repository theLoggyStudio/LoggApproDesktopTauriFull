import { useState, useEffect, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Input, Typography, Row, Col, Card, Space } from "antd";
import { Button, Loading, Modal } from "../items";
import { ShareAltOutlined, MailOutlined } from "@ant-design/icons";
import QRCode from "react-qr-code";
import { useTheme } from "../context/ThemeContext";
import { useAlert } from "../context/AlertContext";
import { useSession } from "../body/context/SessionContext";
import { invoke, getLoggApproOuvertureShareUrl, openShareLoggApproLinkByEmail } from "../tauri-bridge";
import { encrypteRepositoryStructure, decrypteRepositoryStructure, formatConnectionError } from "../lib/payloadCrypto";
import { stockAppUserLogin } from "../lib/stockApi";
import { getFirstStockPath } from "../body/utils/stockPrivileges";
import { themes, criptKey, checkAdminCredentials, getDefaultSadminPassword } from "../constants";
import { usePageTexts } from "../hooks/usePageTexts";
import connectionBrandLogo from "../assets/logo.png";
import "./PageConnection.css";

const { Title, Text, Paragraph } = Typography;

const APP_DISPLAY_NAME = "LoggAppro";

export default function PageConnection() {
  const navigate = useNavigate();
  const { themeNumber } = useTheme();
  const { setAlertObj } = useAlert();
  const { setSession } = useSession();
  const T = usePageTexts("connection");
  const [form] = Form.useForm<{ email: string; password: string }>();
  const [lanHint, setLanHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareUrlError, setShareUrlError] = useState<string | undefined>();
  const [shareLoading, setShareLoading] = useState(false);

  const t = themes[themeNumber];

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI__" in window)) return;
    invoke<{ success?: boolean; frontUrl?: string }>("get_local_ip", {})
      .then((data) => {
        if (data?.success && data.frontUrl) setLanHint(data.frontUrl);
      })
      .catch(() => setLanHint(null));
  }, []);

  const openQrModal = async () => {
    setQrOpen(true);
    setShareLoading(true);
    setShareUrl("");
    setShareUrlError(undefined);
    try {
      const res = await getLoggApproOuvertureShareUrl();
      if (res.url) {
        setShareUrl(res.url);
      } else {
        setShareUrlError(res.error ?? T[18]);
      }
    } catch {
      setShareUrlError(T[18]);
    } finally {
      setShareLoading(false);
    }
  };

  const sendLinkByEmail = async () => {
    if (!shareUrl) return;
    await openShareLoggApproLinkByEmail(shareUrl);
  };

  const handleConnection = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const email = values.email?.trim() ?? "";
    const password = values.password ?? "";
    setLoading(true);
    try {
      if (!email || !password) {
        setAlertObj({ type: "warning", text: T[8], show: true });
        return;
      }

      if (checkAdminCredentials(email, password)) {
        try {
          const payloadRm = encrypteRepositoryStructure({ pays: "sn", tabId: "main" }, criptKey);
          if (payloadRm) await invoke("remove_demo_docteur_after_sadmin_login", { payload: payloadRm });
        } catch {
          /* non bloquant */
        }
        if (password === getDefaultSadminPassword()) {
          try {
            const payloadDemo = encrypteRepositoryStructure(
              {
                pays: "sn",
                tabId: "main",
                sadminLogin: email.trim(),
                sadminPassword: password,
              },
              criptKey
            );
            if (payloadDemo) await invoke("ensure_default_demo_docteur", { payload: payloadDemo });
          } catch {
            /* initialisation démo non bloquante (ex. déjà créé, backend indisponible) */
          }
        }
        setSession({ id: "sadmin", loginOrLabel: "sadmin", role: "sadmin" });
        setAlertObj({ type: "success", text: T[9], show: true });
        navigate("/stock");
        return;
      }

      try {
        const stockUser = await stockAppUserLogin(email, password);
        if (stockUser?.id) {
          setSession({
            id: stockUser.id,
            loginOrLabel: stockUser.loginOrLabel ?? email,
            role: stockUser.role ?? "stock_user",
            stockPrivileges: stockUser.stockPrivileges ?? [],
            address: stockUser.address?.trim() || undefined,
            stockRoleId: stockUser.stockRoleId?.trim() || undefined,
          });
          setAlertObj({ type: "success", text: T[11], show: true });
          navigate(getFirstStockPath(stockUser.stockPrivileges ?? []));
          return;
        }
      } catch (stockErr: unknown) {
        const m = formatConnectionError(stockErr);
        if (m.includes("STOCK_USER_NOT_FOUND")) {
          /* compte dans la base principale */
        } else {
          setAlertObj({ type: "error", text: m, show: true });
          return;
        }
      }

      const payload = encrypteRepositoryStructure(
        { loginOrTel: email.toLowerCase().trim(), password, pays: "sn", tabId: "main" },
        criptKey
      );
      if (!payload) {
        setAlertObj({ type: "error", text: T[10], show: true });
        return;
      }

      const encryptedData = await invoke<unknown>("auth_connection", { payload });
      const userResponse = decrypteRepositoryStructure(encryptedData, criptKey) as {
        id?: string;
        role?: string;
      } | null;

      if (userResponse && userResponse.id) {
        setSession({
          id: userResponse.id,
          loginOrLabel: email,
          role: userResponse.role,
        });
        setAlertObj({
          type: "success",
          text: T[11],
          show: true,
        });
        navigate("/stock");
      } else {
        setAlertObj({ type: "error", text: T[12], show: true });
      }
    } catch (error) {
      console.error("Erreur lors de la connexion", error);
      setAlertObj({ type: "error", text: formatConnectionError(error), show: true });
    } finally {
      setLoading(false);
    }
  };

  const brandSurfaceStyle = {
    "--conn-primary": t.primary,
    "--conn-text": t.textPrimary,
    "--conn-fluid-highlight": "rgba(255,255,255,0.32)",
    "--conn-fluid-accent": "rgba(255,255,255,0.14)",
    "--conn-fluid-glow": themeNumber === 1 ? "rgba(255,255,255,0.12)" : "rgba(144, 224, 239, 0.22)",
    "--conn-blob-a": "rgba(255,255,255,0.38)",
    "--conn-blob-b": themeNumber === 1 ? "rgba(212,212,216,0.35)" : "rgba(220, 252, 231, 0.42)",
    "--conn-blob-c": themeNumber === 1 ? "rgba(161,161,170,0.28)" : "rgba(144, 224, 239, 0.3)",
  } as CSSProperties;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Row style={{ flex: 1 }} wrap={false}>
        <Col xs={24} md={10} lg={11} xl={12} className="connection-brand-wrap">
          <div className="connection-brand-inner" style={brandSurfaceStyle}>
            <div className="connection-fluid-bg" aria-hidden>
              <div className="connection-fluid-mesh" />
              <div className="connection-fluid-blob connection-fluid-blob--a" />
              <div className="connection-fluid-blob connection-fluid-blob--b" />
              <div className="connection-fluid-blob connection-fluid-blob--c" />
              <div className="connection-fluid-shimmer" />
            </div>
            <div className="connection-brand-front">
              <img
                className="connection-brand-logo"
                src={connectionBrandLogo}
                alt={APP_DISPLAY_NAME}
                width={160}
                height={160}
                decoding="async"
              />
              <Title level={2} className="connection-app-title">
                {APP_DISPLAY_NAME}
              </Title>
            </div>
          </div>
        </Col>
        <Col xs={24} md={14} lg={13} xl={12} style={{ backgroundColor: t.primary, color: t.textPrimary }}>
          <Card
            variant="borderless"
            style={{
              maxWidth: 480,
              margin: "2rem auto",
              background: "transparent",
              boxShadow: "none",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <Title level={2} style={{ marginBottom: 8, color: t.textPrimary }}>
                {T[0]}
              </Title>
              <Button
                type="link"
                icon={<ShareAltOutlined />}
                onClick={openQrModal}
                style={{ color: t.textSecondary, padding: "0 8px 12px" }}
              >
                {T[13]}
              </Button>
            </div>
            {lanHint && (
              <Paragraph style={{ color: t.textTertiary, fontSize: 13 }}>
                {T[1].replace(/\{url\}/g, lanHint)}
              </Paragraph>
            )}
            <Form form={form} layout="vertical" onFinish={handleConnection} requiredMark={false}>
              <Form.Item label={<span style={{ color: t.textSecondary }}>{T[2]}</span>} name="email" rules={[{ required: true, message: T[8] }]}>
                <Input placeholder={T[3]} size="large" autoComplete="username" />
              </Form.Item>
              <Form.Item label={<span style={{ color: t.textSecondary }}>{T[4]}</span>} name="password" rules={[{ required: true, message: T[8] }]}>
                <Input.Password placeholder={T[5]} size="large" autoComplete="current-password" />
              </Form.Item>
              <Paragraph style={{ color: t.textTertiary, fontSize: 12 }}>
                {T[6]}{" "}
                <Text code style={{ color: t.textSecondary }}>{getDefaultSadminPassword()}</Text>
              </Paragraph>
              <Form.Item>
                <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ background: t.secondary, color: t.primary, borderColor: t.secondary, fontWeight: 600 }}>
                  {T[7]}
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>

      <Modal
        title={T[17]}
        open={qrOpen}
        onCancel={() => setQrOpen(false)}
        footer={[
          <Button key="close" onClick={() => setQrOpen(false)}>
            {T[16]}
          </Button>,
        ]}
        destroyOnHidden
        width={420}
        centered
      >
        <Loading spinning={shareLoading}>
          {shareUrlError ? (
            <Paragraph type="danger" style={{ marginBottom: 0 }}>
              {shareUrlError}
            </Paragraph>
          ) : shareUrl ? (
            <Space direction="vertical" size="middle" style={{ width: "100%", alignItems: "center" }}>
              <Paragraph type="secondary" style={{ textAlign: "center", marginBottom: 0 }}>
                {T[14]}
              </Paragraph>
              <div
                style={{
                  background: "#fff",
                  padding: 16,
                  borderRadius: 12,
                  boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
                }}
              >
                <QRCode value={shareUrl} size={220} level="M" />
              </div>
              <Text
                copyable={{ text: shareUrl }}
                style={{ fontSize: 12, wordBreak: "break-all", textAlign: "center", color: "rgba(0,0,0,0.75)" }}
              >
                {shareUrl}
              </Text>
              <Button type="primary" icon={<MailOutlined />} block onClick={sendLinkByEmail}>
                {T[15]}
              </Button>
            </Space>
          ) : !shareLoading ? (
            <Paragraph type="secondary">{T[18]}</Paragraph>
          ) : null}
        </Loading>
      </Modal>
    </div>
  );
}
