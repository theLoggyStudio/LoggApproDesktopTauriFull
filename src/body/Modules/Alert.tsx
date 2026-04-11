import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAlert } from "../context/SearchContext.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faQrcode } from "@fortawesome/free-solid-svg-icons";
import { useTheme } from '../context/ThemeContext.tsx';
import { themes } from "../../constants/index.ts";
import { Modal } from "../../items/Modal.tsx";
import QRCode from "react-qr-code";
import { invoke } from "../../tauri-bridge.ts";
import BoutonEmail from "./BoutonEmail.tsx";

const FRONT_PORT = "7061";

export function Alert() {
    const alertContext = useAlert();
    const { alertObj, setAlertObj } = alertContext || { alertObj: { text: "", type: "success", show: false }, setAlertObj: () => {} };
    const { themeNumber } = useTheme();
    const location = useLocation();
    const [showModalScan, setShowModalScan] = useState(false);
    const [modalScanUrl, setModalScanUrl] = useState<string | null>(null);

    const isPageOuverture = location.pathname === "/";
    const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

    const handleScanClick = async () => {
        if (isTauri) {
            // Desktop : afficher le modal QR (évite l'erreur d'ouverture navigateur / serveur inaccessible)
            try {
                const data = await invoke<{ success?: boolean; frontUrl?: string }>("get_local_ip");
                if (data?.success && data?.frontUrl) {
                    setModalScanUrl(data.frontUrl);
                    setShowModalScan(true);
                } else {
                    setAlertObj({ type: "error", show: true, text: "Impossible d'obtenir l'adresse réseau. Vérifiez votre connexion." });
                }
            } catch {
                setAlertObj({ type: "error", show: true, text: "Impossible d'obtenir l'adresse réseau." });
            }
        } else {
            // Web : afficher le QR dans le modal
            setShowModalScan(true);
        }
    };

    const handleClose = () => {
        setAlertObj({ text: "", type: "success", show: false });
    };

    const theme = themeNumber !== undefined && themes[themeNumber] ? themes[themeNumber] : themes[0];

    const selectionnerTypeAlert = () => {
        switch (alertObj.type) {
            case "primary":
                return (
                    <div
                        className="alert alert-dismissible border shadow-sm"
                        role="alert"
                        style={{
                            color: theme.primary,
                            backgroundColor: "rgba(255, 255, 255, 0.97)",
                            borderColor: `${theme.primary}55`,
                            maxWidth: "min(640px, 96vw)",
                            margin: "0 auto",
                            textAlign: "left",
                            whiteSpace: "pre-line",
                        }}
                    >
                        {alertObj.text}
                        <button
                            type="button"
                            className="btn-close"
                            onClick={handleClose}
                            aria-label="Fermer"
                            style={{ filter: "none", opacity: 0.55 }}
                        />
                    </div>
                );
            case "success":
                return (
                    <div className="alert alert-success alert-dismissible" role="alert">
                        {alertObj.text}
                        <button type="button" className="btn-close" onClick={handleClose} aria-label="Close"></button>
                    </div>
                );
            case "warning":
                return (
                    <div className="alert alert-warning alert-dismissible" role="alert">
                        {alertObj.text}
                        <button type="button" className="btn-close" onClick={handleClose} aria-label="Close"></button>
                    </div>
                );
            case "error":
                return (
                    <div className="alert alert-danger alert-dismissible" role="alert">
                        {alertObj.text}
                        <button type="button" className="btn-close" onClick={handleClose} aria-label="Close"></button>
                    </div>
                );
            default:
                return (
                    <div className="alert alert-warning alert-dismissible" role="alert">
                        {alertObj.text}
                        <button type="button" className="btn-close" onClick={handleClose} aria-label="Close"></button>
                    </div>
                );
        }
    };

    const violetColor = themeNumber !== undefined && themes[themeNumber] ? themes[themeNumber].primary : "#5A28A5";

    return (
        <>
            {/* Bouton Scan : desktop = ouvre navigateur sur page web ; web = modal QR dans l'Alert */}
            {isPageOuverture && (
                <button
                    onClick={handleScanClick}
                    style={{
                        position: "fixed",
                        top: "20px",
                        right: "20px",
                        zIndex: 19998,
                        backgroundColor: violetColor,
                        color: "#fff",
                        border: "none",
                        borderRadius: "50%",
                        width: "50px",
                        height: "50px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                        transition: "all 0.3s ease",
                        fontSize: "24px"
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "scale(1.1)";
                        e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.4)";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "scale(1)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
                    }}
                    aria-label="Scannez pour vous connecter"
                    title="Ouvrir la page de scan QR"
                >
                    <FontAwesomeIcon icon={faQrcode} />
                </button>
            )}

            {/* Modal QR : desktop et web - affiché dans l'Alert (pas d'ouverture navigateur externe) */}
            <Modal
                show={showModalScan}
                onClose={() => { setShowModalScan(false); setModalScanUrl(null); }}
                title="Scannez pour vous connecter"
                width={420}
                maxWidth="95vw"
            >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
                    {(() => {
                        const qrUrl = isTauri
                            ? (modalScanUrl || "")
                            : `${window.location.protocol}//${window.location.hostname}:${window.location.port || FRONT_PORT}`;
                        return (
                            <>
                                {qrUrl ? (
                                    <QRCode value={qrUrl} size={100} style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
                                ) : (
                                    <div style={{ width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", borderRadius: 10 }}>
                                        <span style={{ fontSize: 14, color: "#666" }}>Chargement...</span>
                                    </div>
                                )}
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: "#666",
                                        textAlign: "center",
                                        wordBreak: "break-all",
                                        padding: 10,
                                        backgroundColor: "#f5f5f5",
                                        borderRadius: 5,
                                        width: "100%",
                                    }}
                                >
                                    {qrUrl || "—"}
                                </div>
                                <BoutonEmail
                                    shareUrl={qrUrl}
                                    disabled={!qrUrl}
                                    backgroundColor={violetColor}
                                    onError={(text) =>
                                        setAlertObj({ type: "error", show: true, text })
                                    }
                                />
                            </>
                        );
                    })()}
                </div>
            </Modal>

            {alertObj.show && alertObj.text && alertObj.text !== "" && alertObj.text !== "undefined" && String(alertObj.text).trim() !== "" && (
                <div style={{ position: "fixed", zIndex: 20000, bottom: "10px", width: "100%", textAlign: "center" }}>
                    {selectionnerTypeAlert()}
                </div>
            )}
        </>
    );
}

export default Alert;
