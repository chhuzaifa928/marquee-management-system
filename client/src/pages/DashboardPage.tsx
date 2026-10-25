import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../auth/AuthContext";
import { useDashboard } from "../api/hooks";
import { MODULE_DEFS } from "../config/modules";
import { fmtDate, money } from "../lib/format";
import { Card, StatusBadge } from "../components/ui";

export function DashboardPage() {
  const { user, modules } = useAuth();
  const roles = user?.roles ?? [];
  const isAdminLevel = roles.includes("admin") || roles.includes("super_admin");
  const { data } = useDashboard();

  const cards = MODULE_DEFS.filter((m) => m.key !== "dashboard" && m.key !== "admin" && modules.includes(m.key));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-pearl-900">Welcome, {user?.name}</h1>
      <p className="mt-1 text-sm text-pearl-500">{roles.join(", ")} · Grand Pearl Marquee ERP</p>

      {isAdminLevel && modules.includes("admin") && (
        <Link to="/admin" className="mt-5 flex items-center justify-between rounded-xl bg-pearl-800 p-5 text-white shadow-sm transition hover:bg-pearl-700">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold">⚙️ Administration</div>
            <div className="text-sm text-pearl-200">Company & GST settings, users & roles, audit log{roles.includes("super_admin") ? ", system lock" : ""}.</div>
          </div>
          <span className="text-2xl">→</span>
        </Link>
      )}

      {/* Stat tiles */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Today's events" value={data ? String(data.todayCount) : "—"} />
        {data?.cashPosition != null && <Tile label="Cash position" value={money(data.cashPosition)} />}
        {data?.receivables != null && <Tile label="Receivables (due)" value={money(data.receivables)} />}
        {data?.lowStockCount != null && <Tile label="Low-stock items" value={String(data.lowStockCount)} warn={data.lowStockCount > 0} />}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase text-pearl-400">Upcoming events</h2>
          {!data?.upcoming?.length ? (
            <p className="text-pearl-500">No upcoming events.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.upcoming.map((b: any) => (
                  <tr key={b.id} className="border-b border-pearl-50">
                    <td className="py-1.5">
                      <Link to={`/bookings/${b.id}`} className="font-mono text-xs text-pearl-700 hover:underline">{b.bookingNo}</Link>
                    </td>
                    <td>{b.customer}</td>
                    <td className="text-pearl-500">{b.hall}</td>
                    <td>{fmtDate(b.eventDate)} <span className="capitalize text-pearl-400">{b.slot}</span></td>
                    <td><StatusBadge status={b.status} /></td>
                    <td className="text-right">{money(b.due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {data?.monthlyRevenue ? (
          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase text-pearl-400">Monthly revenue</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.monthlyRevenue.map((m: any) => ({ month: m.month, revenue: Number(m.revenue) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eceef6" />
                <XAxis dataKey="month" fontSize={11} tickLine={false} />
                <YAxis fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))} width={40} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Bar dataKey="revenue" fill="#515b90" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        ) : (
          <Card><p className="text-sm text-pearl-400">Revenue chart is available to Accounts/Admin.</p></Card>
        )}
      </div>

      <p className="mt-6 text-sm text-pearl-500">Your areas:</p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((m) => (
          <Link key={m.key} to={m.path} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-pearl-100 transition hover:ring-pearl-300">
            <div className="text-xl" aria-hidden>{m.icon}</div>
            <div className="mt-1 text-sm font-medium text-pearl-900">{m.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <Card className={warn ? "ring-amber-200" : ""}>
      <div className="text-xs text-pearl-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${warn ? "text-amber-700" : "text-pearl-900"}`}>{value}</div>
    </Card>
  );
}
