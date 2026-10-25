import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CustomersPage } from "./pages/customers/CustomersPage";
import { CustomerDetailPage } from "./pages/customers/CustomerDetailPage";
import { BookingsPage } from "./pages/bookings/BookingsPage";
import { BookingCreatePage } from "./pages/bookings/BookingCreatePage";
import { BookingDetailPage } from "./pages/bookings/BookingDetailPage";
import { CalendarPage } from "./pages/bookings/CalendarPage";
import { PaymentsPage } from "./pages/payments/PaymentsPage";
import { AccountingPage } from "./pages/accounting/AccountingPage";
import { ReportsPage } from "./pages/reports/ReportsPage";
import { AdminPage } from "./pages/admin/AdminPage";
import { InventoryPage } from "./pages/inventory/InventoryPage";
import { AssetsPage } from "./pages/assets/AssetsPage";
import { DecorPage } from "./pages/decor/DecorPage";
import { VendorsPage } from "./pages/vendors/VendorsPage";
import { EventCostsPage } from "./pages/eventCosts/EventCostsPage";
import type { ModuleKey } from "./config/modules";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

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

              <Route path="/payments" element={guard("payments", <PaymentsPage />)} />
              <Route path="/accounting" element={guard("accounting", <AccountingPage />)} />
              <Route path="/reports" element={guard("reports", <ReportsPage />)} />
              <Route path="/admin" element={guard("admin", <AdminPage />)} />
              <Route path="/inventory" element={guard("inventory", <InventoryPage />)} />
              <Route path="/assets" element={guard("assets", <AssetsPage />)} />
              <Route path="/decor" element={guard("decor", <DecorPage />)} />
              <Route path="/vendors" element={guard("vendors", <VendorsPage />)} />
              <Route path="/event-costs" element={guard("event_costs", <EventCostsPage />)} />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
