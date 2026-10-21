// Module registry — mirrors the server's ModuleKey list. The server is the
// security boundary; this only drives what the nav renders.

export type ModuleKey =
  | "dashboard"
  | "customers"
  | "bookings"
  | "payments"
  | "accounting"
  | "event_costs"
  | "inventory"
  | "assets"
  | "decor"
  | "vendors"
  | "reports"
  | "admin";

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  path: string;
  icon: string; // simple emoji glyph for the scaffold
}

export const MODULE_DEFS: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", path: "/dashboard", icon: "📊" },
  { key: "bookings", label: "Bookings", path: "/bookings", icon: "📅" },
  { key: "customers", label: "Customers", path: "/customers", icon: "👤" },
  { key: "payments", label: "Payments", path: "/payments", icon: "💳" },
  { key: "accounting", label: "Accounting", path: "/accounting", icon: "📒" },
  { key: "event_costs", label: "Event Costs", path: "/event-costs", icon: "🧾" },
  { key: "inventory", label: "Inventory", path: "/inventory", icon: "📦" },
  { key: "assets", label: "Assets", path: "/assets", icon: "🏗️" },
  { key: "decor", label: "Decor", path: "/decor", icon: "🎀" },
  { key: "vendors", label: "Vendors", path: "/vendors", icon: "🤝" },
  { key: "reports", label: "Reports", path: "/reports", icon: "📈" },
  { key: "admin", label: "Admin", path: "/admin", icon: "⚙️" },
];
