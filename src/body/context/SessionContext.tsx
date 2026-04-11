import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { setAuthGetter } from "../store/authStore";

export interface SessionState {
  userId: string;
  tabId: string;
  pays: string;
  patientId: string;
  mustChangePassword?: boolean;
  /** Compte démo Doc01 : inviter à personnaliser l'e-mail (modal fermable). */
  mustChangeDemoEmail?: boolean;
  role?: string;
}

const defaultSession: SessionState = {
  userId: "",
  tabId: "",
  pays: "",
  patientId: "",
  mustChangePassword: false,
  mustChangeDemoEmail: false,
  role: "",
};

type SessionContextType = {
  session: SessionState;
  setSession: (s: Partial<SessionState>) => void;
  setPatientId: (id: string) => void;
  setDbPassword: (p: string) => void;
  clearSession: () => void;
  clearMustChangePassword: () => void;
  clearMustChangeDemoEmail: () => void;
  isAuthenticated: boolean;
};

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession doit être utilisé dans un SessionProvider");
  }
  return ctx;
};

export const SessionProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSessionState] = useState<SessionState>(defaultSession);
  const dbPasswordRef = useRef<string>("");

  const setSession = useCallback((updates: Partial<SessionState>) => {
    setSessionState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setPatientId = useCallback((patientId: string) => {
    setSessionState((prev) => ({ ...prev, patientId }));
  }, []);

  const setDbPassword = useCallback((p: string) => {
    dbPasswordRef.current = p;
  }, []);

  const clearSession = useCallback(() => {
    setSessionState(defaultSession);
    dbPasswordRef.current = "";
  }, []);

  const clearMustChangePassword = useCallback(() => {
    setSessionState((prev) => ({ ...prev, mustChangePassword: false }));
  }, []);

  const clearMustChangeDemoEmail = useCallback(() => {
    setSessionState((prev) => ({ ...prev, mustChangeDemoEmail: false }));
  }, []);

  useEffect(() => {
    setAuthGetter(() => ({
      userId: session.userId,
      dbPassword: dbPasswordRef.current,
    }));
  }, [session.userId]);

  const isAuthenticated = !!(session.userId && session.tabId);

  return (
    <SessionContext.Provider
      value={{
        session,
        setSession,
        setPatientId,
        setDbPassword,
        clearSession,
        clearMustChangePassword,
        clearMustChangeDemoEmail,
        isAuthenticated,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};
