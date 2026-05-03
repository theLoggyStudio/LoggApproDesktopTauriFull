import React, { createContext, useContext, useState, useRef, useCallback, type ReactNode } from "react";

export type AlertState = {
  text: string;
  type: string;
  show: boolean;
};

const AlertContext = createContext<{
  alertObj: AlertState;
  setAlertObj: (value: AlertState | ((prev: AlertState) => AlertState)) => void;
}>({
  alertObj: { text: "", type: "success", show: false },
  setAlertObj: () => {},
});

export function useAlert() {
  return useContext(AlertContext);
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alertObj, setAlertObjState] = useState<AlertState>({
    text: "",
    type: "success",
    show: false,
  });

  const alertQueueRef = useRef<
    { text: string; type: string; duration: number; persistent: boolean }[]
  >([]);
  const isProcessingRef = useRef(false);
  const currentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setAlertObj = useCallback((newAlert: AlertState | ((prev: AlertState) => AlertState)) => {
    const processAlertQueue = async () => {
      if (isProcessingRef.current || alertQueueRef.current.length === 0) {
        return;
      }
      isProcessingRef.current = true;
      while (alertQueueRef.current.length > 0) {
        const alertItem = alertQueueRef.current.shift();
        if (!alertItem) break;
        setAlertObjState({
          text: alertItem.text,
          type: alertItem.type,
          show: true,
        });
        if (alertItem.persistent) {
          isProcessingRef.current = false;
          return;
        }
        await new Promise<void>((resolve) => {
          currentTimeoutRef.current = setTimeout(() => {
            setAlertObjState({ text: "", type: "success", show: false });
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
      setAlertObjState((prevState) => {
        const updated = newAlert(prevState);
        if (
          updated.text &&
          updated.text !== "" &&
          updated.text !== "undefined" &&
          String(updated.text).trim() !== ""
        ) {
          alertQueueRef.current.push({
            text: updated.text,
            type: updated.type || "success",
            duration: (updated as { duration?: number }).duration || 5000,
            persistent: !!(updated as { persistent?: boolean }).persistent,
          });
          setTimeout(() => void processAlertQueue(), 0);
        }
        return updated;
      });
    } else {
      if (
        newAlert &&
        newAlert.text &&
        newAlert.text !== "" &&
        newAlert.text !== "undefined" &&
        String(newAlert.text).trim() !== ""
      ) {
        alertQueueRef.current.push({
          text: newAlert.text,
          type: newAlert.type || "success",
          duration: (newAlert as { duration?: number }).duration || 5000,
          persistent: !!(newAlert as { persistent?: boolean }).persistent,
        });
        setTimeout(() => void processAlertQueue(), 0);
      } else if (newAlert && newAlert.show === false) {
        alertQueueRef.current.length = 0;
        setAlertObjState({ text: "", type: "success", show: false });
      }
    }
  }, []);

  return (
    <AlertContext.Provider value={{ alertObj, setAlertObj }}>
      {children}
    </AlertContext.Provider>
  );
}
