import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../lib/auth-client";

export default function ProtectedRoute({ children }) {
  const { data: session, isPending, refetch } = useSession();
  const [hasCheckedSession, setHasCheckedSession] = useState(false);

  useEffect(() => {
    let isActive = true;

    setHasCheckedSession(false);
    refetch().finally(() => {
      if (isActive) setHasCheckedSession(true);
    });

    return () => {
      isActive = false;
    };
  }, [refetch]);

  if (isPending || !hasCheckedSession) {
    return <div className="container">Cargando...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
