import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ModulePlaceholder } from "./pages/ModulePlaceholder";
import { CustomersPage } from "./pages/customers/CustomersPage";
import { CustomerDetailPage } from "./pages/customers/CustomerDetailPage";
import { BookingsPage } from "./pages/bookings/BookingsPage";
import { BookingCreatePage } from "./pages/bookings/BookingCreatePage";
import { BookingDetailPage } from "./pages/bookings/BookingDetailPage";
import { CalendarPage } from "./pages/bookings/CalendarPage";
import type { ModuleKey } from "./config/modules";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

// Modules still awaiting their real UI (built in Modules 3–8).
const PLACEHOLDERS: ModuleKey[] = [
  "payments",
  "accounting",
  "event_costs",
  "inventory",
  "assets",
  "decor",
  "vendors",
  "reports",
  "admin",
];

function guard(module: ModuleKey, element: ReactElement) {
  return <ProtectedRoute module={module}>{element}</ProtectedRoute>;
}

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

              <Route path="/customers" element={guard("customers", <CustomersPage />)} />
              <Route path="/customers/:id" element={guard("customers", <CustomerDetailPage />)} />

              <Route path="/bookings" element={guard("bookings", <BookingsPage />)} />
              <Route path="/bookings/new" element={guard("bookings", <BookingCreatePage />)} />
              <Route path="/bookings/calendar" element={guard("bookings", <CalendarPage />)} />
              <Route path="/bookings/:id" element={guard("bookings", <BookingDetailPage />)} />

              {PLACEHOLDERS.map((m) => (
                <Route
                  key={m}
                  path={pathFor(m)}
                  element={guard(m, <ModulePlaceholder moduleKey={m} />)}
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

function pathFor(m: ModuleKey): string {
  return m === "event_costs" ? "/event-costs" : `/${m}`;
}
