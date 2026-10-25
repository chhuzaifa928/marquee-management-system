import { useAuth } from "../auth/AuthContext";
import { MODULE_DEFS } from "../config/modules";
import { Link } from "react-router-dom";

export function DashboardPage() {
  const { user, modules } = useAuth();
  const roles = user?.roles ?? [];
  const isAdminLevel = roles.includes("admin") || roles.includes("super_admin");
  const cards = MODULE_DEFS.filter(
    (m) => m.key !== "dashboard" && m.key !== "admin" && modules.includes(m.key),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-pearl-900">
        Welcome, {user?.name}
      </h1>
      <p className="mt-1 text-sm text-pearl-500">
        {roles.join(", ")} · Grand Pearl Marquee ERP
      </p>

      {isAdminLevel && modules.includes("admin") && (
        <Link
          to="/admin"
          className="mt-5 flex items-center justify-between rounded-xl bg-pearl-800 p-5 text-white shadow-sm transition hover:bg-pearl-700"
        >
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold">⚙️ Administration</div>
            <div className="text-sm text-pearl-200">
              Company & GST settings, users & roles, audit log{roles.includes("super_admin") ? ", system lock" : ""}.
            </div>
          </div>
          <span className="text-2xl">→</span>
        </Link>
      )}

      <p className="mt-6 text-sm text-pearl-500">Your areas:</p>

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
