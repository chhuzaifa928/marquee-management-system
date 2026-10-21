import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { MODULE_DEFS } from "../config/modules";

export function Layout() {
  const { user, modules, logout } = useAuth();
  const navigate = useNavigate();

  const visible = MODULE_DEFS.filter((m) => modules.includes(m.key));

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-64 flex-col bg-pearl-800 text-pearl-50">
        <div className="px-5 py-5 border-b border-pearl-700">
          <div className="text-lg font-semibold leading-tight">Grand Pearl</div>
          <div className="text-xs text-pearl-300">Marquee ERP</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {visible.map((m) => (
            <NavLink
              key={m.key}
              to={m.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-pearl-600 text-white"
                    : "text-pearl-200 hover:bg-pearl-700"
                }`
              }
            >
              <span aria-hidden>{m.icon}</span>
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-pearl-700 px-4 py-3 text-xs">
          <div className="font-medium text-pearl-100">{user?.name}</div>
          <div className="text-pearl-300">{user?.roles.join(", ")}</div>
          <button
            onClick={handleLogout}
            className="mt-2 w-full rounded-md bg-pearl-700 px-3 py-1.5 text-pearl-100 hover:bg-pearl-600"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
