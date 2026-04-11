/**
 * ⚠️ COMPOSANT PROVISOIRE - À SUPPRIMER APRÈS LES TESTS
 *
 * Bouton flottant pour lancer les tests. Visible uniquement en dev.
 */
import React, { useState } from "react";
import { runTestsProvisoires } from "../utils/TestsProvisoires";
import { useSession } from "../context/SessionContext";

export function DevTestsProvisoires() {
  const { session } = useSession();
  const [running, setRunning] = useState(false);
  const isDev = import.meta.env.DEV;

  if (!isDev) return null;

  const handleRun = async () => {
    if (!session.userId || !session.tabId) {
      console.warn("🧪 Tests: Connectez-vous d'abord pour avoir userId, tabId, pays.");
      alert("Connectez-vous d'abord, puis allez sur la page patient ou patient-detail.");
      return;
    }
    setRunning(true);
    try {
      const { okCount, failCount } = await runTestsProvisoires({
        userId: session.userId,
        tabId: session.tabId,
        pays: session.pays || "sn",
        patientId: session.patientId || undefined,
      });
      alert(`Tests terminés: ${okCount} OK, ${failCount} échec(s). Voir la console.`);
    } catch (e) {
      console.error("Erreur tests:", e);
      alert("Erreur lors des tests. Voir la console.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <button
      onClick={handleRun}
      disabled={running}
      title="Lancer les tests provisoires"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 99999,
        padding: "8px 12px",
        fontSize: 12,
        backgroundColor: "#333",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        cursor: running ? "wait" : "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      {running ? "⏳ Tests..." : "🧪 Tests"}
    </button>
  );
}
