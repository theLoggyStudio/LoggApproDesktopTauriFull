/**
 * COMPOSANT DE TEST TEMPORAIRE - À SUPPRIMER
 * Vérifie que le backend Rust fonctionne correctement
 * Visible uniquement pour les utilisateurs connectés en tant que sadmin (mode superAdmin)
 */
import React, { useState } from "react";
import { Button } from "react-bootstrap";
import { useMode } from "../context/SearchContext";

export function TestBackendRust({isAdmin}: { isAdmin: boolean }) {
  const { mode } = useMode();
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // N'afficher que lorsque connecté en tant que sadmin (mode superAdmin)
  if (mode !== "superAdmin") {
    return null;
  }

  const runTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { invoke } = await import("../../tauri-bridge");
      const res = await invoke<any>("test_backend_rust", { payload: "" });
      setResult(JSON.stringify(res, null, 2));
    } catch (err: any) {
      setResult(`Erreur: ${err?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 8, fontSize: "0.8em" }}>
      isAdmin && (<Button size="sm" variant="outline-secondary" onClick={runTest} disabled={loading}>
        {loading ? "Test..." : "Test Backend Rust"}
      </Button>
      {result && (
        <pre style={{ marginTop: 4, fontSize: "0.75em", maxHeight: 120, overflow: "auto" }}>
          {result}
        </pre>
      )})
    </div>
  );
}
