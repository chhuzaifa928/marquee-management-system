import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import type { ModuleKey } from "../config/modules";

export function ProtectedRoute({
  children,
  module,
}: {
  children: ReactNode;
  module?: ModuleKey;
}) {
  const { user, modules, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-pearl-500">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Client-side guard mirrors the server (which is the real boundary).
  if (module && !modules.includes(module)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
