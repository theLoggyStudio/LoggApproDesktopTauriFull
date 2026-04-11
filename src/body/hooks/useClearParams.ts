/**
 * Hook pour vider le contenu des providers de paramètres.
 * À appeler lors de la déconnexion ou quand on est sur la page de connexion.
 */
import { useCallback } from "react";
import { useSearch, useItemsTab, useAlert, useMode } from "../context/SearchContext";
import { useSession } from "../context/SessionContext";

export function useClearParams() {
  const { setTheValueSearch } = useSearch() ?? { setTheValueSearch: () => {} };
  const { setItemsTab } = useItemsTab() ?? { setItemsTab: () => {} };
  const { setAlertObj } = useAlert() ?? { setAlertObj: () => {} };
  const { setMode, setModeFileName } = useMode() ?? { setMode: () => {}, setModeFileName: () => {} };
  const { clearSession } = useSession();

  const clearAllParams = useCallback((fullLogout = false) => {
    setTheValueSearch("");
    setItemsTab([]);
    setAlertObj({ show: false, text: "", type: "success" });
    setModeFileName("");
    if (fullLogout) {
      setMode("");
      clearSession();
    }
  }, [setTheValueSearch, setItemsTab, setAlertObj, setMode, setModeFileName, clearSession]);

  return { clearAllParams };
}
