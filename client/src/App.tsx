import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ModulePlaceholder } from "./pages/ModulePlaceholder";
import { MODULE_DEFS, type ModuleKey } from "./config/modules";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

// Modules that already have a real page vs. placeholders (built later).
const PLACEHOLDER_MODULES = MODULE_DEFS.filter((m) => m.key !== "dashboard");

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              {PLACEHOLDER_MODULES.map((m) => (
                <Route
                  key={m.key}
                  path={m.path}
                  element={
                    <ProtectedRoute module={m.key as ModuleKey}>
                      <ModulePlaceholder moduleKey={m.key as ModuleKey} />
                    </ProtectedRoute>
                  }
                />
              ))}
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
