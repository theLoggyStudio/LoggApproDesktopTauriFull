/**
 * Page web dédiée au scan QR (http://IP:7061/#/scan).
 * Ouverte par le bouton scan sur desktop (navigateur externe).
 * L'URL est correcte via window.location car on est sur la page web.
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "react-qr-code";
import { useTheme } from "../context/ThemeContext";
import { themes, codeCouleur } from "../../constants/index.ts";
import { useAlert } from "../context/SearchContext";
import BoutonEmail from "../Modules/BoutonEmail.tsx";

const FRONT_PORT = "7061";

export default function PageScanQR() {
  const { themeNumber } = useTheme();
  const { setAlertObj } = useAlert();
  const navigate = useNavigate();
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  useEffect(() => {
    const baseUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port || FRONT_PORT}`;
    setQrCodeUrl(baseUrl);
  }, []);

  const violetColor =
    themeNumber !== undefined && themes[themeNumber] ? themes[themeNumber].primary : codeCouleur.primary;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backgroundColor: "#f5f5f5",
        position: "relative",
      }}
    >
      <button
        onClick={() => navigate("/")}
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          backgroundColor: "transparent",
          border: "none",
          fontSize: 14,
          cursor: "pointer",
          color: "#666",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
        aria-label="Retour"
      >
        ← Retour
      </button>

      <div
        style={{
          backgroundColor: "#fff",
          padding: 30,
          borderRadius: 15,
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          maxWidth: 400,
        }}
      >

        <div style={{ fontSize: 18, fontWeight: "bold", color: "#333", textAlign: "center" }}>
          Scannez pour vous connecter
        </div>

        {qrCodeUrl ? (
          <QRCode value={qrCodeUrl} size={100} style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
        ) : (
          <div
            style={{
              width: 200,
              height: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#f5f5f5",
              borderRadius: 10,
            }}
          >
            <span style={{ fontSize: 14, color: "#666" }}>Chargement...</span>
          </div>
        )}

        <div
          style={{
            fontSize: 12,
            color: "#666",
            textAlign: "center",
            maxWidth: 280,
            wordBreak: "break-all",
            padding: 10,
            backgroundColor: "#f5f5f5",
            borderRadius: 5,
            minHeight: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {qrCodeUrl || "—"}
        </div>

        <BoutonEmail
          shareUrl={qrCodeUrl}
          disabled={!qrCodeUrl}
          backgroundColor={violetColor}
          onError={(text) => setAlertObj({ type: "error", show: true, text })}
        />
      </div>
    </div>
  );
}
