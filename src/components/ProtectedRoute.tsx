import { Navigate } from "react-router-dom";
import { useSession } from "../body/context/SessionContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  if (!session) {
    return <Navigate to="/connection" replace />;
  }
  return <>{children}</>;
}
