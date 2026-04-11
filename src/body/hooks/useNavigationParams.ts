/**
 * Logique standard pour passer les paramètres entre pages :
 * - À l'envoi : navigate(path, { state }) ; userId/tabId/pays viennent surtout de la session après connexion.
 *   Fiche patient : `/patient-detail` (liste) ou `/patient-detail/:patientId` (détail).
 * - À la réception : useNavigationParams()
 *
 * Priorité : URL params > location.state > session (fallback)
 */
import { useLocation, useParams } from "react-router-dom";
import { useSession } from "../context/SessionContext";
import { useEffect } from "react";

export function useNavigationParams() {
  const location = useLocation();
  const params = useParams<{ userId?: string; tabId?: string; pays?: string; patientId?: string }>();
  const { session, setSession } = useSession();
  const state = (location.state ?? {}) as Record<string, string | undefined>;

  // Sync URL params and state to session when present (compatibilité Web / accès direct par URL)
  useEffect(() => {
    if (params.userId || params.tabId || params.pays || params.patientId || state.role) {
      setSession({
        ...(params.userId && { userId: params.userId }),
        ...(params.tabId && { tabId: params.tabId }),
        ...(params.pays && { pays: params.pays }),
        ...(params.patientId && { patientId: params.patientId }),
        ...(state.role && { role: state.role }),
      });
    }
  }, [params.userId, params.tabId, params.pays, params.patientId, state.role, setSession]);

  return {
    patientId: params.patientId ?? state.patientId ?? session.patientId ?? "",
    userId: params.userId ?? state.userId ?? session.userId ?? "",
    tabId: params.tabId ?? state.tabId ?? session.tabId ?? "",
    pays: params.pays ?? state.pays ?? session.pays ?? "",
    role: state.role ?? session.role ?? "",
  };
}
