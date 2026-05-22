import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type SessionUser = {
  id: string;
  loginOrLabel: string;
  role?: string;
  /** Comptes créés dans Stock (écran Collaborateur) — écrans autorisés. Absent pour sadmin ou compte principal. */
  stockPrivileges?: string[];
  /** E-mail de contact (facultatif). */
  email?: string;
  /** Adresse enregistrée pour les comptes utilisateur stock (facultatif). */
  address?: string;
  /** Rôle métier (`stock_role`) pour les comptes stock. */
  stockRoleId?: string;
};

const SessionContext = createContext<{
  session: SessionUser | null;
  setSession: (u: SessionUser | null) => void;
  logout: () => void;
}>({
  session: null,
  setSession: () => {},
  logout: () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SessionUser | null>(() => {
    try {
      const raw = sessionStorage.getItem("loggappro_session");
      if (!raw) return null;
      return JSON.parse(raw) as SessionUser;
    } catch {
      return null;
    }
  });

  const setSession = useCallback((u: SessionUser | null) => {
    setSessionState(u);
    try {
      if (u) sessionStorage.setItem("loggappro_session", JSON.stringify(u));
      else sessionStorage.removeItem("loggappro_session");
    } catch {
      /* ignore */
    }
  }, []);

  const logout = useCallback(() => {
    setSession(null);
  }, [setSession]);

  return (
    <SessionContext.Provider value={{ session, setSession, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
