/**
 * Affiche l'URL d'accès web (http://IP:7061) sur la page ouverture.
 * Permet de copier le lien pour accéder à l'app depuis un autre appareil.
 */
import React, { useEffect, useState } from "react";
import { invoke } from "../../tauri-bridge";
import { themes } from "../../constants/index.ts";
import { useTheme } from "../context/ThemeContext";
import { useAlert } from "../context/SearchContext";
import { Copy, Globe } from "lucide-react";

export function BoutonUrlWeb() {
  const { themeNumber } = useTheme();
  const { setAlertObj } = useAlert();
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await invoke<{ frontUrl?: string; ip?: string; success?: boolean }>("get_local_ip", { payload: "" });
        if (res?.frontUrl) {
          setFrontUrl(res.frontUrl);
        } else {
          setFrontUrl(`http://${window.location.hostname}:7061`);
        }
      } catch {
        setFrontUrl(`http://${window.location.hostname}:7061`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleCopy = async () => {
    if (!frontUrl) return;
    try {
      await navigator.clipboard.writeText(frontUrl);
      setAlertObj({ type: "success", show: true, text: "URL copiée dans le presse-papier." });
    } catch {
      setAlertObj({ type: "error", show: true, text: "Impossible de copier." });
    }
  };

  if (loading || !frontUrl) return null;

  const theme = themes[themeNumber];
  const isLocalhost = frontUrl.includes("localhost") || frontUrl.includes("127.0.0.1");

  return (
    <div
      style={{
        marginTop: 16,
        padding: "12px 16px",
        borderRadius: 8,
        backgroundColor: "rgba(255,255,255,0.15)",
        border: `1px solid ${theme.secondary}40`,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        justifyContent: "center",
      }}
    >
      <Globe size={18} style={{ color: theme.secondary }} />
      <span style={{ fontSize: 13, color: theme.secondary }}>
        {isLocalhost ? "Accès local : " : "Accès web (réseau) : "}
      </span>
      <a
        href={frontUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: theme.secondary,
          fontWeight: 600,
          textDecoration: "underline",
          wordBreak: "break-all",
        }}
      >
        {frontUrl}
      </a>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          background: theme.secondary,
          color: theme.primary,
          border: "none",
          borderRadius: 6,
          padding: "6px 10px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 12,
        }}
      >
        <Copy size={14} />
        Copier
      </button>
    </div>
  );
}
