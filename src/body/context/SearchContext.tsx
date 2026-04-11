import React, { createContext, useContext, useState, useRef, useCallback } from "react";
//import { User } from "../Entities/entities.TSX";
// Contexte pour la recherche
const SearchContext = createContext<{ theValueSearch: string; setTheValueSearch: (value: string) => void }>({ theValueSearch: "", setTheValueSearch: () => {} });
export const useSearch = () => useContext(SearchContext);

export const SearchProvider = ({ children }: { children: React.ReactNode }) => {
  const [theValueSearch, setTheValueSearch] = useState("");

  return (
    <SearchContext.Provider value={{ theValueSearch, setTheValueSearch }}>
      {children}
    </SearchContext.Provider>
  );
};

// Contexte pour les items
const ItemsTabContext = createContext<{ itemsTab: any[]; setItemsTab: (value: any[]) => void }>({ itemsTab: [], setItemsTab: () => {} });

export const useItemsTab = () => useContext(ItemsTabContext);

export const ItemsTabProvider = ({ children }: { children: React.ReactNode }) => {
  const [itemsTab, setItemsTab] = useState<any[]>([]);

  return (
    <ItemsTabContext.Provider value={{ itemsTab, setItemsTab }}>
      {children}
    </ItemsTabContext.Provider>
  );
};

// Alerts - Système asynchrone avec queue
const AlertContext = createContext<{ alertObj: any; setAlertObj: (value: any) => void }>({
  alertObj: { text: "", type: "success", show: false },
  setAlertObj: () => {},
});

export const useAlert = () => useContext(AlertContext);

export const AlertProvider = ({ children }: { children: React.ReactNode }) => {
  const [alertObj, setAlertObj] = useState({
    text: "",
    type: "success",
    show: false,
  });

  // Queue d'alertes et état de traitement (useRef pour éviter les re-renders)
  const alertQueueRef = useRef<any[]>([]);
  const isProcessingRef = useRef(false);
  const currentTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Référence stable pour les effets (PageProfil, etc.) : avant, chaque alerte recréait le contexte
  // et relançait des useEffect([..., setAlertObj]) — ex. rechargement du profil qui écrasait les privilèges du modal Sadmin.
  const setAlertObjAsync = useCallback((newAlert: any) => {
    const processAlertQueue = async () => {
      if (isProcessingRef.current || alertQueueRef.current.length === 0) {
        return;
      }

      isProcessingRef.current = true;

      while (alertQueueRef.current.length > 0) {
        const alertItem = alertQueueRef.current.shift();
        if (!alertItem) break;

        setAlertObj({
          text: alertItem.text,
          type: alertItem.type,
          show: true,
        });

        // Alerte uniquement fermable par l'utilisateur (pas de disparition auto)
        if (alertItem.persistent) {
          isProcessingRef.current = false;
          return;
        }

        await new Promise<void>((resolve) => {
          currentTimeoutRef.current = setTimeout(() => {
            setAlertObj({
              text: "",
              type: "success",
              show: false,
            });

            currentTimeoutRef.current = setTimeout(() => {
              currentTimeoutRef.current = null;
              resolve();
            }, 300);
          }, alertItem.duration || 5000);
        });
      }

      isProcessingRef.current = false;
    };

    if (typeof newAlert === "function") {
      setAlertObj((prevState) => {
        const updated = newAlert(prevState);
        if (updated.text && updated.text !== "" && updated.text !== "undefined" && String(updated.text).trim() !== "") {
          alertQueueRef.current.push({
            text: updated.text,
            type: updated.type || "success",
            duration: updated.duration || 5000,
            persistent: !!updated.persistent,
          });
          setTimeout(() => void processAlertQueue(), 0);
        }
        return updated;
      });
    } else {
      if (newAlert && newAlert.text && newAlert.text !== "" && newAlert.text !== "undefined" && String(newAlert.text).trim() !== "") {
        alertQueueRef.current.push({
          text: newAlert.text,
          type: newAlert.type || "success",
          duration: newAlert.duration || 5000,
          persistent: !!newAlert.persistent,
        });
        setTimeout(() => void processAlertQueue(), 0);
      } else if (newAlert && newAlert.show === false) {
        if (currentTimeoutRef.current) {
          clearTimeout(currentTimeoutRef.current);
          currentTimeoutRef.current = null;
        }
        alertQueueRef.current = [];
        isProcessingRef.current = false;
        setAlertObj({
          text: "",
          type: "success",
          show: false,
        });
      }
    }
  }, [setAlertObj]);

  return (
    <AlertContext.Provider value={{ alertObj, setAlertObj: setAlertObjAsync }}>
      {children}
    </AlertContext.Provider>
  );
};

const ModeContext = createContext<{ mode: "admin" | "client" | "" | "superAdmin"; setMode: (value: "admin" | "client" | "" | "superAdmin") => void; modeFileName: string; setModeFileName: (value: string) => void }>({
  mode: "",
  setMode: () => {},
  modeFileName: "",
  setModeFileName: () => {},
});
export const useMode = () => useContext(ModeContext);

export const ModeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setMode] = useState<"admin" | "client" | "" | "superAdmin">("");
  const [modeFileName, setModeFileName] = useState("");

  return (
    <ModeContext.Provider
      value={{ mode, setMode, modeFileName, setModeFileName }}
    >
      {children}
    </ModeContext.Provider>
  );
};
