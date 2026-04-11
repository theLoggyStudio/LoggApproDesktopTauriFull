import React, { useState, useEffect } from "react";
import { invoke, openExternalUrl } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import {
  encrypteRepositoryStructure,
  decrypteRepositoryStructure,
} from "../helpers/helpers";
import { useSession } from "../context/SessionContext";

const CORRUPTION_DETECTED = "CORRUPTION_DETECTED";

export default function ModalCorruptionDonnees() {
  const { session } = useSession();
  const [show, setShow] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resolvedTabId = (session.tabId || "main").trim() || "main";
  const solvedKey = `lp_corruption_resolved__${session.userId || "unknown"}__${resolvedTabId}`;

  useEffect(() => {
    if (!session.userId || !session.tabId || !session.pays) return;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(solvedKey) === "1") {
      setShow(false);
      return;
    }
    const check = async () => {
      try {
        const payload = encrypteRepositoryStructure(
          { id: session.userId, tabId: session.tabId, pays: session.pays },
          criptKey
        );
        const res = await invoke<any>("check_corruption_status", { payload });
        const dec = decrypteRepositoryStructure(res, criptKey);
        if (dec?.corruption === true) {
          setShow(true);
          setPassword("");
          setError("");
        } else if (typeof window !== "undefined") {
          // Si le backend confirme qu'il n'y a plus de corruption, on retire le verrou local.
          window.sessionStorage.removeItem(solvedKey);
        }
      } catch {
        // Ignorer les erreurs de check (backend non dispo, etc.)
      }
    };
    check();
  }, [session.userId, session.tabId, session.pays, solvedKey]);

  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const payload = encrypteRepositoryStructure(
        {
          password,
          cabinetId: session.userId,
          tabId: session.tabId,
          pays: session.pays,
        },
        criptKey
      );
      const res = await invoke<any>("verify_sadmin_reset_paiement", { payload });
      const decRaw = decrypteRepositoryStructure(res, criptKey);
      const dec =
        typeof decRaw === "string"
          ? (() => {
              try {
                return JSON.parse(decRaw);
              } catch {
                return { message: decRaw };
              }
            })()
          : decRaw;
      if (dec == null) {
        setError(
          "Réponse du serveur illisible (déchiffrement). Vérifiez que la clé de chiffrement front correspond au backend."
        );
        return;
      }
      const msg = typeof dec.message === "string" ? dec.message : "";
      const ok =
        dec.success === true ||
        dec.success === "true" ||
        /date\s*r[ée]initialis[ée]e/i.test(msg);
      if (ok) {
        const successMsg =
          msg ||
          "Date réinitialisée. Des frais de réparation de 50 000 XOF peuvent être demandés via PayDunya.";
        const urlPay = typeof dec.urlDePaiement === "string" ? dec.urlDePaiement.trim() : "";
        setPassword("");
        setError("");
        if (typeof window !== "undefined") {
          // Empêche une réouverture immédiate du modal dans la session courante.
          window.sessionStorage.setItem(solvedKey, "1");
        }
        setShow(false);
        if (urlPay) {
          void openExternalUrl(urlPay);
        } else {
          window.alert(`${successMsg}\n\nConfigurez PayDunya ou réglez les frais manuellement si nécessaire.`);
        }
      } else {
        setError(msg || "Erreur lors de la vérification.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("incorrect") ? msg : "Mot de passe SADMIN incorrect.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100000,
        padding: 20,
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #8B0000 0%, #1a0000 100%)",
          color: "#fff",
          borderRadius: 16,
          padding: 32,
          maxWidth: 480,
          width: "100%",
          boxShadow: "0 25px 70px rgba(139,0,0,0.4)",
          border: "2px solid #ff4444",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 20px 0", color: "#ff6666", fontSize: "1.4rem" }}>
          Tentative de corruption de données
        </h3>
        <p style={{ marginBottom: 24, color: "#ffaaaa", lineHeight: 1.5 }}>
          Veuillez renseigner le mot de passe du SADMIN.
        </p>
        <form onSubmit={handleSubmitPassword}>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe SADMIN"
            required
            style={{
              width: "100%",
              padding: 14,
              fontSize: 16,
              borderRadius: 8,
              border: "2px solid #ff4444",
              backgroundColor: "#1a0000",
              color: "#fff",
              marginBottom: 16,
            }}
          />
          {error && (
            <p style={{ color: "#ff6666", marginBottom: 12, fontSize: 14 }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: "100%",
              padding: 14,
              backgroundColor: "#8B0000",
              color: "#fff",
              border: "2px solid #ff4444",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: "bold",
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Vérification..." : "Valider"}
          </button>
        </form>
      </div>
    </div>
  );
}

export { CORRUPTION_DETECTED };
