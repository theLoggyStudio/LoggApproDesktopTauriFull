import { useEffect, useState } from "react";
import { checkBackendHealth, getHttpBackendUrl, isTauriAvailable } from "../tauri-bridge";

export function WebBackendBanner() {
  const [status, setStatus] = useState<"checking" | "ok" | "error">("checking");
  const [errorMsg, setErrorMsg] = useState("");

  const doCheck = () => {
    if (isTauriAvailable()) {
      setStatus("ok");
      return;
    }
    setStatus("checking");
    checkBackendHealth().then((r) => {
      setStatus(r.ok ? "ok" : "error");
      setErrorMsg(r.error ?? "");
    });
  };

  useEffect(() => {
    doCheck();
  }, []);

  if (isTauriAvailable()) return null;

  if (status === "error") {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: "#c0392b",
          color: "#fff",
          padding: "12px 16px",
          fontSize: 14,
          textAlign: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        <strong>Backend inaccessible.</strong> {errorMsg}
        <br />
        <small>
          Sur le PC serveur : lancez l&apos;exe OU exécutez <code>npm run dev:tauri</code>. Vérifiez le pare-feu (ports
          7061 et 7062).
        </small>
        <br />
        <small>Backend attendu : {getHttpBackendUrl()}</small>
        <button
          type="button"
          onClick={doCheck}
          style={{
            marginLeft: 12,
            padding: "4px 12px",
            background: "rgba(255,255,255,0.2)",
            border: "1px solid #fff",
            color: "#fff",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (status === "checking") {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: "#555",
          color: "#fff",
          padding: "8px 16px",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        Vérification du backend…
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#1e8449",
        color: "#fff",
        padding: "6px 16px",
        fontSize: 12,
        textAlign: "center",
      }}
    >
      Mode navigateur : backend joignable ({getHttpBackendUrl()})
    </div>
  );
}
