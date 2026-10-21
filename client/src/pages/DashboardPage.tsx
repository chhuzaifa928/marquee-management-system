import { useAuth } from "../auth/AuthContext";
import { MODULE_DEFS } from "../config/modules";
import { Link } from "react-router-dom";

export function DashboardPage() {
  const { user, modules } = useAuth();
  const cards = MODULE_DEFS.filter(
    (m) => m.key !== "dashboard" && modules.includes(m.key),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-pearl-900">
        Welcome, {user?.name}
      </h1>
      <p className="mt-1 text-sm text-pearl-500">
        Role-aware widgets (upcoming events, cash position, receivables, low stock,
        revenue chart) arrive with the dashboard module. Your available areas:
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((m) => (
          <Link
            key={m.key}
            to={m.path}
            className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-pearl-100 transition hover:ring-pearl-300"
          >
            <div className="text-2xl" aria-hidden>
              {m.icon}
            </div>
            <div className="mt-2 font-medium text-pearl-900">{m.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
