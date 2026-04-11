/**
 * Vide le contenu des providers de paramètres lorsque l'URL est sur une page de connexion.
 * Peu importe la raison (déconnexion, session expirée, navigation directe, etc.).
 * Ne vide qu'une seule fois par navigation pour éviter les boucles infinies.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useClearParams } from "../hooks/useClearParams";

const CONNECTION_PATHS = ["/", "/connection", "/nouveau-compte"];

export function ClearParamsOnConnectionPage() {
  const location = useLocation();
  const { clearAllParams } = useClearParams();
  const lastClearedPathRef = useRef<string | null>(null);

  useEffect(() => {
    const path = location.pathname;
    if (CONNECTION_PATHS.includes(path) && lastClearedPathRef.current !== path) {
      lastClearedPathRef.current = path;
      clearAllParams(true);
    } else if (!CONNECTION_PATHS.includes(path)) {
      lastClearedPathRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- clearAllParams exclu pour éviter boucle infinie
  }, [location.pathname]);

  return null;
}
