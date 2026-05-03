import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../../context/SessionContext";
import { getFirstStockPath, hasStockScreenAccess, pathnameToStockScreen } from "../../utils/stockPrivileges";

/** Redirige vers un écran autorisé si l’utilisateur stock n’a pas le privilège pour la route courante. */
export function StockAccessGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { session } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!session) return;
    const screen = pathnameToStockScreen(pathname);
    if (hasStockScreenAccess(session, screen)) return;
    navigate(getFirstStockPath(session.stockPrivileges ?? []), { replace: true });
  }, [pathname, session, navigate]);

  return <>{children}</>;
}
