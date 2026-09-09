import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../lib/auth-client";

const ROLE_DEFAULT_PATHS = {
  admin: "/admin",
  comisario: "/comisario",
  escribano: "/escribano",
  jurado: "/home",
};

export default function RoleRoute({ allowedRoles, children }) {
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

  const role = session?.user?.role || "jurado";

  if (!allowedRoles.includes(role)) {
    const redirectPath = ROLE_DEFAULT_PATHS[role] || "/home";
    return <Navigate to={redirectPath} replace />;
  }

  return children;
}
